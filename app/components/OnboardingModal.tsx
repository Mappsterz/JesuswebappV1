'use client';

import styles from '../page.module.css';
import { CrossIcon } from './icons';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function OnboardingModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className={styles.modalOverlay} role="presentation">
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className={styles.onboardingIcon} aria-hidden="true">
          <CrossIcon size={36} />
        </div>
        <h2 id="welcome-title" className={styles.modalTitle}>
          Welcome to Walk With Me
        </h2>
        <p className={styles.modalMessage}>
          This is a compassionate AI guide inspired by the teachings of Jesus Christ. It offers
          comfort, reflection, and Scripture — but it is not a substitute for a local church, pastor,
          or licensed counselor.
        </p>
        <p className={styles.modalMessage}>
          If you are in crisis, please reach out: call or text <strong>988</strong> (US Suicide &amp;
          Crisis Lifeline), or text <strong>HOME</strong> to <strong>741741</strong>.
        </p>
        <div className={styles.modalActions}>
          <button className={styles.modalBtnPrimary} onClick={onClose} autoFocus>
            Begin
          </button>
        </div>
      </div>
    </div>
  );
}
