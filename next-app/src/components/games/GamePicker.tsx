'use client';

import React, { useState } from 'react';
import styles from './ChatGames.module.css';
import { NeoModal } from '@/components/neo/NeoModal';
import { AppIcon } from '@/components/icons/AppIcon';
import { GAME_INFO, GAME_KINDS, type GameKind } from '@/lib/games/types';
import { DIFFICULTIES, type Difficulty } from '@/lib/games/bots';
import { COACH_MODES, type CoachMode } from '@/lib/games/coach';
import { TIME_CONTROLS, UNTIMED, type TimeControl } from '@/lib/games/clock';
import { ACCENT_CLASS } from './GameShell';

export type GameMode = 'solo' | 'friend';

export interface GameStartOptions {
  kind: GameKind;
  mode: GameMode;
  difficulty: Difficulty;
  timeControl: TimeControl;
  coachMode?: CoachMode;
}

interface Props {
  isOpen: boolean;
  busy?: boolean;
  error?: string | null;
  /** 'solo' from the Dashboard header (vs Computer); 'friend' from Chat (challenge only). */
  mode?: GameMode;
  /** Who a challenge goes to: the friend's name or "the group". */
  friendLabel?: string;
  /** False when challenges are not possible (blocked user). */
  friendAvailable?: boolean;
  onClose: () => void;
  onStart: (opts: GameStartOptions) => void;
}

const SOLO_TAGS: Record<GameKind, string[]> = {
  chess: ['Turn-based', 'Solo Coach'],
  dama: ['Filipino rules', 'Solo Coach'],
  tictactoe: ['Quick', 'Solo Coach'],
  blockdrop: ['Live', 'Versus'],
};

const FRIEND_TAGS: Record<GameKind, string[]> = {
  chess: ['Turn-based', 'Fair match'],
  dama: ['Filipino rules', 'Fair match'],
  tictactoe: ['Quick', 'Fair match'],
  blockdrop: ['Live', 'Versus'],
};

const DROP_ART = ['#22d3ee', '#22d3ee', '#22d3ee', '#22d3ee', '', '#facc15', '', '#c084fc', '', '', '#facc15', '#facc15', '#c084fc', '#c084fc', '#c084fc', '#4ade80', '#4ade80', '#f87171'];

