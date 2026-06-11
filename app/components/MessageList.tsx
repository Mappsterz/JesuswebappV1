'use client';

import { forwardRef } from 'react';
import styles from '../page.module.css';
import type { Message } from '@/lib/types';
import { MessageBubble } from './MessageBubble';
import { StreamingBubble } from './StreamingBubble';

type Props = {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  onRegenerate: () => void;
  endRef: React.RefObject<HTMLDivElement | null>;
  newMessageCount: number;
};

export const MessageList = forwardRef<HTMLDivElement, Props>(function MessageList(
  { messages, isStreaming, streamingContent, onRegenerate, endRef, newMessageCount },
  ref
) {
  return (
    <div className={styles.chatArea} ref={ref}>
      <div className={styles.messageList}>
        {messages.map((msg, i) => {
          /* Only animate messages that were freshly appended (not loaded from storage) */
          const isNew = newMessageCount > 0 && i >= messages.length - newMessageCount;

          return (
            <MessageBubble
              key={i}
              message={msg}
              index={i}
              isLast={i === messages.length - 1}
              canRegenerate={!isStreaming}
              onRegenerate={onRegenerate}
              isNew={isNew}
            />
          );
        })}

        {isStreaming && streamingContent && <StreamingBubble content={streamingContent} />}

        {isStreaming && !streamingContent && (
          <div className={styles.typingIndicator}>
            <div className={styles.typingBubble}>
              <span className={styles.typingLabel}>Jesus</span>
              <span className={styles.thinkingSpinner} />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
});
