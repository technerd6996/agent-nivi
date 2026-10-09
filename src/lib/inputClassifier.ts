/**
 * Input classification for the triage gate.
 *
 * The previous gate was a single boolean OR over keyword regexes, so the bare
 * word "error" was enough to unlock a full remediation runbook. That let
 * "Error 404 Who is arun" through, and the local engine answered it with a
 * confident P2 severity it had no basis for.
 *
 * This version grades signal STRENGTH instead:
 *
 *   strong  — a structured, identifiable fault: an errno, an exit code, a
 *             stack frame, a k8s state, an HTTP code in context, a timestamped
 *             log line. One of these is a real diagnostic payload.
 *   weak    — mood words ("error", "down", "broken") and bare numbers. These
 *             say something is wrong but not what, where, or how.
 *
 * Weak-only input is not refused outright — it is answerable, just not
 * diagnosable yet, so it routes to a clarifying question instead of a runbook.
 */

import { KNOWLEDGE_BASE } from '../data/knowledgeBase';

export type InputKind =
  /** General-knowledge or personal question — outside the agent's scope. */
  | 'off-topic'
  /** No diagnostic signal whatsoever. */
  | 'insufficient'
  /** Something is wrong, but there is not enough to diagnose. Ask first. */
  | 'vague'
  /** A real diagnostic payload. Proceed to triage. */
  | 'diagnostic';

export interface InputClassification {
  kind: InputKind;
  /** Which strong signals matched, for logging and explanation. */
  strongHits: string[];
  weakHits: string[];
}

/**
 * Structured fault signatures. Each entry is [label, pattern].
 * Presence of any one means the input describes an identifiable failure.
 */
