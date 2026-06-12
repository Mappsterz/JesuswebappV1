import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from '@/lib/systemPrompt';
import type { ChatMessage } from '@/lib/types';
import type { ChatProvider } from './types';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 768;

/* Sampling — tuned for warmth + variety. A higher temperature and top_p push
   the model away from formulaic, repetitive phrasing across a long conversation.
   (Note: gemini-2.5-flash rejects presence/frequency penalties, so we rely on
   temperature + top_p here.) All env-tunable for zero-redeploy tuning. */
const GEMINI_TEMPERATURE = Number(process.env.GEMINI_TEMPERATURE) || 0.9;
const GEMINI_TOP_P = Number(process.env.GEMINI_TOP_P) || 0.95;

/* Gemini model fallback chain — tried in order. If first returns 429/503, try next. */
const GEMINI_MODELS: string[] = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

/* gemini-2.5-flash "thinks" by default, and thinking tokens count against
   maxOutputTokens — a long hidden reasoning pass can eat nearly the whole
   budget and cut the visible reply off mid-sentence (observed: 735 of 768
   tokens spent on thoughts, 29 left for the answer). Thinking is disabled
   by default. Set GEMINI_THINKING_BUDGET to -1 for dynamic thinking or a
   positive token cap (required for models like gemini-2.5-pro that cannot
   disable thinking); set it to "off" to omit thinkingConfig entirely. */
const GEMINI_THINKING_BUDGET = Number(process.env.GEMINI_THINKING_BUDGET ?? '0');

export function isGeminiConfigured(): boolean {
  return Boolean(GEMINI_API_KEY);
}

/* ── Gemini client singleton ── */
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return geminiClient;
}

type GeminiChunk = {
  text?: string;
  candidates?: { finishReason?: string }[];
};

async function* geminiChunks(
  response: AsyncIterable<GeminiChunk>,
  model: string
): AsyncGenerator<string> {
  let finishReason: string | undefined;
  for await (const chunk of response) {
    if (chunk.text) yield chunk.text;
    const reason = chunk.candidates?.[0]?.finishReason;
    if (reason) finishReason = reason;
  }
  /* MAX_TOKENS here means the visible reply was truncated mid-sentence —
     surface it in logs so token-budget problems are diagnosable. */
  if (finishReason && finishReason !== 'STOP') {
    console.warn(`[Walk With Me] gemini ${model} finished with ${finishReason}`);
  }
}

export const geminiProvider: ChatProvider = {
  name: 'gemini',
  async open(messages: ChatMessage[]) {
    const ai = getGeminiClient();

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: m.content }],
      }));

    /* Try each model in the fallback chain */
    let lastError: Error | null = null;

    for (const modelName of GEMINI_MODELS) {
      try {
        const response = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: GEMINI_TEMPERATURE,
            topP: GEMINI_TOP_P,
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
            ...(Number.isFinite(GEMINI_THINKING_BUDGET)
              ? { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET } }
              : {}),
          },
        });
        return { backend: 'gemini', model: modelName, chunks: geminiChunks(response, modelName) };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const errMsg = lastError.message.toLowerCase();

        // Clearly non-retryable (bad request, auth, permission) — stop immediately.
        if (
          errMsg.includes('400') ||
          errMsg.includes('401') ||
          errMsg.includes('403') ||
          errMsg.includes('api key') ||
          errMsg.includes('permission')
        ) {
          break;
        }

        // Rate-limit, service-unavailable, timeouts, or transient network blips
        // (fetch failed / ECONNRESET / 500 / 502 / 503) — try the next model.
        console.warn(`[Walk With Me] ${modelName} failed (${lastError.message}); trying next model...`);
        continue;
      }
    }

    throw lastError ?? new Error('All Gemini models failed');
  },
};
