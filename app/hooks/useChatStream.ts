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
  /* Returns the active conversation id, creating one if state isn't ready —
     a first prompt must never be silently dropped. */
  ensureActiveId: () => string;
  /* Writes are routed by conversation id so a streamed reply lands in the
     conversation that started it, even if the user switches away mid-stream. */
  updateMessagesFor: (id: string, updater: Message[] | ((prev: Message[]) => Message[])) => void;
  titleFromFirstMessage: (id: string, text: string) => void;
  onSettled?: () => void;
};

export function useChatStream({ activeId, ensureActiveId, updateMessagesFor, titleFromFirstMessage, onSettled }: Options) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>('idle');
  const [lastError, setLastError] = useState<StreamError | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const accumulatedRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const lastMessagesRef = useRef<Message[]>([]);
  const lastConvoIdRef = useRef<string | null>(null);

  /* ── Paced reveal ──
     Network chunks land in accumulatedRef in bursts; revealing them as they
     arrive makes text appear in slabs. Instead, a rAF loop drips characters
     into view at a rate proportional to the backlog: steady when the stream
     is steady, faster when it falls behind, and a quick drain once the
     network is done so pacing never outlives the real response time. */
  const revealedRef = useRef(0);
  const streamDoneRef = useRef(false);
  const drainResolveRef = useRef<(() => void) | null>(null);

  const revealTarget = useCallback(() => {
    /* Never reveal an in-stream error marker as visible text */
    const full = accumulatedRef.current;
    const markerIdx = full.indexOf(STREAM_ERROR_MARKER);
    return markerIdx === -1 ? full.length : markerIdx;
  }, []);

  /* Force-complete the reveal (error paths, stream end safety) */
  const flushStreamingToState = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    revealedRef.current = accumulatedRef.current.length;
    setStreamingContent(accumulatedRef.current);
  }, []);

  const revealTick = useCallback(function tick() {
    rafRef.current = null;
    const target = revealTarget();
    let cursor = revealedRef.current;

    if (cursor < target) {
      const instant =
        document.visibilityState === 'hidden' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (instant) {
        cursor = target;
      } else {
        const backlog = target - cursor;
        /* Reveal a fraction of the backlog per frame: exponential catch-up
           that converges smoothly. Drain ~4x faster once the network is done. */
        const divisor = streamDoneRef.current ? 5 : 22;
        cursor = Math.min(target, cursor + Math.max(2, Math.ceil(backlog / divisor)));
      }
      revealedRef.current = cursor;
      setStreamingContent(accumulatedRef.current.slice(0, cursor));
    }

    if (!streamDoneRef.current || cursor < revealTarget()) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      drainResolveRef.current?.();
      drainResolveRef.current = null;
    }
  }, [revealTarget]);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(revealTick);
  }, [revealTick]);

  /* Wait for the paced reveal to catch up after the network finishes.
     Time-capped so a throttled/hidden tab can never stall the commit. */
  const drainReveal = useCallback(async () => {
    streamDoneRef.current = true;
    if (revealedRef.current >= revealTarget()) return;
    /* rAF doesn't fire in hidden tabs — nothing to pace offscreen, so let the
       caller's flush reveal everything at once instead of waiting out the cap */
    if (document.visibilityState === 'hidden') return;
    scheduleFlush();
    await Promise.race([
      new Promise<void>((resolve) => {
        drainResolveRef.current = resolve;
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
    drainResolveRef.current = null;
  }, [revealTarget, scheduleFlush]);

  const commitAssistant = useCallback(
    (content: string, convoId: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      flushSync(() => {
        updateMessagesFor(convoId, (prev) => [...prev, { role: 'assistant', content }]);
      });
    },
    [updateMessagesFor]
  );

  const runStream = useCallback(
    async (messagesToSend: Message[], convoId: string) => {
      setIsStreaming(true);
      setStreamingContent('');
      setLastError(null);
      setConnectionHealth('connected');
      accumulatedRef.current = '';
      revealedRef.current = 0;
      streamDoneRef.current = false;
      lastMessagesRef.current = messagesToSend;
      lastConvoIdRef.current = convoId;

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
          let serverMessage = '';
          try {
            serverMessage = (await response.json())?.error || '';
          } catch { /* non-JSON body */ }
          console.error('[WWM] chat request failed', {
            status: response.status,
            serverMessage,
          });
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

        /* Let the paced reveal catch up before settling the message */
        await drainReveal();
        flushStreamingToState();

        /* Check for structured error markers from the API */
        const { cleanContent, error } = extractStreamError(accumulatedRef.current);

        if (error) {
          console.error('[WWM] in-stream error marker', { message: error.message, partialChars: cleanContent.length });
          setLastError(error);
          setConnectionHealth('error');
          if (cleanContent.trim()) {
            commitAssistant(cleanContent, convoId);
          }
        } else {
          setConnectionHealth('idle');
          commitAssistant(accumulatedRef.current, convoId);
        }
      } catch (err: unknown) {
        streamDoneRef.current = true;
        flushStreamingToState();
        if (err instanceof Error && err.name === 'AbortError') {
          commitAssistant(accumulatedRef.current, convoId);
          setConnectionHealth('idle');
          return;
        }
        console.error('[WWM] stream failed', {
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
          receivedChars: accumulatedRef.current.length,
        });
        setConnectionHealth('error');
        if (accumulatedRef.current.trim()) {
          const { cleanContent } = extractStreamError(accumulatedRef.current);
          commitAssistant(cleanContent || accumulatedRef.current, convoId);
        } else {
          commitAssistant(CONNECTION_ERROR, convoId);
        }
      } finally {
        streamDoneRef.current = true;
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        drainResolveRef.current?.();
        drainResolveRef.current = null;
        accumulatedRef.current = '';
        revealedRef.current = 0;
        setStreamingContent('');
        setIsStreaming(false);
        onSettled?.();
      }
    },
    [commitAssistant, flushStreamingToState, scheduleFlush, drainReveal, onSettled]
  );

  const sendMessage = useCallback(
    async (text: string, currentMessages: Message[]) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      /* Never drop a send because conversation state isn't ready yet —
         create the conversation on the spot if needed. */
      const convoId = activeId ?? ensureActiveId();
      if (!activeId) {
        console.warn('[WWM] send arrived before conversations initialized — created one on the fly');
      }

      const userMessage: Message = { role: 'user', content: trimmed };
      titleFromFirstMessage(convoId, trimmed);
      updateMessagesFor(convoId, (prev) => [...prev, userMessage]);

      await runStream([...currentMessages, userMessage], convoId);
    },
    [activeId, ensureActiveId, isStreaming, runStream, titleFromFirstMessage, updateMessagesFor]
  );

  const regenerate = useCallback(
    async (currentMessages: Message[]) => {
      if (isStreaming || !activeId) return;
      const lastUserIndex = [...currentMessages].map((m) => m.role).lastIndexOf('user');
      if (lastUserIndex === -1) return;

      const trimmed = currentMessages.slice(0, lastUserIndex + 1);
      updateMessagesFor(activeId, trimmed);
      await runStream(trimmed, activeId);
    },
    [activeId, isStreaming, runStream, updateMessagesFor]
  );

  const retry = useCallback(
    async () => {
      if (isStreaming || lastMessagesRef.current.length === 0 || !lastConvoIdRef.current) return;
      setLastError(null);
      await runStream(lastMessagesRef.current, lastConvoIdRef.current);
    },
    [isStreaming, runStream]
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
