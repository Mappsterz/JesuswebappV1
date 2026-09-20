export interface Message {
  /* Stable identity for React keys. Index keys were used before, so a
     regenerate (which trims the tail) re-keyed every row after the cut and
     remounted their markdown. */
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function createMessage(role: Message['role'], content: string): Message {
  return { id: crypto.randomUUID(), role, content };
}

/* Conversations saved before messages carried ids get them on the way in. */
export function withMessageIds(messages: Array<Partial<Message> & Pick<Message, 'role' | 'content'>>): Message[] {
  return messages.map((m) => (m.id ? (m as Message) : { ...m, id: crypto.randomUUID() }));
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  isArchived: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface BibleVerse {
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleResponse {
  reference: string;
  text: string;
  verses: BibleVerse[];
}

export interface ChatRequest {
  messages: ChatMessage[];
}
