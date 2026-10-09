/**
 * Session memory: what gets carried from one turn to the next.
 *
 * Two layers, deliberately different in character:
 *
 *  1. CHAT HISTORY — the recent transcript, verbatim-ish. Bounded and lossy:
 *     oldest turns fall off, long pastes get middle-truncated, and agent
 *     replies are compressed to their conclusions rather than the full runbook.
 *
 *  2. CONTEXT MEMORY — a small structured ledger (services, error codes,
 *     actions tried, confirmed facts, ruled-out hypotheses). Lossless for the
 *     life of the conversation, because it is append-only and deduplicated,
 *     so a fact confirmed at turn 2 is still known at turn 30 even after the
 *     original message has aged out of the transcript.
 */

import { ChatMessage, ContextMemory, TriageResult } from '../types';
import { PromptChatTurn } from './systemPrompt';

// --- Budgets -----------------------------------------------------------------

/** Most recent turns kept in the transcript (user + agent messages combined). */
export const MAX_HISTORY_TURNS = 12;

/** Per-message character cap before middle-truncation. */
export const MAX_CHARS_PER_TURN = 2000;

/** Hard ceiling on the whole transcript, applied oldest-first. */
export const MAX_HISTORY_CHARS = 12000;

/** Per-field cap on the structured ledger. */
export const MAX_MEMORY_ITEMS = 20;

export const EMPTY_MEMORY: ContextMemory = {
  affectedServices: [],
  errorCodesSeen: [],
  actionsAlreadyTried: [],
  confirmedFacts: [],
  ruledOut: [],
};

// --- Chat history ------------------------------------------------------------

/**
 * Keeps the head and tail of an over-long message. Stack traces and logs carry
 * signal at both ends (the exception line up top, the root frame at the
 * bottom), so trimming the middle preserves more than a plain head cut.
 */
function truncateMiddle(text: string, limit = MAX_CHARS_PER_TURN): string {
  const t = (text || '').trim();
  if (t.length <= limit) return t;
  const keep = Math.floor((limit - 40) / 2);
  return `${t.slice(0, keep)}\n…[${t.length - keep * 2} chars omitted]…\n${t.slice(-keep)}`;
}

/**
 * Compresses an agent reply to its conclusions.
 *
 * The rendered runbook can run 4-6k characters; replaying several of those
 * would consume the whole history budget and crowd out the user's own words.
 * The model only needs to know what it already concluded and recommended.
 */
function summarizeAgentTurn(triage: TriageResult | undefined, fallback: string): string {
  if (!triage) return truncateMiddle(fallback);

  const a = triage.matchedArticle;
  const parts: string[] = [];

  if (triage.agentMessage) parts.push(triage.agentMessage);
  parts.push(`Assessed: ${a.title} (${triage.severity}, confidence ${triage.confidenceScore}%).`);
  if (a.rootCause) parts.push(`Root cause: ${a.rootCause}`);
  if (a.steps?.length) {
    parts.push(
      `Recommended steps: ${a.steps.map(s => `${s.stepNumber}) ${s.title}`).join('; ')}.`
    );
  }
  return truncateMiddle(parts.join(' '), MAX_CHARS_PER_TURN);
}

/**
 * Builds the transcript sent to the model: newest-last, oldest dropped first
 * once either the turn count or the character budget is exceeded.
 */
export function buildChatHistory(messages: ChatMessage[]): PromptChatTurn[] {
  const turns: PromptChatTurn[] = [];

  for (const m of messages) {
    if (m.sender === 'user') {
      const body = [m.content, m.rawSnippet].filter(Boolean).join('\n');
      if (body.trim()) turns.push({ role: 'user', content: truncateMiddle(body) });
    } else if (m.sender === 'agent') {
      const body = m.triageResult
        ? summarizeAgentTurn(m.triageResult, m.content)
        : truncateMiddle(m.content);
      if (body.trim()) turns.push({ role: 'assistant', content: body });
    }
  }

  // Keep the most recent N turns.
  let kept = turns.slice(-MAX_HISTORY_TURNS);

  // Then trim from the front until the transcript fits the character budget.
  const size = (arr: PromptChatTurn[]) =>
    arr.reduce((n, t) => n + t.content.length, 0);
  while (kept.length > 1 && size(kept) > MAX_HISTORY_CHARS) {
    kept = kept.slice(1);
  }

  return kept;
}

// --- Context memory ---------------------------------------------------------

function mergeList(existing: string[] = [], incoming: unknown): string[] {
  const add = Array.isArray(incoming)
    ? incoming.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
  const seen = new Set<string>();
  const out: string[] = [];

  // Newest first so the cap drops the stalest entries, then restore order.
  for (const v of [...existing, ...add]) {
    const key = v.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }

  return out.length > MAX_MEMORY_ITEMS ? out.slice(-MAX_MEMORY_ITEMS) : out;
}

/**
 * Folds a turn's `contextUpdate` into the running ledger. Deduplicated
 * case-insensitively so the model repeating a known fact does not grow memory.
 */
export function mergeContextMemory(
  existing: ContextMemory | undefined,
  update: any
): ContextMemory {
  const base = existing || EMPTY_MEMORY;
  if (!update || typeof update !== 'object') return base;

  return {
    environment: (typeof update.environment === 'string' && update.environment.trim())
      ? update.environment.trim()
      : base.environment,
    affectedServices: mergeList(base.affectedServices, update.affectedServices),
    errorCodesSeen: mergeList(base.errorCodesSeen, update.errorCodesSeen),
    actionsAlreadyTried: mergeList(base.actionsAlreadyTried, update.actionsAlreadyTried),
    confirmedFacts: mergeList(base.confirmedFacts, update.confirmedFacts),
    ruledOut: mergeList(base.ruledOut, update.ruledOut),
  };
}
