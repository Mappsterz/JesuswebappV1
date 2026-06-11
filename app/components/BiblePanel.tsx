'use client';

import { useState } from 'react';
import styles from '../page.module.css';
import type { BibleResponse } from '@/lib/types';
import { BookIcon, CloseIcon, ChatIcon } from './icons';

type Props = {
  open: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
};

export function BiblePanel({ open, onClose, onInsert }: Props) {
  const [reference, setReference] = useState('');
  const [result, setResult] = useState<BibleResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    const query = reference.trim();
    if (!query) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/bible?reference=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verse not found. Try a reference like "John 3:16".');
      } else {
        setResult(data as BibleResponse);
      }
    } catch {
      setError('Unable to reach the Bible service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className={styles.panelOverlay} onClick={onClose} role="presentation" />
      <aside className={styles.biblePanel} role="dialog" aria-modal="true" aria-label="Scripture lookup">
        <div className={styles.biblePanelHeader}>
          <span className={styles.biblePanelTitle}>
            <BookIcon size={18} />
            Scripture
          </span>
          <button className={styles.iconBtn} onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className={styles.biblePanelSearch}>
          <input
            type="text"
            className={styles.biblePanelInput}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') lookup();
            }}
            placeholder="e.g. John 3:16 or Psalm 23"
            aria-label="Bible reference"
            autoFocus
          />
          <button className={styles.biblePanelLookupBtn} onClick={lookup} disabled={loading || !reference.trim()}>
            {loading ? '...' : 'Look up'}
          </button>
        </div>

        <div className={styles.biblePanelBody}>
          {error && <p className={styles.biblePanelError}>{error}</p>}

          {result && (
            <div className={styles.verseCard}>
              <h3 className={styles.verseReference}>{result.reference}</h3>
              <p className={styles.verseText}>{result.text}</p>
              <button
                className={styles.verseInsertBtn}
                onClick={() => {
                  onInsert(`"${result.text.trim()}" — ${result.reference}`);
                  onClose();
                }}
              >
                <ChatIcon size={13} />
                Insert into chat
              </button>
            </div>
          )}

          {!result && !error && !loading && (
            <p className={styles.biblePanelHint}>
              Look up any passage to read it here, then bring it into your conversation.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
