'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import type { AvatarConfig } from '@/lib/models/avatar';
import { GAME_INFO, type GameKind } from '@/lib/games/types';
import { DIFFICULTIES, tttBotMove, type Difficulty } from '@/lib/games/bots';
import { requestChessCoach, requestChessMove, requestDamaCoach, requestDamaMove } from '@/lib/games/botRunner';
import {
  analyzeTttCoach,
  type BlockDropCoachReport,
  type ClueLevel,
  type CoachMode,
  type LastMoveReview,
} from '@/lib/games/coach';
import { applyTttMove, initialTtt, parseTtt, tttNextMark, tttWinner } from '@/lib/games/tictactoe';
import { applyChessMove, chessOutcome, chessTurn, initialChess, parseChess } from '@/lib/games/chess';
import { damaOutcome, initialDama, parseDama, playDamaMove } from '@/lib/games/dama';
import { isTimed, remainingMs, type TimeControl } from '@/lib/games/clock';
import { GameShell, useNow, type PlayerInfo, type ResultInfo } from './GameShell';
import { GameCoachCard, type TurnCoachReport } from './GameCoachCard';
import type { ColorChoice } from './GamePicker';
import type { BoardMove, ChessCoachHint, DamaCoachHint, Seat, TttCoachHint } from './boardTypes';
import { TicTacToeBoard } from './TicTacToeBoard';
import { ChessBoard, ChessCaptured, MoveList } from './ChessBoard';
import { DamaBoard, DamaCaptured, damaLost } from './DamaBoard';
import {
  BlockDropCoachCard,
  BlockDropGame,
  BlockDropOpponentCard,
  type BlockDropEnd,
} from './BlockDropGame';

type TurnKind = Exclude<GameKind, 'blockdrop'>;
type Side = Exclude<Seat, null>;

/** Minimum time the computer "thinks", so its moves are easy to follow. */
const MIN_THINK_MS = 450;

function initialState(kind: TurnKind): unknown {
  return kind === 'chess' ? initialChess() : kind === 'dama' ? initialDama() : initialTtt();
}

function turnOf(kind: TurnKind, state: unknown): Side {
  if (kind === 'chess') return chessTurn(parseChess(state)) === 'w' ? 'one' : 'two';
  if (kind === 'dama') return parseDama(state).turn === 'w' ? 'one' : 'two';
  return tttNextMark(parseTtt(state)) === 'X' ? 'one' : 'two';
}

