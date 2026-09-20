'use client';

import { forwardRef, memo } from 'react';
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
  /* Play the entrance on the newest user message. Assistant messages never
     animate here — they arrive through StreamingBubble. */
  animateLastUser: boolean;
};

/* Memoized so parent re-renders that leave these props untouched (input
   typing, sidebar state) skip the whole list. During a stream only
   streamingContent changes, and each MessageBubble is itself memoized, so the
   per-tick work is the streaming row alone.

   Props derived from isStreaming are only handed to the last row. Passing
   `!isStreaming` to every bubble meant each send and each commit re-rendered
   all N bubbles and re-parsed all their markdown — a hitch that grew with
   the length of the thread, measured at ~50ms by 35 rows. */
export const MessageList = memo(
  forwardRef<HTMLDivElement, Props>(function MessageList(
    { messages, isStreaming, streamingContent, onRegenerate, endRef, animateLastUser },
    ref
  ) {
    const lastIndex = messages.length - 1;

    return (
      <div className={styles.chatArea} ref={ref}>
        <div className={styles.messageList}>
          {messages.map((msg, i) => {
            const isLast = i === lastIndex;
            const isNew = animateLastUser && isLast && msg.role === 'user';

            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                index={i}
                isLast={isLast}
                canRegenerate={isLast && !isStreaming}
                onRegenerate={onRegenerate}
                isNew={isNew}
              />
            );
          })}

          {isStreaming && <StreamingBubble content={streamingContent} />}

          <div ref={endRef} />
        </div>
      </div>
    );
  })
);
