'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './page.module.css';

import { useTheme } from './hooks/useTheme';
import { useConversations } from './hooks/useConversations';
import { useChatStream } from './hooks/useChatStream';
import { getDailyPassage, buildDevotionalPrompt } from '@/lib/devotional';

import { Sidebar } from './components/Sidebar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { ConfirmDialog } from './components/ConfirmDialog';
import { OnboardingModal } from './components/OnboardingModal';
import { BiblePanel } from './components/BiblePanel';
import { CrossIcon, SunIcon, MoonIcon, ArrowDownIcon, MenuIcon, BookIcon } from './components/icons';

const ONBOARDED_KEY = 'wwm-onboarded';

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const {
    conversations,
    activeId,
    setActiveId,
    messages,
    updateActiveMessages,
    newWalk,
    renameWalk,
    toggleArchiveWalk,
    deleteWalk,
    titleFromFirstMessage,
    exportConversations,
    importConversations,
  } = useConversations();

  /* ── Local UI state ── */
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [isBibleOpen, setIsBibleOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  /* ── Refs ── */
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const showScrollBtnRef = useRef(false);

  /* Track how many messages at the END of the list are "new" (should animate).
     Messages loaded from localStorage or conversation switching get 0. */
  const newMessageCountRef = useRef(0);
  const prevMessageLenRef = useRef(0);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const { isStreaming, streamingContent, connectionHealth, lastError, sendMessage, regenerate, retry, stop } = useChatStream({
    activeId,
    updateActiveMessages,
    titleFromFirstMessage,
    onSettled: focusInput,
  });

  /* ── Onboarding (first visit) ── */
  useEffect(() => {
    // localStorage is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true);
  }, []);

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    setShowOnboarding(false);
    focusInput();
  }, [focusInput]);

  /* ── Auto-scroll ── */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = chatAreaRef.current;
    if (!el) return;
    if (behavior === 'auto') el.scrollTop = el.scrollHeight;
    else messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (messages.length > 0 || streamingContent) {
      if (!isNearBottomRef.current) return;
      /* Always use instant scroll during streaming — smooth creates
         compounding animation frames as the target moves every token */
      scrollToBottom('auto');
    }
  }, [messages, streamingContent, isStreaming, scrollToBottom]);

  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        isNearBottomRef.current = distFromBottom < 200;
        const shouldShow = distFromBottom > 200;
        if (shouldShow !== showScrollBtnRef.current) {
          showScrollBtnRef.current = shouldShow;
          setShowScrollBtn(shouldShow);
        }
      });
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeId]);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  /* ── Actions ── */
  const handleSend = useCallback(() => {
    const text = input;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    sendMessage(text, messages);
  }, [input, messages, sendMessage]);

  const handleSuggestion = useCallback(
    (text: string) => {
      if (text === 'Daily devotional') {
        sendMessage(buildDevotionalPrompt(getDailyPassage()), messages);
        return;
      }
      sendMessage(text, messages);
    },
    [messages, sendMessage]
  );

  const handleRegenerate = useCallback(() => {
    regenerate(messages);
  }, [messages, regenerate]);

  const restartChat = useCallback(() => {
    stop();
    updateActiveMessages([]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    focusInput();
  }, [stop, updateActiveMessages, focusInput]);

  const insertFromBible = useCallback(
    (text: string) => {
      setInput((prev) => (prev ? `${prev}\n\n${text}` : text));
      focusInput();
    },
    [focusInput]
  );

  const handleImport = useCallback(
    (json: string) => {
      const ok = importConversations(json);
      if (!ok) alert('That file could not be imported. Please choose a valid export file.');
    },
    [importConversations]
  );

  const showWelcome = messages.length === 0;

  /* Track which messages are newly added (for entrance animation) */
  useEffect(() => {
    const prevLen = prevMessageLenRef.current;
    const curLen = messages.length;
    if (curLen > prevLen && prevLen > 0) {
      // Messages were appended — the new ones should animate
      newMessageCountRef.current = curLen - prevLen;
    } else if (curLen <= prevLen || prevLen === 0) {
      // Conversation switched, cleared, or initial load — no animations
      newMessageCountRef.current = 0;
    }
    prevMessageLenRef.current = curLen;
  }, [messages]);

  return (
    <div className={`${styles.pageContainer} ${isSidebarOpen ? styles.sidebarOpen : ''}`}>
      <div className={styles.ambientBackground}>
        <div className={styles.lightRays} />
      </div>

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          /* View Transitions API: smooth crossfade when switching chats */
          const update = () => {
            setActiveId(id);
            setIsSidebarOpen(false);
          };
          if (typeof document !== 'undefined' && 'startViewTransition' in document) {
            (document as any).startViewTransition(update);
          } else {
            update();
          }
        }}
        onNewWalk={() => {
          newWalk();
          setIsSidebarOpen(false);
          setInput('');
          focusInput();
        }}
        onRename={renameWalk}
        onToggleArchive={toggleArchiveWalk}
        onRequestDelete={(id) => setDeleteTarget(id)}
        onExport={exportConversations}
        onImport={handleImport}
      />

      {isSidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setIsSidebarOpen(false)} />}

      <div className={styles.mainWrapper}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.headerLeft}>
              <button
                className={styles.sidebarToggle}
                onClick={() => setIsSidebarOpen((prev) => !prev)}
                title="Toggle history"
                aria-label="Toggle chat history"
              >
                <MenuIcon size={20} />
              </button>
              <button
                className={styles.brand}
                onClick={restartChat}
                title="Restart conversation"
                aria-label="Walk With Me - Restart conversation"
              >
                <span className={styles.brandIcon} aria-hidden="true">
                  <CrossIcon size={20} />
                </span>
                <h1 className={styles.brandName}>Walk With Me</h1>
              </button>
            </div>
            <div className={styles.headerRight}>
              {/* Connection health indicator */}
              {connectionHealth === 'connected' && (
                <span className={styles.healthDot} title="Connected" aria-label="Connected to AI backend">
                  <span className={styles.healthDotInner} data-status="connected" />
                </span>
              )}
              {connectionHealth === 'error' && (
                <span className={styles.healthDot} title="Connection issue" aria-label="Connection issue">
                  <span className={styles.healthDotInner} data-status="error" />
                </span>
              )}
              <button
                className={styles.themeToggle}
                onClick={() => setIsBibleOpen(true)}
                aria-label="Open Scripture lookup"
                title="Scripture lookup"
              >
                <BookIcon size={18} />
              </button>
              <button
                className={styles.themeToggle}
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>
        </header>

        <main className={styles.main}>
          {/* Dual-layer crossfade: both mounted, opacity transition via CSS */}
          <div className={`${styles.viewLayer} ${showWelcome ? styles.viewVisible : styles.viewHidden}`}>
            <WelcomeScreen onSuggestion={handleSuggestion} />
          </div>
          <div className={`${styles.viewLayer} ${!showWelcome ? styles.viewVisible : styles.viewHidden}`}>
            <MessageList
              ref={chatAreaRef}
              endRef={messagesEndRef}
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              onRegenerate={handleRegenerate}
              newMessageCount={newMessageCountRef.current}
            />
          </div>
        </main>

        {showScrollBtn && !showWelcome && (
          <button className={styles.scrollToBottom} onClick={() => scrollToBottom()} aria-label="Scroll to bottom">
            <ArrowDownIcon size={16} />
          </button>
        )}

        {/* Retry banner for streaming errors */}
        {lastError && lastError.canRetry && (
          <div className={styles.retryBanner}>
            <span className={styles.retryMessage}>{lastError.message}</span>
            <button className={styles.retryBtn} onClick={retry}>
              ↻ Retry
            </button>
          </div>
        )}

        <ChatInput
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          onStop={stop}
          isStreaming={isStreaming}
        />
      </div>

      <BiblePanel open={isBibleOpen} onClose={() => setIsBibleOpen(false)} onInsert={insertFromBible} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this walk?"
        message="This conversation will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteWalk(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <OnboardingModal open={showOnboarding} onClose={dismissOnboarding} />
    </div>
  );
}
