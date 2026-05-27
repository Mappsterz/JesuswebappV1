'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import styles from './page.module.css';

import type { Message, Conversation } from '../lib/types';

/* ——————————————————————————————
   Suggestion Chips Data
   —————————————————————————————— */
const SUGGESTIONS = [
  'I need comfort today',
  'Help me understand a passage',
  'Write me a prayer',
  'Daily devotional',
] as const;

/* ——————————————————————————————
   Main Chat Page
   —————————————————————————————— */
export default function Home() {
  /* ── State ─────────────────────── */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  /* ── Refs ──────────────────────── */
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Computed State ────────────── */
  const activeConversation = conversations.find((c) => c.id === activeId) || null;
  const messages = activeConversation ? activeConversation.messages : [];

  /* ── Load Conversations on Mount ── */
  useEffect(() => {
    try {
      const savedConvos = localStorage.getItem('wwm-conversations');
      const savedActiveId = localStorage.getItem('wwm-active-convo-id');
      
      let convos: Conversation[] = [];
      if (savedConvos) {
        convos = JSON.parse(savedConvos);
      }
      
      // Filter out any blank conversations from previous sessions (unless it's the only one/active)
      convos = convos.filter(c => c.messages.length > 0 || c.id === savedActiveId);
      
      if (convos.length === 0) {
        const initialId = crypto.randomUUID();
        const initialConvo: Conversation = {
          id: initialId,
          title: 'New Walk',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          isArchived: false,
        };
        convos = [initialConvo];
        setConversations(convos);
        setActiveId(initialId);
      } else {
        setConversations(convos);
        const activeExists = convos.some(c => c.id === savedActiveId);
        if (activeExists) {
          setActiveId(savedActiveId);
        } else {
          const firstActive = convos.find(c => !c.isArchived) || convos[0];
          setActiveId(firstActive.id);
        }
      }
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  }, []);

  /* ── Save Conversations ────────── */
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('wwm-conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  useEffect(() => {
    if (activeId) {
      localStorage.setItem('wwm-active-convo-id', activeId);
    } else {
      localStorage.removeItem('wwm-active-convo-id');
    }
  }, [activeId]);

  /* ── Theme Persistence ─────────── */
  useEffect(() => {
    const saved = localStorage.getItem('wwm-theme') as 'dark' | 'light' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('wwm-theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  /* ── Update Active Messages ────── */
  const updateActiveMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    if (!activeId) return;
    setConversations((prev) => {
      return prev.map((c) => {
        if (c.id === activeId) {
          const nextMessages = typeof updater === 'function' ? updater(c.messages) : updater;
          return {
            ...c,
            messages: nextMessages,
            updatedAt: Date.now(),
          };
        }
        return c;
      });
    });
  }, [activeId]);

  /* ── Conversation Actions ──────── */
  const handleNewWalk = useCallback(() => {
    const newId = crypto.randomUUID();
    const newConvo: Conversation = {
      id: newId,
      title: 'New Walk',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      isArchived: false,
    };
    setConversations(prev => [newConvo, ...prev]);
    setActiveId(newId);
    setIsSidebarOpen(false);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.focus();
    }
  }, []);

  const handleRenameWalk = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: trimmed } : c));
    setEditingId(null);
  }, []);

  const handleToggleArchiveWalk = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    setConversations((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, isArchived: !c.isArchived } : c);
      const isArchivingActive = id === activeId;
      const willBeArchived = !prev.find(c => c.id === id)?.isArchived;
      
      if (isArchivingActive && willBeArchived) {
        const remainingActive = updated.filter(c => !c.isArchived);
        if (remainingActive.length > 0) {
          setActiveId(remainingActive[0].id);
        } else {
          const newId = crypto.randomUUID();
          const newConvo: Conversation = {
            id: newId,
            title: 'New Walk',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
            isArchived: false,
          };
          updated.unshift(newConvo);
          setActiveId(newId);
        }
      }
      return updated;
    });
  }, [activeId]);

  const handleDeleteWalk = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return;
    }
    
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      
      if (id === activeId) {
        const remainingActive = updated.filter(c => !c.isArchived);
        if (remainingActive.length > 0) {
          setActiveId(remainingActive[0].id);
        } else if (updated.length > 0) {
          setActiveId(updated[0].id);
        } else {
          const newId = crypto.randomUUID();
          const newConvo: Conversation = {
            id: newId,
            title: 'New Walk',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
            isArchived: false,
          };
          updated.unshift(newConvo);
          setActiveId(newId);
        }
      }
      return updated;
    });
  }, [activeId]);

  /* ── Restart Chat ──────────────── */
  const restartChat = useCallback(() => {
    abortRef.current?.abort();
    updateActiveMessages([]);
    setIsStreaming(false);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.focus();
    }
  }, [updateActiveMessages]);

  /* ── Auto-scroll ───────────────── */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (messages.length > 0 || streamingContent) {
      scrollToBottom(isStreaming ? 'auto' : 'smooth');
    }
  }, [messages, streamingContent, isStreaming, scrollToBottom]);

  useEffect(() => {
    const el = chatAreaRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > 200);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  /* ── Focus input on mount ──────── */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* ── Send Message ──────────────── */
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming || !activeId) return;

      const userMessage: Message = { role: 'user', content: trimmed };
      const currentConversation = conversations.find(c => c.id === activeId);
      if (!currentConversation) return;

      const updatedMessages = [...currentConversation.messages, userMessage];

      // Update state immediately with user message + auto-name if first message
      setConversations((prev) => {
        return prev.map((c) => {
          if (c.id === activeId) {
            let updatedTitle = c.title;
            if (c.title === 'New Walk' && c.messages.length === 0) {
              const cleanText = trimmed.replace(/[?.,!]+$/, '');
              updatedTitle = cleanText.length > 25 ? cleanText.substring(0, 25) + '...' : cleanText;
            }
            return {
              ...c,
              title: updatedTitle,
              messages: [...c.messages, userMessage],
              updatedAt: Date.now(),
            };
          }
          return c;
        });
      });

      setInput('');
      setIsStreaming(true);
      setStreamingContent('');

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }

      // Abort previous request if any
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let assistantContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;
          setStreamingContent(assistantContent);
        }

        // Commit the final streamed content to the active conversation history
        updateActiveMessages((prev) => [...prev, { role: 'assistant', content: assistantContent }]);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;

        const errorMsg =
          '⚠️ Unable to connect right now. If you\'re running locally, make sure Ollama is running (`ollama serve`). Please try again in a moment. 🙏';

        updateActiveMessages((prev) => [...prev, { role: 'assistant', content: errorMsg }]);
      } finally {
        setStreamingContent('');
        setIsStreaming(false);
        inputRef.current?.focus();
      }
    },
    [activeId, conversations, isStreaming, updateActiveMessages]
  );

  /* ── Form Submit ───────────────── */
  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  /* ── Keyboard: Enter to Send ───── */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  /* ── Auto-resize Textarea ──────── */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    },
    []
  );

  /* ── Suggestion Chip Click ─────── */
  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  /* ── Sidebar Rendering Helpers ── */
  const startEditing = (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const saveEdit = (id: string) => {
    handleRenameWalk(id, editTitle);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const renderSidebarItem = (c: Conversation) => {
    const isActive = c.id === activeId;
    const isEditing = c.id === editingId;

    return (
      <div
        key={c.id}
        className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
        onClick={() => {
          if (!isEditing) {
            setActiveId(c.id);
            setIsSidebarOpen(false); // Close drawer on mobile
          }
        }}
      >
        <span className={styles.sidebarItemIcon} aria-hidden="true">💬</span>
        
        {isEditing ? (
          <div className={styles.editTitleWrapper} onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              className={styles.editTitleInput}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit(c.id);
                if (e.key === 'Escape') cancelEdit();
              }}
              autoFocus
            />
            <button className={styles.iconBtn} onClick={() => saveEdit(c.id)} title="Save Title" aria-label="Save Title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button className={styles.iconBtn} onClick={cancelEdit} title="Cancel" aria-label="Cancel">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <span className={styles.sidebarItemTitle}>{c.title}</span>
            <div className={styles.sidebarItemActions}>
              <button 
                className={styles.iconBtn} 
                onClick={(e) => startEditing(c, e)} 
                title="Rename Walk"
                aria-label="Rename Walk"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                </svg>
              </button>
              <button 
                className={styles.iconBtn} 
                onClick={(e) => handleToggleArchiveWalk(c.id, e)} 
                title={c.isArchived ? "Unarchive Walk" : "Archive Walk"}
                aria-label={c.isArchived ? "Unarchive Walk" : "Archive Walk"}
              >
                {c.isArchived ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <polyline points="10 12 12 10 14 12" />
                    <line x1="12" y1="10" x2="12" y2="16" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                )}
              </button>
              <button 
                className={styles.iconBtn} 
                onClick={(e) => handleDeleteWalk(c.id, e)} 
                title="Delete Walk"
                aria-label="Delete Walk"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  /* ── Determine if welcome screen ── */
  const showWelcome = messages.length === 0;

  /* ═══════════════════════════════
     Render
     ═══════════════════════════════ */
  return (
    <div className={`${styles.pageContainer} ${isSidebarOpen ? styles.sidebarOpen : ''}`}>
      {/* — Ambient Background — */}
      <div className={styles.ambientBackground}>
        <div className={styles.lightRays} />
      </div>

      {/* — Sidebar — */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button className={styles.newWalkBtn} onClick={handleNewWalk}>
            <span className={styles.newWalkIcon} aria-hidden="true">✝</span>
            <span>New Walk</span>
          </button>
        </div>

        <div className={styles.sidebarContent}>
          {/* Active Walks */}
          <div className={styles.sidebarSection}>
            <h3 className={styles.sidebarSectionTitle}>Active Walks</h3>
            <div className={styles.sidebarList}>
              {conversations.filter(c => !c.isArchived).map(c => renderSidebarItem(c))}
            </div>
          </div>

          {/* Archived Walks */}
          {conversations.some(c => c.isArchived) && (
            <div className={styles.sidebarSection}>
              <button 
                className={styles.accordionHeader}
                onClick={() => setIsArchivedExpanded(prev => !prev)}
                aria-expanded={isArchivedExpanded}
              >
                <span>Archived Walks</span>
                <span className={styles.accordionArrow} style={{ transform: isArchivedExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  ▼
                </span>
              </button>
              {isArchivedExpanded && (
                <div className={styles.sidebarList}>
                  {conversations.filter(c => c.isArchived).map(c => renderSidebarItem(c))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* — Sidebar Overlay — */}
      {isSidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* — Main Content Wrapper — */}
      <div className={styles.mainWrapper}>
        {/* — Header — */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.headerLeft}>
              <button
                className={styles.sidebarToggle}
                onClick={() => setIsSidebarOpen(prev => !prev)}
                title="Toggle history"
                aria-label="Toggle chat history"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <button
                className={styles.brand}
                onClick={restartChat}
                title="Restart conversation"
                aria-label="Walk With Me - Restart conversation"
              >
                <span className={styles.brandIcon} aria-hidden="true">
                  ✝
                </span>
                <h1 className={styles.brandName}>Walk With Me</h1>
              </button>
            </div>
            <div className={styles.headerRight}>
              <span className={styles.localModelBadge} title="Running on your local machine — no cloud, no API keys">
                <span className={styles.localModelDot} aria-hidden="true" />
                Local Model
              </span>
              <button
                className={styles.themeToggle}
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        </header>

        {/* — Main Chat/Welcome area — */}
        <main className={styles.main}>
          {showWelcome ? (
            /* ── Welcome Screen ── */
            <div className={styles.welcomeScreen}>
              <div className={styles.welcomeIcon} aria-hidden="true">
                ✝
              </div>
              <h2 className={styles.welcomeGreeting}>Peace be with you</h2>
              <p className={styles.welcomeSubtitle}>
                How can I walk with you today?
              </p>
              <div className={styles.suggestionChips}>
                {SUGGESTIONS.map((text) => (
                  <button
                    key={text}
                    className={styles.suggestionChip}
                    onClick={() => handleSuggestion(text)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Chat Area ── */
            <div className={styles.chatArea} ref={chatAreaRef}>
              <div className={styles.messageList}>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`${styles.messageRow} ${
                      msg.role === 'user'
                        ? styles.messageRowUser
                        : styles.messageRowAssistant
                    }`}
                    style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}
                  >
                    <div
                      className={`${styles.messageBubble} ${
                        msg.role === 'user'
                          ? styles.messageBubbleUser
                          : styles.messageBubbleAssistant
                      }`}
                    >
                      <span
                        className={`${styles.messageLabel} ${
                          msg.role === 'user' ? styles.messageLabelUser : ''
                        }`}
                      >
                        {msg.role === 'user' ? 'You' : 'Jesus'}
                      </span>
                      <div className={styles.messageContent}>{msg.content}</div>
                    </div>
                  </div>
                ))}

                {/* — Streaming Message Bubble — */}
                {isStreaming && streamingContent && (
                  <div className={`${styles.messageRow} ${styles.messageRowAssistant}`}>
                    <div className={`${styles.messageBubble} ${styles.messageBubbleAssistant}`}>
                      <span className={styles.messageLabel}>Jesus</span>
                      <div className={styles.messageContent}>{streamingContent}</div>
                    </div>
                  </div>
                )}

                {/* — Typing Indicator — */}
                {isStreaming && !streamingContent && (
                  <div className={styles.typingIndicator}>
                    <div className={styles.typingBubble}>
                      <span className={styles.typingLabel}>Jesus</span>
                      <div className={styles.typingDots}>
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </main>

        {/* — Scroll to Bottom — */}
        {showScrollBtn && !showWelcome && (
          <button
            className={styles.scrollToBottom}
            onClick={() => scrollToBottom()}
            aria-label="Scroll to bottom"
          >
            ↓
          </button>
        )}

        {/* — Input Area — */}
        <div className={styles.inputArea}>
          <form className={styles.inputWrapper} onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              className={styles.inputField}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Share what's on your heart..."
              rows={1}
              disabled={isStreaming}
              aria-label="Message input"
            />
            <button
              type="submit"
              className={styles.sendButton}
              disabled={isStreaming || !input.trim()}
              aria-label="Send message"
            >
              <span className={styles.sendButtonIcon}>➤</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
