'use client';

import React, { useEffect, useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoButton } from '@/components/neo/NeoButton';
import { AppIcon } from '@/components/icons/AppIcon';
import { E2EEManager } from '@/lib/services/e2eeManager';
import { KeyBackupModal } from '@/components/settings/KeyBackupModal';
import styles from './EncryptionDetailsModal.module.css';

export type EncryptionChannelKind = 'dm' | 'group' | 'space';

interface EncryptionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelKind: EncryptionChannelKind;
  userId: string;
  peerUserId?: string;
  peerName?: string;
  spaceId?: string;
  spaceVisibility?: string;
}

export function EncryptionDetailsModal({
  isOpen,
  onClose,
  channelKind,
  userId,
  peerUserId,
  peerName,
  spaceId,
  spaceVisibility,
}: EncryptionDetailsModalProps) {
  const [myFingerprint, setMyFingerprint] = useState<string | null>(null);
  const [peerFingerprint, setPeerFingerprint] = useState<string | null>(null);
  const [dmMode, setDmMode] = useState<'ecdh' | 'baseline'>('ecdh');
  const [hasBackup, setHasBackup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;

    const load = async () => {
      await E2EEManager.initUser(userId);
      const [mine, backedUp] = await Promise.all([
        E2EEManager.getMyFingerprint(),
        E2EEManager.hasCloudBackup(userId),
      ]);
      if (cancelled) return;
      setMyFingerprint(mine);
      setHasBackup(backedUp);

      if (channelKind === 'dm' && peerUserId) {
        const [peerFp, mode] = await Promise.all([
          E2EEManager.getPeerFingerprint(peerUserId),
          E2EEManager.getDMEncryptionMode(peerUserId),
        ]);
        if (cancelled) return;
        setPeerFingerprint(peerFp);
        setDmMode(mode);
      } else {
        setPeerFingerprint(null);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, channelKind, peerUserId]);

  const copyFingerprint = async () => {
    if (!myFingerprint) return;
    try {
      await navigator.clipboard.writeText(myFingerprint);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const isPublicSpace = channelKind === 'space' && spaceVisibility !== 'private';
  const isBaselineDM = channelKind === 'dm' && dmMode === 'baseline';
  const showUpgradeNotice = isBaselineDM || isPublicSpace;

  let statusTitle = 'End-to-End Encrypted';
  let statusDescription =
    'Messages are encrypted on your device with AES-256-GCM before leaving your browser.';

  if (channelKind === 'dm') {
    if (dmMode === 'ecdh') {
      statusTitle = 'Zero-Knowledge ECDH Active';
      statusDescription =
        'Key agreement uses ECDH P-256 + HKDF-SHA-256. Only you and your friend can decrypt messages.';
    } else {
      statusTitle = 'Standard Encryption (Awaiting Peer Key Upgrade)';
      statusDescription =
        'Messages are encrypted in the database, and will upgrade automatically to zero-knowledge ECDH once your friend comes online.';
    }
  } else if (channelKind === 'group') {
    statusTitle = 'Squad Room Key Active';
    statusDescription =
      'Messages use a 256-bit AES-GCM squad key distributed to members via pairwise ECDH.';
  } else if (channelKind === 'space') {
    if (spaceVisibility === 'private') {
      statusTitle = 'Private Space Room Key Active';
      statusDescription =
        'Room chat and speech bubbles are encrypted with a space key shared exclusively with members.';
    } else {
      statusTitle = 'Space Session Encryption Active';
      statusDescription = `Public drop-in spaces${spaceId ? '' : ''} encrypt room chat and speech bubbles with a fast space-session key so guests can join immediately.`;
    }
  }

  return (
    <>
      <NeoModal isOpen={isOpen} onClose={onClose} title="Chat Encryption Details" maxWidth="460px">
        <div className={styles.stack}>
          <div className={styles.statusCard}>
            <div className={`${styles.statusIcon} ${showUpgradeNotice ? styles.statusIconWarn : ''}`}>
              <AppIcon name={showUpgradeNotice ? 'shield' : 'lock'} size={18} />
            </div>
            <div>
              <div className={styles.statusTitle}>{statusTitle}</div>
              <div className={styles.statusSub}>{statusDescription}</div>
            </div>
          </div>

          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Cipher Suite</span>
            <span className={styles.fingerprintCode}>ECDH P-256 + AES-256-GCM (Web Crypto)</span>
          </div>

          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Your Key Fingerprint</span>
            <div className={styles.fingerprintLine}>
              <span className={styles.fingerprintCode}>{myFingerprint || 'Initializing…'}</span>
              {myFingerprint && (
                <NeoButton type="button" size="sm" variant="secondary" onClick={copyFingerprint}>
                  <AppIcon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy'}
                </NeoButton>
              )}
            </div>
          </div>

          {channelKind === 'dm' && peerUserId && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>{peerName || 'Peer'} Key Fingerprint</span>
              <span className={styles.fingerprintCode}>
                {peerFingerprint || 'Not published yet (upgrades automatically on next login)'}
              </span>
            </div>
          )}

          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Multi-Device Cloud Sync</span>
            <span className={styles.statusSub}>
              {hasBackup
                ? 'Zero-knowledge encrypted backup saved for cross-device recovery.'
                : 'No backup PIN set yet. Back up your key to keep message access on new devices.'}
            </span>
          </div>

          <div className={styles.actions}>
            <NeoButton type="button" size="sm" variant="secondary" onClick={() => setBackupOpen(true)}>
              <AppIcon name="lock" /> {hasBackup ? 'Manage Backup PIN' : 'Set Backup PIN'}
            </NeoButton>
            <NeoButton type="button" size="sm" variant="primary" onClick={onClose}>
              Done
            </NeoButton>
          </div>
        </div>
      </NeoModal>

      <KeyBackupModal
        isOpen={backupOpen}
        onClose={() => setBackupOpen(false)}
        userId={userId}
        onSuccess={() => setHasBackup(true)}
      />
    </>
  );
}
