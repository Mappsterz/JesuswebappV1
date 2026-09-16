'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from '../page.module.css';

/* Inside a single paragraph, fold plain text into the markdown zone once it
   exceeds this size, so raw syntax never lingers in a very long paragraph.
   Folding normally happens earlier, at paragraph boundaries. */
const FOLD_THRESHOLD = 600;

/* Leading-edge gradient. The newest characters carry a static, position-derived
   opacity, so the reveal is a gradient in space rather than a fade animation
   per word: nothing mounts hidden, so nothing blinks. */
const RAMP_MIN = 14;
const RAMP_MAX = 44;
const RAMP_MIN_OPACITY = 0.06;

/* Reveal speed swings with network backlog, so the window is sized from a
   smoothed read of characters-per-render. Quantizing the result keeps steady
   streaming from re-rendering on width changes nobody can see. */
const RATE_SMOOTHING = 0.3;
const RAMP_PER_CHAR = 3;
const RAMP_STEP = 4;

/* Once text stops arriving, firm the tail to full opacity: a stall mid-reply,
   or the last frame before the message commits, must not leave characters
   sitting faint. */
const SETTLE_DELAY_MS = 90;

/* Where the markdown zone ends. Pure function of the text, so the split is
   stable across re-renders and needs no history. */
function computeStableLen(content: string, rampStart: number): number {
  const searchEnd = rampStart - 2;
  const breakIdx = searchEnd >= 0 ? content.lastIndexOf('\n\n', searchEnd) : -1;
  const afterBreak = breakIdx === -1 ? 0 : breakIdx + 2;

  if (rampStart - afterBreak > FOLD_THRESHOLD) {
    const spaceIdx = content.lastIndexOf(' ', rampStart - 1);
    if (spaceIdx >= afterBreak) return spaceIdx + 1;
  }
  return afterBreak;
}

type Props = {
  content: string;
};

export function StreamingBubble({ content }: Props) {
  const [rampLen, setRampLen] = useState(RAMP_MIN);
  const [settledLen, setSettledLen] = useState(-1);
  const rateRef = useRef(0);
  const lastLenRef = useRef(0);

  const isSettled = content.length > 0 && settledLen === content.length;

  /* Reveal speed is measured in an effect rather than during render, so the
     render stays a pure function of content and these two state values. */
  useEffect(() => {
    const len = content.length;
    if (len === lastLenRef.current) return;

    if (len < lastLenRef.current) {
      rateRef.current = 0; /* a new stream reused this component */
    } else {
      const delta = len - lastLenRef.current;
      rateRef.current = rateRef.current * (1 - RATE_SMOOTHING) + delta * RATE_SMOOTHING;
    }
    lastLenRef.current = len;

    const next = Math.min(
      RAMP_MAX,
      Math.max(RAMP_MIN, Math.round((rateRef.current * RAMP_PER_CHAR) / RAMP_STEP) * RAMP_STEP)
    );
    if (next !== rampLen) setRampLen(next);
  }, [content, rampLen]);

  useEffect(() => {
    if (!content || settledLen === content.length) return;
    const timer = window.setTimeout(() => setSettledLen(content.length), SETTLE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [content, settledLen]);

  const rampStart = Math.max(0, content.length - rampLen);
  const stableLen = computeStableLen(content, rampStart);
  const stable = content.slice(0, stableLen);
  const settled = content.slice(stableLen, rampStart);
  const ramp = content.slice(rampStart);

  /* Only re-parse markdown when the stable zone grows, not on every token */
  const stableMarkdown = useMemo(
    () => (stable ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{stable}</ReactMarkdown> : null),
    [stable]
  );

  /* Characters are keyed by absolute index, so each one keeps its DOM node as
     it slides back through the window: React patches opacity instead of
     remounting, which is what keeps the edge smooth. */
  const rampNodes = useMemo(() => {
    const nodes: ReactNode[] = [];
    const lastIdx = ramp.length - 1;
    let offset = 0;

    for (const run of ramp.split(/(\s+)/)) {
      if (!run) continue;
      const runStart = offset;
      const chars: ReactNode[] = [];

      for (const char of Array.from(run)) {
        const t = lastIdx > 0 ? offset / lastIdx : 0;
        chars.push(
          <span
            key={rampStart + offset}
            className={styles.streamRampChar}
            style={{ opacity: isSettled ? 1 : 1 - (1 - RAMP_MIN_OPACITY) * t * t }}
          >
            {char}
          </span>
        );
        offset += char.length;
      }

      if (/\s/.test(run)) {
        nodes.push(...chars);
      } else {
        nodes.push(
          <span key={`w${rampStart + runStart}`} className={styles.streamRampWord}>
            {chars}
          </span>
        );
      }
    }

    return nodes;
  }, [ramp, rampStart, isSettled]);

  return (
    <div className={`${styles.messageRow} ${styles.messageRowAssistant} ${styles.streamingBubble}`}>
      <div className={`${styles.messageBubble} ${styles.messageBubbleAssistant}`}>
        <span className={styles.messageLabel}>Guide</span>
        <div
          className={`${styles.messageContent} ${styles.markdown}`}
          aria-live="polite"
          aria-atomic="false"
        >
          {content ? (
            <>
              {stableMarkdown}
              {settled ? <span className={styles.streamSettled}>{settled}</span> : null}
              {rampNodes}
              <span className={styles.streamCursor} aria-hidden="true" />
            </>
          ) : (
            /* Same bubble shows the thinking spinner until the first words
               arrive, so the handoff is continuous rather than a bubble swap */
            <span className={styles.thinkingSpinner} aria-label="Thinking" />
          )}
        </div>
      </div>
    </div>
  );
}
