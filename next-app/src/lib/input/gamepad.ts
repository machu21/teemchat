import type { ControlAction } from '@/lib/settings/controls';

// ============================================================
// GAMEPAD (standard mapping, e.g. Xbox / PlayStation pads in a browser)
// Pure: turns a pad snapshot plus last frame's buttons into movement,
// aim, and pressed / released actions. WorldGame polls
// navigator.getGamepads() each frame and feeds the actions through the
// same handlers as the keyboard (so rebinding and context rules apply).
// ============================================================

/** Standard-mapping button index → what it does in survival. */
export const PAD_BUTTONS: Partial<Record<number, ControlAction>> = {
  0: 'interact', // A / Cross
  1: 'useObject', // B / Circle
  2: 'shove', // X / Square
  3: 'reload', // Y / Triangle
  4: 'nextWeapon', // LB (with shift semantics below: previous)
  5: 'nextWeapon', // RB
  6: 'sprint', // LT (hold)
  7: 'fire', // RT (hold)
  8: 'map', // Back / Select / Share
  9: 'inventory', // Start / Options
  10: 'craft', // L3
  11: 'character', // R3
  12: 'flashlight', // D-pad up
  13: 'useSupply', // D-pad down
  14: 'jump', // D-pad left
  15: 'sleep', // D-pad right
};

/** Buttons that act while held (the rest fire once per press). */
export const PAD_HELD: ReadonlySet<ControlAction> = new Set(['fire', 'sprint']);

/** Shown in the controls list. */
export const PAD_LABELS: Partial<Record<ControlAction, string>> = {
  interact: 'A',
  useObject: 'B',
  shove: 'X',
  reload: 'Y',
  nextWeapon: 'LB / RB',
  sprint: 'LT',
  fire: 'RT',
  map: 'Back',
  inventory: 'Start',
  craft: 'L3',
  character: 'R3',
  flashlight: 'D-pad up',
  useSupply: 'D-pad down',
  jump: 'D-pad left',
  sleep: 'D-pad right',
  moveUp: 'Left stick',
  moveDown: 'Left stick',
  moveLeft: 'Left stick',
  moveRight: 'Left stick',
};

export const STICK_DEADZONE = 0.2;
export const AIM_DEADZONE = 0.45;

export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value?: number }[];
}

export interface PadFrame {
  /** Left stick (or zero inside the deadzone), each axis −1…1. */
  move: { x: number; y: number };
  /** Right stick angle (radians) when pushed far enough, else null. */
  aim: number | null;
  /** Actions whose button went down / up this frame (index kept for LB vs RB). */
  pressed: { action: ControlAction; button: number }[];
  released: { action: ControlAction; button: number }[];
  /** Raw button state for next frame. */
  buttons: boolean[];
}

/** Rescales past the deadzone so small pushes still start from zero. */
export function deadzone(x: number, y: number, dz = STICK_DEADZONE): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: x * scale, y: y * scale };
}

export function readPad(pad: PadSnapshot, prev: readonly boolean[]): PadFrame {
  const move = deadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  const ax = pad.axes[2] ?? 0;
  const ay = pad.axes[3] ?? 0;
  const aim = Math.hypot(ax, ay) >= AIM_DEADZONE ? Math.atan2(ay, ax) : null;
  const buttons = pad.buttons.map((b) => b.pressed || (b.value ?? 0) > 0.5);
  const pressed: PadFrame['pressed'] = [];
  const released: PadFrame['released'] = [];
  buttons.forEach((down, i) => {
    const action = PAD_BUTTONS[i];
    if (!action) return;
    const was = prev[i] ?? false;
    if (down && !was) pressed.push({ action, button: i });
    else if (!down && was) released.push({ action, button: i });
  });
  return { move, aim, pressed, released, buttons };
}
