// ============================================================
// CONTROLS SETTINGS (pure, DOM-free)
// Key bindings + on-screen (touch) control layout. Stored per device in
// localStorage by stores/controls.ts; WorldGame reads bindings, GameCanvas
// reads the touch layout.
// ============================================================

export type ControlAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'fire'
  | 'reload'
  | 'nextWeapon'
  | 'useSupply'
  | 'jump'
  | 'interact'
  | 'lock'
  | 'barricade';

/** Up to two keys per action (KeyboardEvent.code values). */
export type KeyBindings = Record<ControlAction, [string | null, string | null]>;

export interface ActionInfo {
  id: ControlAction;
  label: string;
  group: 'Movement' | 'Survival' | 'Doors & windows';
  /** Shown next to the action in settings. */
  hint?: string;
}

export const CONTROL_ACTIONS: readonly ActionInfo[] = [
  { id: 'moveUp', label: 'Move up', group: 'Movement' },
  { id: 'moveDown', label: 'Move down', group: 'Movement' },
  { id: 'moveLeft', label: 'Move left', group: 'Movement' },
  { id: 'moveRight', label: 'Move right', group: 'Movement' },
  { id: 'sprint', label: 'Sprint (hold)', group: 'Movement' },
  { id: 'jump', label: 'Jump', group: 'Movement' },
  { id: 'fire', label: 'Fire / attack', group: 'Survival', hint: 'Hold for automatic weapons' },
  { id: 'reload', label: 'Reload', group: 'Survival' },
  { id: 'nextWeapon', label: 'Next weapon', group: 'Survival', hint: 'With Shift: previous · 1–6 pick a slot' },
  { id: 'useSupply', label: 'Eat / drink', group: 'Survival', hint: 'Uses what you need most' },
  { id: 'interact', label: 'Open / close / enter', group: 'Doors & windows' },
  { id: 'lock', label: 'Lock / unlock', group: 'Doors & windows' },
  { id: 'barricade', label: 'Board up', group: 'Doors & windows', hint: 'With Shift: pull a plank' },
];

export const DEFAULT_BINDINGS: KeyBindings = {
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space', null],
  fire: ['KeyF', null],
  reload: ['KeyR', null],
  nextWeapon: ['KeyQ', null],
  useSupply: ['KeyC', null],
  interact: ['KeyE', null],
  lock: ['KeyL', null],
  barricade: ['KeyB', null],
};

/** Keys that can't be bound: zoom, weapon slots, browser/system keys. */
const RESERVED = new Set([
  'Escape',
  'Tab',
  'Enter',
  'NumpadEnter',
  'MetaLeft',
  'MetaRight',
  'ContextMenu',
  'Equal',
  'Minus',
  'NumpadAdd',
  'NumpadSubtract',
  'Digit0',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'F5',
  'F11',
  'F12',
]);

export function isBindable(code: string): boolean {
  return !!code && !RESERVED.has(code);
}

