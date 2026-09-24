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
import { CommunityCard } from './components/CommunityCard';
import { CrossIcon, SunIcon, MoonIcon, ArrowDownIcon, SidebarIcon, BookIcon, PeopleIcon } from './components/icons';

const ONBOARDED_KEY = 'wwm-onboarded';

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const {
    conversations,
    activeId,
    setActiveId,
    messages,
    ensureActiveId,
    updateMessagesFor,
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
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  /* ── Refs ── */
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const communityRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const showScrollBtnRef = useRef(false);

  /* The conversation whose newest user message should play its entrance.
     Set on send and compared against activeId at render, so switching
     conversations or restoring from storage never animates, with no effect
     needed to clear it. Assistant replies never animate here: they already
     arrive through StreamingBubble and would otherwise spring a second time
     on commit. Real state, not a ref, so the flag is current on the render
     that mounts the new bubble. */
  const [animateSendIn, setAnimateSendIn] = useState<string | null>(null);
  const animateLastUser = animateSendIn !== null && animateSendIn === activeId;

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const { isStreaming, streamingContent, connectionHealth, lastError, sendMessage, regenerate, retry, stop } = useChatStream({
    activeId,
    ensureActiveId,
    updateMessagesFor,
    titleFromFirstMessage,
    onSettled: focusInput,
  });

  useEffect(() => {
    if (!isCommunityOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!communityRef.current?.contains(e.target as Node)) setIsCommunityOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCommunityOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isCommunityOpen]);

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
    isNearBottomRef.current = true;
    if (behavior === 'auto') el.scrollTop = el.scrollHeight;
    else messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  /* Opening or switching a conversation lands on its latest message. */
  useEffect(() => {
    scrollToBottom('auto');
  }, [activeId, scrollToBottom]);

  /* Follow the bottom as content grows. A ResizeObserver on the message list
     fires only when its height actually changes — a wrapped line, a committed
     message — rather than on every animation frame, and it runs after layout,
     so reading scrollHeight here forces no extra reflow. CSS scroll anchoring
     would do this natively in Chromium, but Safari has none, so the observer
     is the portable path. Following pauses by itself once the reader scrolls
     up, because the scroll listener below flips isNearBottomRef to false. */
  useEffect(() => {
    const el = chatAreaRef.current;
    const list = el?.firstElementChild;
    if (!el || !list) return;
    const observer = new ResizeObserver(() => {
      if (isNearBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeId]);

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

  /* ── Actions ──
     Sending is an explicit request to see the reply, so it resumes following
     even when the reader had scrolled up; the observer then tracks the new
     message and the stream as they land. */
  const handleSend = useCallback(() => {
    const text = input;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    isNearBottomRef.current = true;
    setAnimateSendIn(activeId);
    sendMessage(text, messages);
  }, [input, messages, sendMessage, activeId]);

  const handleSuggestion = useCallback(
    (text: string) => {
      isNearBottomRef.current = true;
      setAnimateSendIn(activeId);
      if (text === 'Daily devotional') {
        sendMessage(buildDevotionalPrompt(getDailyPassage()), messages);
        return;
      }
      sendMessage(text, messages);
    },
    [messages, sendMessage, activeId]
  );

  const handleRegenerate = useCallback(() => {
    isNearBottomRef.current = true;
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
                <SidebarIcon size={20} />
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
              <div className={styles.communityMenu} ref={communityRef}>
                <button
                  className={styles.themeToggle}
                  onClick={() => setIsCommunityOpen((prev) => !prev)}
                  aria-label="Walk with others"
                  title="Walk with others"
                  aria-expanded={isCommunityOpen}
                  aria-controls="community-menu"
                >
                  <PeopleIcon size={18} />
                </button>
                {isCommunityOpen && (
                  <CommunityCard
                    id="community-menu"
                    onSuggestion={(text) => {
                      setIsCommunityOpen(false);
                      handleSuggestion(text);
                    }}
                  />
                )}
              </div>
              <button
                className={styles.themeToggle}
                onClick={() => {
                  setIsCommunityOpen(false);
                  setIsBibleOpen(true);
                }}
                aria-label="Open Scripture lookup"
                title="Scripture lookup"
              >
                <BookIcon size={18} />
              </button>
              <button
                className={styles.themeToggle}
                onClick={() => {
                  setIsCommunityOpen(false);
                  toggleTheme();
                }}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </div>
        </header>

        <main className={styles.main}>
          {/* Dual-layer directional hand-off: both mounted, choreographed via CSS.
              Identity classes (welcomeLayer/chatLayer) let each layer move in its
              own direction — welcome lifts away, chat rises in. */}
          <div className={`${styles.viewLayer} ${styles.welcomeLayer} ${showWelcome ? styles.viewVisible : styles.viewHidden}`}>
            <WelcomeScreen onSuggestion={handleSuggestion} />
          </div>
          <div className={`${styles.viewLayer} ${styles.chatLayer} ${!showWelcome ? styles.viewVisible : styles.viewHidden}`}>
            <MessageList
              ref={chatAreaRef}
              endRef={messagesEndRef}
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              onRegenerate={handleRegenerate}
              animateLastUser={animateLastUser}
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
