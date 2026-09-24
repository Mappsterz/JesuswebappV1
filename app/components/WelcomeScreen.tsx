'use client';

import styles from '../page.module.css';
import { CrossIcon } from './icons';

const SUGGESTION = 'I need comfort today';

type Props = {
  onSuggestion: (text: string) => void;
};

export function WelcomeScreen({ onSuggestion }: Props) {
  return (
    <div className={styles.welcomeScreen}>
      <div className={styles.welcomeIcon} aria-hidden="true">
        <CrossIcon size={56} />
      </div>
      <h2 className={styles.welcomeSubtitle}>How can I walk with you today?</h2>
      <div className={styles.suggestionChips}>
        <button className={styles.suggestionChip} onClick={() => onSuggestion(SUGGESTION)}>
          {SUGGESTION}
        </button>
      </div>
    </div>
  );
}