/** Human label for a KeyboardEvent.code. */
export function keyLabel(code: string | null | undefined): string {
  if (!code) return '—';
  const named: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'Alt',
    AltRight: 'R-Alt',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backquote: '`',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    CapsLock: 'Caps',
    Backspace: '⌫',
  };
  if (named[code]) return named[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export function bindingsFor(b: KeyBindings, action: ControlAction): string[] {
  return b[action].filter((c): c is string => !!c);
}

/** The action a key triggers, or null. */
export function actionForCode(b: KeyBindings, code: string): ControlAction | null {
  for (const a of Object.keys(b) as ControlAction[]) if (b[a][0] === code || b[a][1] === code) return a;
  return null;
}

/** Primary key label for an action (for on-screen hints). */
export function primaryLabel(b: KeyBindings, action: ControlAction): string {
  return keyLabel(b[action][0] ?? b[action][1]);
}

/**
 * Binds `code` to `action` slot `slot` (null clears). A key already used
 * elsewhere is swapped: the other action takes over whatever this slot had,
 * so no key ever triggers two actions.
 */
export function rebind(b: KeyBindings, action: ControlAction, slot: 0 | 1, code: string | null): KeyBindings {
  if (code !== null && !isBindable(code)) return b;
  const next = Object.fromEntries((Object.keys(b) as ControlAction[]).map((a) => [a, [...b[a]]])) as KeyBindings;
  const previous = next[action][slot];
  if (code !== null) {
    for (const a of Object.keys(next) as ControlAction[]) {
      for (const s of [0, 1] as const) {
        if (next[a][s] === code && !(a === action && s === slot)) next[a][s] = a === action ? null : previous;
      }
    }
  }
  next[action][slot] = code;
  // Never leave an action with only a secondary key: promote it
  if (!next[action][0] && next[action][1]) next[action] = [next[action][1], null];
  return next;
}

// ---------------------------------------------------------------- touch layout

export type TouchControl = 'joystick' | 'fire' | 'jump' | 'sprint' | 'weapons' | 'zoom' | 'action';
export type Handedness = 'right' | 'left';
export type ControlSize = 'sm' | 'md' | 'lg';
export type SprintTouchMode = 'toggle' | 'hold';
export type Orientation = 'portrait' | 'landscape';

/** Control centre as a fraction (0–1) of the game area. */
export interface ControlPos {
  x: number;
  y: number;
}

export interface TouchLayout {
  hand: Handedness;
  size: ControlSize;
  /** 0.35–1 */
  opacity: number;
  sprintMode: SprintTouchMode;
  /** Custom positions per orientation; missing controls use the default layout. */
  positions: Record<Orientation, Partial<Record<TouchControl, ControlPos>>>;
}

export const TOUCH_CONTROLS: readonly { id: TouchControl; label: string }[] = [
  { id: 'joystick', label: 'Joystick' },
  { id: 'fire', label: 'Fire' },
  { id: 'jump', label: 'Jump' },
  { id: 'sprint', label: 'Sprint' },
  { id: 'weapons', label: 'Weapons & supplies' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'action', label: 'Action (A)' },
];

/** Controls grow from their centre, so Large stays modest enough to keep the default layout clear. */
export const SIZE_SCALE: Record<ControlSize, number> = { sm: 0.85, md: 1, lg: 1.15 };

export const DEFAULT_TOUCH: TouchLayout = {
  hand: 'right',
  size: 'md',
  opacity: 1,
  sprintMode: 'toggle',
  positions: { portrait: {}, landscape: {} },
};

export interface ControlsSettings {
  version: 1;
  bindings: KeyBindings;
  touch: TouchLayout;
}

export const DEFAULT_SETTINGS: ControlsSettings = { version: 1, bindings: DEFAULT_BINDINGS, touch: DEFAULT_TOUCH };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Keeps a control's centre inside the area given its size (px), so it can
 * never be dragged — or left by a rotation/resize — off screen.
 */
export function clampPos(p: ControlPos, area: { w: number; h: number }, size: { w: number; h: number }, margin = 4): ControlPos {
  if (area.w <= 0 || area.h <= 0) return { x: clamp01(p.x), y: clamp01(p.y) };
  const hx = Math.min(0.5, (size.w / 2 + margin) / area.w);
  const hy = Math.min(0.5, (size.h / 2 + margin) / area.h);
  return { x: Math.min(1 - hx, Math.max(hx, p.x)), y: Math.min(1 - hy, Math.max(hy, p.y)) };
}

/** Validates untrusted (stored) data, falling back to defaults field by field. */
export function sanitizeSettings(raw: unknown): ControlsSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ControlsSettings>;
  let bindings = DEFAULT_BINDINGS;
  if (r.bindings && typeof r.bindings === 'object') {
    bindings = { ...DEFAULT_BINDINGS };
    for (const a of Object.keys(DEFAULT_BINDINGS) as ControlAction[]) {
      const v = (r.bindings as Record<string, unknown>)[a];
      if (Array.isArray(v) && v.length === 2 && v.every((c) => c === null || (typeof c === 'string' && isBindable(c)))) {
        bindings[a] = [v[0] as string | null, v[1] as string | null];
      }
    }
    // Drop duplicates left by hand-edited storage: first owner keeps the key
    const seen = new Set<string>();
    for (const a of Object.keys(bindings) as ControlAction[]) {
      bindings[a] = bindings[a].map((c) => (c && seen.has(c) ? null : (c && seen.add(c), c))) as [string | null, string | null];
    }
    // An action left with no key gets its default back when that key is free
    for (const a of Object.keys(bindings) as ControlAction[]) {
      if (bindings[a][0] || bindings[a][1]) continue;
      const free = DEFAULT_BINDINGS[a].filter((c): c is string => !!c && !seen.has(c));
      free.forEach((c) => seen.add(c));
      bindings[a] = [free[0] ?? null, free[1] ?? null];
    }
  }
  const t = (r.touch && typeof r.touch === 'object' ? r.touch : {}) as Partial<TouchLayout>;
  const positions: TouchLayout['positions'] = { portrait: {}, landscape: {} };
  for (const o of ['portrait', 'landscape'] as const) {
    const src = (t.positions as Record<string, unknown> | undefined)?.[o];
    if (!src || typeof src !== 'object') continue;
    for (const { id } of TOUCH_CONTROLS) {
      const p = (src as Record<string, unknown>)[id] as ControlPos | undefined;
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) positions[o][id] = { x: clamp01(p.x), y: clamp01(p.y) };
    }
  }
  return {
    version: 1,
    bindings,
    touch: {
      hand: t.hand === 'left' ? 'left' : 'right',
      size: t.size === 'sm' || t.size === 'lg' ? t.size : 'md',
      opacity: typeof t.opacity === 'number' && Number.isFinite(t.opacity) ? Math.min(1, Math.max(0.35, t.opacity)) : 1,
      sprintMode: t.sprintMode === 'hold' ? 'hold' : 'toggle',
      positions,
    },
  };
}
