'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import type { AvatarConfig } from '@/lib/models/avatar';
import { ChatGameService, type GameLive } from '@/lib/services/chatGames';
import { GAME_INFO, type ChatGameRow, type GameKind } from '@/lib/games/types';
import { parseBlockDrop } from '@/lib/games/blockdrop';
import { TIME_CONTROLS, remainingMs } from '@/lib/games/clock';
import type { BoardMove, Seat } from './boardTypes';
import { GameShell, useNow, type PlayerInfo, type ResultInfo, type StatusInfo } from './GameShell';
import { TicTacToeBoard } from './TicTacToeBoard';
import { ChessBoard, ChessCaptured, MoveList, chessStatus } from './ChessBoard';
import { DamaBoard, DamaCaptured, damaLost, damaStatus } from './DamaBoard';
import { BlockDropGame, type BlockDropEnd, type BlockDropEvents } from './BlockDropGame';

interface Props {
  gameId: string;
  meId: string;
  nameOf: (userId: string) => string;
  avatarOf?: (userId: string) => AvatarConfig | null | undefined;
  onClose: () => void;
  onRematch: (kind: GameKind, timeControl: { baseMs: number; incMs: number }) => void;
  /** Called whenever the row changes, so the chat's invite card stays current. */
  onRowChange?: (row: ChatGameRow) => void;
}

type Side = Exclude<Seat, null>;

function timeControlLabel(row: ChatGameRow): string {
  if (!row.timeBaseMs) return '';
  const known = TIME_CONTROLS.find((t) => t.baseMs === row.timeBaseMs && t.incMs === row.timeIncMs);
  return known ? known.label : `${Math.round(row.timeBaseMs / 60000)} min`;
}

