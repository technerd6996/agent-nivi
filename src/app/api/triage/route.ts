import { NextRequest, NextResponse } from 'next/server';
import { runTriage } from '../../../lib/triageEngine';
import { KNOWLEDGE_BASE } from '../../../data/knowledgeBase';
import { TriageResult, KBArticle, SeverityLevel } from '../../../types';
import { checkPromptGuard, guardBlockedMessage } from '../../../lib/promptGuard';
import {
  buildSystemPrompt,
  EMPTY_CONTEXT_MEMORY,
  PromptChatTurn,
  PromptContextMemory,
  PromptUserProfile,
} from '../../../lib/systemPrompt';

import { nvidiaChat, modelLabel } from '../../../lib/nvidia';
import { triageToMarkdown, followUpToMarkdown, stepsToMarkdown } from '../../../lib/triageMarkdown';
import { classifyInput, InputClassification } from '../../../lib/inputClassifier';
import { extractFromImage } from '../../../lib/visionExtract';
import { searchSimilarChunks, DEFAULT_TOP_K } from '../../../lib/vectorStore';

/** Sentinel id returned by runTriage when nothing in the KB actually matched. */
const KB_FALLBACK_ID = 'KB-GEN-DIAG';

const DEFAULT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';
const DEFAULT_API_KEY = process.env.NVIDIA_API_KEY || '';

// ---------------------------------------------------------------------------
// Input Classification
// ---------------------------------------------------------------------------

/**
 * Returns true if the message is a greeting / small-talk (no diagnostic content).
 * Greetings are intercepted early with a friendly scoped reply — they must NOT
 * reach the AI or local triage engine.
 */
