'use client';

import { forwardRef, useCallback, useState, type FormEvent, type KeyboardEvent } from 'react';
import styles from '../page.module.css';
import { SendIcon, StopIcon } from './icons';

const CHAT_INPUT_ID = 'chat-message';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
};

export const ChatInput = forwardRef<HTMLTextAreaElement, Props>(function ChatInput(
  { value, onChange, onSubmit, onStop, isStreaming },
  ref
) {
  const [isFocused, setIsFocused] = useState(false);
  const isFilled = value.trim().length > 0;
  const isLabelFloating = isFocused || isFilled;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isStreaming) return;
    onSubmit();
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming) onSubmit();
      }
    },
    [isStreaming, onSubmit]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className={styles.inputArea}>
      <form className={styles.inputForm} onSubmit={handleSubmit}>
        <div
          className={styles.mdTextField}
          data-focused={isFocused ? 'true' : undefined}
          data-filled={isFilled ? 'true' : undefined}
        >
          <label
            className={`${styles.mdLabel} ${isLabelFloating ? styles.mdLabelFloating : ''}`}
            htmlFor={CHAT_INPUT_ID}
          >
            Share what&apos;s on your heart
          </label>
          <textarea
            ref={ref}
            id={CHAT_INPUT_ID}
            className={styles.mdInput}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder=" "
            rows={1}
            aria-label="Message input"
          />
          {isStreaming ? (
            <button
              type="button"
              className={`${styles.mdFab} ${styles.mdFabStop}`}
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <span className={styles.mdFabIcon}>
                <StopIcon size={16} />
              </span>
            </button>
          ) : (
            <button
              type="submit"
              className={styles.mdFab}
              disabled={!value.trim()}
              aria-label="Send message"
            >
              <span className={styles.mdFabIcon}>
                <SendIcon size={18} />
              </span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
});