const STRONG_SIGNALS: [string, RegExp][] = [
  ['exit-code',     /\bexit\s*code\s*:?\s*\d{1,3}\b/i],
  ['signal',        /\b(sigkill|sigsegv|sigterm|sigabrt|segfault|segmentation fault|core dumped)\b/i],
  ['k8s-state',     /\b(oomkilled|crashloopbackoff|imagepullbackoff|errimagepull|evicted|nodenotready|createcontainerconfigerror|readiness probe failed|liveness probe failed)\b/i],
  ['errno',         /\b(enospc|enomem|econnrefused|econnreset|etimedout|enotfound|eacces|emfile|epipe|ehostunreach)\b/i],
  ['oracle-sql',    /\b(ora-\d{3,5}|sqlstate\s*\[?\w+|deadlock\s+detected|lock\s+wait\s+timeout)\b/i],
  // An HTTP status only counts when something marks it as a status code.
  ['http-status',   /\b(?:http|https|status|statuscode|status_code|response|code)\s*[:/=]?\s*[1-5]\d{2}\b/i],
  ['http-phrase',   /\b[45]\d{2}\s+(gateway\s+time|internal\s+server|bad\s+gateway|service\s+unavailable|not\s+found|unauthorized|forbidden|too\s+many|request\s+time)/i],
  ['stack-frame',   /(^|\n)\s*at\s+[\w$.<>]+\s*\(|\bTraceback\s*\(most recent call last\)|File\s+"[^"]+",\s*line\s+\d+/],
  ['exception',     /\b[A-Z]\w*(?:Exception|Error)\b\s*[::]/],
  ['log-level',     /\[\s*(ERROR|FATAL|CRITICAL|CRIT|WARN|WARNING)\s*\]/i],
  ['timestamp-log', /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/],
  ['cert',          /\b(certificate\s+(has\s+)?expired|cert\s+expired|ssl\s+handshake|tls\s+(alert|handshake)|x509)\b/i],
  ['metric',        /\b\d+(?:\.\d+)?\s*(?:ms|µs|us|gb|mb|gi|mi|rps|qps|req\/s)\b/i],
  ['percentile',    /\b(p50|p90|p95|p99|p999)\b/i],
  ['resource-full', /\b(no space left on device|out of memory|disk (is )?full|quota exceeded|too many open files|connection pool (exhausted|full))\b/i],
  ['systemd',       /\b(failed to start|active:\s*failed|job for .+ failed|unit .+ entered failed state)\b/i],
];

/** Mood words: real but non-specific distress signals. */
const WEAK_SIGNALS: [string, RegExp][] = [
  ['generic-fault', /\b(error|err|errors|exception|fault|fail|failed|failure|crash|crashed|broken|down|outage|issue|problem|bug|stuck|hang|hung)\b/i],
  ['generic-perf',  /\b(slow|slowness|lag|laggy|latency|spike|timeout|timed out|unresponsive|unavailable|degraded)\b/i],
  ['bare-number',   /\b\d{3}\b/],
  ['infra-noun',    /\b(server|service|pod|node|cluster|database|db|api|app|website|site|network|disk|cpu|memory)\b/i],
];

/**
 * Narrow out-of-scope patterns: identity lookups and general knowledge.
 * Kept deliberately tight so legitimate ops phrasing ("who is on call")
 * is not caught.
 */
const OFF_TOPIC_SIGNALS: RegExp[] = [
  // "who is arun" / "who was X" — but not on-call rota questions
  /\bwho\s+(?:is|are|was|were)\s+(?!on[\s-]?call\b|the\s+on[\s-]?call\b|paged\b|assigned\b|responsible\b|owner\b)[a-z]/i,
  /\bwhat\s+is\s+the\s+(?:capital|population|weather|time\s+in|meaning\s+of\s+life)\b/i,
  /\b(?:tell|teach)\s+me\s+about\s+(?!this\b|the\s+(?:error|incident|alert|log|outage)\b)/i,
  /\b(?:write|compose|draft|generate)\s+(?:me\s+)?(?:a|an)\s+(?:poem|story|essay|song|joke|haiku|rap|novel)\b/i,
  /\b(?:recipe|lyrics|horoscope|movie\s+recommendation)\b/i,
  /\bhow\s+(?:old|tall|rich|far)\s+is\b/i,
  /\b(?:translate|summarize)\s+(?:this\s+)?(?:into|to)\s+[a-z]+\b/i,
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every error code and phrase the knowledge base has a runbook for.
 *
 * Derived from the KB rather than hand-listed, so adding a runbook
 * automatically teaches the gate to recognise its codes. A hand-maintained
 * list drifted badly: EADDRINUSE, CERT_HAS_EXPIRED, NXDOMAIN and 34 others
 * were runbook-covered but refused at the door.
 *
 * Purely numeric codes ("504", "137") are excluded deliberately — a bare
 * three-digit number is not enough to triage on its own, and is still caught
 * by the http-status-in-context rule above. Named codes and phrases are
 * unambiguous, so they count as strong evidence.
 */
const KB_CODE_PATTERNS: RegExp[] = Array.from(
  new Set(
    KNOWLEDGE_BASE.flatMap(a => a.errorCodes)
      .map(c => c.trim())
      .filter(c => c.length >= 4 && !/^\d+$/.test(c))
  )
).map(code => new RegExp(`(^|[^a-z0-9_-])${escapeRegex(code.toLowerCase())}([^a-z0-9_-]|$)`, 'i'));

function matchesKnownCode(text: string): boolean {
  return KB_CODE_PATTERNS.some(re => re.test(text));
}

/** Substantial enough that weak signals are probably describing something real. */
function looksSubstantial(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  return text.length >= 120 || lines.length >= 3;
}

export function classifyInput(raw: string): InputClassification {
  const text = (raw || '').trim();

  const strongHits = STRONG_SIGNALS.filter(([, re]) => re.test(text)).map(([k]) => k);
  if (matchesKnownCode(text)) strongHits.push('kb-error-code');
  const weakHits = WEAK_SIGNALS.filter(([, re]) => re.test(text)).map(([k]) => k);

  // Off-topic wins over weak signals: "Error 404 Who is arun" carries the word
  // "error", but the actual request is an identity lookup. A strong signal
  // overrides, so a genuine log that happens to contain such a phrase still
  // gets triaged.
  if (strongHits.length === 0 && OFF_TOPIC_SIGNALS.some(re => re.test(text))) {
    return { kind: 'off-topic', strongHits, weakHits };
  }

  if (strongHits.length > 0) {
    return { kind: 'diagnostic', strongHits, weakHits };
  }

  if (weakHits.length === 0) {
    return { kind: 'insufficient', strongHits, weakHits };
  }

  // Weak signals only. A long paste or several corroborating hints is enough
  // to attempt triage; a two-word complaint is not.
  const corroborated =
    looksSubstantial(text) ||
    (weakHits.length >= 3 && text.length >= 60);

  return { kind: corroborated ? 'diagnostic' : 'vague', strongHits, weakHits };
}
