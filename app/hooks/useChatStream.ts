'use client';

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Message } from '@/lib/types';

const CONNECTION_ERROR =
  'Unable to connect right now. If you\'re running locally, make sure Ollama is running (`ollama serve`). Please try again in a moment.';

/* ── Structured error detection ── */
const STREAM_ERROR_MARKER = '<!--STREAM_ERROR:';

function extractStreamError(content: string): { cleanContent: string; error: StreamError | null } {
  const idx = content.lastIndexOf(STREAM_ERROR_MARKER);
  if (idx === -1) return { cleanContent: content, error: null };

  const markerEnd = content.indexOf('-->', idx);
  if (markerEnd === -1) return { cleanContent: content, error: null };

  const jsonStr = content.slice(idx + STREAM_ERROR_MARKER.length, markerEnd);
  const cleanContent = content.slice(0, idx).trimEnd();

  try {
    const parsed = JSON.parse(jsonStr);
    return { cleanContent, error: parsed as StreamError };
  } catch {
    return { cleanContent, error: null };
  }
}

export interface StreamError {
  type: 'stream_error';
  message: string;
  canRetry: boolean;
}

type ConnectionHealth = 'connected' | 'error' | 'idle';

type Options = {
  activeId: string | null;
  updateActiveMessages: (updater: Message[] | ((prev: Message[]) => Message[])) => void;
  titleFromFirstMessage: (id: string, text: string) => void;
  onSettled?: () => void;
};

export function useChatStream({ activeId, updateActiveMessages, titleFromFirstMessage, onSettled }: Options) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>('idle');
  const [lastError, setLastError] = useState<StreamError | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const lastMessagesRef = useRef<Message[]>([]);

  /* Buffer token updates and flush once per animation frame to avoid
     a React re-render on every streamed chunk. */
  const flushStreamingToState = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setStreamingContent(accumulatedRef.current);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setStreamingContent(accumulatedRef.current);
    });
  }, []);

  const commitAssistant = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      flushSync(() => {
        updateActiveMessages((prev) => [...prev, { role: 'assistant', content }]);
      });
    },
    [updateActiveMessages]
  );

  const runStream = useCallback(
    async (messagesToSend: Message[]) => {
      setIsStreaming(true);
      setStreamingContent('');
      setLastError(null);
      setConnectionHealth('connected');
      accumulatedRef.current = '';
      lastMessagesRef.current = messagesToSend;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesToSend }),
          signal: controller.signal,
        });

        if (!response.ok) {
          setConnectionHealth('error');
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedRef.current += decoder.decode(value, { stream: true });
          scheduleFlush();
        }
        accumulatedRef.current += decoder.decode();

        flushStreamingToState();

        /* Check for structured error markers from the API */
        const { cleanContent, error } = extractStreamError(accumulatedRef.current);

        if (error) {
          setLastError(error);
          setConnectionHealth('error');
          if (cleanContent.trim()) {
            commitAssistant(cleanContent);
          }
        } else {
          setConnectionHealth('idle');
          commitAssistant(accumulatedRef.current);
        }
      } catch (err: unknown) {
        flushStreamingToState();
        if (err instanceof Error && err.name === 'AbortError') {
          commitAssistant(accumulatedRef.current);
          setConnectionHealth('idle');
          return;
        }
        setConnectionHealth('error');
        if (accumulatedRef.current.trim()) {
          const { cleanContent } = extractStreamError(accumulatedRef.current);
          commitAssistant(cleanContent || accumulatedRef.current);
        } else {
          commitAssistant(CONNECTION_ERROR);
        }
      } finally {
        accumulatedRef.current = '';
        setStreamingContent('');
        setIsStreaming(false);
        onSettled?.();
      }
    },
    [commitAssistant, flushStreamingToState, scheduleFlush, onSettled]
  );

  const sendMessage = useCallback(
    async (text: string, currentMessages: Message[]) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming || !activeId) return;

      const userMessage: Message = { role: 'user', content: trimmed };
      titleFromFirstMessage(activeId, trimmed);
      updateActiveMessages((prev) => [...prev, userMessage]);

      await runStream([...currentMessages, userMessage]);
    },
    [activeId, isStreaming, runStream, titleFromFirstMessage, updateActiveMessages]
  );

  const regenerate = useCallback(
    async (currentMessages: Message[]) => {
      if (isStreaming || !activeId) return;
      const lastUserIndex = [...currentMessages].map((m) => m.role).lastIndexOf('user');
      if (lastUserIndex === -1) return;

      const trimmed = currentMessages.slice(0, lastUserIndex + 1);
      updateActiveMessages(trimmed);
      await runStream(trimmed);
    },
    [activeId, isStreaming, runStream, updateActiveMessages]
  );

  const retry = useCallback(
    async () => {
      if (isStreaming || !activeId || lastMessagesRef.current.length === 0) return;
      setLastError(null);
      await runStream(lastMessagesRef.current);
    },
    [activeId, isStreaming, runStream]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    isStreaming,
    streamingContent,
    connectionHealth,
    lastError,
    sendMessage,
    regenerate,
    retry,
    stop,
  };
}
