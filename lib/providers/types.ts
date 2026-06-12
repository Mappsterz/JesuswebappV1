import type { ChatMessage } from '@/lib/types';

/* A provider yields plain text chunks; all transport/SDK details stay inside
   the adapter. Errors thrown before the iterable is returned let the route
   fall back to the next provider in the chain; errors thrown while iterating
   surface to the client as in-stream error markers. */
export interface ProviderStream {
  backend: string;
  model: string;
  chunks: AsyncIterable<string>;
}

export interface ChatProvider {
  name: string;
  /* Opens a streaming completion. Throws on pre-stream failure (connection,
     auth, model selection) so the caller can try the next provider. */
  open(messages: ChatMessage[]): Promise<ProviderStream>;
}
