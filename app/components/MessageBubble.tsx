'use client';

import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../page.module.css';
import type { Message } from '@/lib/types';
import { CopyIcon, CheckIcon, RegenerateIcon } from './icons';

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
          <div className={`${styles.messageContent} ${styles.markdown}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
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
