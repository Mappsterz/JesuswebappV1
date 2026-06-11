'use client';

import styles from '../page.module.css';
import { CrossIcon } from './icons';

const SUGGESTIONS = [
  'I need comfort today',
  'Help me understand a passage',
  'Write me a prayer',
  'Daily devotional',
] as const;

type Props = {
  onSuggestion: (text: string) => void;
};

export function WelcomeScreen({ onSuggestion }: Props) {
  return (
    <div className={styles.welcomeScreen}>
      <div className={styles.welcomeIcon} aria-hidden="true">
        <CrossIcon size={56} />
      </div>
      <h2 className={styles.welcomeGreeting}>Peace be with you</h2>
      <p className={styles.welcomeSubtitle}>How can I walk with you today?</p>
      <div className={styles.suggestionChips}>
        {SUGGESTIONS.map((text) => (
          <button key={text} className={styles.suggestionChip} onClick={() => onSuggestion(text)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
