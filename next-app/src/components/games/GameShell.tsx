'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import type { AvatarConfig } from '@/lib/models/avatar';
import { GAME_INFO, type GameKind } from '@/lib/games/types';
import { LOW_TIME_MS, formatClock } from '@/lib/games/clock';

export const ACCENT_CLASS: Record<GameKind, string> = {
  chess: styles.accentChess,
  dama: styles.accentDama,
  tictactoe: styles.accentTictactoe,
  blockdrop: styles.accentBlockdrop,
};

/** Re-renders every `intervalMs` while `active` and returns the current time. */
export function useNow(active: boolean, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

const noopSubscribe = () => () => { };

/** False during server rendering and hydration, true on the client: portals render only then. */
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export interface PlayerInfo {
  name: string;
  avatar?: AvatarConfig | null;
  bot?: boolean;
  /** Piece colour shown on the avatar. */
  side?: 'light' | 'dark' | null;
  /** "White", "X", "Black pieces"... */
  sideLabel?: string;
  active: boolean;
  /** Remaining time, or undefined for no clock. */
  clockMs?: number;
  clockRunning?: boolean;
  extra?: React.ReactNode;
}

export function PlayerCard({ p }: { p: PlayerInfo }) {
  const low = p.clockMs !== undefined && p.clockRunning && p.clockMs < LOW_TIME_MS;
  return (
    <div className={`${styles.player} ${p.active ? styles.playerActive : ''}`}>
      <div className={`${styles.avatar} ${p.bot ? styles.avatarBot : ''}`}>
        {p.bot ? <AppIcon name="bot" /> : p.avatar ? <PixelAvatar config={p.avatar} size={34} /> : <AppIcon name="user" />}
        {p.side && <span className={`${styles.sideDot} ${p.side === 'light' ? styles.sideLight : styles.sideDark}`} aria-hidden />}
      </div>
      <div className={styles.playerText}>
        <span className={styles.playerName}>
          {p.name}
          {p.active && <span className={styles.turnTag}>To move</span>}
        </span>
        <span className={styles.playerMeta}>
          {p.sideLabel}
          {p.extra}
        </span>
      </div>
      {p.clockMs !== undefined && (
        <div
          className={`${styles.clock} ${p.clockRunning ? styles.clockRunning : ''} ${low ? styles.clockLow : ''}`}
          role="timer"
          aria-label={`${p.name} clock ${formatClock(p.clockMs)}`}
        >
          {formatClock(p.clockMs)}
        </div>
      )}
    </div>
  );
}

export interface StatusInfo {
  text: string;
  tone?: 'mine' | 'alert' | 'idle';
  /** Animated ellipsis (computer thinking, waiting). */
  thinking?: boolean;
}

export interface ResultInfo {
  outcome: 'win' | 'lose' | 'draw';
  title: string;
  detail?: string;
}

interface ShellProps {
  kind: GameKind;
  subtitle: string;
  onBack: () => void;
  topAction?: React.ReactNode;
  top?: PlayerInfo;
  bottom?: PlayerInfo;
  status?: StatusInfo | null;
  coach?: React.ReactNode;
  notice?: string | null;
  /** The board; the result card is laid over it. */
  children?: React.ReactNode;
  /** Under the board (move list...). */
  below?: React.ReactNode;
  actions?: React.ReactNode;
  result?: ResultInfo | null;
  onRematch?: () => void;
  rematchLabel?: string;
}

export function GameShell({
  kind,
  subtitle,
  onBack,
  topAction,
  top,
  bottom,
  status,
  coach,
  notice,
  children,
  below,
  actions,
  result,
  onRematch,
  rematchLabel = 'Play again',
}: ShellProps) {
  const info = GAME_INFO[kind];
  // The result card can be closed to look at the final position; a new result shows it again.
  const resultKey = result ? `${result.outcome}|${result.title}|${result.detail ?? ''}` : '';
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const showResult = Boolean(result) && hiddenFor !== resultKey;
  const isClient = useIsClient();

  // Modal behaviour: Escape goes back to the chat, and the page behind does not scroll.
  const onBackRef = React.useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBackRef.current();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  if (!isClient) return null;

  return createPortal(
    <div className={styles.modalBackdrop}>
      <div className={`${styles.root} ${styles.shell} ${styles.modal} ${ACCENT_CLASS[kind]}`} role="dialog" aria-modal="true" aria-label={info.title}>
        <div className={styles.topBar}>
          <span className={styles.topIcon}>
            <AppIcon name={info.icon} />
          </span>
          <span className={styles.topText}>
            <span className={styles.topTitle}>{info.title}</span>
            <span className={styles.topSub}>{subtitle}</span>
          </span>
          {topAction}
          <button type="button" className={`${styles.btn} ${styles.btnOnAccent}`} onClick={onBack} aria-label="Back to chat" title="Back to chat (Esc)">
            <AppIcon name="message" /> <span className={styles.hideNarrow}>Back to chat</span>
          </button>
        </div>

        <div className={styles.body}>
          {top && (
            <div className={styles.areaTop}>
              <PlayerCard p={top} />
            </div>
          )}

          {status && (
            <div
              className={`${styles.areaStatus} ${styles.statusPill} ${status.tone === 'mine' ? styles.statusMine : ''} ${status.tone === 'alert' ? styles.statusAlert : ''}`}
              role="status"
              aria-live="polite"
            >
              <span className={status.thinking ? styles.dots : undefined}>{status.text}</span>
            </div>
          )}

          <div className={`${styles.areaBoard} ${styles.boardArea}`}>
            {children}
            {result && showResult && (
              <div className={styles.result} role="dialog" aria-label={result.title}>
                <div className={styles.resultCard}>
                  <span
                    className={`${styles.resultBadge} ${result.outcome === 'win' ? styles.badgeWin : result.outcome === 'lose' ? styles.badgeLose : styles.badgeDraw
                      }`}
                  >
                    <AppIcon name={result.outcome === 'win' ? 'trophy' : result.outcome === 'lose' ? 'flag' : 'handshake'} />
                  </span>
                  <span className={styles.resultTitle}>{result.title}</span>
                  {result.detail && <span className={styles.resultDetail}>{result.detail}</span>}
                  <div className={styles.resultActions}>
                    {onRematch && (
                      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onRematch}>
                        <AppIcon name="repeat" /> {rematchLabel}
                      </button>
                    )}
                    <button type="button" className={styles.btn} onClick={() => setHiddenFor(resultKey)}>
                      <AppIcon name="eye" /> View board
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {coach && <div className={styles.areaCoach}>{coach}</div>}
          {below && <div className={styles.areaBelow}>{below}</div>}
          {bottom && (
            <div className={styles.areaBottom}>
              <PlayerCard p={bottom} />
            </div>
          )}
          {notice && (
            <div className={`${styles.areaNotice} ${styles.notice}`} role="alert">
              {notice}
            </div>
          )}
          {actions && <div className={`${styles.areaActions} ${styles.actions}`}>{actions}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

