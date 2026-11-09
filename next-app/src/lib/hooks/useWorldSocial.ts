'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldGame } from '@/game/WorldGame';
import type { WorldSyncService } from '@/lib/services/worldSync';
import { DashboardPresenceService } from '@/lib/services/dashboardPresence';
import { supabase } from '@/lib/supabase';
import {
  AUTO_AWAY_MS,
  EmoteId,
  PlayerStatus,
  isDoNotDisturb,
} from '@/lib/world/emotes';
import {
  FocusTimerState,
  adjustForSkew,
  advance,
  pauseTimer,
  resumeTimer,
  skipPhase,
  startTimer,
} from '@/lib/world/focusTimer';
import { playFocusPhaseSound } from '@/lib/utils/callSounds';
import {
  KNOCK_PASS_MS,
  RoomDefinition,
  RoomEvent,
  rectContains,
  roomsForMap,
} from '@/lib/world/rooms';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOCK_TTL_MS = 20_000;
/** How close (px) you must be to a locked room to see the Knock prompt. */
const KNOCK_REACH = 48;

export interface PendingKnock {
  roomId: string;
  actorId: string;
  actorName: string;
  at: number;
}

type Toast = (icon: string, message: string, color: string) => void;

interface Options {
  syncService: WorldSyncService | null;
  userId: string | null | undefined;
  mapTheme: string | null | undefined;
  onToast: Toast;
}

/**
 * Emotes, raise hand, sit, status (incl. auto-away) and private rooms (membership,
 * locks, knocking) for the space page. Exposes refs so non-React callbacks
 * (LiveKit isAudible, chat handlers) read the latest values without re-subscribing.
 */
