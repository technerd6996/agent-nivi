/**
 * Reads error content out of a screenshot.
 *
 * Two-stage by design: a vision model transcribes what is actually visible,
 * then that text goes through the normal triage pipeline (classifier -> KB
 * match -> system prompt). Keeping the stages separate means the grounding
 * rules, KB matching and severity logic all still apply, and the transcript
 * can be shown to the user so they can see what the agent actually read.
 *
 * The triage model itself is text-only, so this is also the only way an image
 * can reach it.
 */

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/** Vision model chain, most capable first. */
const VISION_MODELS = [
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
];

const EXTRACT_PROMPT =
  `You are reading a screenshot supplied by an engineer during an IT incident.

Transcribe ONLY what is actually visible. Do not diagnose, do not suggest fixes, and do not invent values that are not shown.

Report, in plain text:
1. Any error codes, exit codes, HTTP status codes, or error identifiers.
2. Any process/pod/container/service/host names and namespaces.
3. Any status or state words (CrashLoopBackOff, OOMKilled, Failed, Pending, NotReady, Terminated).
4. Any log lines, stack frames, or exception messages — verbatim.
5. Any metrics with units (memory limits, latency, CPU, disk).
6. Any timestamps.

If the image contains no error or diagnostic information, reply with exactly: NO_DIAGNOSTIC_CONTENT

Be complete but do not add commentary.`;

export interface VisionExtractResult {
  ok: boolean;
  /** Transcribed diagnostic text, or '' on failure. */
  text: string;
  modelUsed?: string;
  /** True when the model reported the image has no diagnostic content. */
  empty: boolean;
  error?: string;
  status?: number;
}

/**
 * Sends a data-URL image to the vision model chain and returns the
 * transcription. Falls through the chain on transient failures.
 */
export async function extractFromImage(
  imageDataUrl: string,
  apiKey: string,
  userNote?: string
): Promise<VisionExtractResult> {
  if (!imageDataUrl?.startsWith('data:image/')) {
    return { ok: false, text: '', empty: false, error: 'not-an-image-data-url' };
  }

  const userText = userNote?.trim()
    ? `${EXTRACT_PROMPT}\n\nThe engineer also wrote: "${userNote.trim()}"`
    : EXTRACT_PROMPT;

  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (const model of VISION_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(NVIDIA_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: userText },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          }],
          temperature: 0,
          max_tokens: 900,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        lastStatus = response.status;
        lastError = await response.text().catch(() => '');
        console.warn(`Vision model ${model} returned ${response.status}; trying next.`);
        continue;
      }

      const data = await response.json();
      const raw = (data?.choices?.[0]?.message?.content || '').trim();

      if (!raw) {
        lastError = 'empty-response';
        continue;
      }

      if (/^NO_DIAGNOSTIC_CONTENT/i.test(raw)) {
        return { ok: true, text: '', empty: true, modelUsed: model };
      }

      return { ok: true, text: raw, empty: false, modelUsed: model };
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err?.message || String(err);
      console.warn(`Vision model ${model} failed: ${lastError}; trying next.`);
    }
  }

  return { ok: false, text: '', empty: false, error: lastError, status: lastStatus };
}
