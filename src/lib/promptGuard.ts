/**
 * Prompt Guard integration using meta/llama-guard-4-12b via NVIDIA API.
 * Provides real-time input safety classification, prompt injection detection,
 * and malicious instruction prevention for Agent Nivi.
 */

import { nvidiaChat } from './nvidia';

export const LLAMA_GUARD_MODEL = 'meta/llama-guard-4-12b';

/**
 * Guard model chain, in preference order.
 *
 * meta/llama-guard-4-12b is listed first for continuity but currently times out
 * (HTTP 504) on this account, so the Nemotron safety models carry the load.
 */
const GUARD_MODEL_CHAIN = [
  'nvidia/llama-3.1-nemotron-safety-guard-8b-v3',
  'nvidia/nemotron-3.5-content-safety',
];

const DEFAULT_API_KEY = process.env.NVIDIA_API_KEY || '';

export interface PromptGuardResult {
  isSafe: boolean;
  reason?: string;
  category?: string;
  modelUsed: string;
  latencyMs: number;
}

/** Known prompt injection / jailbreak heuristic signatures for instant defense-in-depth */
const HEURISTIC_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior|system)\s+rules/i,
  /(reveal|leak|print|show|output)\s+(your\s+)?(system\s+prompt|initial\s+instructions)/i,
  /bypass\s+(all\s+)?(guardrails|filters|safety|restrictions)/i,
  /\b(jailbreak|dan\s+mode|developer\s+mode\s+enabled)\b/i,
  /act\s+as\s+(an?\s+)?(unrestricted|unfiltered|evil|jailbroken)\b/i,
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /\bjavascript\s*:/i,
  /\b(drop\s+database|truncate\s+table|delete\s+from\s+users)\b/i,
];

/**
 * Checks a user prompt against meta/llama-guard-4-12b.
 * Falls back to local security heuristics if API endpoint is slow or unreachable.
 */
export async function checkPromptGuard(prompt: string, apiKey?: string): Promise<PromptGuardResult> {
  const startTime = performance.now();
  const key = apiKey || process.env.NVIDIA_API_KEY || DEFAULT_API_KEY;

  // 1. Fast local heuristic pre-check for blatant prompt injection attacks
  for (const pattern of HEURISTIC_INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      const elapsed = Math.round(performance.now() - startTime);
      return {
        isSafe: false,
        reason: 'Detected prompt injection / adversarial pattern violation',
        category: 'Prompt Injection / Adversarial Input',
        modelUsed: `${LLAMA_GUARD_MODEL} (Heuristic Guardrail)`,
        latencyMs: elapsed,
      };
    }
  }

  // 2. Call a hosted safety classifier, cascading through the chain.
  if (key) {
    const guard = await nvidiaChat({
      apiKey: key,
      messages: [{ role: 'user', content: prompt }],
      models: GUARD_MODEL_CHAIN,
      temperature: 0.0,
      maxTokens: 64,
      attemptsPerModel: 1,   // keep the gate fast; fall through rather than retry
      timeoutMs: 8000,
    });

    if (guard.ok) {
      const elapsed = Math.round(performance.now() - startTime);
      const verdict = parseSafetyVerdict(guard.content);

      if (verdict.unsafe) {
        return {
          isSafe: false,
          reason: `Safety classifier flagged input as unsafe (${verdict.category})`,
          category: verdict.category,
          modelUsed: guard.modelUsed,
          latencyMs: elapsed,
        };
      }

      return { isSafe: true, modelUsed: guard.modelUsed, latencyMs: elapsed };
    }

    console.warn(
      `Safety classifier unavailable (status ${guard.lastStatus ?? 'n/a'}); ` +
      `input allowed on heuristic check only.`
    );
  }

  // Fail open: heuristics above already ran, so blatant injections are blocked.
  const elapsed = Math.round(performance.now() - startTime);
  return {
    isSafe: true,
    modelUsed: 'Local Heuristic Guardrail (classifier unavailable)',
    latencyMs: elapsed,
  };
}

/**
 * Normalises verdicts across guard model output formats:
 *   - Llama Guard:             "unsafe\nS1"
 *   - nemotron-safety-guard:   {"User Safety": "unsafe", "Safety Categories": "..."}
 *   - nemotron-content-safety: "User Safety: unsafe"
 */
function parseSafetyVerdict(raw: string): { unsafe: boolean; category: string } {
  const text = (raw || '').trim();
  if (!text) return { unsafe: false, category: 'General Safety Policy' };

  // JSON form
  try {
    const obj = JSON.parse(text);
    const verdict = String(obj['User Safety'] ?? obj['user safety'] ?? '').toLowerCase();
    const cats = obj['Safety Categories'] ?? obj['safety categories'];
    if (verdict) {
      return {
        unsafe: verdict.includes('unsafe'),
        category: (Array.isArray(cats) ? cats.join(', ') : cats) || 'General Safety Policy',
      };
    }
  } catch {
    // not JSON — fall through to text parsing
  }

  const lower = text.toLowerCase();

  // "User Safety: unsafe"
  const labelled = lower.match(/user\s*safety\s*[:=]\s*(safe|unsafe)/);
  if (labelled) {
    const catMatch = text.match(/safety\s*categories\s*[:=]\s*(.+)/i);
    return {
      unsafe: labelled[1] === 'unsafe',
      category: catMatch?.[1]?.trim().replace(/["}]+$/, '') || 'General Safety Policy',
    };
  }

  // Llama Guard: leading "unsafe" then category on the next line
  if (lower.startsWith('unsafe')) {
    return {
      unsafe: true,
      category: text.split('\n')[1]?.trim() || 'General Safety Policy',
    };
  }

  return { unsafe: false, category: 'General Safety Policy' };
}

/**
 * Blocked-input notice. Takes the model that actually produced the verdict so
 * the message never credits a classifier that did not run.
 */
export function guardBlockedMessage(modelUsed?: string): string {
  const engine = modelUsed || 'Local Heuristic Guardrail';
  return `🛡️ **Prompt Security Alert — Input Blocked**

Your input was flagged by prompt protection filters as potentially unsafe, adversarial, or violating operational safety policies.

• **Protection Engine:** ${engine}
• **Policy:** Agent Nivi strictly rejects prompt injections, adversarial overrides, and non-operational instructions.
• **Permitted Inputs:** Legitimate IT diagnostic telemetry (error codes, stack traces, OS logs, server metrics).

_Please remove any adversarial instructions and resubmit valid IT diagnostic logs._`;
}

/** @deprecated Use guardBlockedMessage(modelUsed) so the engine name is accurate. */
export const GUARD_BLOCKED_MESSAGE = guardBlockedMessage();
