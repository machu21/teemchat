'use client';

import React, { useState } from 'react';
import { NeoButton } from '@/components/neo/NeoButton';
import { ModerationAction, SafetyService } from '@/lib/services/safety';
import { useSafetyStore } from '@/stores/safety';
import { ReportModal } from './ReportModal';
import styles from './Safety.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import type { IconName } from '@/lib/icons';

type Toast = (icon: IconName, message: string, color: string) => void;

interface PlayerSafetyPanelProps {
  currentUserId: string;
  targetUserId: string;
  targetName: string;
  spaceId?: string | null;
  /** Viewer can kick / ban / mute in this space. */
  isModerator?: boolean;
  onToast?: Toast;
  /** Called after a successful host action so the caller can notify the target. */
  onModerated?: (action: ModerationAction) => void;
  /** Called after block, so the caller can close the profile card. */
  onBlocked?: () => void;
}

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: '10 min', minutes: 10 },
  { label: '1 hour', minutes: 60 },
  { label: '24 hours', minutes: 1440 },
  { label: 'Permanent', minutes: null },
];

const ACTION_LABEL: Record<ModerationAction, string> = {
  kick: 'Kick',
  ban: 'Ban',
  unban: 'Unban',
  mute_voice: 'Mute voice',
  mute_chat: 'Mute chat',
  unmute: 'Unmute',
};

export function PlayerSafetyPanel({
  currentUserId,
  targetUserId,
  targetName,
  spaceId,
  isModerator = false,
  onToast,
  onModerated,
  onBlocked,
}: PlayerSafetyPanelProps) {
  const isBlocked = useSafetyStore((s) => s.blockedIds.has(targetUserId));
  const isMuted = useSafetyStore((s) => s.mutedIds.has(targetUserId));
  const block = useSafetyStore((s) => s.block);
  const unblock = useSafetyStore((s) => s.unblock);
  const toggleMute = useSafetyStore((s) => s.toggleMute);

  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<number | null>(60);
  const [pending, setPending] = useState<ModerationAction | null>(null);

  const toast: Toast = (icon, message, color) => onToast?.(icon, message, color);

  const handleBlock = async () => {
    setBusy(true);
    const ok = isBlocked ? await unblock(targetUserId) : await block(targetUserId);
    setBusy(false);
    if (!ok) {
      toast('warning', 'Could not update block. Please try again.', '#EF4444');
      return;
    }
    if (isBlocked) {
      toast('checkCircle', `${targetName} is unblocked.`, '#22C55E');
    } else {
      toast('ban', `${targetName} is blocked. You won't see or hear them.`, '#EF4444');
      onBlocked?.();
    }
  };

  const runModeration = async (action: ModerationAction) => {
    if (!spaceId) return;
    setBusy(true);
    const res = await SafetyService.moderate({
      spaceId,
      targetUserId,
      action,
      minutes: action === 'kick' ? 10 : duration,
    });
    setBusy(false);
    setPending(null);
    if (!res.ok) {
      toast('warning', res.error || 'Action failed.', '#EF4444');
      return;
    }
    toast('shield', `${ACTION_LABEL[action].replace(/^\S+\s/, '')}: ${targetName}`, '#3B82F6');
    onModerated?.(action);
  };

  return (
    <div className={styles.stack}>
      <div className={styles.actionRow}>
        <NeoButton
          size="sm"
          variant="secondary"
          onClick={() => toggleMute(targetUserId)}
          aria-pressed={isMuted}
          title="Hide this player's voice, bubbles and chat for this visit"
        >
          {isMuted ? <><AppIcon name="volume" /> Unmute</> : <><AppIcon name="volumeOff" /> Mute</>}
        </NeoButton>
        <NeoButton size="sm" variant={isBlocked ? 'secondary' : 'danger'} disabled={busy} onClick={handleBlock}>
          {isBlocked ? 'Unblock' : <><AppIcon name="ban" /> Block</>}
        </NeoButton>
        <NeoButton size="sm" variant="secondary" onClick={() => setReportOpen(true)}>
          <AppIcon name="flag" /> Report
        </NeoButton>
      </div>

      {isModerator && spaceId && (
        <div className={styles.hostTools}>
          <div className={styles.hostTitle}>Host tools</div>
          <div className={styles.durationRow} role="radiogroup" aria-label="Duration">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                type="button"
                role="radio"
                aria-checked={duration === d.minutes}
                className={`${styles.chip} ${duration === d.minutes ? styles.chipActive : ''}`}
                onClick={() => setDuration(d.minutes)}
              >
                {d.label}
              </button>
            ))}
          </div>
          {pending ? (
            <div className={styles.hostGrid}>
              <NeoButton size="sm" variant="danger" disabled={busy} onClick={() => runModeration(pending)}>
                Confirm {ACTION_LABEL[pending].replace(/^\S+\s/, '')}
              </NeoButton>
              <NeoButton size="sm" variant="secondary" disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </NeoButton>
            </div>
          ) : (
            <div className={styles.hostGrid}>
              {(['kick', 'ban', 'mute_voice', 'mute_chat', 'unmute'] as ModerationAction[]).map((action) => (
                <NeoButton
                  key={action}
                  size="sm"
                  variant={action === 'ban' || action === 'kick' ? 'danger' : 'secondary'}
                  disabled={busy}
                  onClick={() => setPending(action)}
                >
                  {ACTION_LABEL[action]}
                </NeoButton>
              ))}
            </div>
          )}
          <p className={styles.muted}>Kick removes them for 10 minutes. Duration applies to ban and mutes.</p>
        </div>
      )}

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        reporterId={currentUserId}
        reportedUserId={targetUserId}
        reportedName={targetName}
        spaceId={spaceId}
        roomId="general"
        onBlock={isBlocked ? undefined : handleBlock}
      />
    </div>
  );
}
