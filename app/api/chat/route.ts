import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { trimMessagesForApi } from '@/lib/chatContext';
import { ChatMessage, ChatRequest } from '@/lib/types';
import { SYSTEM_PROMPT, CRISIS_RESPONSE_PREFIX, detectCrisis } from '@/lib/systemPrompt';
import { fetchWithRetry } from '@/lib/retry';

/* ═══════════════════════════════════════════════════════════════════════════
   Dual-mode API route:
   • LOCAL  → Ollama (walk-with-me model at localhost:11434)
   • CLOUD  → Google Gemini (when GEMINI_API_KEY is set, e.g. on Vercel)

   Improvements:
   - Retry with exponential backoff on Ollama/Gemini calls
   - Streaming chunk timeout watchdog (15s)
   - Gemini model fallback chain
   - Unified system prompt for both backends
   - Upgraded Ollama health check (verifies model is loaded)
   - Structured in-stream error markers for client retry UI
   - keep_alive: -1 to prevent Ollama cold starts
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Configuration (env-driven for zero-redeploy changes) ── */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'walk-with-me';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 768;

/* Sampling — tuned for warmth + variety. A higher temperature and top_p push
   the model away from formulaic, repetitive phrasing across a long conversation.
   (Note: gemini-2.5-flash rejects presence/frequency penalties, so we rely on
   temperature + top_p here.) All env-tunable for zero-redeploy tuning. */
const GEMINI_TEMPERATURE = Number(process.env.GEMINI_TEMPERATURE) || 0.9;
const GEMINI_TOP_P = Number(process.env.GEMINI_TOP_P) || 0.95;

/* Ollama runtime sampling (overrides Modelfile so tuning needs no model rebuild). */
const OLLAMA_TEMPERATURE = Number(process.env.OLLAMA_TEMPERATURE) || 0.85;
const OLLAMA_TOP_P = Number(process.env.OLLAMA_TOP_P) || 0.92;
const OLLAMA_REPEAT_PENALTY = Number(process.env.OLLAMA_REPEAT_PENALTY) || 1.2;

/* Gemini model fallback chain — tried in order. If first returns 429/503, try next. */
const GEMINI_MODELS: string[] = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/* Streaming watchdog: abort if no chunk arrives within this window */
const CHUNK_TIMEOUT_MS = 15_000;

/* Cold-start observability: true only for the first request served by this
   function instance. Lets logs distinguish "slow because cold" from "failed". */
let isColdInstance = true;

type RequestMeta = { requestStart: number; coldStart: boolean };

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

