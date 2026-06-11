'use client';

import { useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../page.module.css';

const SEGMENT_FOLD_THRESHOLD = 200;

type WordSegment = {
  id: number;
  text: string;
};

type Props = {
  content: string;
};

function resetStreamState(
  stableLenRef: React.MutableRefObject<number>,
  segmentsRef: React.MutableRefObject<WordSegment[]>,
  partialRef: React.MutableRefObject<string>,
  nextIdRef: React.MutableRefObject<number>
) {
  stableLenRef.current = 0;
  segmentsRef.current = [];
  partialRef.current = '';
  nextIdRef.current = 0;
}

export function StreamingBubble({ content }: Props) {
  const stableLenRef = useRef(0);
  const segmentsRef = useRef<WordSegment[]>([]);
  const partialRef = useRef('');
  const nextIdRef = useRef(0);
  const lastContentRef = useRef('');

  if (!content) {
    if (lastContentRef.current) {
      resetStreamState(stableLenRef, segmentsRef, partialRef, nextIdRef);
    }
    lastContentRef.current = '';
    return null;
  }

  if (
    lastContentRef.current &&
    content.length < lastContentRef.current.length &&
    !lastContentRef.current.startsWith(content)
  ) {
    resetStreamState(stableLenRef, segmentsRef, partialRef, nextIdRef);
  }

  const processed =
    stableLenRef.current +
    segmentsRef.current.reduce((n, s) => n + s.text.length, 0) +
    partialRef.current.length;

  if (content.length > processed) {
    partialRef.current += content.slice(processed);
  }

  while (true) {
    const match = partialRef.current.match(/^\S+\s+/);
    if (!match) break;
    segmentsRef.current.push({ id: nextIdRef.current++, text: match[0] });
    partialRef.current = partialRef.current.slice(match[0].length);
  }

  const segmentChars = segmentsRef.current.reduce((n, s) => n + s.text.length, 0);
  if (segmentChars > SEGMENT_FOLD_THRESHOLD) {
    const folded = segmentsRef.current.map((s) => s.text).join('');
    stableLenRef.current += folded.length;
    segmentsRef.current = [];
  }

  lastContentRef.current = content;

  const stable = content.slice(0, stableLenRef.current);
  const segments = segmentsRef.current;
  const partial = partialRef.current;

  /* Memoize the stable markdown so it's only re-parsed when stable content changes,
     not on every streaming token flush */
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const stableMarkdown = useMemo(
    () => (stable ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{stable}</ReactMarkdown> : null),
    [stable]
  );

  return (
    <div className={`${styles.messageRow} ${styles.messageRowAssistant} ${styles.streamingBubble}`}>
      <div className={`${styles.messageBubble} ${styles.messageBubbleAssistant}`}>
        <span className={styles.messageLabel}>Jesus</span>
        <div
          className={`${styles.messageContent} ${styles.markdown}`}
          aria-live="polite"
          aria-atomic="false"
        >
          {stableMarkdown}
          {segments.map((seg) => (
            <span key={seg.id} className={styles.streamChunk}>
              {seg.text}
            </span>
          ))}
          {partial ? <span className={styles.streamPartial}>{partial}</span> : null}
          <span className={styles.streamCursor} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
