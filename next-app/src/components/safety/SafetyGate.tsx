'use client';

import React, { useEffect, useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { NeoButton } from '@/components/neo/NeoButton';
import { useSafetyStore } from '@/stores/safety';
import { validateBirthDate } from '@/lib/safety/ageBand';
import styles from './Safety.module.css';

interface SafetyGateProps {
  /** Signed-in user (including guests); null when signed out. */
  userId: string | null | undefined;
}

/**
 * Loads the viewer's safety profile (age band, filter, blocks) and asks for a
 * birth date once when none is on file (Google sign-ins, guests, older accounts).
 * Mount it on every page a signed-in user lands on.
 */
export function SafetyGate({ userId }: SafetyGateProps) {
  const load = useSafetyStore((s) => s.load);
  const reset = useSafetyStore((s) => s.reset);
  const loaded = useSafetyStore((s) => s.loaded);
  const loadedFor = useSafetyStore((s) => s.userId);
  const hasBirthDate = useSafetyStore((s) => s.hasBirthDate);
  const setBirthDate = useSafetyStore((s) => s.setBirthDate);

  const [birthDate, setBirthDateInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      reset();
      return;
    }
    if (loadedFor && loadedFor !== userId) reset();
    load(userId).catch(() => {});
  }, [userId, loadedFor, load, reset]);

  const needsBirthDate = Boolean(userId) && loaded && loadedFor === userId && !hasBirthDate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validateBirthDate(birthDate);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    const res = await setBirthDate(birthDate);
    setSaving(false);
    setError(res);
  };

  return (
    <NeoModal
      isOpen={needsBirthDate}
      // Required step: closing is not offered until a birth date is saved.
      onClose={() => {}}
      title="One quick question"
      maxWidth="420px"
    >
      <form className={styles.stack} onSubmit={handleSubmit}>
        <p className={styles.lead}>
          When were you born? We use this to keep TeemChat safe for everyone. Players under 13 get
          Family Mode automatically.
        </p>
        <NeoInput
          id="age-gate-birth-date"
          label="DATE OF BIRTH"
          type="date"
          value={birthDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setBirthDateInput(e.target.value)}
          required
        />
        <p className={styles.muted}>
          Your birth date stays private. Other players never see it. It can only be set once.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <NeoButton type="submit" variant="primary" size="lg" disabled={saving || !birthDate}>
          {saving ? 'Saving…' : 'Continue'}
        </NeoButton>
      </form>
    </NeoModal>
  );
}
