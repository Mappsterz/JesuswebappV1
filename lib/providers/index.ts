import type { ChatProvider } from './types';
import { ollamaProvider } from './ollama';
import { geminiProvider, isGeminiConfigured } from './gemini';
import { openAICompatProvider, isOpenAICompatConfigured } from './openaiCompat';

export type { ChatProvider, ProviderStream } from './types';

const PROVIDERS: Record<string, ChatProvider> = {
  ollama: ollamaProvider,
  openai: openAICompatProvider,
  gemini: geminiProvider,
};

function isConfigured(name: string): boolean {
  if (name === 'ollama') return true; // always constructible (localhost default)
  if (name === 'openai') return isOpenAICompatConfigured();
  if (name === 'gemini') return isGeminiConfigured();
  return false;
}

/**
 * Builds the ordered list of providers to try for a chat request.
 *
 * Default order (each included only when configured):
 *   1. ollama — when OLLAMA_URL is explicitly set
 *   2. openai — when OPENAI_API_KEY is set (any OpenAI-compatible endpoint)
 *   3. gemini — when GEMINI_API_KEY is set
 * With nothing configured, falls back to Ollama at localhost for local dev.
 *
 * CHAT_PROVIDERS overrides the order explicitly, e.g. "openai,gemini" or
 * "ollama,openai". Unknown or unconfigured names are skipped with a warning.
 */
export function buildProviderChain(): ChatProvider[] {
  const explicit = process.env.CHAT_PROVIDERS;

  if (explicit) {
    const chain: ChatProvider[] = [];
    for (const name of explicit.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean)) {
      if (!PROVIDERS[name]) {
        console.warn(`[Walk With Me] CHAT_PROVIDERS: unknown provider "${name}" — skipping`);
        continue;
      }
      if (!isConfigured(name)) {
        console.warn(`[Walk With Me] CHAT_PROVIDERS: "${name}" is not configured — skipping`);
        continue;
      }
      chain.push(PROVIDERS[name]);
    }
    return chain;
  }

  const chain: ChatProvider[] = [];
  if (process.env.OLLAMA_URL) chain.push(ollamaProvider);
  if (isOpenAICompatConfigured()) chain.push(openAICompatProvider);
  if (isGeminiConfigured()) chain.push(geminiProvider);
  if (chain.length === 0) chain.push(ollamaProvider);
  return chain;
}
