'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCompanionChat } from './useCompanionChat';
import { CompanionBrain, isLateNight } from '@/lib/companion/brain';
import { CompanionEventType } from '@/lib/companion/lines';
import { CompanionActionHandlers, ZoneTarget, runCompanionActions } from '@/lib/companion/actions';
import { TOUR_DONE_LINE, TourController, TourEvent } from '@/lib/companion/tour';
import { useSocialStore } from '@/stores/social';
import type { WorldSyncService } from '@/lib/services/worldSync';
import type { CompanionEmote, CompanionMood, CompanionReply, WorldContext } from '@/lib/companion/types';

export type CompanionCue = { text: string; emote?: CompanionEmote; mood?: CompanionMood; seq: number };
export type CompanionGuide = { x: number; y: number; name: string; seq: number };

const NEARBY_PX = 120;
const LONG_SESSION_SECONDS = 90 * 60;

interface UseSpaceCompanionOptions {
  enabled: boolean;
  userId: string | undefined;
  userName: string | undefined;
  syncService: WorldSyncService | null;
  zones: ZoneTarget[];
  currentZone: string;
  activity: string;
  /** Display name of the space's map, e.g. "Zombie City" */
  mapName: string;
  /** Social hangout or Zombie Survival */
  mode: 'social' | 'zombie';
  /** UI the companion can open on the owner's behalf */
  openMap: () => void;
  openChat: () => void;
  openMessenger?: (friendName?: string) => void;
}

/**
 * Everything that makes the companion feel alive inside a space: proactive
 * bubbles, guiding, reminders, the first-time tour and AI replies on the canvas.
 */