/* ── Structured in-stream error marker ── */
function encodeStreamError(
  encoder: TextEncoder,
  message: string,
  canRetry: boolean = true
): Uint8Array {
  return encoder.encode(
    `\n\n<!--STREAM_ERROR:${JSON.stringify({ type: 'stream_error', message, canRetry })}-->`
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OLLAMA BACKEND
   ═══════════════════════════════════════════════════════════════════════════ */

async function streamFromOllama(
  messages: ChatMessage[],
  isCrisis: boolean,
  meta: RequestMeta
): Promise<Response> {
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

  const ollamaResponse = await fetchWithRetry(
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

  if (!ollamaResponse.ok) {
    if (ollamaResponse.status === 404) {
      throw new Error('OLLAMA_MODEL_NOT_FOUND');
    }
    const errorText = await ollamaResponse.text();
    throw new Error(`Ollama error (${ollamaResponse.status}): ${errorText}`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = ollamaResponse.body!.getReader();
      const decoder = new TextDecoder();

      /* ── Chunk timeout watchdog ── */
      let chunkTimer: ReturnType<typeof setTimeout> | null = null;

      function resetChunkTimer() {
        if (chunkTimer) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => {
          console.warn('[Walk With Me] Ollama chunk timeout — no data for 15s');
          controller.enqueue(
            encodeStreamError(encoder, 'Response timed out. Please try again.', true)
          );
          try { controller.close(); } catch { /* already closed */ }
        }, CHUNK_TIMEOUT_MS);
      }

      try {
        if (isCrisis) {
          controller.enqueue(encoder.encode(CRISIS_RESPONSE_PREFIX));
        }

        resetChunkTimer();
        let buffer = '';
        let firstTokenLogged = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          resetChunkTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                if (!firstTokenLogged) {
                  firstTokenLogged = true;
                  console.log('[WWM] first token ' + JSON.stringify({
                    backend: 'ollama',
                    model: OLLAMA_MODEL,
                    ttftMs: Date.now() - meta.requestStart,
                    coldStart: meta.coldStart,
                  }));
                }
                controller.enqueue(encoder.encode(json.message.content));
              }
              if (json.done) {
                if (chunkTimer) clearTimeout(chunkTimer);
                controller.close();
                return;
              }
            } catch {
              // Partial JSON — skip
            }
          }
        }

        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.message?.content) {
              controller.enqueue(encoder.encode(json.message.content));
            }
          } catch {
            // skip
          }
        }

        if (chunkTimer) clearTimeout(chunkTimer);
        controller.close();
      } catch (err) {
        if (chunkTimer) clearTimeout(chunkTimer);
        console.error('Ollama stream error:', err);
        controller.enqueue(
          encodeStreamError(encoder, 'Connection lost during response. Please try again.', true)
        );
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   GEMINI BACKEND — with model fallback chain
   ═══════════════════════════════════════════════════════════════════════════ */

async function streamFromGemini(
  messages: ChatMessage[],
  isCrisis: boolean,
  meta: RequestMeta
): Promise<Response> {
  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    }));

  /* Try each model in the fallback chain */
  let response;
  let lastError: Error | null = null;
  let selectedModel = GEMINI_MODELS[0];

  for (const modelName of GEMINI_MODELS) {
    try {
      response = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: GEMINI_TEMPERATURE,
          topP: GEMINI_TOP_P,
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        },
      });
      selectedModel = modelName;
      lastError = null;
      break; // Success — stop trying models
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

  if (!response || lastError) {
    const errMsg = lastError ? lastError.message : 'All Gemini models failed';
    console.error('[Walk With Me] Gemini generateContentStream error:', errMsg);
    return new Response(
      JSON.stringify({ error: `Gemini API error: ${errMsg}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[Walk With Me] Streaming from Gemini model: ${selectedModel}`);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      /* ── Chunk timeout watchdog ── */
      let chunkTimer: ReturnType<typeof setTimeout> | null = null;

      function resetChunkTimer() {
        if (chunkTimer) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => {
          console.warn('[Walk With Me] Gemini chunk timeout — no data for 15s');
          controller.enqueue(
            encodeStreamError(encoder, 'Response timed out. Please try again.', true)
          );
          try { controller.close(); } catch { /* already closed */ }
        }, CHUNK_TIMEOUT_MS);
      }

      try {
        if (isCrisis) {
          controller.enqueue(encoder.encode(CRISIS_RESPONSE_PREFIX));
        }

        resetChunkTimer();
        let firstTokenLogged = false;
        let totalChars = 0;
        for await (const chunk of response) {
          resetChunkTimer();
          const text = chunk.text;
          if (text) {
            if (!firstTokenLogged) {
              firstTokenLogged = true;
              console.log('[WWM] first token ' + JSON.stringify({
                backend: 'gemini',
                model: selectedModel,
                ttftMs: Date.now() - meta.requestStart,
                coldStart: meta.coldStart,
              }));
            }
            totalChars += text.length;
            controller.enqueue(encoder.encode(text));
          }
        }

        console.log('[WWM] stream complete ' + JSON.stringify({
          backend: 'gemini',
          model: selectedModel,
          totalChars,
          durationMs: Date.now() - meta.requestStart,
          coldStart: meta.coldStart,
        }));
        if (chunkTimer) clearTimeout(chunkTimer);
        controller.close();
      } catch (err) {
        if (chunkTimer) clearTimeout(chunkTimer);
        console.error('[Walk With Me] Gemini stream error:', err);
        controller.enqueue(
          encodeStreamError(encoder, 'Connection lost during response. Please try again.', true)
        );
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   BACKEND SELECTION & HEALTH CHECKS
   ═══════════════════════════════════════════════════════════════════════════ */

function getBackendMode(): 'ollama' | 'gemini' {
  if (process.env.OLLAMA_URL) return 'ollama';
  if (GEMINI_API_KEY) return 'gemini';
  return 'ollama';
}

/**
 * Enhanced Ollama health check:
 * - Verifies the server is reachable
 * - Verifies the target model is actually loaded/available
 */
async function isOllamaAvailable(): Promise<{ available: boolean; modelLoaded: boolean }> {
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

/* ═══════════════════════════════════════════════════════════════════════════
   POST HANDLER
   ═══════════════════════════════════════════════════════════════════════════ */

export async function POST(request: NextRequest) {
  const meta: RequestMeta = { requestStart: Date.now(), coldStart: isColdInstance };
  isColdInstance = false;
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages array is required and must not be empty' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const messages = trimMessagesForApi(body.messages);

    const latestUserMessage = [...messages]
      .reverse()
      .find((m: ChatMessage) => m.role === 'user');
    const isCrisis = latestUserMessage ? detectCrisis(latestUserMessage.content) : false;

    const mode = getBackendMode();

    if (mode === 'gemini') {
      return await streamFromGemini(messages, isCrisis, meta);
    }

    if (mode === 'ollama') {
      /* When Ollama is the only backend there's nothing to fall back to, so the
         pre-flight health check is pure latency — go straight to streaming and
         let the stream attempt surface any error. Only probe when a Gemini
         fallback exists and we need to decide whether to use it. */
      if (!GEMINI_API_KEY) {
        try {
          return await streamFromOllama(messages, isCrisis, meta);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg === 'OLLAMA_MODEL_NOT_FOUND') {
            return new Response(
              JSON.stringify({
                error: `Model "${OLLAMA_MODEL}" not found. Run: cd ollama && bash setup.sh`,
              }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
          }
          throw err;
        }
      }

      const { available: ollamaUp, modelLoaded } = await isOllamaAvailable();

      if (ollamaUp) {
        if (!modelLoaded) {
          console.warn(`[Walk With Me] Ollama is up but model "${OLLAMA_MODEL}" not found in model list`);
          // Still try — model might be pulling or the name format differs
        }

        try {
          return await streamFromOllama(messages, isCrisis, meta);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg === 'OLLAMA_MODEL_NOT_FOUND') {
            return new Response(
              JSON.stringify({
                error: `Model "${OLLAMA_MODEL}" not found. Run: cd ollama && bash setup.sh`,
              }),
              { status: 404, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (GEMINI_API_KEY) {
            console.warn('[Walk With Me] Ollama failed, falling back to Gemini:', msg);
            return await streamFromGemini(messages, isCrisis, meta);
          }
          throw err;
        }
      }

      if (GEMINI_API_KEY) {
        console.warn('[Walk With Me] Ollama unreachable, falling back to Gemini');
        return await streamFromGemini(messages, isCrisis, meta);
      }
    }

    return new Response(
      JSON.stringify({
        error: 'No AI backend available. Please start Ollama (`ollama serve`) or configure a GEMINI_API_KEY.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Walk With Me] Chat API error:', error);

    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
