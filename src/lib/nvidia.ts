/**
 * NVIDIA API client with retry and model fallback.
 *
 * The flagship 550B model frequently returns 503 "Service temporarily
 * overloaded". Rather than silently dropping to canned KB content, we retry
 * with backoff and then cascade to smaller models that are actually serving.
 */

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/** HTTP statuses that mean "try again" rather than "this request is wrong". */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** Human-facing labels for the models we may end up using. */
export const MODEL_LABELS: Record<string, string> = {
  'nvidia/nemotron-3-ultra-550b-a55b': 'NVIDIA Nemotron-3 Ultra 550B',
  'nvidia/nemotron-3-super-120b-a12b': 'NVIDIA Nemotron-3 Super 120B',
  'nvidia/nemotron-3.5-lightning-30b-a3b': 'NVIDIA Nemotron-3.5 Lightning 30B',
  'nvidia/nemotron-nano-3-30b-a3b': 'NVIDIA Nemotron Nano-3 30B',
};

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] || model;
}

/**
 * Triage/chat model chain, preferring models that are currently serving.
 * The environment-selected model remains available as an optional final
 * choice so a deployment can opt into a specific model without being forced
 * to use an unavailable endpoint first.
 */
export function getModelChain(): string[] {
  const configured = process.env.NVIDIA_MODEL || process.env.NVIDIA_FAST_MODEL;
  const preferred = [
    'nvidia/nemotron-3.5-lightning-30b-a3b',
    'nvidia/nemotron-3-super-120b-a12b',
  ];
  const secondary = [
    'nvidia/nemotron-nano-3-30b-a3b',
  ];
  return [
    ...preferred,
    ...(configured && !preferred.includes(configured) ? [configured] : []),
    ...secondary.filter(m => m !== configured),
  ];
}

export interface ChatMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NvidiaChatResult {
  ok: boolean;
  /** Assistant message text (the `content` field). */
  content: string;
  /** Chain-of-thought text, when the model emits `reasoning_content`. */
  reasoning: string;
  /** Model id that actually served the request. */
  modelUsed: string;
  /** "stop" normally; "length" means the reply hit max_tokens and is truncated. */
  finishReason?: string;
  /** True when a fallback served instead of the requested primary. */
  usedFallback: boolean;
  /** Per-model outcome, for logging and diagnostics. */
  attempts: { model: string; status?: number; error?: string }[];
  lastStatus?: number;
  lastError?: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calls the NVIDIA chat completions API, retrying transient failures and
 * cascading through the model chain until one succeeds.
 */
export async function nvidiaChat(opts: {
  apiKey: string;
  messages: ChatMessageParam[];
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  /** Retry attempts per model before moving to the next one. */
  attemptsPerModel?: number;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}): Promise<NvidiaChatResult> {
  const {
    apiKey,
    messages,
    models = getModelChain(),
    temperature = 0.15,
    maxTokens = 2048,
    attemptsPerModel = 1,
    timeoutMs = 15000,
  } = opts;

  const attempts: NvidiaChatResult['attempts'] = [];
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let m = 0; m < models.length; m++) {
    const model = models[m];

    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(NVIDIA_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const choice = data?.choices?.[0];
          const msg = choice?.message;
          attempts.push({ model, status: response.status });
          if (choice?.finish_reason === 'length') {
            console.warn(
              `NVIDIA model ${model} hit max_tokens (${maxTokens}); reply is truncated.`
            );
          }
          return {
            ok: true,
            content: msg?.content || '',
            reasoning: msg?.reasoning_content || '',
            modelUsed: model,
            finishReason: choice?.finish_reason,
            usedFallback: m > 0,
            attempts,
          };
        }

        lastStatus = response.status;
        lastError = await response.text().catch(() => '');
        attempts.push({ model, status: response.status });

        // A non-retryable status (bad key, unknown model) will not improve on
        // retry — move straight to the next model.
        if (!RETRYABLE_STATUSES.has(response.status)) break;

        if (attempt < attemptsPerModel) {
          await sleep(400 * Math.pow(2, attempt - 1)); // 400ms, 800ms, ...
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err?.message || String(err);
        attempts.push({ model, error: lastError });
        if (attempt < attemptsPerModel) {
          await sleep(400 * Math.pow(2, attempt - 1));
        }
      }
    }

    console.warn(
      `NVIDIA model ${model} unavailable (status ${lastStatus ?? 'n/a'}${lastError ? `: ${lastError.slice(0, 120)}` : ''}).` +
      (m < models.length - 1 ? ` Falling back to ${models[m + 1]}.` : ' No models left.')
    );
  }

  return {
    ok: false,
    content: '',
    reasoning: '',
    modelUsed: models[0],
    usedFallback: false,
    attempts,
    lastStatus,
    lastError,
  };
}
