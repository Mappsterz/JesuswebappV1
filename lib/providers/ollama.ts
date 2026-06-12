import { fetchWithRetry } from '@/lib/retry';
import { SYSTEM_PROMPT } from '@/lib/systemPrompt';
import type { ChatMessage } from '@/lib/types';
import type { ChatProvider } from './types';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'walk-with-me';

/* Ollama runtime sampling (overrides Modelfile so tuning needs no model rebuild). */
const OLLAMA_TEMPERATURE = Number(process.env.OLLAMA_TEMPERATURE) || 0.85;
const OLLAMA_TOP_P = Number(process.env.OLLAMA_TOP_P) || 0.92;
const OLLAMA_REPEAT_PENALTY = Number(process.env.OLLAMA_REPEAT_PENALTY) || 1.2;

/* Sentinel error: the model isn't installed — a setup problem to surface to
   the user, not a transient failure to mask with a provider fallback. */
export const OLLAMA_MODEL_NOT_FOUND = 'OLLAMA_MODEL_NOT_FOUND';

/* Ollama streams NDJSON: one JSON object per line, `done: true` terminates. */
async function* parseNdjsonChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) yield json.message.content;
        if (json.done) return;
      } catch {
        // Partial JSON — skip
      }
    }
  }

  if (buffer.trim()) {
    try {
      const json = JSON.parse(buffer);
      if (json.message?.content) yield json.message.content;
    } catch {
      // skip
    }
  }
}

export const ollamaProvider: ChatProvider = {
  name: 'ollama',
  async open(messages: ChatMessage[]) {
    const ollamaMessages = [
      /* Send unified system prompt at runtime for consistent persona */
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        })),
    ];

    const response = await fetchWithRetry(
      () =>
        fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: ollamaMessages,
            stream: true,
            keep_alive: -1, // Prevent model unloading after idle
            options: {
              num_predict: 768,
              temperature: OLLAMA_TEMPERATURE,
              top_p: OLLAMA_TOP_P,
              repeat_penalty: OLLAMA_REPEAT_PENALTY,
            },
          }),
        }),
      { maxRetries: 2, baseDelay: 500 }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(OLLAMA_MODEL_NOT_FOUND);
      }
      const errorText = await response.text();
      throw new Error(`Ollama error (${response.status}): ${errorText}`);
    }

    return {
      backend: 'ollama',
      model: OLLAMA_MODEL,
      chunks: parseNdjsonChunks(response.body!),
    };
  },
};

/**
 * Enhanced Ollama health check:
 * - Verifies the server is reachable
 * - Verifies the target model is actually loaded/available
 */
export async function isOllamaAvailable(): Promise<{ available: boolean; modelLoaded: boolean }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return { available: false, modelLoaded: false };

    // Check if our specific model is in the list
    const data = await res.json();
    const models = data.models || [];
    const modelLoaded = models.some(
      (m: { name: string }) =>
        m.name === OLLAMA_MODEL || m.name === `${OLLAMA_MODEL}:latest`
    );

    return { available: true, modelLoaded };
  } catch {
    return { available: false, modelLoaded: false };
  }
}
