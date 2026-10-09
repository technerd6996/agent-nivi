import { KBArticle, SeverityLevel, TriageResult } from '../types';
import { KNOWLEDGE_BASE } from '../data/knowledgeBase';

/**
 * Words that appear across many runbook titles and symptoms and therefore
 * carry almost no discriminating power. Previously "exit" + "code" from
 * "…(OOMKilled - Exit Code 137)" scored +16 and cleared the match threshold,
 * so an unrelated "exit code 42" was answered with the OOMKilled runbook.
 */
const LOW_INFORMATION_WORDS = new Set([
  'exit', 'code', 'codes', 'error', 'errors', 'failure', 'failed', 'fail',
  'pod', 'pods', 'node', 'nodes', 'service', 'services', 'server', 'servers',
  'system', 'systems', 'container', 'containers', 'cluster', 'clusters',
  'http', 'https', 'status', 'request', 'requests', 'response',
  'high', 'usage', 'check', 'with', 'from', 'this', 'that', 'into',
  'time', 'limit', 'limits', 'open', 'file', 'files', 'host', 'hosts',
  'application', 'applications', 'process', 'processes', 'issue', 'issues',
]);

/** Word-boundary containment, so "code" does not match inside "codebase". */
function containsWord(haystack: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9_-])${escapeRegex(word)}([^a-z0-9_-]|$)`, 'i').test(haystack);
}

export function runTriage(input: string): TriageResult {
  const normalized = input.toLowerCase();

  let bestMatch: KBArticle | null = null;
  let highestScore = 0;
  let bestCodeScore = 0;
  let bestKeywordScore = 0;
  let matchedErrorCode: string | undefined;
  let matchedKeywords: string[] = [];

  for (const article of KNOWLEDGE_BASE) {
    // Tracked separately so a match can require real evidence (an error code
    // or a full keyword phrase) rather than a pile of generic word hits.
    let codeScore = 0;
    let keywordScore = 0;
    let softScore = 0;
    const currentMatchedKeywords: string[] = [];
    let currentMatchedCode: string | undefined;

    // Exact error codes — the strongest evidence available.
    for (const code of article.errorCodes) {
      const codeLower = code.toLowerCase();
      const regex = new RegExp(`(^|[^a-zA-Z0-9_-])${escapeRegex(codeLower)}([^a-zA-Z0-9_-]|$)`, 'i');
      if (regex.test(normalized)) {
        codeScore += 55;
        if (!currentMatchedCode) currentMatchedCode = code;
      }
    }

    // Keyword phrases. A full phrase hit is real evidence; partial word
    // overlap is only a soft hint.
    for (const kw of article.keywords) {
      const kwLower = kw.toLowerCase();
      if (normalized.includes(kwLower)) {
        keywordScore += 25;
        currentMatchedKeywords.push(kw);
      } else {
        const words = kwLower
          .split(' ')
          .filter(w => w.length > 3 && !LOW_INFORMATION_WORDS.has(w));
        if (words.length) {
          const hits = words.filter(w => containsWord(normalized, w)).length;
          if (hits > 0) softScore += (hits / words.length) * 12;
        }
      }
    }

    // Symptoms — soft corroboration only.
    for (const symptom of article.symptoms) {
      const symWords = symptom.toLowerCase()
        .split(/[^a-z0-9-]+/)
        .filter(w => w.length > 4 && !LOW_INFORMATION_WORDS.has(w));
      const hits = symWords.filter(w => containsWord(normalized, w)).length;
      if (hits >= 2) softScore += hits * 4;
    }

    // Title words — soft corroboration only, and only informative ones.
    const titleWords = article.title.toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter(w => w.length > 3 && !LOW_INFORMATION_WORDS.has(w));
    for (const tw of titleWords) {
      if (containsWord(normalized, tw)) softScore += 8;
    }

    const score = codeScore + keywordScore + softScore;
    if (score > highestScore) {
      highestScore = score;
      bestCodeScore = codeScore;
      bestKeywordScore = keywordScore;
      bestMatch = article;
      matchedErrorCode = currentMatchedCode;
      matchedKeywords = currentMatchedKeywords;
    }
  }

  // A runbook is only "matched" when there is hard evidence for it: an exact
  // error code, or at least one full keyword phrase. Soft word overlap alone
  // is treated as no match, so the caller can say so honestly instead of
  // attaching an unrelated runbook.
  const hasHardEvidence = bestCodeScore > 0 || bestKeywordScore >= 25;
  if (!bestMatch || !hasHardEvidence || highestScore < 25) {
    return createFallbackTriage(input);
  }

  // Confidence reflects which kind of evidence was found, rather than being
  // floored at a flattering 68.
  const confidenceScore = bestCodeScore > 0
    ? Math.min(97, 82 + Math.round((bestKeywordScore + Math.min(highestScore - bestCodeScore, 40)) / 8))
    : Math.min(82, 64 + Math.round(bestKeywordScore / 4));

  const initialStepProgress: Record<string, boolean> = {};
  bestMatch.steps.forEach(step => {
    initialStepProgress[step.id] = false;
  });

  const incidentId = `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const severityReason = getSeverityReason(bestMatch.severity, bestMatch.title, matchedErrorCode);

  return {
    matchedArticle: bestMatch,
    confidenceScore,
    matchedKeywords: matchedKeywords.length > 0 ? Array.from(new Set(matchedKeywords)) : [bestMatch.category],
    matchedErrorCode,
    severity: bestMatch.severity,
    severityReason,
    stepProgress: initialStepProgress,
    ticketDraft: {
      ticketId: incidentId,
      title: `[${bestMatch.severity.split(' - ')[0]}] ${bestMatch.title}`,
      priority: bestMatch.severity,
      system: bestMatch.affectedServices[0] || 'Core Infrastructure',
      service: bestMatch.category,
      assigneeTeam: bestMatch.escalationPath,
      markdownBody: `### Incident Summary
- **Incident ID:** ${incidentId}
- **Detected Severity:** ${bestMatch.severity}
- **KB Article Reference:** ${bestMatch.id} - ${bestMatch.title}
- **Root Cause Hypothesis:** ${bestMatch.rootCause}
- **Trigger Snippet:** \`${input.slice(0, 150)}...\`

### Remediation Checklist
${bestMatch.steps.map(s => `- [ ] Step ${s.stepNumber}: ${s.title}`).join('\n')}

### Escalation SLA
- Initial Response SLA: ${bestMatch.severity.includes('P1') ? '15 minutes' : '60 minutes'}
- Estimated MTTR: ${bestMatch.estimatedResolutionMinutes} mins`
    }
  };
}

