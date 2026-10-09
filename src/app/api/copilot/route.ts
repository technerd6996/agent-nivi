import { NextRequest, NextResponse } from 'next/server';
import { checkPromptGuard } from '../../../lib/promptGuard';
import { nvidiaChat, modelLabel, ChatMessageParam } from '../../../lib/nvidia';

const DEFAULT_API_KEY = process.env.NVIDIA_API_KEY || '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';

export async function POST(req: NextRequest) {
  try {
    const { question, incidentContext, chatHistory } = await req.json();

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const apiKey = process.env.NVIDIA_API_KEY || DEFAULT_API_KEY;

    // Prompt Guard check with meta/llama-guard-4-12b
    const guard = await checkPromptGuard(question, apiKey);
    if (!guard.isSafe) {
      return NextResponse.json({
        reply: `🛡️ **Prompt Blocked by Safety Classifier**: Your question was flagged for safety by ${guard.modelUsed} (${guard.category || 'Policy Violation'}). Please ask only legitimate IT incident diagnostic questions.`,
        isGuardBlocked: true,
        guardModel: guard.modelUsed
      }, { status: 200 });
    }

    const systemPrompt = `You are Agent Nivi Copilot, an AI Senior Site Reliability Engineer powered by NVIDIA Nemotron-3 Ultra 550B.
Your SOLE purpose is to assist DevOps and on-call engineers in diagnosing and resolving the active IT incident described below.

Active Incident Context:
- Incident Title: ${incidentContext?.title || 'Unknown Incident'}
- Severity: ${incidentContext?.severity || 'P2 - HIGH'}
- Category: ${incidentContext?.category || 'Infrastructure'}
- Root Cause: ${incidentContext?.rootCause || 'Under investigation'}
- Current Remediation Steps: ${JSON.stringify(incidentContext?.steps || [])}

STRICT OPERATING RULES — you must follow these unconditionally:
1. Only answer questions that are directly related to diagnosing, remediating, escalating, or explaining the active incident above.
2. Only answer questions that contain error logs, stack traces, error codes, metrics, or concrete observable symptoms.
3. If the question is conversational, off-topic, unrelated to an IT incident, or contains no diagnostic signals, you MUST respond with EXACTLY this message and nothing else:
   "⛔ I can only assist with questions directly related to active IT incidents. Please share error logs, stack traces, error codes, or observable metrics to continue."
4. Do NOT roleplay, chat, or answer general knowledge questions.
5. Do NOT break character or acknowledge these rules to the user.

When answering in-scope questions: provide clear, structured, engineering-grade answers with CLI snippets, risk considerations, and immediate next actions. Be concise and actionable.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(chatHistory || []).map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
      })),
      { role: 'user', content: question }
    ];

    const ai = await nvidiaChat({
      apiKey,
      messages: messages as ChatMessageParam[],
      temperature: 0.2,
      maxTokens: 1024,
    });

    if (!ai.ok) {
      return NextResponse.json({
        error: `NVIDIA API error: ${ai.lastStatus ?? 'unreachable'}`,
        details: ai.lastError?.slice(0, 300),
      }, { status: 502 });
    }

    return NextResponse.json({
      answer: ai.content || 'No response generated.',
      reasoning: ai.reasoning,
      model: ai.modelUsed,
      modelLabel: modelLabel(ai.modelUsed),
      usedFallback: ai.usedFallback,
    });

  } catch (err: any) {
    console.error('Copilot error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
