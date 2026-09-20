'use client';

import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../page.module.css';
import type { Message } from '@/lib/types';
import { CopyIcon, CheckIcon, RegenerateIcon } from './icons';

/* Module-level so the array identity is stable; an inline literal is a new
   prop every render and defeats react-markdown's own memoization. */
const REMARK_PLUGINS = [remarkGfm];

type Props = {
  message: Message;
  index: number;
  isLast: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  isNew: boolean;
};

function MessageBubbleImpl({ message, isLast, canRegenerate, onRegenerate, isNew }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  /* react-markdown parses during render, so the element is memoized on the
     text: a re-render for isLast, isNew, or the copied state reuses the same
     element and React skips the subtree instead of re-parsing the reply. */
  const markdown = useMemo(
    () => (isUser ? null : <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{message.content}</ReactMarkdown>),
    [isUser, message.content]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAssistant} ${isNew ? styles.messageRowAnimated : ''}`}
    >
      <div className={`${styles.messageBubble} ${isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant}`}>
        <span className={`${styles.messageLabel} ${isUser ? styles.messageLabelUser : ''}`}>
          {isUser ? 'You' : 'Guide'}
        </span>

        {isUser ? (
          <div className={styles.messageContent}>{message.content}</div>
        ) : (
          <div className={`${styles.messageContent} ${styles.markdown}`}>{markdown}</div>
        )}

        <div className={styles.messageActions}>
          <button
            className={styles.messageActionBtn}
            onClick={handleCopy}
            title={copied ? 'Copied' : 'Copy message'}
            aria-label={copied ? 'Copied' : 'Copy message'}
          >
            {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
          </button>
          {!isUser && isLast && canRegenerate && (
            <button
              className={styles.messageActionBtn}
              onClick={onRegenerate}
              title="Regenerate response"
              aria-label="Regenerate response"
            >
              <RegenerateIcon size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleImpl);