export function useWorldSocial({ syncService, userId, mapTheme, onToast }: Options) {
  const gameRef = useRef<WorldGame | null>(null);
  const [handRaised, setHandRaisedState] = useState(false);
  const [sitting, setSittingState] = useState(false);
  const [status, setStatusState] = useState<PlayerStatus>('available');
  const statusRef = useRef<PlayerStatus>('available');
  const autoAwayRef = useRef(false);
  const [room, setRoom] = useState<RoomDefinition | null>(null);
  const [roomCount, setRoomCount] = useState(0);
  const [lockedRooms, setLockedRooms] = useState<Set<string>>(() => new Set());
  const lockedRef = useRef<Set<string>>(new Set());
  const [knocks, setKnocks] = useState<PendingKnock[]>([]);
  const [knockTarget, setKnockTarget] = useState<RoomDefinition | null>(null);
  const [emoteMenuOpen, setEmoteMenuOpen] = useState(false);
  const toastRef = useRef(onToast);

  // Focus timers per room (ephemeral) and who is taking notes per room.
  const timersRef = useRef<Map<string, FocusTimerState>>(new Map());
  const [timer, setTimerState] = useState<FocusTimerState | null>(null);
  const [autoFocusStatus, setAutoFocusStatus] = useState(false);
  const autoFocusRef = useRef(false);
  const notesRef = useRef<Map<string, string>>(new Map()); // roomId -> note taker name
  const [roomNotesBy, setRoomNotesBy] = useState<string | null>(null);
  const takingNotesRef = useRef<string | null>(null); // roomId I take notes in

  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);

  const applyLocks = useCallback((next: Set<string>) => {
    lockedRef.current = next;
    setLockedRooms(next);
    if (gameRef.current) gameRef.current.lockedRoomIds = next;
  }, []);

  // ── Game handle ──
  const onGameReady = useCallback((game: WorldGame | null) => {
    gameRef.current = game;
    if (!game) return;
    game.lockedRoomIds = lockedRef.current;
    // Re-apply persistent state after a map change re-creates the game.
    const extras = syncService?.getPresenceExtras();
    if (extras) {
      game.player.overlay = { ...game.player.overlay, handRaised: extras.handRaised, status: extras.status };
    }
  }, [syncService]);

  const onRoomChanged = useCallback((next: RoomDefinition | null) => {
    setRoom(next);
    setTimerState(next ? timersRef.current.get(next.id) ?? null : null);
    setRoomNotesBy(next ? notesRef.current.get(next.id) ?? null : null);
  }, []);

  const onSitChanged = useCallback((next: boolean) => {
    setSittingState(next);
  }, []);

  // ── Emotes / hand / sit ──
  const playEmote = useCallback((emote: EmoteId) => {
    const ok = gameRef.current?.playEmote(emote) ?? false;
    setEmoteMenuOpen(false);
    return ok;
  }, []);

  const toggleHand = useCallback(() => {
    setHandRaisedState((prev) => {
      const next = !prev;
      gameRef.current?.setHandRaised(next);
      if (!gameRef.current) syncService?.updatePresenceState({ handRaised: next });
      return next;
    });
  }, [syncService]);

  const toggleSit = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.setSitting(!game.player.isSitting);
  }, []);

  const onSocialAction = useCallback(
    (action: 'emotes' | 'raiseHand' | 'sit') => {
      if (action === 'emotes') setEmoteMenuOpen((open) => !open);
      else if (action === 'raiseHand') toggleHand();
      else toggleSit();
    },
    [toggleHand, toggleSit]
  );

  // ── Status ──
  const setStatus = useCallback(
    (next: PlayerStatus, opts: { auto?: boolean } = {}) => {
      autoAwayRef.current = Boolean(opts.auto);
      statusRef.current = next;
      setStatusState(next);
      gameRef.current?.setStatus(next);
      if (!gameRef.current) syncService?.updatePresenceState({ status: next });
      DashboardPresenceService.updatePresence({ status: next });
      if (userId && UUID_REGEX.test(userId)) {
        supabase
          .from('profiles')
          .update({ status: next })
          .eq('id', userId)
          .then(() => undefined);
      }
    },
    [syncService, userId]
  );

  const setStatusRef = useRef(setStatus);
  useEffect(() => {
    setStatusRef.current = setStatus;
  }, [setStatus]);

  // Auto-away after 10 idle minutes; any input brings you back.
  useEffect(() => {
    let last = Date.now();
    const onInput = () => {
      last = Date.now();
      if (autoAwayRef.current && statusRef.current === 'away') setStatus('available');
    };
    const timer = setInterval(() => {
      if (statusRef.current === 'available' && Date.now() - last > AUTO_AWAY_MS) {
        setStatus('away', { auto: true });
      }
    }, 30_000);
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, onInput, { passive: true }));
    return () => {
      clearInterval(timer);
      events.forEach((ev) => window.removeEventListener(ev, onInput));
    };
  }, [setStatus]);

  // ── Focus timer + notes bookkeeping ──
  const syncMyRoomView = useCallback(() => {
    const mine = gameRef.current?.myRoomId() ?? null;
    setTimerState(mine ? timersRef.current.get(mine) ?? null : null);
    setRoomNotesBy(mine ? notesRef.current.get(mine) ?? null : null);
  }, []);

  const storeTimer = useCallback(
    (roomId: string, t: FocusTimerState | null) => {
      if (t) timersRef.current.set(roomId, t);
      else timersRef.current.delete(roomId);
      syncMyRoomView();
    },
    [syncMyRoomView]
  );

  const storeNotes = useCallback(
    (roomId: string, by: string | null) => {
      if (by) notesRef.current.set(roomId, by);
      else notesRef.current.delete(roomId);
      syncMyRoomView();
    },
    [syncMyRoomView]
  );

  // ── Rooms: lock state, knocks, late-joiner sync ──
  useEffect(() => {
    if (!syncService) return;

    const onRoomEvent = (event: RoomEvent) => {
      const game = gameRef.current;
      switch (event.type) {
        case 'room_lock':
        case 'room_state': {
          const next = new Set(lockedRef.current);
          if (event.locked) next.add(event.roomId);
          else next.delete(event.roomId);
          applyLocks(next);
          if (event.type === 'room_state') {
            if (event.timer !== undefined) {
              storeTimer(event.roomId, event.timer ? adjustForSkew(event.timer, event.sentAt ?? Date.now(), Date.now()) : null);
            }
            if (event.notesOn !== undefined) storeNotes(event.roomId, event.notesOn ? 'Someone' : null);
          }
          break;
        }
        case 'focus_timer':
          storeTimer(event.roomId, event.timer ? adjustForSkew(event.timer, event.sentAt, Date.now()) : null);
          break;
        case 'notes_state':
          storeNotes(event.roomId, event.on ? event.actorName : null);
          break;
        case 'knock':
          if (!game || game.myRoomId() !== event.roomId) return;
          setKnocks((prev) =>
            prev.some((k) => k.actorId === event.actorId && k.roomId === event.roomId)
              ? prev
              : [...prev, { roomId: event.roomId, actorId: event.actorId, actorName: event.actorName, at: Date.now() }]
          );
          break;
        case 'knock_reply':
          if (event.allow) {
            game?.grantRoomPass(event.roomId, KNOCK_PASS_MS);
            toastRef.current('🚪', 'You were let in. Walk on in!', '#22C55E');
          } else {
            toastRef.current('🚪', 'Not right now. Try again later.', '#EF4444');
          }
          break;
      }
    };

    // Tell newcomers about our room's lock, focus timer and note taking.
    const onPeerJoined = (peerId: string) => {
      const mine = gameRef.current?.myRoomId();
      if (!mine) return;
      const locked = lockedRef.current.has(mine);
      const t = timersRef.current.get(mine) ?? null;
      const notesOn = takingNotesRef.current === mine || notesRef.current.has(mine);
      if (locked || t || notesOn) {
        syncService.broadcastRoomEvent('room_state', { roomId: mine, locked, targetId: peerId, timer: t, notesOn });
      }
    };

    return syncService.setRoomHandlers({ onRoomEvent, onPeerJoined });
  }, [syncService, applyLocks, storeTimer, storeNotes]);

  // Poll (2x/s): headcount, abandoned locks, knock prompt, expired knocks.
  useEffect(() => {
    const timer = setInterval(() => {
      const game = gameRef.current;
      if (!game) return;
      const mine = game.myRoomId();
      setRoomCount(mine ? game.occupantsOf(mine).length + 1 : 0);

      // A locked room nobody is in any more unlocks itself.
      if (lockedRef.current.size > 0) {
        let changed = false;
        const next = new Set(lockedRef.current);
        for (const id of lockedRef.current) {
          if (id !== mine && game.occupantsOf(id).length === 0) {
            next.delete(id);
            changed = true;
          }
        }
        if (changed) applyLocks(next);
      }

      // Focus timers: roll over finished phases; chime + optional status for my room.
      const now = Date.now();
      for (const [rid, t] of timersRef.current) {
        const next = advance(t, now);
        if (next === t) continue;
        timersRef.current.set(rid, next);
        if (rid === mine) {
          setTimerState(next);
          playFocusPhaseSound(next.phase);
          if (autoFocusRef.current) setStatusRef.current(next.phase === 'focus' ? 'focus' : 'available');
        }
      }

      // Knock prompt when standing next to a locked room from outside.
      let target: RoomDefinition | null = null;
      if (!mine && lockedRef.current.size > 0) {
        const pos = game.getPlayerPosition();
        const cx = pos.x + 16;
        const cy = pos.y + 20;
        for (const r of roomsForMap(mapTheme)) {
          if (!lockedRef.current.has(r.id)) continue;
          const grown = { x: r.rect.x - KNOCK_REACH, y: r.rect.y - KNOCK_REACH, w: r.rect.w + KNOCK_REACH * 2, h: r.rect.h + KNOCK_REACH * 2 };
          if (rectContains(grown, cx, cy)) {
            target = r;
            break;
          }
        }
      }
      setKnockTarget((prev) => (prev?.id === target?.id ? prev : target));

      setKnocks((prev) => {
        const fresh = prev.filter((k) => Date.now() - k.at < KNOCK_TTL_MS && k.roomId === mine);
        return fresh.length === prev.length ? prev : fresh;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [mapTheme, applyLocks]);

  /** Starts / pauses / resumes / skips / stops the focus timer of my room for everyone in it. */
  const timerAction = useCallback(
    (action: 'start' | 'pause' | 'resume' | 'skip' | 'stop', preset?: { focusMin: number; breakMin: number }) => {
      const mine = gameRef.current?.myRoomId();
      if (!mine) return;
      const now = Date.now();
      const cur = timersRef.current.get(mine) ?? null;
      let next: FocusTimerState | null = cur;
      if (action === 'start') next = startTimer(mine, preset?.focusMin ?? 25, preset?.breakMin ?? 5, now);
      else if (action === 'stop') next = null;
      else if (!cur) return;
      else if (action === 'pause') next = pauseTimer(cur, now);
      else if (action === 'resume') next = resumeTimer(cur, now);
      else next = skipPhase(cur, now);
      storeTimer(mine, next);
      syncService?.broadcastRoomEvent('focus_timer', { roomId: mine, timer: next });
      if (autoFocusRef.current) {
        if (next?.running && next.phase === 'focus') setStatus('focus');
        else if (!next) setStatus('available');
      }
    },
    [syncService, storeTimer, setStatus]
  );

  const toggleAutoFocus = useCallback(() => {
    setAutoFocusStatus((prev) => {
      autoFocusRef.current = !prev;
      return !prev;
    });
  }, []);

  /** Announces that I started / stopped taking notes in my room (everyone sees a badge). */
  const setTakingNotes = useCallback(
    (on: boolean) => {
      const mine = gameRef.current?.myRoomId();
      const roomId = on ? mine : takingNotesRef.current;
      if (!roomId) return;
      takingNotesRef.current = on ? roomId : null;
      syncService?.broadcastRoomEvent('notes_state', { roomId, on });
    },
    [syncService]
  );

  const toggleLock = useCallback(() => {
    const mine = gameRef.current?.myRoomId();
    if (!mine) return;
    const locked = !lockedRef.current.has(mine);
    const next = new Set(lockedRef.current);
    if (locked) next.add(mine);
    else next.delete(mine);
    applyLocks(next);
    syncService?.broadcastRoomEvent('room_lock', { roomId: mine, locked });
  }, [syncService, applyLocks]);

  const knock = useCallback(() => {
    if (!knockTarget) return;
    const sent = syncService?.broadcastRoomEvent('knock', { roomId: knockTarget.id });
    toastRef.current('✊', sent ? `Knocked on ${knockTarget.name}…` : 'Wait a moment before knocking again.', '#3B82F6');
  }, [syncService, knockTarget]);

  const answerKnock = useCallback(
    (k: PendingKnock, allow: boolean) => {
      syncService?.broadcastRoomEvent('knock_reply', { roomId: k.roomId, targetId: k.actorId, allow });
      setKnocks((prev) => prev.filter((x) => x !== k));
    },
    [syncService]
  );

  return {
    // refs for non-React callbacks
    gameRef,
    statusRef,
    // canvas wiring
    onGameReady,
    onRoomChanged,
    onSitChanged,
    onSocialAction,
    // emotes
    emoteMenuOpen,
    setEmoteMenuOpen,
    playEmote,
    handRaised,
    toggleHand,
    sitting,
    toggleSit,
    // status
    status,
    setStatus,
    doNotDisturb: isDoNotDisturb(status),
    // rooms
    room,
    roomCount,
    roomLocked: room ? lockedRooms.has(room.id) : false,
    toggleLock,
    knockTarget,
    knock,
    knocks,
    answerKnock,
    // focus timer
    timer,
    timerAction,
    autoFocusStatus,
    toggleAutoFocus,
    // meeting notes (someone else's notes badge; my own flag lives in the page)
    roomNotesBy,
    setTakingNotes,
  };
}

export type WorldSocial = ReturnType<typeof useWorldSocial>;