function getSeverityReason(severity: SeverityLevel, title: string, code?: string): string {
  if (severity.startsWith('P1')) {
    return `Classified as ${severity} because "${code || title}" indicates a critical production failure, potential service outage, or data plane interruption.`;
  }
  if (severity.startsWith('P2')) {
    return `Classified as ${severity} due to degraded performance, high transaction error rate, or imminent service blockage affecting active workflows.`;
  }
  if (severity.startsWith('P3')) {
    return `Classified as ${severity} because this affects a non-critical component or isolated permission scope without system-wide downtime.`;
  }
  return `Classified as ${severity} indicating an operational warning, configuration anomaly, or localized browser client issue.`;
}

function escapeRegex(str: string): string {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function createFallbackTriage(input: string): TriageResult {
  const norm = input.toLowerCase();
  
  // Severity heuristic for unmatched input.
  //
  // Two bugs this replaces: substring matching meant "8500ms" contained "500"
  // and scored P1 - CRITICAL, and a bare "error"/"fail" anywhere scored
  // P2 - HIGH, which made P2 the de facto answer for nearly every input.
  //
  // Word-boundary matching now, and the tiers key off *impact* words rather
  // than the mere presence of a fault word. With no impact signal the result
  // is P3, not P2 — an unmatched incident of unknown blast radius is not
  // self-evidently "high".
  const hasWord = (...words: string[]) =>
    words.some(w => new RegExp(`(^|[^a-z0-9_-])${w}([^a-z0-9_-]|$)`, 'i').test(norm));

  let severity: SeverityLevel = 'P3 - MEDIUM';
  if (hasWord('fatal', 'panic', 'segfault', 'emergency', 'outage', 'data\\s*loss', 'breach', 'corrupted')
      || hasWord('all\\s+users', 'all\\s+customers', 'completely\\s+down', 'total\\s+outage')) {
    severity = 'P1 - CRITICAL';
  } else if (hasWord('cosmetic', 'deprecated', 'deprecation', 'informational', 'no\\s+user\\s+impact', 'notice')) {
    severity = 'P4 - LOW';
  } else if (hasWord('degraded', 'partial\\s+outage', 'unavailable', 'crash', 'crashed', 'crashing', 'oomkilled')
             || hasWord('production', 'prod', 'customer', 'customers')) {
    severity = 'P2 - HIGH';
  }

  const fallbackArticle: KBArticle = {
    id: 'KB-GEN-DIAG',
    title: 'General IT Incident Diagnostic & Telemetry Triage',
    category: 'Application Runtime',
    errorCodes: ['GENERIC_ERROR'],
    keywords: ['diagnostic', 'general triage', 'log inspection'],
    severity,
    summary: 'No specific pre-indexed KB code matched with 100% certainty. Initiating automated dynamic system triage heuristics.',
    rootCause: 'Unclassified runtime exception or custom application error stack trace requiring telemetry correlation.',
    symptoms: ['Uncategorized log entry or stack trace provided by operator.'],
    estimatedResolutionMinutes: 20,
    affectedServices: ['General Application Tier'],
    escalationPath: 'Escalate to Tier 1 Operations / Service Desk Lead',
    steps: [
      {
        id: 'fallback-1',
        stepNumber: 1,
        title: 'Isolate Error Boundary & Process Name',
        action: 'Inspect whether the issue is isolated to a single host/container or widespread across the cluster.',
        command: 'dmesg -T | tail -n 30 || journalctl -xe -n 50',
        expectedOutput: 'Check for kernel faults or recent OOM / segfault invocations.'
      },
      {
        id: 'fallback-2',
        stepNumber: 2,
        title: 'Check CPU, Memory & Open File Descriptors',
        action: 'Verify system resource pressure on the reporting instance.',
        command: 'uptime && free -m && ulimit -n',
        expectedOutput: 'Ensure load averages are under core count and available RAM > 15%.'
      },
      {
        id: 'fallback-3',
        stepNumber: 3,
        title: 'Review Recent Deployments & Git Commits',
        action: 'Determine if this error was triggered by a recent release within the last 2 hours.',
        command: 'git log -n 3 --oneline',
        expectedOutput: 'Identify latest release tag or deployment sha.'
      }
    ]
  };

  const incidentId = `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  return {
    matchedArticle: fallbackArticle,
    confidenceScore: 68,
    matchedKeywords: ['Diagnostic', 'Heuristic Triage'],
    severity,
    severityReason: `Classified based on contextual severity heuristic keywords found in the submitted error payload.`,
    stepProgress: { 'fallback-1': false, 'fallback-2': false, 'fallback-3': false },
    ticketDraft: {
      ticketId: incidentId,
      title: `[${severity.split(' - ')[0]}] Uncategorized Incident - Triage Required`,
      priority: severity,
      system: 'IT Services',
      service: 'Application Runtime',
      assigneeTeam: 'Tier 1 Service Desk',
      markdownBody: `### Incident Summary\n- **Incident ID:** ${incidentId}\n- **Detected Severity:** ${severity}\n- **Payload Snippet:** \`${input.slice(0, 120)}\``
    }
  };
}