function outcomeOf(kind: TurnKind, state: unknown): { over: boolean; winner: Side | null; reason: string } {
  if (kind === 'chess') {
    const o = chessOutcome(parseChess(state));
    if (!o.over) return { over: false, winner: null, reason: '' };
    const reason = o.reason === 'checkmate' ? 'Checkmate' : o.reason === 'stalemate' ? 'Stalemate' : 'Draw';
    return { over: true, winner: o.winner ? (o.winner === 'w' ? 'one' : 'two') : null, reason };
  }
  if (kind === 'dama') {
    const o = damaOutcome(parseDama(state));
    if (!o.over) return { over: false, winner: null, reason: '' };
    return { over: true, winner: o.winner ? (o.winner === 'w' ? 'one' : 'two') : null, reason: o.winner ? 'No moves left' : 'Draw by quiet play' };
  }
  const s = parseTtt(state);
  const w = tttWinner(s);
  if (w) return { over: true, winner: w.mark === 'X' ? 'one' : 'two', reason: 'Three in a row' };
  if (s.board.every((c) => c !== '')) return { over: true, winner: null, reason: 'The board is full' };
  return { over: false, winner: null, reason: '' };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Props {
  kind: GameKind;
  difficulty: Difficulty;
  timeControl: TimeControl;
  coachMode?: CoachMode;
  colorChoice?: ColorChoice;
  me: { name: string; avatar?: AvatarConfig | null };
  onBack: () => void;
  /** Start a fresh game with the same settings. */
  onRematch: () => void;
}

export function SoloGame(props: Props) {
  if (props.kind === 'blockdrop') return <SoloBlockDrop {...props} />;
  return <SoloTurnGame {...props} kind={props.kind} />;
}

function botName(difficulty: Difficulty) {
  return `Computer · ${DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? ''}`;
}

function SoloTurnGame({
  kind,
  difficulty,
  timeControl,
  coachMode: initialCoachMode = 'live',
  colorChoice = 'white',
  me,
  onBack,
  onRematch,
}: Props & { kind: TurnKind }) {
  const [humanSide] = useState<Side>(() => {
    if (kind !== 'chess' && kind !== 'dama') return 'one';
    if (colorChoice === 'black') return 'two';
    if (colorChoice === 'random') return Math.random() < 0.5 ? 'one' : 'two';
    return 'one';
  });
  const botSide: Side = humanSide === 'one' ? 'two' : 'one';
  const humanColor = humanSide === 'one' ? 'w' : 'b';

  const [state, setState] = useState<unknown>(() => initialState(kind));
  const [undoStack, setUndoStack] = useState<unknown[]>([]);
  const [lastPlayerTurnPair, setLastPlayerTurnPair] = useState<{ before: unknown; after: unknown } | null>(null);
  const [coachMode, setCoachMode] = useState<CoachMode>(initialCoachMode);
  const [coachReport, setCoachReport] = useState<TurnCoachReport | null>(null);
  const [playerMoveReview, setPlayerMoveReview] = useState<LastMoveReview | null>(null);
  /** Progressive Socratic clue level: 0 = Principle only, 1 = Focus piece, 2 = Full idea. */
  const [clueLevel, setClueLevel] = useState<ClueLevel>(0);

  const timed = kind === 'chess' && isTimed(timeControl);
  // Clocks start after White's first move, like the online games.
  const [clocks, setClocks] = useState({ one: timeControl.baseMs, two: timeControl.baseMs, startedAt: null as number | null });
  const [resigned, setResigned] = useState(false);

  const turn = turnOf(kind, state);
  const outcome = useMemo(() => outcomeOf(kind, state), [kind, state]);
  const clockRunning = timed && !outcome.over && !resigned && clocks.startedAt !== null;
  const now = useNow(clockRunning);
  const left = (side: Side) => remainingMs(clocks[side], clockRunning && turn === side, clocks.startedAt, now);
  const flagged = clockRunning && left(turn) <= 0;
  const finished = outcome.over || resigned || flagged;

  const play = useCallback(
    (next: unknown, by: Side) => {
      if (by === humanSide) {
        setUndoStack((prev) => [...prev.slice(-30), state]);
        setLastPlayerTurnPair({ before: state, after: next });
        setClueLevel(0);
      }
      setState(next);
      if (!timed) return;
      setClocks((c) => {
        const t = Date.now();
        if (c.startedAt === null) return { ...c, startedAt: t };
        return { ...c, [by]: c[by] - (t - c.startedAt) + timeControl.incMs, startedAt: t };
      });
    },
    [state, timed, timeControl.incMs, humanSide]
  );

  const onMove = (move: BoardMove) => {
    if (finished || turn === botSide) return;
    play(move.state, humanSide);
  };

  const handleUndoTurn = useCallback(() => {
    if (undoStack.length === 0 || finished) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setLastPlayerTurnPair(null);
    setPlayerMoveReview(null);
    setClueLevel(1); // When rethinking a mistake, highlight which piece to consider
    setState(prev);
  }, [undoStack, finished]);

  const advanceClue = useCallback(() => {
    setClueLevel((prev) => {
      if (kind === 'tictactoe') return 2;
      return prev === 0 ? 1 : 2;
    });
  }, [kind]);

  // Evaluate position with AI Coach whenever state changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let rep: TurnCoachReport;
      const prevForReview =
        lastPlayerTurnPair && lastPlayerTurnPair.after === state ? lastPlayerTurnPair.before : null;

      if (kind === 'chess') {
        rep = await requestChessCoach(
          parseChess(state),
          humanColor,
          prevForReview ? parseChess(prevForReview) : null
        );
      } else if (kind === 'dama') {
        rep = await requestDamaCoach(
          parseDama(state),
          humanColor,
          prevForReview ? parseDama(prevForReview) : null
        );
      } else {
        rep = analyzeTttCoach(
          parseTtt(state),
          'X',
          prevForReview ? parseTtt(prevForReview) : null
        );
      }
      if (cancelled) return;
      if (rep.lastMoveReview) {
        setPlayerMoveReview(rep.lastMoveReview);
      }
      setCoachReport(rep);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, state, lastPlayerTurnPair, humanColor]);

  // The computer's move.
  useEffect(() => {
    if (finished || turn !== botSide) return;
    let cancelled = false;
    const started = Date.now();
    (async () => {
      let next: unknown = null;
      if (kind === 'tictactoe') {
        const s = parseTtt(state);
        const cell = tttBotMove(s, difficulty);
        next = cell === null ? null : applyTttMove(s, cell);
      } else if (kind === 'chess') {
        const s = parseChess(state);
        const m = await requestChessMove(s.fen, difficulty);
        next = m ? applyChessMove(s, m.from, m.to, m.promotion) : null;
      } else {
        const s = parseDama(state);
        const m = await requestDamaMove(s, difficulty);
        next = m ? playDamaMove(s, m) : null;
      }
      await sleep(Math.max(0, MIN_THINK_MS - (Date.now() - started)));
      if (!cancelled && next) play(next, botSide);
    })();
    return () => {
      cancelled = true;
    };
    // `play` only reads stable values; re-run when the position or result changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, turn, finished, kind, difficulty, botSide]);

  const coachActive = !finished && turn === humanSide && coachMode !== 'off';

  // Socratic board hints:
  // Level 0: Only shows threatened pieces (so the player learns board vision), NO move spoilers!
  // Level 1: Highlights ONLY the piece (`focusSquare`) to think about, NO destination arrow!
  // Level 2: Shows the idea path if the player explicitly asked for Clue 2.
  const chessHint: ChessCoachHint | null = useMemo(() => {
    if (!coachActive || !coachReport || coachReport.kind !== 'chess') return null;
    const threatenedSquares = coachMode === 'live' ? coachReport.threatenedSquares : [];
    const c = coachReport.clue;
    if (!c) return { threatenedSquares };
    return {
      threatenedSquares,
      focusSquare: clueLevel >= 1 ? c.from : null,
      arrow: clueLevel >= 2 ? { from: c.from, to: c.to } : null,
    };
  }, [coachActive, coachReport, coachMode, clueLevel]);

  const damaHint: DamaCoachHint | null = useMemo(() => {
    if (!coachActive || !coachReport || coachReport.kind !== 'dama' || !coachReport.clue) return null;
    const c = coachReport.clue;
    return {
      focusSquare: clueLevel >= 1 ? c.from : null,
      arrow: clueLevel >= 2 ? { from: c.from, path: c.path } : null,
    };
  }, [coachActive, coachReport, clueLevel]);

  const tttHint: TttCoachHint | null = useMemo(() => {
    if (!coachActive || !coachReport || coachReport.kind !== 'tictactoe' || !coachReport.clue) return null;
    return {
      focusCell: clueLevel >= 2 ? coachReport.clue.cell : null,
    };
  }, [coachActive, coachReport, clueLevel]);

  const mergedReport: TurnCoachReport | null = useMemo(() => {
    if (!coachReport) return null;
    return { ...coachReport, lastMoveReview: playerMoveReview ?? coachReport.lastMoveReview };
  }, [coachReport, playerMoveReview]);

  const sideLabel = (side: Side) =>
    kind === 'chess' ? (side === 'one' ? 'White' : 'Black') : kind === 'dama' ? (side === 'one' ? 'White pieces' : 'Black pieces') : side === 'one' ? 'Plays X' : 'Plays O';
  const extra = (side: Side) =>
    kind === 'chess' ? (
      <ChessCaptured state={state} color={side === 'one' ? 'w' : 'b'} />
    ) : kind === 'dama' ? (
      <DamaCaptured count={damaLost(state, side === 'one' ? 'b' : 'w')} color={side === 'one' ? 'b' : 'w'} />
    ) : null;

  const player = (side: Side): PlayerInfo => ({
    name: side === botSide ? botName(difficulty) : me.name,
    avatar: side === botSide ? null : me.avatar,
    bot: side === botSide,
    side: kind === 'tictactoe' ? null : side === 'one' ? 'light' : 'dark',
    sideLabel: sideLabel(side),
    active: !finished && turn === side,
    clockMs: timed ? left(side) : undefined,
    clockRunning: clockRunning && turn === side,
    extra: extra(side),
  });

  const result: ResultInfo | null = (() => {
    if (!finished) return null;
    const winner: Side | null = resigned ? botSide : flagged ? (turn === 'one' ? 'two' : 'one') : outcome.winner;
    const detail = resigned ? 'You resigned' : flagged ? 'Out of time' : outcome.reason;
    if (!winner) return { outcome: 'draw', title: 'Draw', detail };
    return winner === humanSide ? { outcome: 'win', title: 'You win!', detail } : { outcome: 'lose', title: 'Computer wins', detail };
  })();

  const check = kind === 'chess' && !finished ? chessOutcome(parseChess(state)) : null;
  // The pill stays when the game ends, so the board under it does not jump.
  const status = finished
    ? { text: 'Game over' }
    : turn === botSide
      ? { text: 'Computer is thinking', thinking: true }
      : { text: check && !check.over && check.check ? 'Check! Your move' : 'Your move', tone: 'mine' as const };

  const props = { state, seat: humanSide, canMove: !finished && turn === humanSide, onMove };
  const board =
    kind === 'tictactoe' ? (
      <TicTacToeBoard {...props} coachHint={tttHint} />
    ) : kind === 'chess' ? (
      <ChessBoard {...props} coachHint={chessHint} />
    ) : (
      <DamaBoard {...props} coachHint={damaHint} />
    );

  const leave = () => {
    if (finished || window.confirm('Leave this game? It will not be saved.')) onBack();
  };

  return (
    <GameShell
      kind={kind}
      subtitle={`Solo practice · ${DIFFICULTIES.find((d) => d.id === difficulty)?.label}${kind === 'chess' || kind === 'dama' ? ` · ${humanSide === 'one' ? 'White' : 'Black'}` : ''}${timed ? ` · ${timeControl.label}` : ''}`}
      onBack={leave}
      backLabel="Games"
      backIcon="gamepad"
      top={player(botSide)}
      bottom={player(humanSide)}
      status={status}
      coach={
        !finished ? (
          <GameCoachCard
            mode={coachMode}
            onModeChange={setCoachMode}
            report={mergedReport}
            analyzing={!mergedReport}
            isMyTurn={!finished && turn === humanSide}
            clueLevel={clueLevel}
            onAdvanceClue={advanceClue}
            onUndoTurn={undoStack.length > 0 && !finished && turn === humanSide ? handleUndoTurn : undefined}
          />
        ) : undefined
      }
      below={kind === 'chess' ? <MoveList state={state} /> : undefined}
      result={result}
      onRematch={onRematch}
      actions={
        <>
          {!finished && undoStack.length > 0 && turn === humanSide && (
            <button type="button" className={styles.btn} onClick={handleUndoTurn} title="Take back last turn">
              <AppIcon name="undo" /> Take back
            </button>
          )}
          {!finished && kind !== 'tictactoe' && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => {
                if (window.confirm('Resign this game?')) setResigned(true);
              }}
            >
              <AppIcon name="flag" /> Resign
            </button>
          )}
          <button type="button" className={styles.btn} onClick={onRematch}>
            <AppIcon name="repeat" /> New game
          </button>
        </>
      }
    >
      {board}
    </GameShell>
  );
}

