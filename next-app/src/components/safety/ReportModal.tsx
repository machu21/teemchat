'use client';

import React, { useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoButton } from '@/components/neo/NeoButton';
import { REPORT_REASONS, ReportReason, SafetyService } from '@/lib/services/safety';
import styles from './Safety.module.css';

const COOLDOWN_MS = 60_000;
const lastReportAt = new Map<string, number>();

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reporterId: string;
  reportedUserId: string;
  reportedName: string;
  spaceId?: string | null;
  roomId?: string | null;
  /** Offer to also block after reporting. */
  onBlock?: () => Promise<void> | void;
}

export function ReportModal({
  isOpen,
  onClose,
  reporterId,
  reportedUserId,
  reportedName,
  spaceId,
  roomId,
  onBlock,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const close = () => {
    setReason(null);
    setDetails('');
    setError(null);
    setSent(false);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError('Please choose a reason.');
      return;
    }
    const last = lastReportAt.get(reportedUserId) || 0;
    if (Date.now() - last < COOLDOWN_MS) {
      setError('You already reported this player. Please wait a minute before sending another report.');
      return;
    }
    setSending(true);
    setError(null);
    const res = await SafetyService.report({
      reporterId,
      reportedUserId,
      reason,
      details,
      spaceId,
      roomId,
    });
    setSending(false);
    if (!res.ok) {
      setError(res.error || 'Could not send the report.');
      return;
    }
    lastReportAt.set(reportedUserId, Date.now());
    setSent(true);
  };

  return (
    <NeoModal isOpen={isOpen} onClose={close} title={`Report ${reportedName}`} maxWidth="440px">
      {sent ? (
        <div className={styles.stack}>
          <p className={styles.success} role="status">
            Thanks. Our moderators will review this report.
          </p>
          <p className={styles.muted}>
            If you feel unsafe, you can block this player so you no longer see or hear them.
          </p>
          {onBlock && (
            <NeoButton
              variant="danger"
              onClick={async () => {
                await onBlock();
                close();
              }}
            >
              🚫 Block {reportedName}
            </NeoButton>
          )}
          <NeoButton variant="secondary" onClick={close}>
            Done
          </NeoButton>
        </div>
      ) : (
        <form className={styles.stack} onSubmit={submit}>
          <p className={styles.lead}>What is happening?</p>
          <div className={styles.reasonList} role="radiogroup" aria-label="Report reason">
            {REPORT_REASONS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={reason === r.id}
                className={`${styles.reasonOption} ${reason === r.id ? styles.reasonOptionActive : ''}`}
                onClick={() => setReason(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <label className={styles.muted} htmlFor="report-details">
            Add details (optional)
          </label>
          <textarea
            id="report-details"
            className={styles.textarea}
            maxLength={500}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="What did they say or do?"
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <NeoButton type="submit" variant="danger" disabled={sending || !reason}>
            {sending ? 'Sending…' : '🚩 Send report'}
          </NeoButton>
        </form>
      )}
    </NeoModal>
  );
}