function isGreeting(text: string): boolean {
  const t = text.toLowerCase().trim();
  const greetingPatterns = [
    /^(hi|hey|hello|howdy|hiya|sup|yo)(\s|[!.,?]|$)/,
    /^good\s?(morning|afternoon|evening|day)/,
    /^(thanks|thank\s+you|cheers|thx)(\s|[!.,?]|$)/,
    /^(bye|goodbye|see\s+you|cya)(\s|[!.,?]|$)/,
    /^how\s+are\s+you/,
    /^what('?s|\s+is)\s+(up|new|going\s+on)/,
    /^(help|assist\s+me|can\s+you\s+help)(\?|$)/,
    /^who\s+are\s+you/,
    /^what\s+(can|do)\s+you/,
  ];
  return greetingPatterns.some(p => p.test(t));
}

/**
 * Returns true if the message contains at least one diagnostic signal:
 * error codes, stack traces, log keywords, metrics, or observable symptoms.
 */
function hasDiagnosticContent(text: string): boolean {
  const t = text.toLowerCase();

  // Error code patterns  (HTTP codes, exit codes, SQL codes, POSIX errors, etc.)
  const errorCodePatterns = [
    /\b(error|err|exception|fault|fail(ed|ure)?|panic|fatal|abort|crash|oom(killed)?|segfault)\b/,
    /\b(timeout|timed[\s-]out|refused|unreachable|unavailable|down|outage|offline)\b/,
    /\b(http|status)[\s:/]?\d{3}\b/,  // HTTP 5xx, 4xx, etc.
    /\b(exit\s*code|exitcode)\s*\d+\b/,
    /\b(ora-\d+|sql\s*error|deadlock|lock\s*wait|1205|40p01)\b/,
    /\b(enospc|enomem|econnrefused|etimedout|enotfound|eacces)\b/,
    /\b(oom|out\s*of\s*memory|disk\s*full|no\s*space\s*left)\b/,
    /\b(cert(ificate)?\s*(expired?|invalid)|ssl\s*error|tls\s*(fail|error))\b/,
    /\b(access\s*denied|unauthorized|403|401|iam\s*error|permission\s*denied)\b/,
    /\b(pod|node|cluster|kubectl|helm|k8s|kubernetes)\b/,
    /\b(500|502|503|504|429|408)\b/,
  ];

  // Stack trace / log structure signals
  const structurePatterns = [
    /at\s+\S+\.\S+\s*\(/,           // Java/Node stack frame: at Class.method(
    /\bTraceback\b/,
    /File\s+".+"\s*,\s*line\s+\d+/,  // Python traceback
    /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/,  // Timestamp in log
    /\[\s*(ERROR|WARN|FATAL|CRIT|DEBUG|INFO)\s*\]/i,
    /\b(stderr|stdout|syslog|journalctl|dmesg|stacktrace|stack\s*trace)\b/,
    /\b(caused\s*by|wrapped\s*by|root\s*cause)\b/,
  ];

  // Metrics / observable symptoms
  const metricPatterns = [
    /\b(cpu|memory|ram|disk|latency|throughput|rps|qps|p99|p95|percentile)\b/,
    /\b(spike|spike\s*in|high\s*load|load\s*average|utilization)\b/,
    /\b(alert|alarm|pagerduty|oncall|on-call|incident|sev\s*\d|severity)\b/,
    /\d+\s*(%|ms|sec|mb|gb|rpm|req\/s)/,  // numbers with units
    /\b(metric|dashboard|grafana|datadog|cloudwatch|newrelic|splunk|elk)\b/,
  ];

  return (
    errorCodePatterns.some(p => p.test(t)) ||
    structurePatterns.some(p => p.test(t)) ||
    metricPatterns.some(p => p.test(t))
  );
}

/** Shown when the user sends a greeting or conversational message. */
const GREETING_MESSAGE =
  `👋 **Hello! I'm Agent Nivi — an SRE Triage Agent**

**What I do:**
I specialize in rapid IT incident triage, root cause diagnosis, and operational remediation. I analyze error logs, stack traces, and system metrics against our enterprise SOP runbooks, determine incident severity (P1–P4), and formulate executable step-by-step remediation procedures to restore service quickly.

To begin triaging an incident, please share any of the following:

• **Error logs** — raw log output from your application, service, or OS
• **Stack traces** — full exception or traceback output
• **Error codes** — HTTP status codes, exit codes, SQL error codes (e.g. 504, Exit Code 137, ORA-00060, ENOSPC)
• **Metrics / symptoms** — CPU spikes, memory exhaustion, latency anomalies, or alert notifications

_Example: paste your terminal output, a Grafana/Datadog alert, or a copied stack trace to begin triage._`;

/** Shown when the user sends a message with no recognisable diagnostic signal. */
const REJECTION_MESSAGE =
  `⛔ **Insufficient Diagnostic Input**

I triage IT incidents from observable signals. To get started, send at least one of:

• **Error logs** — raw log output from your application, service, or OS
• **Stack traces** — full exception/traceback output
• **Error codes** — HTTP status codes, exit codes, SQL error codes (e.g. 504, ORA-00060, ENOSPC)
• **Metrics / symptoms** — CPU spikes, memory pressure, latency readings, alert snapshots

_Example: paste your terminal output, a Grafana alert, or a copied stack trace and re-submit._`;

/** Shown for general-knowledge or personal questions. */
const OFF_TOPIC_MESSAGE =
  `🚫 **Out of Scope**

I'm an SRE incident triage agent — I only work on IT incidents and system failures. I can't answer general knowledge questions, look up people, or write content.

If you do have an incident, send me the signal:

• **Error logs**, **stack traces**, or **error codes** (e.g. 504, Exit Code 137, ENOSPC)
• **Metrics or alerts** — latency, CPU/memory, a Grafana or PagerDuty snapshot`;

/**
 * Shown when something is clearly wrong but there is not enough to diagnose.
 * Used as the no-AI fallback; when the model is reachable it writes its own
 * targeted questions via responseType "clarification".
 */
const VAGUE_MESSAGE =
  `🔍 **I need a bit more to go on**

That tells me something is failing, but not enough to triage it. Could you add:

• **Which service or host** is affected, and in which environment (prod/staging)?
• **The exact error text** — the log line, status code, or stack trace you're seeing
• **When it started**, and whether it's constant or intermittent
• **What changed recently** — a deploy, config change, or traffic shift

_Even a few lines of raw log output is usually enough for me to work from._`;

/**
 * Builds the response for when the model is unreachable.
 *
 * The local heuristic engine always returns *something* — if nothing matches
 * it synthesises a generic article with an invented root cause and a severity
 * derived from whichever mood word it spotted. Presenting that as triage is
 * the bug behind "Error 404" getting a confident P2 runbook. So:
 *
 *   - weak/vague input      -> ask for specifics, diagnose nothing
 *   - no KB article matched -> say so, offer read-only checks only
 *   - a real article matched -> serve that runbook, labelled as KB-only
 */
function degradedResponse(opts: {
  classification: InputClassification;
  localMatch: TriageResult;
  startTime: number;
  note: string;
}) {
  const { classification, localMatch, startTime, note } = opts;
  const elapsed = Math.round(performance.now() - startTime);
  const noKbMatch = localMatch.matchedArticle.id === KB_FALLBACK_ID;

  if (classification.kind === 'vague') {
    return NextResponse.json({
      rejected: true,
      isClarification: true,
      degraded: true,
      message: VAGUE_MESSAGE,
      processingTimeMs: elapsed,
      isAiPowered: false,
      note,
    }, { status: 200 });
  }

  if (noKbMatch) {
    // Real signal, but nothing to ground a diagnosis in. Offer only the
    // read-only checks, with no severity or root-cause claim.
    const steps = localMatch.matchedArticle.steps.filter(s => !!s.command);
    const message = [
      `⚠️ **No matching runbook**`,
      `I couldn't match this to any runbook in the knowledge base, and the AI model is currently unreachable — so I won't guess at a severity or root cause.`,
      `Here are safe read-only checks to narrow it down. None of these change system state:`,
      stepsToMarkdown(steps),
      `_Paste the output back and I'll take another pass._`,
    ].join('\n\n');

    return NextResponse.json({
      rejected: true,
      isClarification: true,
      degraded: true,
      noKbMatch: true,
      message,
      processingTimeMs: elapsed,
      isAiPowered: false,
      note,
    }, { status: 200 });
  }

  // A genuine KB article matched — that runbook is authored content, so it is
  // safe to serve on its own.
  const triageResult: TriageResult = {
    ...localMatch,
    isAiGenerated: false,
    modelUsed: 'Knowledge Base runbook (AI unavailable)',
  };
  triageResult.markdown = triageToMarkdown(triageResult);

  return NextResponse.json({
    triageResult,
    processingTimeMs: elapsed,
    isAiPowered: false,
    degraded: true,
    note,
  }, { status: 200 });
}

// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const startTime = performance.now();
  let input = '';
  let rawSnippet: string | undefined;
  // Session memory for the prompt. The client may send these to carry context
  // across turns; absent them the prompt renders its "new conversation" branch.
  let chatHistory: PromptChatTurn[] = [];
  let contextMemory: PromptContextMemory = EMPTY_CONTEXT_MEMORY;
  let userProfile: PromptUserProfile | undefined;
  let imageDataUrl: string | undefined;
  let extractedFromImage: string | undefined;
  let visionModelUsed: string | undefined;

  try {
    const body = await req.json();
    input = body.input || '';
    rawSnippet = body.rawSnippet;
    if (Array.isArray(body.chatHistory)) {
      chatHistory = body.chatHistory
        .filter((m: any) => m && typeof m.content === 'string')
        .map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }));
    }
    if (body.contextMemory) {
      contextMemory = { ...EMPTY_CONTEXT_MEMORY, ...body.contextMemory };
    }
    userProfile = body.userProfile || undefined;
    imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let queryText = (rawSnippet || input).trim();

  // --- Image input -----------------------------------------------------------
  // A screenshot is transcribed first, then the transcription is treated as the
  // incident payload so the normal gate, KB matching and prompt all apply.
  if (imageDataUrl) {
    const key = process.env.NVIDIA_API_KEY || DEFAULT_API_KEY;
    const vision = await extractFromImage(imageDataUrl, key, queryText);

    if (!vision.ok) {
      return NextResponse.json({
        rejected: true,
        isClarification: true,
        message: `🖼️ **Couldn't read that image**\n\nThe vision model is unavailable right now${vision.status ? ` (HTTP ${vision.status})` : ''}, so I can't extract the error from your screenshot.\n\nPaste the error text directly and I'll triage it.`,
        processingTimeMs: Math.round(performance.now() - startTime),
        isAiPowered: false,
      }, { status: 200 });
    }

    if (vision.empty) {
      return NextResponse.json({
        rejected: true,
        isClarification: true,
        message: `🖼️ **No error information in that image**\n\nI read the screenshot but couldn't find any error codes, log output, or failure states in it.\n\nIf the error is in a different part of the screen, send a crop that includes it — or paste the text directly.`,
        imageRead: true,
        visionModel: vision.modelUsed,
        processingTimeMs: Math.round(performance.now() - startTime),
        isAiPowered: false,
      }, { status: 200 });
    }

    // Transcription becomes the payload; anything the user typed stays as context.
    extractedFromImage = vision.text;
    visionModelUsed = vision.modelUsed;
    queryText = queryText
      ? `${queryText}\n\n--- Transcribed from attached screenshot ---\n${vision.text}`
      : vision.text;
  }

  if (!queryText) {
    return NextResponse.json({ error: 'Empty input query' }, { status: 400 });
  }

  // A message is a follow-up when this thread already has turns. Follow-ups
  // ("did the restart help?", "what if that fails?") legitimately carry no
  // diagnostic signal of their own — the context is the preceding transcript —
  // so the diagnostic gate must only police the first message of a thread.
  const isFollowUp = chatHistory.length > 0;

  // -------------------------------------------------------------------------
  // Input gate — runs BEFORE the AI / local engine is ever called.
  //
  // 1. Prompt Guard: scans for prompt injection and policy violations.
  //    Applies to every message, follow-ups included.
  // 2. Greetings: friendly scoped welcome. First message only.
  // 3. No signals: standard rejection. First message only.
  // 4. Diagnostic, or any follow-up: proceed to the model.
  // -------------------------------------------------------------------------
  const apiKey = process.env.NVIDIA_API_KEY || DEFAULT_API_KEY;
  const aiEnabled = Boolean(apiKey) && process.env.TOVISHNU_DISABLE_AI !== 'true';

  if (aiEnabled) {
    const guardResult = await checkPromptGuard(queryText, apiKey);
    if (!guardResult.isSafe) {
      return NextResponse.json({
        rejected: true,
        isGuardBlocked: true,
        guardModel: guardResult.modelUsed,
        guardCategory: guardResult.category,
        message: guardBlockedMessage(guardResult.modelUsed)
      }, { status: 200 });
    }
  }

  let classification = classifyInput(queryText);

  if (!isFollowUp) {
    if (isGreeting(queryText)) {
      return NextResponse.json({ rejected: true, isGreeting: true, message: GREETING_MESSAGE }, { status: 200 });
    }

    if (classification.kind === 'off-topic') {
      return NextResponse.json({
        rejected: true, isGreeting: false, isOffTopic: true,
        message: OFF_TOPIC_MESSAGE
      }, { status: 200 });
    }

    if (classification.kind === 'insufficient') {
      return NextResponse.json({
        rejected: true, isGreeting: false,
        message: REJECTION_MESSAGE
      }, { status: 200 });
    }
    // 'vague' falls through: the model is better at asking the right follow-up
    // question than a canned list is. If the model is unreachable, the vague
    // branch below serves VAGUE_MESSAGE instead of inventing a runbook.
  }

  // Pre-fetch best matching local KB article for RAG context
  const localMatch = runTriage(queryText);
  const matchedKb = localMatch.matchedArticle;

  // If no API key is configured, or the app is forced into local-only mode,
  // skip the external AI path entirely so the response stays fast.
  if (!aiEnabled) {
    return degradedResponse({ classification, localMatch, startTime, note: 'ai-disabled' });
  }

  // Retrieve Top-K authoritative SRE runbook chunks from the 500,000-word runbook
  let retrievedRunbookChunks: any[] = [];
  try {
    const ragResult = await searchSimilarChunks(queryText, { topK: DEFAULT_TOP_K });
    retrievedRunbookChunks = ragResult.results;
  } catch (ragErr) {
    console.warn('[Triage] Vector retrieval fallback notice:', ragErr);
  }

  // Prepare RAG prompt for the NVIDIA model chain.
  // matchedKb is passed as null when runTriage fell back to its generic article,
  // so the prompt's "no KB match" branch fires instead of citing a bogus SOP.
  const systemPrompt = buildSystemPrompt({
    matchedKb: matchedKb.id === KB_FALLBACK_ID ? null : {
      id: matchedKb.id,
      title: matchedKb.title,
      category: matchedKb.category,
      rootCause: matchedKb.rootCause,
      escalationPath: matchedKb.escalationPath,
      severity: matchedKb.severity,
    },
    retrievedChunks: retrievedRunbookChunks,
    chatHistory,
    contextMemory,
    userProfile,
  });

  const userPrompt = `Incoming IT Incident Payload / Stack Trace:
"""
${queryText}
"""

Perform deep technical root cause analysis, assess production impact, and formulate an executable remediation plan.`;

  try {
    // Retries transient 503/504s and cascades to a smaller model if the
    // flagship is overloaded, instead of silently serving canned KB text.
    const ai = await nvidiaChat({
      apiKey,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.15,
      // The schema asks for 4-8 richly described steps plus contextUpdate;
      // 2048 truncated the JSON mid-array and forced a parse fallback.
      maxTokens: 8192,
    });

    if (!ai.ok) {
      console.warn(
        `All NVIDIA models unavailable (last status ${ai.lastStatus ?? 'n/a'}); serving degraded response.`
      );
      return degradedResponse({
        classification, localMatch, startTime,
        note: `nvidia-unavailable-${ai.lastStatus ?? 'network'}`,
      });
    }

    const content = ai.content;
    const reasoningContent = ai.reasoning;

    // Clean JSON content if wrapped in code blocks
    let cleanJsonStr = content.trim();
    if (cleanJsonStr.startsWith('```json')) {
      cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJsonStr.startsWith('```')) {
      cleanJsonStr = cleanJsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsedAi: any;
    try {
      parsedAi = JSON.parse(cleanJsonStr);
    } catch (parseErr) {
      const truncated = ai.finishReason === 'length';
      console.error(
        `Failed to parse AI JSON from ${ai.modelUsed}` +
        (truncated ? ' (response truncated at max_tokens)' : '') + ':',
        parseErr
      );
      // Fallback to local match if JSON parsing fails
      return degradedResponse({
        classification, localMatch, startTime,
        note: `ai-parse-failure${truncated ? '-truncated' : ''}`,
      });
    }

    // The prompt returns responseType "clarification" with no steps when the
    // input is too vague to diagnose. Render it as a plain agent message rather
    // than an empty incident card.
    if (parsedAi.responseType === 'clarification') {
      const questions: string[] = Array.isArray(parsedAi.clarifyingQuestions)
        ? parsedAi.clarifyingQuestions
        : [];
      const elapsed = Math.round(performance.now() - startTime);
      return NextResponse.json({
        rejected: true,
        isClarification: true,
        message: [
          parsedAi.message || 'I need a bit more detail before I can triage this.',
          ...(questions.length ? ['', ...questions.map(q => `• ${q}`)] : []),
        ].join('\n'),
        clarifyingQuestions: questions,
        contextUpdate: parsedAi.contextUpdate,
        processingTimeMs: elapsed,
        model: ai.modelUsed,
      }, { status: 200 });
    }

    // A follow-up continues an existing incident. Reply in prose and merge the
    // memory update, but don't synthesise a second incident for the sidebar.
    if (parsedAi.responseType === 'followup' && isFollowUp) {
      const elapsed = Math.round(performance.now() - startTime);
      return NextResponse.json({
        followUp: true,
        markdown: followUpToMarkdown(parsedAi),
        aiReasoning: reasoningContent,
        contextUpdate: parsedAi.contextUpdate,
        processingTimeMs: elapsed,
        isAiPowered: true,
        extractedFromImage,
        visionModel: visionModelUsed,
        model: ai.modelUsed,
        usedFallback: ai.usedFallback,
      }, { status: 200 });
    }

    const incidentId = `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const steps = (parsedAi.steps?.length ? parsedAi.steps : matchedKb.steps).map((s: any, idx: number) => ({
      id: `ai-step-${idx + 1}-${Date.now()}`,
      stepNumber: s.stepNumber || idx + 1,
      title: s.title || `Remediation Step ${idx + 1}`,
      action: s.action || '',
      command: s.command || undefined,
      expectedOutput: s.expectedOutput || undefined,
      warningNote: s.warningNote || undefined,
    }));

    const stepProgress: Record<string, boolean> = {};
    steps.forEach((s: any) => {
      stepProgress[s.id] = false;
    });

    // Models sometimes echo a schema field's *description* instead of filling in
    // a value (the escalationPath description reads like prose, so it gets
    // copied verbatim). Treat an echoed description as missing.
    const echoesSchemaText = (v: unknown): boolean =>
      typeof v === 'string' && /from kb if matched|or null$|^concise |^executive-ready /i.test(v.trim());

    const aiEscalation: string | undefined =
      parsedAi.escalationPath && !echoesSchemaText(parsedAi.escalationPath)
        ? parsedAi.escalationPath
        : undefined;

    // "NONE_DETECTED" is the prompt's sentinel for "no error code in the input";
    // treat it as absent so it never renders as a real error code.
    const aiErrorCode: string | undefined =
      parsedAi.matchedErrorCode && parsedAi.matchedErrorCode !== 'NONE_DETECTED'
        ? parsedAi.matchedErrorCode
        : undefined;

    const aiArticle: KBArticle = {
      id: matchedKb.id || `AI-SOP-${Date.now()}`,
      title: parsedAi.title || matchedKb.title,
      category: parsedAi.category || matchedKb.category,
      errorCodes: aiErrorCode ? [aiErrorCode] : matchedKb.errorCodes,
      keywords: matchedKb.keywords,
      severity: (parsedAi.severity as SeverityLevel) || matchedKb.severity,
      summary: parsedAi.summary || matchedKb.summary,
      rootCause: parsedAi.rootCause || matchedKb.rootCause,
      symptoms: matchedKb.symptoms,
      steps,
      escalationPath: aiEscalation || matchedKb.escalationPath,
      affectedServices: parsedAi.affectedServices || matchedKb.affectedServices,
      estimatedResolutionMinutes: parsedAi.estimatedResolutionMinutes || matchedKb.estimatedResolutionMinutes,
      authoritativeDocUrl: matchedKb.authoritativeDocUrl,
    };

    const triageResult: TriageResult = {
      matchedArticle: aiArticle,
      // The prompt allows a genuinely low score, so keep 0 rather than
      // substituting a flattering default.
      confidenceScore: typeof parsedAi.confidenceScore === 'number'
        ? parsedAi.confidenceScore
        : 96,
      confidenceBasis: parsedAi.confidenceBasis,
      matchedKeywords: localMatch.matchedKeywords,
      matchedErrorCode: aiErrorCode || localMatch.matchedErrorCode,
      severity: aiArticle.severity,
      severityReason: parsedAi.severityReason || localMatch.severityReason,
      stepProgress,
      isAiGenerated: true,
      // Report the model that actually served, not the one we asked for.
      modelUsed: modelLabel(ai.modelUsed) + (ai.usedFallback ? ' (fallback)' : ''),
      aiReasoning: reasoningContent,
      agentMessage: parsedAi.message,
      kbMatched: parsedAi.kbMatched ?? (matchedKb.id !== KB_FALLBACK_ID),
      ticketDraft: {
        ticketId: incidentId,
        title: `[${aiArticle.severity.split(' - ')[0]}] ${aiArticle.title}`,
        priority: aiArticle.severity,
        system: aiArticle.affectedServices[0] || 'Core Infrastructure',
        service: aiArticle.category,
        assigneeTeam: aiArticle.escalationPath,
        markdownBody: `### Incident Summary (AI-Triaged via ${modelLabel(ai.modelUsed)})
- **Incident ID:** ${incidentId}
- **Detected Severity:** ${aiArticle.severity}
- **KB SOP Reference:** ${aiArticle.id} - ${aiArticle.title}
- **Root Cause Analysis:** ${aiArticle.rootCause}
- **Trigger Snippet:** \`${queryText.slice(0, 160)}...\`

### Remediation Runbook
${steps.map((s: any) => `- [ ] Step ${s.stepNumber}: ${s.title}${s.command ? ` (\`${s.command}\`)` : ''}`).join('\n')}

### Escalation & SLA
- Assigned Team: ${aiArticle.escalationPath}
- Estimated MTTR: ${aiArticle.estimatedResolutionMinutes} mins
- AI Model: ${modelLabel(ai.modelUsed)}`
      }
    };

    // Pre-render the conversational reply so the client just displays prose.
    triageResult.markdown = triageToMarkdown(triageResult);

    const elapsed = Math.round(performance.now() - startTime);

    return NextResponse.json({
      triageResult,
      processingTimeMs: elapsed,
      isAiPowered: true,
      model: ai.modelUsed,
      aiReasoning: reasoningContent,
      responseType: parsedAi.responseType || 'triage',
      extractedFromImage,
      visionModel: visionModelUsed,
      usedFallback: ai.usedFallback,
      ragChunks: retrievedRunbookChunks.map((c: any) => ({
        chunkId: c.chunkId,
        sectionTitle: c.sectionTitle,
        similarityScore: c.similarityScore,
      })),
      // New memory items learned this turn; the client should merge these into
      // its ContextMemory and send it back on the next request.
      contextUpdate: parsedAi.contextUpdate
    });

  } catch (err: any) {
    console.error('NVIDIA API Error:', err);
    return degradedResponse({ classification, localMatch, startTime, note: 'network-error' });
  }
}