export function useSpaceCompanion(opts: UseSpaceCompanionOptions) {
  const { enabled, userId, userName, syncService, currentZone } = opts;
  const [cue, setCue] = useState<CompanionCue | null>(null);
  const [guide, setGuide] = useState<CompanionGuide | null>(null);
  const seqRef = useRef(0);
  const sessionStartRef = useRef<number>(0);
  const brainRef = useRef<CompanionBrain | null>(null);
  const tourRef = useRef<TourController | null>(null);
  const [tourStep, setTourStep] = useState<string | null>(null);
  const greetedRef = useRef(false);
  const lastZoneRef = useRef<string | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const nextSeq = () => ++seqRef.current;

  const show = useCallback((text: string, emote?: CompanionEmote, mood?: CompanionMood) => {
    setCue({ text, emote, mood, seq: nextSeq() });
  }, []);

  const proactive = useCallback(
    (event: CompanionEventType, vars?: { zone?: string; name?: string }) => {
      const line = brainRef.current?.notify(event, vars);
      if (line) show(line.text, line.emote, line.mood);
      return Boolean(line);
    },
    [show]
  );

  const leadTo = useCallback(
    (zone: ZoneTarget) => {
      setGuide({ x: zone.x, y: zone.y, name: zone.name, seq: nextSeq() });
    },
    []
  );

  const getWorld = useCallback((): WorldContext => {
    const o = optsRef.current;
    const me = o.syncService;
    const nearby: string[] = [];
    if (me) {
      for (const p of me.getRemotePlayers().values()) nearby.push(p.displayName);
    }
    const friends = useSocialStore.getState().friends.filter((f) => f.isOnline).map((f) => f.displayName);
    return {
      mapName: o.mapName,
      mode: o.mode,
      places: o.zones.map((z) => ({ id: z.id, name: z.name })),
      zone: o.currentZone,
      activity: o.activity,
      nearbyNames: nearby.slice(0, 6),
      onlineFriendNames: friends.slice(0, 6),
      sessionSeconds: sessionStartRef.current ? Math.round((Date.now() - sessionStartRef.current) / 1000) : 0,
    };
  }, []);

  // Late-bound handlers used by AI actions
  const handlersRef = useRef<CompanionActionHandlers>({});

  const onReply = useCallback(
    (reply: CompanionReply) => {
      brainRef.current?.noteSpoke();
      show(reply.text, reply.emote, reply.mood);
      return runCompanionActions(reply.actions, handlersRef.current, optsRef.current.zones)
        .filter((r) => r.ran && r.label)
        .map((r) => r.label as string);
    },
    [show]
  );

  const onReminderDue = useCallback(
    (text: string) => {
      proactive('reminder_due', { name: text });
    },
    [proactive]
  );

  const chat = useCompanionChat({
    userId: enabled ? userId : null,
    userName,
    getWorld,
    onReply,
    onReminderDue,
  });
  const { profile, companion, addReminder, updateProfile } = chat;

  // Tour ------------------------------------------------------------------
  const persistTour = useCallback(() => {
    const t = tourRef.current;
    if (t) void updateProfile({ tourProgress: { ...t.progress(), ...(t.finished ? { done: true } : {}) } });
  }, [updateProfile]);

  const announceStep = useCallback(() => {
    const step = tourRef.current?.current ?? null;
    setTourStep(step?.id ?? null);
    if (!step) return;
    show(step.say, 'sparkle', 'excited');
    if (step.leadTo) {
      const zone = optsRef.current.zones.find((z) => z.id === step.leadTo);
      if (zone) leadTo(zone);
    }
  }, [leadTo, show]);

  const startTour = useCallback(() => {
    if (!tourRef.current) tourRef.current = new TourController();
    tourRef.current.restart();
    announceStep();
  }, [announceStep]);

  const tourEvent = useCallback(
    (event: TourEvent) => {
      const t = tourRef.current;
      if (!t || t.finished || !tourStep) return;
      const result = t.handle(event);
      if (!result) return;
      persistTour();
      if (result.next) {
        announceStep();
      } else {
        setTourStep(null);
        show(TOUR_DONE_LINE, 'heart', 'proud');
      }
    },
    [announceStep, persistTour, show, tourStep]
  );

  // Action handlers (refreshed every render so they see the latest state)
  useEffect(() => {
    handlersRef.current = {
      navigate_to_zone: leadTo,
      open_map: () => optsRef.current.openMap(),
      open_dms: optsRef.current.openMessenger ? (name) => optsRef.current.openMessenger?.(name) : undefined,
      start_tour: startTour,
      set_reminder: (text, minutes) => void addReminder(text, minutes),
    };
  }, [leadTo, startTour, addReminder]);

  // Brain identity follows the profile (species can change from the Bond tab)
  const survival = opts.mode === 'zombie';
  useEffect(() => {
    if (!profile) return;
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();
    if (!brainRef.current) {
      brainRef.current = new CompanionBrain({ species: profile.species, ownerName: userName || 'friend' });
    } else {
      brainRef.current.setIdentity(profile.species, userName || 'friend');
    }
    brainRef.current.setSurvival(survival);
  }, [profile, userName, survival]);

  // One greeting per visit, plus the automatic tour for brand-new owners
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const companionId = profile?.id;
  useEffect(() => {
    const p = profileRef.current;
    if (!companionId || !p || greetedRef.current) return;
    greetedRef.current = true;
    tourRef.current = new TourController(p.tourProgress);

    const lastSeen = p.lastSeenOwnerAt ? new Date(p.lastSeenOwnerAt).getTime() : 0;
    const away = lastSeen > 0 && Date.now() - lastSeen > 24 * 3600_000;
    // The cozy first-run tour waits for a social space; survival is no place for sightseeing
    const isBrandNew = !lastSeen && Object.keys(p.tourProgress).length === 0 && optsRef.current.mode !== 'zombie';
    let tourTimer: ReturnType<typeof setTimeout> | null = null;
    const greetTimer = setTimeout(() => {
      if (isLateNight(new Date())) proactive('late_night');
      else proactive(away ? 'welcome_back' : 'greet');
      if (isBrandNew) tourTimer = setTimeout(() => startTour(), 4000);
    }, 1200);
    return () => {
      clearTimeout(greetTimer);
      if (tourTimer) clearTimeout(tourTimer);
      // Allow a fresh greeting if this effect is torn down early (e.g. StrictMode remount)
      greetedRef.current = false;
    };
  }, [companionId, proactive, startTour]);

  // Show the companion to other players (name + species only)
  useEffect(() => {
    if (!syncService) return;
    syncService.setCompanionBadge(companion ? { name: companion.name, species: companion.species ?? 'cat' } : null);
  }, [syncService, companion]);

  // Zone changes
  useEffect(() => {
    if (!profile) return;
    if (lastZoneRef.current === null) {
      lastZoneRef.current = currentZone;
      return;
    }
    if (lastZoneRef.current === currentZone) return;
    lastZoneRef.current = currentZone;
    tourEvent('zone_changed');
    proactive('zone_enter', { zone: currentZone });
  }, [currentZone, profile, proactive, tourEvent]);

  // Long session nudge
  useEffect(() => {
    if (!profile) return;
    const timer = setInterval(() => {
      if (sessionStartRef.current && (Date.now() - sessionStartRef.current) / 1000 > LONG_SESSION_SECONDS) {
        proactive('long_session');
      }
    }, 5 * 60_000);
    return () => clearInterval(timer);
  }, [profile, proactive]);

  // First movement completes the tour's "move" step
  useEffect(() => {
    if (tourStep !== 'move') return;
    const onKey = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        tourEvent('moved');
      }
    };
    const onPointer = () => tourEvent('moved');
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onPointer, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onPointer);
    };
  }, [tourStep, tourEvent]);

  // Friends walking nearby (called from the page's proximity callback)
  const handleProximity = useCallback(
    (distances: Map<string, number>) => {
      const sync = optsRef.current.syncService;
      if (!sync || !brainRef.current) return;
      const friendIds = new Set(useSocialStore.getState().friends.map((f) => f.userId));
      if (!friendIds.size) return;
      const players = sync.getRemotePlayers();
      for (const [id, dist] of distances) {
        if (dist > NEARBY_PX) continue;
        const p = players.get(id);
        if (p && friendIds.has(p.userId)) {
          if (proactive('friend_nearby', { name: p.displayName })) return;
        }
      }
    },
    [proactive]
  );

  // Canvas callbacks
  const onTap = useCallback(() => {
    proactive('tapped');
    optsRef.current.openChat();
  }, [proactive]);
  const onWake = useCallback(() => proactive('wake_up'), [proactive]);
  const onSleep = useCallback(() => brainRef.current?.notify('fall_asleep'), []);
  const onArrive = useCallback((name: string) => proactive('guide_arrived', { zone: name }), [proactive]);

  const canvasProps = useMemo(
    () => ({
      companionCue: cue,
      companionGuide: guide,
      onCompanionArrive: onArrive,
      onCompanionWake: onWake,
      onCompanionSleep: onSleep,
    }),
    [cue, guide, onArrive, onWake, onSleep]
  );

  return {
    ...chat,
    canvasProps,
    onTap,
    handleProximity,
    tourEvent,
    tourStep,
    startTour,
    /** Mute proactive chatter while the owner is typing to the companion */
    setTyping: (typing: boolean) => brainRef.current?.setMuted(typing),
  };
}