function SoloBlockDrop({ difficulty, coachMode: initialCoachMode = 'live', me, onBack, onRematch }: Props) {
  // A fresh seed per game; both boards get the same pieces.
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [end, setEnd] = useState<BlockDropEnd | null>(null);
  const [coachMode, setCoachMode] = useState<CoachMode>(initialCoachMode);
  const [oppStats, setOppStats] = useState({ score: 0, lines: 0 });
  const [coachReport, setCoachReport] = useState<BlockDropCoachReport | null>(null);
  const oppCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const name = botName(difficulty);

  const result: ResultInfo | null = end
    ? end.won
      ? { outcome: 'win', title: 'You win!', detail: `${end.score} pts · ${end.lines} lines` }
      : { outcome: 'lose', title: 'Topped out', detail: `${end.score} pts · ${end.lines} lines` }
    : null;

  return (
    <GameShell
      kind="blockdrop"
      subtitle={`Solo practice · ${DIFFICULTIES.find((d) => d.id === difficulty)?.label}`}
      onBack={() => {
        if (end || window.confirm('Leave this game? It will not be saved.')) onBack();
      }}
      backLabel="Games"
      backIcon="gamepad"
      topAction={
        <button
          type="button"
          className={`${styles.btn} ${styles.btnOnAccent}`}
          onClick={() => setCoachMode((m) => (m === 'live' ? 'off' : 'live'))}
          title="Toggle Stack Coach tips"
        >
          <AppIcon name="bookText" size={14} />{' '}
          <span>Coach: {coachMode === 'off' ? 'Off' : 'On'}</span>
        </button>
      }
      status={{ text: end ? 'Game over' : GAME_INFO.blockdrop.blurb }}
      coach={
        <BlockDropCoachCard
          mode={coachMode}
          onModeChange={setCoachMode}
          report={coachReport}
        />
      }
      below={
        <BlockDropOpponentCard
          name={name}
          bot
          canvasRef={oppCanvasRef}
          score={end ? end.oppScore : oppStats.score}
          lines={end ? end.oppLines : oppStats.lines}
          finished={Boolean(end)}
        />
      }
      result={result}
      onRematch={onRematch}
      actions={
        <button type="button" className={styles.btn} onClick={onRematch}>
          <AppIcon name="repeat" /> New game
        </button>
      }
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <BlockDropGame
          seed={seed}
          meId={me.name}
          playing
          opponent={{ kind: 'cpu', difficulty, name }}
          coachMode={coachMode}
          oppCanvasRef={oppCanvasRef}
          onOppStatsChange={setOppStats}
          onCoachReportChange={setCoachReport}
          onEnd={setEnd}
        />
      </div>
    </GameShell>
  );
}
