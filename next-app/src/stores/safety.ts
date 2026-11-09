'use client';

import { useCallback } from 'react';
import { create } from 'zustand';
import {
  AgeBand,
  DEFAULT_SAFETY_PREFS,
  DmPrivacy,
  SafetyPrefs,
  SafetyRestrictions,
  restrictionsFor,
} from '@/lib/safety/ageBand';
import { filterText } from '@/lib/safety/profanity';
import { MySafety, SafetyService } from '@/lib/services/safety';

interface SafetyState {
  userId: string | null;
  loaded: boolean;
  ageBand: AgeBand;
  hasBirthDate: boolean;
  prefs: SafetyPrefs;
  restrictions: SafetyRestrictions;
  /** Users I blocked (persisted). */
  blockedIds: Set<string>;
  /** Users I muted for this visit only (voice + bubbles + chat hidden). */
  mutedIds: Set<string>;

  load: (userId: string) => Promise<void>;
  reset: () => void;
  setBirthDate: (birthDate: string) => Promise<string | null>;
  updatePrefs: (patch: { chatFilter?: boolean; dmPrivacy?: DmPrivacy }) => Promise<boolean>;
  block: (targetId: string) => Promise<boolean>;
  unblock: (targetId: string) => Promise<boolean>;
  toggleMute: (targetId: string) => void;
}

const initial = {
  userId: null,
  loaded: false,
  ageBand: 'unknown' as AgeBand,
  hasBirthDate: false,
  prefs: DEFAULT_SAFETY_PREFS,
  restrictions: restrictionsFor('unknown', DEFAULT_SAFETY_PREFS),
  blockedIds: new Set<string>(),
  mutedIds: new Set<string>(),
};

function applySafety(safety: MySafety) {
  return {
    ageBand: safety.ageBand,
    hasBirthDate: safety.hasBirthDate,
    prefs: safety.prefs,
    restrictions: restrictionsFor(safety.ageBand, safety.prefs),
  };
}

let loadingFor: string | null = null;

export const useSafetyStore = create<SafetyState>((set, get) => ({
  ...initial,

  load: async (userId) => {
    if (!userId || loadingFor === userId || (get().loaded && get().userId === userId)) return;
    loadingFor = userId;
    try {
      const [safety, blocked] = await Promise.all([
        SafetyService.getMySafety(userId),
        SafetyService.listBlocked(userId),
      ]);
      // A sign-out or account switch while loading wins.
      if (loadingFor !== userId) return;
      set({ ...applySafety(safety), userId, loaded: true, blockedIds: new Set(blocked) });
    } finally {
      if (loadingFor === userId) loadingFor = null;
    }
  },

  reset: () => {
    loadingFor = null;
    set({ ...initial, blockedIds: new Set(), mutedIds: new Set() });
  },

  setBirthDate: async (birthDate) => {
    const userId = get().userId;
    if (!userId) return 'Please sign in first.';
    const res = await SafetyService.setBirthDate(userId, birthDate);
    if (res.error || !res.safety) return res.error || 'Could not save your birth date.';
    set(applySafety(res.safety));
    return null;
  },

  updatePrefs: async (patch) => {
    const userId = get().userId;
    if (!userId) return false;
    const next = await SafetyService.updatePrefs(userId, patch);
    if (!next) return false;
    set(applySafety(next));
    return true;
  },

  block: async (targetId) => {
    const userId = get().userId;
    if (!userId) return false;
    const ok = await SafetyService.block(userId, targetId);
    if (ok) set({ blockedIds: new Set(get().blockedIds).add(targetId) });
    return ok;
  },

  unblock: async (targetId) => {
    const userId = get().userId;
    if (!userId) return false;
    const ok = await SafetyService.unblock(userId, targetId);
    if (ok) {
      const next = new Set(get().blockedIds);
      next.delete(targetId);
      set({ blockedIds: next });
    }
    return ok;
  },

  toggleMute: (targetId) => {
    const next = new Set(get().mutedIds);
    if (next.has(targetId)) next.delete(targetId);
    else next.add(targetId);
    set({ mutedIds: next });
  },
}));

/** Blocked or muted for this visit: hide avatar, bubbles, chat and voice. */
export function isHiddenUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const { blockedIds, mutedIds } = useSafetyStore.getState();
  return blockedIds.has(userId) || mutedIds.has(userId);
}

/** Applies the viewer's chat filter (forced on in Family Mode). */
export function safeText(text: string): string {
  return useSafetyStore.getState().restrictions.filterOn ? filterText(text) : text;
}

/** Reactive version of safeText for components: re-renders when the filter is toggled. */
export function useSafeText(): (text: string) => string {
  const filterOn = useSafetyStore((s) => s.restrictions.filterOn);
  return useCallback((text: string) => (filterOn ? filterText(text) : text), [filterOn]);
}

/** Memoizes a text filter per string; used by the canvas, which re-filters every frame. */
export function cachedTextFilter(filter: (text: string) => string): (text: string) => string {
  const cache = new Map<string, string>();
  return (text: string) => {
    let out = cache.get(text);
    if (out === undefined) {
      if (cache.size > 500) cache.clear();
      out = filter(text);
      cache.set(text, out);
    }
    return out;
  };
}
