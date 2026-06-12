import { NextRequest } from 'next/server';
import { trimMessagesForApi } from '@/lib/chatContext';
import { ChatMessage, ChatRequest } from '@/lib/types';
import { CRISIS_RESPONSE_PREFIX, detectCrisis } from '@/lib/systemPrompt';
import { buildProviderChain, type ProviderStream } from '@/lib/providers';
import { isOllamaAvailable, OLLAMA_MODEL, OLLAMA_MODEL_NOT_FOUND } from '@/lib/providers/ollama';

/* ═══════════════════════════════════════════════════════════════════════════
   Provider-agnostic chat route.

   Adapters in lib/providers/ turn each backend (Ollama, OpenAI-compatible,
   Gemini) into a plain async iterable of text chunks; this route owns
   everything backend-independent:
   - Provider fallback chain (buildProviderChain, env-driven order)
   - Streaming chunk timeout watchdog (15s)
   - Crisis-response prefix injection
   - Structured in-stream error markers for client retry UI
   - First-token / completion observability logs
   ═══════════════════════════════════════════════════════════════════════════ */

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/* Streaming watchdog: abort if no chunk arrives within this window */
const CHUNK_TIMEOUT_MS = 15_000;

/* Cold-start observability: true only for the first request served by this
   function instance. Lets logs distinguish "slow because cold" from "failed". */
let isColdInstance = true;

type RequestMeta = { requestStart: number; coldStart: boolean };

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

/* ── Shared streaming response wrapper ──
   Wraps a provider's chunk iterable with the crisis prefix, watchdog,
   error markers, and observability logging — identical for every backend. */
function streamResponse(provider: ProviderStream, isCrisis: boolean, meta: RequestMeta): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      /* ── Chunk timeout watchdog ── */
      let chunkTimer: ReturnType<typeof setTimeout> | null = null;

      function resetChunkTimer() {
        if (chunkTimer) clearTimeout(chunkTimer);
        chunkTimer = setTimeout(() => {
          console.warn(`[Walk With Me] ${provider.backend} chunk timeout — no data for 15s`);
          try {
            controller.enqueue(
              encodeStreamError(encoder, 'Response timed out. Please try again.', true)
            );
          } catch { /* already closed */ }
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
        for await (const text of provider.chunks) {
          resetChunkTimer();
          if (!text) continue;
          if (!firstTokenLogged) {
            firstTokenLogged = true;
            console.log('[WWM] first token ' + JSON.stringify({
              backend: provider.backend,
              model: provider.model,
              ttftMs: Date.now() - meta.requestStart,
              coldStart: meta.coldStart,
            }));
          }
          totalChars += text.length;
          controller.enqueue(encoder.encode(text));
        }

        console.log('[WWM] stream complete ' + JSON.stringify({
          backend: provider.backend,
          model: provider.model,
          totalChars,
          durationMs: Date.now() - meta.requestStart,
          coldStart: meta.coldStart,
        }));
        if (chunkTimer) clearTimeout(chunkTimer);
        controller.close();
      } catch (err) {
        if (chunkTimer) clearTimeout(chunkTimer);
        console.error(`[Walk With Me] ${provider.backend} stream error:`, err);
        try {
          controller.enqueue(
            encodeStreamError(encoder, 'Connection lost during response. Please try again.', true)
          );
        } catch { /* already closed by watchdog */ }
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

    const chain = buildProviderChain();
    let lastError: Error | null = null;

    for (let i = 0; i < chain.length; i++) {
      const provider = chain[i];
      const hasFallback = i < chain.length - 1;

      /* Pre-flight Ollama probe only when a fallback exists — when Ollama is
         the last resort the probe is pure latency, so go straight to streaming
         and let the stream attempt surface any error. */
      if (provider.name === 'ollama' && hasFallback) {
        const { available, modelLoaded } = await isOllamaAvailable();
        if (!available) {
          console.warn('[Walk With Me] Ollama unreachable, trying next provider');
          continue;
        }
        if (!modelLoaded) {
          console.warn(`[Walk With Me] Ollama is up but model "${OLLAMA_MODEL}" not found in model list`);
          // Still try — model might be pulling or the name format differs
        }
      }

      try {
        return streamResponse(await provider.open(messages), isCrisis, meta);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        /* Missing local model is a setup problem — surface it instead of
           silently masking it with a cloud fallback. */
        if (lastError.message === OLLAMA_MODEL_NOT_FOUND) {
          return new Response(
            JSON.stringify({
              error: `Model "${OLLAMA_MODEL}" not found. Run: cd ollama && bash setup.sh`,
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (hasFallback) {
          console.warn(
            `[Walk With Me] ${provider.name} failed (${lastError.message}); trying next provider...`
          );
        }
      }
    }

    if (lastError) {
      console.error('[Walk With Me] all providers failed:', lastError.message);
      return new Response(
        JSON.stringify({ error: `AI backend error: ${lastError.message}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: 'No AI backend available. Please start Ollama (`ollama serve`) or configure an OPENAI_API_KEY / GEMINI_API_KEY.',
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
