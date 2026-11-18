// ============================================================
// SURVIVAL SETTINGS (per device, localStorage)
// Sound levels and visual-feedback preferences for Zombie Survival.
// Stored like the controls (lib/settings/controls.ts): a per-device
// convenience, read defensively (private mode, cleared storage and bad
// JSON all fall back to the defaults).
// ============================================================

export interface SurvivalSettings {
  version: 1;
  /** 0–1. */
  volume: number;
  sfx: boolean;
  ambience: boolean;
  /** Screen shake on hits and crashes (off for motion sensitivity). */
  shake: boolean;
  /** Floating damage / pickup numbers. */
  numbers: boolean;
  /** The performance overlay (frame time, network, zombies). */
  perf: boolean;
}

export const DEFAULT_SURVIVAL_SETTINGS: SurvivalSettings = { version: 1, volume: 0.7, sfx: true, ambience: true, shake: true, numbers: true, perf: false };

export const SURVIVAL_SETTINGS_KEY = 'teemchat.survival.settings.v1';

/** Validates anything (stored JSON) into settings. */
export function parseSurvivalSettings(raw: unknown): SurvivalSettings {
  const d = DEFAULT_SURVIVAL_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Record<string, unknown>;
  const bool = (k: keyof SurvivalSettings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (d[k] as boolean));
  const volume = typeof r.volume === 'number' && Number.isFinite(r.volume) ? Math.max(0, Math.min(1, r.volume)) : d.volume;
  return { version: 1, volume, sfx: bool('sfx'), ambience: bool('ambience'), shake: bool('shake'), numbers: bool('numbers'), perf: bool('perf') };
}

export function loadSurvivalSettings(): SurvivalSettings {
  try {
    if (typeof window === 'undefined') return { ...DEFAULT_SURVIVAL_SETTINGS };
    const s = window.localStorage.getItem(SURVIVAL_SETTINGS_KEY);
    return parseSurvivalSettings(s ? JSON.parse(s) : null);
  } catch {
    return { ...DEFAULT_SURVIVAL_SETTINGS };
  }
}

export function saveSurvivalSettings(s: SurvivalSettings) {
  try {
    window.localStorage.setItem(SURVIVAL_SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Private mode / storage full: the settings just won't persist
  }
}
