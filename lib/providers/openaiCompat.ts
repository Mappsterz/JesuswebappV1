import { fetchWithRetry } from '@/lib/retry';
import { SYSTEM_PROMPT } from '@/lib/systemPrompt';
import type { ChatMessage } from '@/lib/types';
import type { ChatProvider } from './types';

/* ── OpenAI-compatible backend ──
   One code path covers any provider exposing /v1/chat/completions SSE:
   OpenAI, Groq, OpenRouter, Together, Mistral, DeepSeek, llama.cpp,
   LM Studio, and Ollama's own /v1 endpoint. Point OPENAI_BASE_URL at the
   provider and the rest is identical. */
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS) || 768;
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE) || 0.9;
const OPENAI_TOP_P = Number(process.env.OPENAI_TOP_P) || 0.95;

/* Model fallback chain — tried in order, like the Gemini chain. */
const OPENAI_MODELS: string[] = (process.env.OPENAI_MODELS || 'gpt-4o-mini')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

export function isOpenAICompatConfigured(): boolean {
  return Boolean(OPENAI_API_KEY);
}

/* Chat-completions streams are SSE: `data: {json}` lines, `data: [DONE]` ends.
   Each event's JSON payload sits on a single line, so line-buffered parsing
   is sufficient; non-data lines (comments, keep-alives) are skipped. */
async function* parseSseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // Partial or non-JSON event — skip
      }
    }
  }
}

export const openAICompatProvider: ChatProvider = {
  name: 'openai',
  async open(messages: ChatMessage[]) {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const chatMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
    ];

    let lastError: Error | null = null;

    for (const modelName of OPENAI_MODELS) {
      const response = await fetchWithRetry(
        () =>
          fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: modelName,
              messages: chatMessages,
              stream: true,
              temperature: OPENAI_TEMPERATURE,
              top_p: OPENAI_TOP_P,
              max_tokens: OPENAI_MAX_OUTPUT_TOKENS,
            }),
          }),
        { maxRetries: 1, baseDelay: 500 }
      );

      if (response.ok && response.body) {
        return {
          backend: 'openai',
          model: modelName,
          chunks: parseSseChunks(response.body),
        };
      }

      const errorText = await response.text().catch(() => '');
      lastError = new Error(
        `${OPENAI_BASE_URL} ${modelName} error (${response.status}): ${errorText.slice(0, 300)}`
      );

      /* Auth/request errors won't be fixed by a different model — stop.
         404 (unknown model id), 429, and 5xx are worth trying the next one. */
      if ([400, 401, 403].includes(response.status)) break;
      console.warn(`[Walk With Me] ${modelName} failed (${response.status}); trying next model...`);
    }

    throw lastError ?? new Error('All OpenAI-compatible models failed');
  },
};
