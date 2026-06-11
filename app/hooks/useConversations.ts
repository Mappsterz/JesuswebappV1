'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Conversation, Message } from '@/lib/types';

const CONVOS_KEY = 'wwm-conversations';
const ACTIVE_KEY = 'wwm-active-convo-id';

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New Walk',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    isArchived: false,
  };
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  /* Load on mount. localStorage is only readable after hydration, so the
     initial state sync necessarily happens in this effect. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const savedConvos = localStorage.getItem(CONVOS_KEY);
      const savedActiveId = localStorage.getItem(ACTIVE_KEY);

      let convos: Conversation[] = savedConvos ? JSON.parse(savedConvos) : [];
      convos = convos.filter((c) => c.messages.length > 0 || c.id === savedActiveId);

      if (convos.length === 0) {
        const initial = createConversation();
        setConversations([initial]);
        setActiveId(initial.id);
      } else {
        setConversations(convos);
        const activeExists = convos.some((c) => c.id === savedActiveId);
        setActiveId(activeExists ? savedActiveId : (convos.find((c) => !c.isArchived) || convos[0]).id);
      }
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* Persist */
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem(CONVOS_KEY, JSON.stringify(conversations));
    }
  }, [conversations]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    else localStorage.removeItem(ACTIVE_KEY);
  }, [activeId]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );
  const messages = activeConversation ? activeConversation.messages : [];

  const updateActiveMessages = useCallback(
    (updater: Message[] | ((prev: Message[]) => Message[])) => {
      if (!activeId) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? {
                ...c,
                messages: typeof updater === 'function' ? updater(c.messages) : updater,
                updatedAt: Date.now(),
              }
            : c
        )
      );
    },
    [activeId]
  );

  const newWalk = useCallback(() => {
    const convo = createConversation();
    setConversations((prev) => [convo, ...prev]);
    setActiveId(convo.id);
    return convo.id;
  }, []);

  const renameWalk = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
  }, []);

  const toggleArchiveWalk = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const updated = prev.map((c) => (c.id === id ? { ...c, isArchived: !c.isArchived } : c));
        const willBeArchived = !prev.find((c) => c.id === id)?.isArchived;

        if (id === activeId && willBeArchived) {
          const remaining = updated.filter((c) => !c.isArchived);
          if (remaining.length > 0) {
            setActiveId(remaining[0].id);
          } else {
            const convo = createConversation();
            updated.unshift(convo);
            setActiveId(convo.id);
          }
        }
        return updated;
      });
    },
    [activeId]
  );

  const deleteWalk = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        if (id === activeId) {
          const remainingActive = updated.filter((c) => !c.isArchived);
          if (remainingActive.length > 0) setActiveId(remainingActive[0].id);
          else if (updated.length > 0) setActiveId(updated[0].id);
          else {
            const convo = createConversation();
            updated.unshift(convo);
            setActiveId(convo.id);
          }
        }
        return updated;
      });
    },
    [activeId]
  );

  /* Auto-title from first user message */
  const titleFromFirstMessage = useCallback((id: string, text: string) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === id && c.title === 'New Walk' && c.messages.length === 0) {
          const clean = text.replace(/[?.,!]+$/, '');
          return { ...c, title: clean.length > 25 ? clean.substring(0, 25) + '...' : clean };
        }
        return c;
      })
    );
  }, []);

  /* Export / import */
  const exportConversations = useCallback(() => {
    const blob = new Blob([JSON.stringify(conversations, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `walk-with-me-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [conversations]);

  const importConversations = useCallback((json: string): boolean => {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return false;
      const valid: Conversation[] = parsed.filter(
        (c) => c && typeof c.id === 'string' && Array.isArray(c.messages)
      );
      if (valid.length === 0) return false;
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const merged = [...valid.filter((c) => !existingIds.has(c.id)), ...prev];
        return merged;
      });
      setActiveId(valid[0].id);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    conversations,
    activeId,
    setActiveId,
    activeConversation,
    messages,
    updateActiveMessages,
    setConversations,
    newWalk,
    renameWalk,
    toggleArchiveWalk,
    deleteWalk,
    titleFromFirstMessage,
    exportConversations,
    importConversations,
  };
}
