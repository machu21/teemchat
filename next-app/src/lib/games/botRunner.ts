// Asks the computer opponent or AI Coach for a move / analysis. Uses a Web Worker
// when available so the search never blocks the UI; falls back to running it inline.
import { chessBotMove, damaBotMove, type ChessBotMove, type Difficulty } from './bots';
import {
  analyzeChessCoach,
  analyzeDamaCoach,
  type ChessCoachReport,
  type DamaCoachReport,
} from './coach';
import type { ChessColor, ChessState } from './chess';
import type { DamaColor, DamaMove, DamaState } from './dama';

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, (result: unknown) => void>();

function getWorker(): Worker | null {
  if (workerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
      pending.get(e.data.id)?.(e.data.result);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      // Fail every waiting request over to the inline search and stop using the worker.
      workerFailed = true;
      worker?.terminate();
      worker = null;
      for (const resolve of pending.values()) resolve(undefined);
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function ask<T>(msg: Record<string, unknown>, inline: () => T): Promise<T> {
  const w = getWorker();
  if (!w) return Promise.resolve(inline());
  const id = nextId++;
  return new Promise<T>((resolve) => {
    pending.set(id, (result) => resolve(result === undefined ? inline() : (result as T)));
    w.postMessage({ ...msg, id });
  });
}

export function requestChessMove(fen: string, difficulty: Difficulty): Promise<ChessBotMove | null> {
  return ask({ kind: 'chess', fen, difficulty }, () => chessBotMove(fen, difficulty));
}

export function requestDamaMove(state: DamaState, difficulty: Difficulty): Promise<DamaMove | null> {
  return ask({ kind: 'dama', state, difficulty }, () => damaBotMove(state, difficulty));
}

export function requestChessCoach(
  state: ChessState,
  side: ChessColor,
  prevState?: ChessState | null
): Promise<ChessCoachReport> {
  return ask({ kind: 'coach_chess', state, side, prevState }, () =>
    analyzeChessCoach(state, side, prevState)
  );
}

export function requestDamaCoach(
  state: DamaState,
  side: DamaColor,
  prevState?: DamaState | null
): Promise<DamaCoachReport> {
  return ask({ kind: 'coach_dama', state, side, prevState }, () =>
    analyzeDamaCoach(state, side, prevState)
  );
}
