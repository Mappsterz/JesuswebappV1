import type { ChatMessage } from '@/lib/types';

const DEFAULT_MAX_MESSAGES = 12;

/**
 * Keeps only the most recent messages so API prefill stays fast on long walks.
 * Always preserves the latest message (typically the new user turn).
 */
export function trimMessagesForApi(
  messages: ChatMessage[],
  maxMessages: number = DEFAULT_MAX_MESSAGES
): ChatMessage[] {
  const filtered = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  if (filtered.length <= maxMessages) return filtered;
  return filtered.slice(-maxMessages);
}
