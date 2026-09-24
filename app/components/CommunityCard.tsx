'use client';

import styles from '../page.module.css';

const PROMPTS = [
  'I want to find a church near me',
  'Help me join a parish group',
  'I want to meet people through a club',
] as const;

type Props = {
  id: string;
  onSuggestion: (text: string) => void;
};

export function CommunityCard({ id, onSuggestion }: Props) {
  return (
    <section id={id} className={styles.communityCard} aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.communityTitle}>
        Walk with others
      </h3>
      <p className={styles.communityText}>
        A church, a parish group, or a club is where faith and friendship take root.
      </p>
      <div className={styles.communityActions}>
        {PROMPTS.map((text) => (
          <button key={text} className={styles.communityAction} onClick={() => onSuggestion(text)}>
            {text}
          </button>
        ))}
      </div>
    </section>
  );
}