function TileArt({ kind }: { kind: GameKind }) {
  if (kind === 'chess') {
    return (
      <>
        <div className={styles.artChess} aria-hidden>
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className={(Math.floor(i / 6) + i) % 2 === 0 ? styles.artLight : styles.artDark} />
          ))}
        </div>
        <span className={styles.artPiece} aria-hidden>
          <AppIcon name="chessKnight" fill="#fafafa" strokeWidth={1.6} />
        </span>
      </>
    );
  }
  if (kind === 'dama') {
    return (
      <div className={styles.artDama} aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
    );
  }
  if (kind === 'tictactoe') {
    const marks = ['X', '', 'O', '', 'X', 'O', 'O', '', 'X'];
    return (
      <div className={styles.artTtt} aria-hidden>
        {marks.map((m, i) => (
          <span key={i} style={{ color: m === 'X' ? '#db2777' : '#2563eb' }}>
            {m === 'X' ? <AppIcon name="close" strokeWidth={3} /> : m === 'O' ? <AppIcon name="dot" strokeWidth={3} /> : null}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.artDrop} aria-hidden>
      {DROP_ART.map((c, i) => (
        <span key={i} style={c ? { background: c } : { border: 0 }} />
      ))}
    </div>
  );
}

export function GamePicker({
  isOpen,
  busy = false,
  error = null,
  mode = 'friend',
  friendLabel = 'your friend',
  friendAvailable = true,
  onClose,
  onStart,
}: Props) {
  const [kind, setKind] = useState<GameKind | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [timeControl, setTimeControl] = useState<TimeControl>(UNTIMED);
  const [coachMode, setCoachMode] = useState<CoachMode>('live');
  // Start from the game list every time the picker opens.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setKind(null);
  }

  const effectiveMode: GameMode = mode;
  const info = kind ? GAME_INFO[kind] : null;
  const tagsByKind = effectiveMode === 'solo' ? SOLO_TAGS : FRIEND_TAGS;
  const modalTitle = info ? info.title : effectiveMode === 'solo' ? 'Games vs Computer' : 'Challenge to a game';

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={modalTitle} maxWidth="460px">
      {!kind && (
        <>
          <p className={styles.pickerIntro}>
            {effectiveMode === 'solo'
              ? 'Practice against the computer with AI coaching.'
              : `Challenge ${friendLabel} in a fair match (no AI).`}
          </p>
          <div className={styles.tiles}>
            {GAME_KINDS.map((k) => {
              const g = GAME_INFO[k];
              return (
                <button key={k} type="button" className={`${styles.root} ${styles.tile} ${ACCENT_CLASS[k]}`} onClick={() => setKind(k)}>
                  <span className={styles.tileArt}>
                    <TileArt kind={k} />
                  </span>
                  <span className={styles.tileBody}>
                    <span className={styles.tileName}>{g.title}</span>
                    <span className={styles.tileBlurb}>{g.blurb}</span>
                    <span className={styles.tileTags}>
                      {tagsByKind[k].map((t) => (
                        <span key={t} className={styles.tag}>
                          {t}
                        </span>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {kind && info && (
        <div className={`${styles.root} ${styles.setup} ${ACCENT_CLASS[kind]}`}>
          <div>
            <span className={styles.setupLabel}>Opponent</span>
            <div className={`${styles.mode} ${styles.modeOn}`}>
              <span className={styles.modeTitle}>
                <AppIcon name={effectiveMode === 'solo' ? 'bot' : 'users'} />{' '}
                {effectiveMode === 'solo' ? 'Computer' : `Challenge ${friendLabel}`}
              </span>
              <span className={styles.modeSub}>
                {effectiveMode === 'solo'
                  ? 'Solo practice with AI Coach'
                  : friendAvailable
                  ? `Fair match vs ${friendLabel} (no AI)`
                  : 'Unavailable in this chat'}
              </span>
            </div>
          </div>

          {effectiveMode === 'solo' && (
            <>
              <div>
                <span className={styles.setupLabel}>Difficulty</span>
                <div className={styles.chips} role="radiogroup" aria-label="Difficulty">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      role="radio"
                      aria-checked={difficulty === d.id}
                      className={`${styles.chip} ${difficulty === d.id ? styles.chipOn : ''}`}
                      onClick={() => setDifficulty(d.id)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className={styles.setupLabel}>
                  <AppIcon name="bookText" size={12} /> Learning Guide (Solo Only)
                </span>
                <div className={styles.chips} role="radiogroup" aria-label="AI Coach mode">
                  {COACH_MODES.map((cm) => (
                    <button
                      key={cm.id}
                      type="button"
                      role="radio"
                      aria-checked={coachMode === cm.id}
                      className={`${styles.chip} ${coachMode === cm.id ? styles.chipOn : ''}`}
                      onClick={() => setCoachMode(cm.id)}
                      title={cm.desc}
                    >
                      {cm.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {kind === 'chess' && (
            <div>
              <span className={styles.setupLabel}>Clock</span>
              <div className={styles.chips} role="radiogroup" aria-label="Clock">
                {TIME_CONTROLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={timeControl.id === t.id}
                    className={`${styles.chip} ${timeControl.id === t.id ? styles.chipOn : ''}`}
                    onClick={() => setTimeControl(t)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className={styles.notice} role="alert">
              {error}
            </div>
          )}

          <div className={styles.setupFoot}>
            <button type="button" className={styles.btn} onClick={() => setKind(null)}>
              <AppIcon name="arrowLeft" /> Games
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy || (effectiveMode === 'friend' && !friendAvailable)}
              onClick={() =>
                onStart({
                  kind,
                  mode: effectiveMode,
                  difficulty,
                  timeControl: kind === 'chess' ? timeControl : UNTIMED,
                  coachMode: effectiveMode === 'solo' ? coachMode : 'off',
                })
              }
            >
              <AppIcon name="play" /> {effectiveMode === 'solo' ? 'Start practice' : 'Send challenge'}
            </button>
          </div>
        </div>
      )}
    </NeoModal>
  );
}
