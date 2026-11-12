'use client';

import React from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import type {
  ChessCoachReport,
  ClueLevel,
  CoachMode,
  DamaCoachReport,
  MoveGrade,
  TttCoachReport,
} from '@/lib/games/coach';

export type TurnCoachReport = ChessCoachReport | DamaCoachReport | TttCoachReport;

interface Props {
  mode: CoachMode;
  onModeChange: (mode: CoachMode) => void;
  report: TurnCoachReport | null;
  analyzing?: boolean;
  isMyTurn: boolean;
  clueLevel: ClueLevel;
  onAdvanceClue: () => void;
  /** In Solo mode, lets the user take back their last turn to rethink a mistake. */
  onUndoTurn?: () => void;
}

function gradeBadgeClass(grade: MoveGrade): string {
  switch (grade) {
    case 'brilliant':
      return styles.gradeBrilliant;
    case 'best':
      return styles.gradeBest;
    case 'good':
      return styles.gradeGood;
    case 'inaccuracy':
      return styles.gradeInaccuracy;
    case 'blunder':
      return styles.gradeBlunder;
  }
}

export function GameCoachCard({
  mode,
  onModeChange,
  report,
  analyzing,
  isMyTurn,
  clueLevel,
  onAdvanceClue,
  onUndoTurn,
}: Props) {
  if (mode === 'off') {
    return (
      <div className={styles.coachCollapsed}>
        <span className={styles.coachCollapsedText}>
          <AppIcon name="bot" size={15} /> AI Coach is off
        </span>
        <button
          type="button"
          className={`${styles.btn} ${styles.coachSmallBtn}`}
          onClick={() => onModeChange('live')}
        >
          <AppIcon name="sparkles" size={13} /> Turn On Coach
        </button>
      </div>
    );
  }

  const whitePct = report?.whiteWinPct ?? 50;
  const review = report?.lastMoveReview ?? null;
  const threatSummary = report?.kind === 'chess' ? report.threatSummary : null;
  const clue = report?.clue ?? null;

  const canAdvanceClue =
    isMyTurn &&
    Boolean(clue) &&
    (report?.kind === 'tictactoe' ? clueLevel < 2 : clueLevel < 2);

  const nextClueButtonLabel = (() => {
    if (!clue) return '';
    if (report?.kind === 'tictactoe') {
      return clueLevel === 0 ? 'Show Concept' : 'Reveal Idea';
    }
    if (clueLevel === 0) return mode === 'hint' ? 'Ask for Clue (1/2)' : 'Clue 1: Which piece?';
    return 'Clue 2: Explain idea';
  })();

  return (
    <section className={styles.coachCard} aria-label="AI Game Coach">
      {/* Header & Mode Switcher */}
      <div className={styles.coachHeader}>
        <div className={styles.coachTitleWrap}>
          <span className={styles.coachIconBadge}>
            <AppIcon name="bookText" size={14} />
          </span>
          <span className={styles.coachTitle}>AI Coach</span>
          {report && <span className={styles.coachEvalPill}>{report.evalLabel}</span>}
        </div>
        <div className={styles.coachModeGroup} role="group" aria-label="Coach mode">
          <button
            type="button"
            className={`${styles.coachModeBtn} ${mode === 'live' ? styles.coachModeBtnOn : ''}`}
            onClick={() => onModeChange('live')}
            title="Show guiding concepts, threat warnings, and post-move reviews"
          >
            Coach
          </button>
          <button
            type="button"
            className={`${styles.coachModeBtn} ${mode === 'hint' ? styles.coachModeBtnOn : ''}`}
            onClick={() => onModeChange('hint')}
            title="Quiet mode — only gives clues when you ask or make a blunder"
          >
            Quiet
          </button>
          <button
            type="button"
            className={styles.coachModeBtn}
            onClick={() => onModeChange('off')}
            title="Turn off AI Coach"
          >
            Off
          </button>
        </div>
      </div>

      {/* Position Balance Bar */}
      {report && (
        <div className={styles.evalBarWrap} aria-label={`Position balance: ${report.evalLabel}`}>
          <div className={styles.evalBarFillWhite} style={{ width: `${whitePct}%` }} />
          <div className={styles.evalBarCenterTick} />
        </div>
      )}

      {/* Opponent Threat Warning (teaches board vision without spoiling the move) */}
      {isMyTurn && threatSummary && (
        <div className={styles.threatBanner} role="status">
          <AppIcon name="shieldAlert" size={15} />
          <span>{threatSummary}</span>
        </div>
      )}

      {/* Post-Move Coaching Review on the Player's Last Move */}
      {review && (mode === 'live' || review.grade === 'inaccuracy' || review.grade === 'blunder') && (
        <div className={`${styles.reviewBanner} ${gradeBadgeClass(review.grade)}`}>
          <div className={styles.reviewText}>
            <span className={styles.reviewLabel}>
              <AppIcon
                name={
                  review.grade === 'brilliant' || review.grade === 'best'
                    ? 'checkCircle'
                    : review.grade === 'good'
                      ? 'check'
                      : 'warning'
                }
                size={14}
              />
              {review.label}
            </span>
            <span className={styles.reviewDetail}>
              {review.detail}
              {review.retryPrompt ? ` ${review.retryPrompt}` : ''}
            </span>
          </div>
          {onUndoTurn && (review.grade === 'inaccuracy' || review.grade === 'blunder') && (
            <button
              type="button"
              className={`${styles.btn} ${styles.coachSmallBtn}`}
              onClick={onUndoTurn}
              title="Take back your last turn and find the stronger move yourself"
            >
              <AppIcon name="undo" size={13} /> Rethink
            </button>
          )}
        </div>
      )}

      {/* Socratic Turn Guidance (Concept -> Clue 1: Piece -> Clue 2: Idea) */}
      {analyzing ? (
        <div className={styles.coachBody}>
          <span className={`${styles.coachReason} ${styles.dots}`}>Reading board position</span>
        </div>
      ) : isMyTurn && clue ? (
        <div className={styles.coachBody}>
          {mode === 'hint' && clueLevel === 0 ? (
            <div className={styles.coachAskRow}>
              <span className={styles.coachReason}>Think through your plan first, or ask for a guiding clue.</span>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.coachSmallBtn}`}
                onClick={onAdvanceClue}
              >
                <AppIcon name="sparkles" size={13} /> Get Clue (1/2)
              </button>
            </div>
          ) : (
            <div className={styles.coachPrimaryRow}>
              <div className={styles.coachPrimaryInfo}>
                <div className={styles.coachHeadlineRow}>
                  <span className={styles.coachTagPill}>
                    <AppIcon name="sparkles" size={12} /> {clue.conceptTag}
                  </span>
                  <span className={styles.coachStepLabel}>
                    {clueLevel === 0 ? 'Principle' : clueLevel === 1 ? 'Clue 1 of 2 · Focus Piece' : 'Clue 2 of 2 · Key Idea'}
                  </span>
                </div>
                <p className={styles.coachReason}>
                  {clueLevel === 0
                    ? clue.conceptPrompt
                    : clueLevel === 1
                      ? 'pieceClue' in clue
                        ? clue.pieceClue
                        : clue.conceptPrompt
                      : clue.ideaExplanation}
                </p>
              </div>
              {canAdvanceClue && (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.coachSmallBtn}`}
                  onClick={onAdvanceClue}
                  title="Get the next progressive clue"
                >
                  <AppIcon name="eye" size={13} /> {nextClueButtonLabel}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.coachBody}>
          <p className={styles.coachReason}>{report?.phaseTip ?? 'Watch your opponent\'s move and look for what it changes.'}</p>
        </div>
      )}
    </section>
  );
}
