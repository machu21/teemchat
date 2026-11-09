'use client';

import React, { useEffect, useId, useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoButton } from '@/components/neo/NeoButton';
import { supabase } from '@/lib/supabase';
import { AGE_BAND_LABEL, DmPrivacy } from '@/lib/safety/ageBand';
import { isPersistedId } from '@/lib/services/safety';
import { useSafetyStore } from '@/stores/safety';
import { useSessionStore } from '@/stores/session';
import { AccessibilitySettings } from './AccessibilitySettings';
import styles from './ControlsSettingsModal.module.css';

interface SafetySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'safety' | 'blocked' | 'access';

function Segmented<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          className={`${styles.segment} ${value === o.value ? styles.segmentOn : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Looks up display names for blocked ids (profiles are publicly readable). */
function useBlockedNames(ids: string[], enabled: boolean): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = ids.join(',');
  useEffect(() => {
    if (!enabled) return;
    const persisted = key.split(',').filter(isPersistedId);
    if (persisted.length === 0) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', persisted)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, string> = {};
        for (const row of data as { id: string; display_name: string | null }[]) {
          next[row.id] = row.display_name || 'Player';
        }
        setNames(next);
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);
  return names;
}

export function SafetySettingsModal({ isOpen, onClose }: SafetySettingsModalProps) {
  const tabsId = useId();
  const sessionUserId = useSessionStore((s) => s.session?.id);
  const [tab, setTab] = useState<Tab>('safety');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ageBand = useSafetyStore((s) => s.ageBand);
  const prefs = useSafetyStore((s) => s.prefs);
  const restrictions = useSafetyStore((s) => s.restrictions);
  const blockedIds = useSafetyStore((s) => s.blockedIds);
  const updatePrefs = useSafetyStore((s) => s.updatePrefs);
  const unblock = useSafetyStore((s) => s.unblock);

  const blockedList = [...blockedIds];
  const names = useBlockedNames(blockedList, isOpen && tab === 'blocked');

  const save = async (patch: { chatFilter?: boolean; dmPrivacy?: DmPrivacy }) => {
    setSaving(true);
    setError(null);
    const ok = await updatePrefs(patch);
    setSaving(false);
    if (!ok) setError('Could not save. Please try again.');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'safety', label: '🛡️ Safety' },
    { id: 'blocked', label: `🚫 Blocked (${blockedList.length})` },
    { id: 'access', label: '♿ Access' },
  ];

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title="Safety & accessibility" maxWidth="480px">
      <div className={styles.tabs} role="tablist" aria-label="Safety sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${tabsId}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${tabsId}-${t.id}-panel`}
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'safety' && (
        <div role="tabpanel" id={`${tabsId}-safety-panel`} aria-labelledby={`${tabsId}-safety`} className={styles.panel}>
          <div className={styles.row}>
            <div className={styles.rowLabel}>
              Account age
              <small>Set once from your birth date. Ask support if it is wrong.</small>
            </div>
            <strong>{AGE_BAND_LABEL[ageBand]}</strong>
          </div>

          {restrictions.familyMode && (
            <p className={styles.notice}>
              Family Mode is on: the chat filter is always on, only friends can message you, you only hear
              friends&apos; voices, and Zombie Survival is hidden.
            </p>
          )}

          <div className={styles.group}>
            <div className={styles.settingLabel}>
              Chat filter
              <small>Hides swear words in chat, speech bubbles and names.</small>
            </div>
            <Segmented
              label="Chat filter"
              value={restrictions.filterOn ? 'on' : 'off'}
              disabled={restrictions.chatFilterLocked || saving}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
              onChange={(v) => save({ chatFilter: v === 'on' })}
            />
          </div>

          <div className={styles.group}>
            <div className={styles.settingLabel}>
              Who can message me
              <small>
                {restrictions.dmPrivacyLocked
                  ? 'Players under 18 can only get messages from friends.'
                  : 'Blocked players can never message you.'}
              </small>
            </div>
            <Segmented
              label="Who can message me"
              value={restrictions.dmFriendsOnly ? 'friends' : prefs.dmPrivacy}
              disabled={restrictions.dmPrivacyLocked || saving}
              options={[
                { value: 'friends', label: 'Friends only' },
                { value: 'everyone', label: 'Everyone' },
              ]}
              onChange={(v) => save({ dmPrivacy: v })}
            />
          </div>

          {error && (
            <p className={styles.notice} role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {tab === 'access' && (
        <div role="tabpanel" id={`${tabsId}-access-panel`} aria-labelledby={`${tabsId}-access`} className={styles.panel}>
          <AccessibilitySettings userId={sessionUserId} />
        </div>
      )}

      {tab === 'blocked' && (
        <div role="tabpanel" id={`${tabsId}-blocked-panel`} aria-labelledby={`${tabsId}-blocked`} className={styles.panel}>
          {blockedList.length === 0 ? (
            <p className={styles.lead}>You have not blocked anyone. Tap a player and choose Block to hide them.</p>
          ) : (
            blockedList.map((id) => (
              <div key={id} className={styles.row}>
                <div className={styles.rowLabel}>{names[id] || 'Player'}</div>
                <NeoButton size="sm" variant="secondary" onClick={() => unblock(id)}>
                  Unblock
                </NeoButton>
              </div>
            ))
          )}
        </div>
      )}
    </NeoModal>
  );
}