export function GameOverlay({ gameId, meId, nameOf, avatarOf, onClose, onRematch, onRowChange }: Props) {
  const [row, setRow] = useState<ChatGameRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState<GameLive | null>(null);
  /** Local clock minus server clock, so countdowns match the server. */
  const [skew, setSkew] = useState(0);
  const eventsRef = useRef<BlockDropEvents>({});
  const onRowChangeRef = useRef(onRowChange);
  useEffect(() => {
    onRowChangeRef.current = onRowChange;
  });

  const applyRow = useCallback((next: ChatGameRow | null) => {
    if (!next) return;
    setRow((prev) => (prev && prev.id === next.id && prev.version > next.version ? prev : next));
    onRowChangeRef.current?.(next);
  }, []);

  const reload = useCallback(async () => {
    applyRow(await ChatGameService.load(gameId));
  }, [gameId, applyRow]);

  useEffect(() => {
    let alive = true;
    ChatGameService.load(gameId).then((r) => {
      if (!alive) return;
      setLoading(false);
      applyRow(r);
    });
    ChatGameService.measureClockSkew().then((s) => {
      if (alive) setSkew(s);
    });
    const clientId = `${meId}_${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`;
    const conn = ChatGameService.connect(gameId, meId, clientId, {
      onMoved: () => {
        ChatGameService.load(gameId).then((r) => {
          if (alive) applyRow(r);
        });
      },
      onBoard: (...a) => eventsRef.current.onBoard?.(...a),
      onGarbage: (...a) => eventsRef.current.onGarbage?.(...a),
    });
    setLive(conn);
    return () => {
      alive = false;
      conn.dispose();
      setLive(null);
    };
  }, [gameId, meId, applyRow]);

  const subscribe = useCallback((ev: BlockDropEvents) => {
    eventsRef.current = ev;
    return () => {
      if (eventsRef.current === ev) eventsRef.current = {};
    };
  }, []);

  const run = useCallback(
    async (fn: () => Promise<ChatGameRow | null>, staleMessage = 'Your opponent moved first. Board updated.') => {
      setBusy(true);
      setNotice(null);
      try {
        const next = await fn();
        if (next) {
          applyRow(next);
          live?.sendMoved(next.version);
        } else {
          setNotice(staleMessage);
          await reload();
        }
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Something went wrong.');
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [applyRow, live, reload]
  );

  // ---- Clocks -------------------------------------------------------------
  const timed = Boolean(row && row.timeBaseMs > 0 && row.game !== 'blockdrop');
  const startedAt = row?.turnStartedAt ? Date.parse(row.turnStartedAt) : null;
  const clockRunning = Boolean(timed && row?.status === 'active' && startedAt !== null);
  const now = useNow(clockRunning);
  const serverNow = now - skew;
  const turnSide: Side | null = row?.currentTurn ? (row.currentTurn === row.playerOne ? 'one' : 'two') : null;
  const clockOf = (side: Side) => {
    if (!row || !timed) return undefined;
    const base = (side === 'one' ? row.clockOneMs : row.clockTwoMs) ?? row.timeBaseMs;
    return remainingMs(base, clockRunning && turnSide === side, startedAt, serverNow);
  };
  const flagged = Boolean(clockRunning && turnSide && (clockOf(turnSide) ?? 1) <= 0);
  const isPlayer = Boolean(row && (row.playerOne === meId || row.playerTwo === meId));

  // When the side to move runs out, either player's client ends the game.
  const claimRef = useRef(0);
  useEffect(() => {
    if (!flagged || !isPlayer || !row) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const attempt = async () => {
      if (Date.now() - claimRef.current < 1500) return;
      claimRef.current = Date.now();
      const r = await ChatGameService.claimTimeout(row.id);
      if (!alive) return;
      if (r && r.status !== 'active') {
        applyRow(r);
        live?.sendMoved(r.version);
      } else {
        // Clocks can disagree by a moment; try again shortly.
        timer = setTimeout(attempt, 1600);
      }
    };
    attempt();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [flagged, isPlayer, row, applyRow, live]);

  if (loading || !row) {
    return (
      <GameShell
        kind="chess"
        subtitle={loading ? 'Loading game' : 'Unavailable'}
        onBack={onClose}
        status={loading ? { text: 'Loading', thinking: true } : { text: 'This game is unavailable.', tone: 'alert' }}
      />
    );
  }

  const info = GAME_INFO[row.game];
  const seat: Seat = row.playerOne === meId ? 'one' : row.playerTwo === meId ? 'two' : null;
  const opponentId = seat === 'one' ? row.playerTwo : seat === 'two' ? row.playerOne : null;
  const seatId = (s: Side) => (s === 'one' ? row.playerOne : row.playerTwo);
  const isActive = row.status === 'active';
  const canMove = isActive && !busy && !flagged && seat !== null && row.currentTurn === meId;
  const tcLabel = timeControlLabel(row);

  const submitBoardMove = (move: BoardMove) => {
    if (!seat || !opponentId) return;
    const winner = move.winner ? seatId(move.winner) : null;
    // Show the move straight away; the server row replaces it. Our clock stops while it saves.
    setRow({
      ...row,
      state: move.state,
      currentTurn: move.finished ? null : opponentId,
      status: move.finished ? 'finished' : 'active',
      winner,
      turnStartedAt: null,
    });
    run(() =>
      ChatGameService.submitMove({
        gameId: row.id,
        expectedVersion: row.version,
        state: move.state,
        nextTurn: move.finished ? null : opponentId,
        finished: move.finished,
        winner,
      })
    );
  };

  const onBlockDropEnd = (end: BlockDropEnd) => {
    if (!seat || !opponentId || row.status !== 'active' || end.won) return;
    const prev = parseBlockDrop(row.state);
    const state = {
      seed: prev.seed,
      scores: {
        [meId]: { score: end.score, lines: end.lines, over: true },
        [opponentId]: { score: end.oppScore, lines: end.oppLines, over: false },
      },
    };
    run(() =>
      ChatGameService.submitMove({ gameId: row.id, expectedVersion: row.version, state, nextTurn: null, finished: true, winner: opponentId })
    );
  };

  // ---- Players ------------------------------------------------------------
  const sideLabel = (s: Side) =>
    row.game === 'chess' ? (s === 'one' ? 'White' : 'Black') : row.game === 'dama' ? (s === 'one' ? 'White pieces' : 'Black pieces') : row.game === 'tictactoe' ? (s === 'one' ? 'Plays X' : 'Plays O') : '';
  const extra = (s: Side) =>
    row.game === 'chess' ? (
      <ChessCaptured state={row.state} color={s === 'one' ? 'w' : 'b'} />
    ) : row.game === 'dama' ? (
      <DamaCaptured count={damaLost(row.state, s === 'one' ? 'b' : 'w')} color={s === 'one' ? 'b' : 'w'} />
    ) : null;
  const player = (s: Side): PlayerInfo | undefined => {
    const id = seatId(s);
    if (!id) return undefined;
    return {
      name: id === meId ? `${nameOf(id)} (you)` : nameOf(id),
      avatar: avatarOf?.(id) ?? null,
      side: row.game === 'chess' || row.game === 'dama' ? (s === 'one' ? 'light' : 'dark') : null,
      sideLabel: sideLabel(s),
      active: isActive && row.currentTurn === id,
      clockMs: clockOf(s),
      clockRunning: clockRunning && turnSide === s,
      extra: extra(s),
    };
  };
  const bottomSide: Side = seat === 'two' ? 'two' : 'one';
  const topSide: Side = bottomSide === 'one' ? 'two' : 'one';
  const showPlayers = row.game !== 'blockdrop' && row.playerTwo !== null;

  // ---- Status and result ----------------------------------------------------
  const p2 = row.playerTwo ? nameOf(row.playerTwo) : null;
  const status: StatusInfo | null = (() => {
    switch (row.status) {
      case 'invited':
        return seat === 'one'
          ? { text: `Waiting for ${p2 ?? 'someone'} to accept`, thinking: true }
          : { text: `${nameOf(row.playerOne)} challenged ${p2 ?? 'the chat'}`, tone: 'mine' };
      case 'declined':
        return { text: 'Invite declined.', tone: 'alert' };
      case 'abandoned':
        return { text: 'Invite cancelled.', tone: 'alert' };
      case 'finished':
        return null;
      case 'active': {
        if (info.realtime) return seat ? null : { text: 'Watching live' };
        if (flagged) return { text: 'Time is up', tone: 'alert' };
        const check = row.game === 'chess' ? chessStatus(row.state) : null;
        if (row.currentTurn === meId) return { text: check ? `${check}! Your move` : 'Your move', tone: 'mine' };
        return { text: `${row.currentTurn ? nameOf(row.currentTurn) : 'Opponent'} is thinking`, thinking: true };
      }
    }
  })();

  const result: ResultInfo | null = (() => {
    if (row.status !== 'finished') return null;
    const detail =
      row.result === 'resign'
        ? 'Resigned'
        : row.result === 'timeout'
          ? 'Out of time'
          : row.game === 'chess'
            ? chessStatus(row.state) ?? undefined
            : row.game === 'dama'
              ? damaStatus(row.state) ?? undefined
              : row.game === 'blockdrop'
                ? (() => {
                  const sc = parseBlockDrop(row.state).scores;
                  return [row.playerOne, row.playerTwo]
                    .filter((id): id is string => Boolean(id))
                    .map((id) => `${id === meId ? 'You' : nameOf(id)} ${sc[id]?.score ?? 0}`)
                    .join(' · ');
                })()
                : undefined;
    if (!row.winner) return { outcome: 'draw', title: 'Draw', detail };
    if (row.winner === meId) return { outcome: 'win', title: 'You win!', detail };
    if (seat) return { outcome: 'lose', title: `${nameOf(row.winner)} wins`, detail };
    return { outcome: 'draw', title: `${nameOf(row.winner)} wins`, detail };
  })();

  const canAccept = row.status === 'invited' && seat !== 'one' && (row.playerTwo === null || row.playerTwo === meId);

  // ---- Board (Multiplayer has NO AI Coach / engine assistance for fair play) ----
  const board = (() => {
    if (row.status === 'invited' || row.status === 'declined' || row.status === 'abandoned') {
      return (
        <div className={styles.panel} style={{ width: '100%', textAlign: 'center', padding: 18 }}>
          <AppIcon name={info.icon} size={40} />
          <div style={{ fontWeight: 800, marginTop: 6 }}>{info.title}</div>
          <div className={styles.panelLabel} style={{ marginTop: 4 }}>
            {info.blurb}
            {tcLabel ? ` · ${tcLabel}` : ''}
          </div>
        </div>
      );
    }
    const props = { state: row.state, seat, canMove, onMove: submitBoardMove };
    switch (row.game) {
      case 'tictactoe':
        return <TicTacToeBoard {...props} />;
      case 'chess':
        return <ChessBoard {...props} />;
      case 'dama':
        return <DamaBoard {...props} />;
      case 'blockdrop': {
        const watch = [row.playerOne, row.playerTwo].filter((id): id is string => Boolean(id)).map((id) => ({ id, name: nameOf(id) }));
        return (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <BlockDropGame
              seed={parseBlockDrop(row.state).seed}
              meId={meId}
              playing={isActive && seat !== null}
              opponent={{ kind: 'remote', id: opponentId, name: opponentId ? nameOf(opponentId) : 'Opponent', live, subscribe }}
              watch={watch}
              coachMode="off"
              onEnd={onBlockDropEnd}
            />
          </div>
        );
      }
    }
  })();

  const subtitle = [
    seat ? `vs ${opponentId ? nameOf(opponentId) : p2 ?? 'the chat'}` : 'Spectating',
    tcLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <GameShell
      kind={row.game}
      subtitle={subtitle}
      onBack={onClose}
      top={showPlayers ? player(topSide) : undefined}
      bottom={showPlayers ? player(bottomSide) : undefined}
      status={status}
      notice={notice}
      below={row.game === 'chess' && row.status !== 'invited' ? <MoveList state={row.state} /> : undefined}
      result={result}
      onRematch={seat ? () => onRematch(row.game, { baseMs: row.timeBaseMs, incMs: row.timeIncMs }) : undefined}
      rematchLabel="Rematch"
      actions={
        <>
          {canAccept && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => run(() => ChatGameService.accept(row.id))}>
              <AppIcon name="check" /> Accept
            </button>
          )}
          {row.status === 'invited' && (seat === 'one' || row.playerTwo === meId) && (
            <button type="button" className={styles.btn} disabled={busy} onClick={() => run(() => ChatGameService.decline(row.id))}>
              {seat === 'one' ? 'Cancel invite' : 'Decline'}
            </button>
          )}
          {isActive && seat && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              disabled={busy}
              onClick={() => {
                if (window.confirm('Resign this game?')) run(() => ChatGameService.resign(row.id));
              }}
            >
              <AppIcon name="flag" /> Resign
            </button>
          )}
          {(row.status === 'declined' || row.status === 'abandoned') && seat && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => onRematch(row.game, { baseMs: row.timeBaseMs, incMs: row.timeIncMs })}>
              <AppIcon name="repeat" /> Invite again
            </button>
          )}
        </>
      }
    >
      {board}
    </GameShell>
  );
}
