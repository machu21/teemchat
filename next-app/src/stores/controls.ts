'use client';

import { create } from 'zustand';
import {
  ControlAction,
  ControlPos,
  ControlsSettings,
  DEFAULT_SETTINGS,
  KeyBindings,
  Orientation,
  TouchControl,
  TouchLayout,
  rebind,
  sanitizeSettings,
} from '@/lib/settings/controls';

const STORAGE_KEY = 'teemchat-controls-v1';

interface ControlsState extends ControlsSettings {
  hydrated: boolean;
  /** Layout editor: on-screen controls can be dragged instead of used. */
  editingLayout: boolean;
  /** Load saved settings (call from an effect: storage isn't available during SSR). */
  hydrate: () => void;
  setBinding: (action: ControlAction, slot: 0 | 1, code: string | null) => void;
  resetBindings: () => void;
  setTouch: (patch: Partial<Omit<TouchLayout, 'positions'>>) => void;
  setPosition: (orientation: Orientation, control: TouchControl, pos: ControlPos) => void;
  resetLayout: () => void;
  setEditingLayout: (on: boolean) => void;
}

function save(s: ControlsSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: s.version, bindings: s.bindings, touch: s.touch }));
  } catch {
    // Private mode / blocked storage: settings still apply for this visit
  }
}

export const useControlsStore = create<ControlsState>((set, get) => {
  const commit = (patch: { bindings?: KeyBindings; touch?: TouchLayout }) => {
    set(patch);
    const s = get();
    save({ version: 1, bindings: s.bindings, touch: s.touch });
  };

  return {
    ...DEFAULT_SETTINGS,
    hydrated: false,
    editingLayout: false,

    hydrate: () => {
      if (get().hydrated || typeof window === 'undefined') return;
      let loaded = DEFAULT_SETTINGS;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = sanitizeSettings(JSON.parse(raw));
      } catch {
        loaded = DEFAULT_SETTINGS;
      }
      set({ bindings: loaded.bindings, touch: loaded.touch, hydrated: true });
    },

    setBinding: (action, slot, code) => commit({ bindings: rebind(get().bindings, action, slot, code) }),
    resetBindings: () => commit({ bindings: DEFAULT_SETTINGS.bindings }),

    setTouch: (patch) => commit({ touch: { ...get().touch, ...patch } }),

    setPosition: (orientation, control, pos) => {
      const t = get().touch;
      commit({ touch: { ...t, positions: { ...t.positions, [orientation]: { ...t.positions[orientation], [control]: pos } } } });
    },

    resetLayout: () => commit({ touch: { ...get().touch, positions: { portrait: {}, landscape: {} } } }),

    setEditingLayout: (on) => set({ editingLayout: on }),
  };
});
