import { NextRequest } from 'next/server';
import { ChatMessage, ChatRequest } from '@/lib/types';

/* ═══════════════════════════════════════════════════════════════════════════
   Dual-mode API route:
   • LOCAL  → Ollama (walk-with-me model at localhost:11434)
   • CLOUD  → Google Gemini (when GEMINI_API_KEY is set, e.g. on Vercel)
   
   The route auto-detects which backend to use:
   1. If OLLAMA_URL env var is set, use Ollama
   2. If running locally (no GEMINI_API_KEY), try Ollama at localhost
   3. If GEMINI_API_KEY is set and Ollama isn't available, use Gemini
   ═══════════════════════════════════════════════════════════════════════════ */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'walk-with-me';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/* ── Shared system prompt (used for Gemini — Ollama has it baked in) ────── */
const SYSTEM_PROMPT = `You are Walk With Me — a compassionate spiritual companion inspired by the teachings and character of Jesus Christ as revealed in the four Gospels and the full canon of Scripture.

Your voice is warm, personal, and unhurried — like a wise pastor sitting across from someone at a quiet coffee shop. Never preachy, never performative. You listen deeply, validate emotions before offering perspective, and weave Scripture naturally into conversation.

Core principles:
- Meet every person exactly where they are, as Jesus met the woman at the well (John 4)
- Never shame, lecture, or condemn — speak with the gentleness of a shepherd
- Ground responses in Scripture with specific verses, cited naturally
- Use warm, accessible modern English — not King James archaic speech
- When discussing difficult passages, present key perspectives with humility
- Acknowledge mystery — you don't need all the answers
- Validate feelings first, then gently offer biblical perspective
- Offer to pray when appropriate — craft genuine, heartfelt, specific prayers
- You are NOT a replacement for a local church, pastor, or counselor
- You are an AI companion inspired by Christ's teachings — never claim to be Jesus
- Never make prophecies or claim new divine revelation
- For medical, legal, or clinical mental health issues, lovingly refer to professionals
- Keep responses focused: typically 2–4 warm paragraphs
- End with a gentle question, invitation to share more, or an offer to pray`;

/* ── Crisis detection ──────────────────────────────────────────────────── */
const CRISIS_KEYWORDS = [
  'suicide', 'kill myself', 'end my life', 'self-harm',
  'want to die', 'no reason to live', 'cutting myself', 'overdose',
];

const CRISIS_RESPONSE_PREFIX = `🕊️ I hear you, and I need you to know something right now: your life has immeasurable, irreplaceable value. You are deeply loved — not because of what you do, but because of who you are.

If you are in immediate danger, please reach out:
• **988 Suicide & Crisis Lifeline**: Call or text **988** (US)
• **Crisis Text Line**: Text **HOME** to **741741**
• **International Association for Suicide Prevention**: https://www.iasp.info/resources/Crisis_Centres/

You don't have to carry this alone. Please reach out to a trusted person — a pastor, counselor, friend, or family member.

---

`;

function detectCrisis(message: string): boolean {
  return CRISIS_KEYWORDS.some((kw) => message.toLowerCase().includes(kw));
}

/* ═══════════════════════════════════════════════════════════════════════════
   OLLAMA BACKEND — uses /api/chat for proper multi-turn conversation
   ═══════════════════════════════════════════════════════════════════════════ */

async function streamFromOllama(
  messages: ChatMessage[],
  isCrisis: boolean
): Promise<Response> {
  // Convert to Ollama chat format — system prompt is baked into the model
  const ollamaMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  let ollamaResponse: globalThis.Response;
  try {
    ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: true,
      }),
    });
  } catch {
    throw new Error('OLLAMA_UNAVAILABLE');
  }

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

      try {
        if (isCrisis) {
          controller.enqueue(encoder.encode(CRISIS_RESPONSE_PREFIX));
        }

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                controller.enqueue(encoder.encode(json.message.content));
              }
              if (json.done) {
                controller.close();
                return;
              }
            } catch {
              // Partial JSON — skip
            }
          }
        }

        // Process any remaining buffer
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

        controller.close();
      } catch (err) {
        console.error('Ollama stream error:', err);
        controller.enqueue(
          encoder.encode('\n\n[An error occurred while generating the response. Please try again.]')
        );
        controller.close();
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
   GEMINI BACKEND — cloud fallback for Vercel production
   ═══════════════════════════════════════════════════════════════════════════ */

async function streamFromGemini(
  messages: ChatMessage[],
  isCrisis: boolean
): Promise<Response> {
  // Dynamic import — only loads when actually needed (saves bundle size locally)
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const response = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.7,
      maxOutputTokens: 1024,
    },
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        if (isCrisis) {
          controller.enqueue(encoder.encode(CRISIS_RESPONSE_PREFIX));
        }

        for await (const chunk of response) {
          const text = chunk.text;
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }

        controller.close();
      } catch (err) {
        console.error('Gemini stream error:', err);
        controller.enqueue(
          encoder.encode('\n\n[An error occurred while generating the response. Please try again.]')
        );
        controller.close();
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
   Detect which backend to use
   ═══════════════════════════════════════════════════════════════════════════ */

async function isOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   POST handler
   ═══════════════════════════════════════════════════════════════════════════ */

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages array is required and must not be empty' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const latestUserMessage = [...body.messages]
      .reverse()
      .find((m: ChatMessage) => m.role === 'user');
    const isCrisis = latestUserMessage ? detectCrisis(latestUserMessage.content) : false;

    // ── Backend selection ──────────────────────────────────────────────
    const ollamaUp = await isOllamaAvailable();

    if (ollamaUp) {
      // Prefer Ollama when available (local dev)
      try {
        return await streamFromOllama(body.messages, isCrisis);
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
        // If Ollama failed but we have Gemini, fall through
        if (!GEMINI_API_KEY) throw err;
        console.warn('Ollama failed, falling back to Gemini:', msg);
      }
    }

    // ── Gemini fallback (Vercel production) ────────────────────────────
    if (GEMINI_API_KEY) {
      return await streamFromGemini(body.messages, isCrisis);
    }

    // ── Neither available ──────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        error: 'No AI backend available. Please start Ollama (`ollama serve`) or configure a GEMINI_API_KEY.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Chat API error:', error);

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
