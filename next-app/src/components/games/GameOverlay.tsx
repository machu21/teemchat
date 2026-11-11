'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ChatGames.module.css';
import { AppIcon } from '@/components/icons/AppIcon';
import { ChatGameService, type GameLive } from '@/lib/services/chatGames';
import { GAME_INFO, type ChatGameRow, type GameKind } from '@/lib/games/types';
import { parseBlockDrop } from '@/lib/games/blockdrop';
import type { BoardMove, Seat } from './boardTypes';
import { TicTacToeBoard } from './TicTacToeBoard';
import { ChessBoard, chessStatus } from './ChessBoard';
import { DamaBoard, damaStatus } from './DamaBoard';
import { BlockDropGame, type BlockDropEvents } from './BlockDropGame';

interface Props {
  gameId: string;
  meId: string;
  nameOf: (userId: string) => string;
  onClose: () => void;
  onRematch: (kind: GameKind) => void;
  /** Called whenever the row changes, so the chat's invite card stays current. */
  onRowChange?: (row: ChatGameRow) => void;
}

export function GameOverlay({ gameId, meId, nameOf, onClose, onRematch, onRowChange }: Props) {
  const [row, setRow] = useState<ChatGameRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState<GameLive | null>(null);
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

  const run = async (fn: () => Promise<ChatGameRow | null>) => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await fn();
      if (next) {
        applyRow(next);
        live?.sendMoved(next.version);
      } else {
        setNotice('Your opponent moved first. Board updated.');
        await reload();
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Something went wrong.');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.overlay}>
        <Header title="Loading game..." onClose={onClose} />
      </div>
    );
  }
  if (!row) {
    return (
      <div className={styles.overlay}>
        <Header title="Game" onClose={onClose} />
        <div className={`${styles.status} ${styles.statusError}`}>This game is unavailable.</div>
      </div>
    );
  }

  const info = GAME_INFO[row.game];
  const seat: Seat = row.playerOne === meId ? 'one' : row.playerTwo === meId ? 'two' : null;
  const opponentId = seat === 'one' ? row.playerTwo : seat === 'two' ? row.playerOne : null;
  const seatId = (s: Exclude<Seat, null>) => (s === 'one' ? row.playerOne : row.playerTwo);
  const isActive = row.status === 'active';
  const canMove = isActive && !busy && seat !== null && row.currentTurn === meId;

  const submitBoardMove = (move: BoardMove) => {
    if (!seat || !opponentId) return;
    const winner = move.winner ? seatId(move.winner) : null;
    // Show the move straight away; the server row replaces it.
    setRow({
      ...row,
      state: move.state,
      currentTurn: move.finished ? null : opponentId,
      status: move.finished ? 'finished' : 'active',
      winner,
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

  const onTopOut = (score: number, lines: number, oppScore: number, oppLines: number) => {
    if (!seat || !opponentId || row.status !== 'active') return;
    const prev = parseBlockDrop(row.state);
    const state = {
      seed: prev.seed,
      scores: {
        [meId]: { score, lines, over: true },
        [opponentId]: { score: oppScore, lines: oppLines, over: false },
      },
    };
    run(() =>
      ChatGameService.submitMove({
        gameId: row.id,
        expectedVersion: row.version,
        state,
        nextTurn: null,
        finished: true,
        winner: opponentId,
      })
    );
  };

  const statusText = (() => {
    const p1 = nameOf(row.playerOne);
    const p2 = row.playerTwo ? nameOf(row.playerTwo) : null;
    switch (row.status) {
      case 'invited':
        if (seat === 'one') return `Waiting for ${p2 ?? 'someone'} to accept...`;
        return `${p1} challenged ${p2 ?? 'the chat'}.`;
      case 'declined':
        return 'Invite declined.';
      case 'abandoned':
        return 'Invite cancelled.';
      case 'finished': {
        const extra = row.game === 'chess' ? chessStatus(row.state) : row.game === 'dama' ? damaStatus(row.state) : null;
        const prefix = row.result === 'resign' ? 'Resigned. ' : extra ? `${extra}. ` : '';
        if (!row.winner) return `${prefix}It's a draw.`;
        return `${prefix}${row.winner === meId ? 'You won!' : `${nameOf(row.winner)} won.`}`;
      }
      case 'active': {
        if (info.realtime) return seat ? 'Clear lines to send garbage. Last one standing wins.' : 'Watching live.';
        const check = row.game === 'chess' ? chessStatus(row.state) : null;
        const turn = row.currentTurn === meId ? 'Your turn' : `${row.currentTurn ? nameOf(row.currentTurn) : '...'}'s turn`;
        return check ? `${check}. ${turn}` : turn;
      }
    }
  })();

  const canAccept = row.status === 'invited' && seat !== 'one' && (row.playerTwo === null || row.playerTwo === meId);
  const swatch = (s: Exclude<Seat, null>) =>
    row.game === 'blockdrop' ? null : (
      <span className={`${styles.swatch} ${s === 'one' ? styles.swatchLight : styles.swatchDark}`} aria-hidden />
    );

  const board = (() => {
    if (row.status === 'invited' || row.status === 'declined' || row.status === 'abandoned') return null;
    const props = { state: row.state, seat, canMove, onMove: submitBoardMove };
    switch (row.game) {
      case 'tictactoe':
        return <TicTacToeBoard {...props} />;
      case 'chess':
        return <ChessBoard {...props} />;
      case 'dama':
        return <DamaBoard {...props} />;
      case 'blockdrop': {
        if (row.status === 'finished') {
          const scores = parseBlockDrop(row.state).scores;
          return (
            <div className={styles.dropSide}>
              {[row.playerOne, row.playerTwo].filter((id): id is string => Boolean(id)).map((id) => (
                <div key={id} className={styles.stat}>
                  {nameOf(id)} <strong>{scores[id]?.score ?? 0} pts · {scores[id]?.lines ?? 0} lines</strong>
                </div>
              ))}
            </div>
          );
        }
        const watchIds = seat
          ? opponentId ? [opponentId] : []
          : [row.playerOne, row.playerTwo].filter((id): id is string => Boolean(id));
        return (
          <BlockDropGame
            seed={parseBlockDrop(row.state).seed}
            meId={meId}
            playing={isActive && seat !== null}
            watchIds={watchIds}
            nameOf={nameOf}
            live={live}
            subscribe={subscribe}
            opponentId={opponentId}
            onTopOut={onTopOut}
          />
        );
      }
    }
  })();

  return (
    <div className={styles.overlay}>
      <Header title={info.title} icon={info.icon} onClose={onClose} />

      {row.playerTwo && (
        <div className={styles.players}>
          {(['one', 'two'] as const).map((s) => {
            const id = seatId(s)!;
            return (
              <div key={s} className={`${styles.playerChip} ${isActive && row.currentTurn === id ? styles.playerChipActive : ''}`}>
                {swatch(s)}
                <span>{id === meId ? 'You' : nameOf(id)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.status} role="status" aria-live="polite">{statusText}</div>
      {notice && <div className={`${styles.status} ${styles.statusError}`} role="alert">{notice}</div>}

      {board && <div className={styles.boardWrap}>{board}</div>}

      <div className={styles.actions}>
        {canAccept && (
          <button type="button" className={`${styles.smallBtn} ${styles.primaryBtn}`} disabled={busy} onClick={() => run(() => ChatGameService.accept(row.id))}>
            <AppIcon name="check" /> Accept
          </button>
        )}
        {row.status === 'invited' && (seat === 'one' || row.playerTwo === meId) && (
          <button type="button" className={styles.smallBtn} disabled={busy} onClick={() => run(() => ChatGameService.decline(row.id))}>
            {seat === 'one' ? 'Cancel invite' : 'Decline'}
          </button>
        )}
        {isActive && seat && (
          <button
            type="button"
            className={`${styles.smallBtn} ${styles.dangerBtn}`}
            disabled={busy}
            onClick={() => {
              if (window.confirm('Resign this game?')) run(() => ChatGameService.resign(row.id));
            }}
          >
            <AppIcon name="flag" /> Resign
          </button>
        )}
        {row.status !== 'active' && row.status !== 'invited' && seat && (
          <button type="button" className={`${styles.smallBtn} ${styles.primaryBtn}`} disabled={busy} onClick={() => onRematch(row.game)}>
            <AppIcon name="repeat" /> {row.status === 'finished' ? 'Rematch' : 'Invite again'}
          </button>
        )}
      </div>
    </div>
  );
}

function Header({ title, icon, onClose }: { title: string; icon?: React.ComponentProps<typeof AppIcon>['name']; onClose: () => void }) {
  return (
    <div className={styles.overlayHeader}>
      <span className={styles.overlayTitle}>
        {icon && <AppIcon name={icon} />} {title}
      </span>
      <button type="button" className={styles.smallBtn} onClick={onClose}>
        <AppIcon name="message" /> Back to chat
      </button>
    </div>
  );
}
