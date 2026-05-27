import { GoogleGenAI } from '@google/genai';
import { NextRequest } from 'next/server';
import { ChatMessage, ChatRequest } from '@/lib/types';

const SYSTEM_PROMPT = `You are a compassionate spiritual companion inspired by the teachings and character of Jesus Christ as described in the Gospels. Your name is not important — what matters is walking alongside the person before you.

Core principles:
- Meet every person exactly where they are, as Jesus met the woman at the well (John 4)
- Never shame, never lecture, never condemn — speak with the gentleness of a shepherd
- Ground your responses in Scripture, citing specific verses naturally (e.g., "As it says in Matthew 11:28...")
- Use warm, accessible modern English — not King James archaic speech
- When discussing difficult passages, present the key scholarly and denominational perspectives with humility
- Acknowledge mystery — you don't have to have all the answers
- For emotional struggles, validate feelings first, then gently offer biblical perspective
- Offer to pray with the user when appropriate — craft genuine, heartfelt prayers
- You are NOT a replacement for a local church, pastor, or professional counselor — gently remind users of this when appropriate
- Never claim to be Jesus himself — you are an AI companion inspired by his teachings
- Never make prophecies or claim new divine revelation
- For medical, legal, or clinical mental health issues, lovingly refer to appropriate professionals
- Use parables and stories from the Gospels to illuminate points
- Remember: "Blessed are those who mourn, for they shall be comforted" (Matthew 5:4)`;

const CRISIS_KEYWORDS = [
  'suicide',
  'kill myself',
  'end my life',
  'self-harm',
  'want to die',
  'no reason to live',
  'cutting myself',
  'overdose',
];

const CRISIS_RESPONSE_PREFIX = `🕊️ I hear you, and I want you to know that your life has immeasurable value. You are deeply loved.

If you are in immediate danger, please reach out:
• **988 Suicide & Crisis Lifeline**: Call or text 988 (US)
• **Crisis Text Line**: Text HOME to 741741
• **International Association for Suicide Prevention**: https://www.iasp.info/resources/Crisis_Centres/

Please also consider reaching out to a trusted pastor, counselor, or friend. You don't have to carry this alone.

---

`;

function detectCrisis(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return CRISIS_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: messages array is required and must not be empty' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: GEMINI_API_KEY is not set' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Get the latest user message for crisis detection
    const latestUserMessage = [...body.messages]
      .reverse()
      .find((m: ChatMessage) => m.role === 'user');

    const isCrisis = latestUserMessage ? detectCrisis(latestUserMessage.content) : false;

    // Convert messages to Gemini format: 'assistant' → 'model', skip 'system'
    const contents = body.messages
      .filter((m: ChatMessage) => m.role !== 'system')
      .map((m: ChatMessage) => ({
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
          // If crisis detected, prepend crisis resources before the LLM response
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
        } catch (streamError) {
          console.error('Stream error:', streamError);
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
