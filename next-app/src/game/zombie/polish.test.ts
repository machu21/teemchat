import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH } from '../collision';
import { getBoundaryWallsForMap, getBuildingsForMap } from '../map/mapRegistry';
import { ZombieMode, type ZombieFrameInput, type ZombieHud } from './zombieMode';
import type { FeedbackLayer, Shake, SoundEvent } from './feedback';
import { clockAt, weatherAt } from './survival/world';

// Phase 8 feedback through the real ZombieMode: sounds, floaters, shake, notifications, map data, ambience.

const walls = getBoundaryWallsForMap('village');
const buildings = getBuildingsForMap('village');
const SPAWN = { x: 436, y: 328 };
const frame = (over: Partial<ZombieFrameInput> = {}): ZombieFrameInput => ({
  feetX: SPAWN.x,
  feetY: SPAWN.y,
  moveX: 0,
  moveY: 0,
  insideBuildingId: null,
  others: [],
  ...over,
});

type Priv = {
  owned: Set<string>;
  mags: Record<string, number>;
  feedback: FeedbackLayer;
  shake: Shake;
  vitals: { health: number };
  elapsed: number;
  takeDamage(amount: number, effects: never[], source: 'bite' | 'other'): void;
  receiveItem(item: { uid: string; def: string; qty: number }, force: boolean): boolean;
  showToast(text: string, icon: string | null): void;
  train(skill: string, amount: number): void;
};
const p = (m: ZombieMode) => m as unknown as Priv;

function makeMode() {
  const mode = new ZombieMode(walls, buildings, MAP_WIDTH, MAP_HEIGHT, 1, []);
  let hud: ZombieHud | null = null;
  mode.onHudChanged = (h) => (hud = h);
  mode.setWorld(321, []);
  return { mode, hud: () => hud! };
}

function step(mode: ZombieMode, seconds: number, over: Partial<ZombieFrameInput> = {}) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    mode.sim.zombies = [];
    mode.update(1 / 30, frame(over));
  }
}

const ids = (events: SoundEvent[]) => events.map((e) => e.id);

describe('sounds', () => {
  it('a pistol shot sounds where you are; an empty gun clicks', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.drainSounds();
    p(mode).owned.add('pistol');
    mode.selectWeapon('pistol');
    p(mode).mags.pistol = 1;
    // Drawing a weapon takes a moment
    step(mode, 0.4);
    mode.drainSounds();
    mode.attack();
    mode.update(1 / 30, frame());
    const shot = mode.drainSounds().find((e) => e.id === 'shot_light');
    expect(shot).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
    step(mode, 1);
    mode.drainSounds();
    mode.attack();
    mode.update(1 / 30, frame());
    expect(ids(mode.drainSounds())).toContain('empty');
  });

  it('a melee swing whooshes; connecting adds a thud, blood and a damage number', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.setAim(0);
    mode.drainSounds();
    mode.sim.zombies = [];
    mode.sim.add(SPAWN.x + 18, SPAWN.y - 4);
    mode.attack();
    mode.update(1 / 30, frame());
    const s = ids(mode.drainSounds());
    expect(s).toContain('swing');
    expect(s).toContain('hit');
    expect(p(mode).feedback.floaters.some((f) => f.kind === 'blood')).toBe(true);
    expect(p(mode).feedback.floaters.some((f) => f.kind === 'text' && /^\d+!?$/.test(f.text ?? ''))).toBe(true);
  });

  it('getting hurt: a grunt, a shake and a red number over your head', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.drainSounds();
    p(mode).takeDamage(12, [], 'other');
    expect(ids(mode.drainSounds())).toContain('hurt');
    expect(p(mode).shake.level).toBeGreaterThan(0);
    expect(p(mode).feedback.floaters.find((f) => f.text === '-12')).toBeDefined();
  });

  it('settings turn the shake and the numbers off', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.setFeedback({ shake: false, numbers: false });
    p(mode).takeDamage(12, [], 'other');
    expect(p(mode).shake.level).toBe(0);
    expect(mode.shakeOffset()).toEqual({ x: 0, y: 0 });
    expect(p(mode).feedback.floaters.some((f) => f.kind === 'text')).toBe(false);
  });

  it('pickups blip with "+N Name"; a level-up chimes', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.drainSounds();
    p(mode).receiveItem({ uid: 'x', def: 'planks', qty: 2 }, true);
    expect(ids(mode.drainSounds())).toEqual(['pickup']);
    expect(p(mode).feedback.floaters.some((f) => f.text === '+2 Planks')).toBe(true);
    p(mode).train('carpentry', 10_000);
    expect(ids(mode.drainSounds())).toContain('level');
  });

  it('the queue is drained each time', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    mode.drainSounds();
    expect(mode.drainSounds()).toEqual([]);
  });
});

describe('notifications', () => {
  it('several toasts stack (newest last); the log and the map only come with the menu', () => {
    const { mode, hud } = makeMode();
    step(mode, 0.1);
    p(mode).showToast('one', null);
    p(mode).showToast('two', 'bell');
    p(mode).showToast('three', null);
    step(mode, 0.05);
    expect(hud().toasts.slice(-3).map((t) => t.text)).toEqual(['one', 'two', 'three']);
    expect(hud().toast).toBe('three');
    expect(hud().log).toBeNull();
    expect(hud().map).toBeNull();
    mode.setMenuOpen(true);
    step(mode, 0.05);
    expect(hud().log?.[0].text).toBe('three');
    expect(hud().map).toMatchObject({ w: MAP_WIDTH, h: MAP_HEIGHT });
    expect(Math.abs(hud().map!.player.x - SPAWN.x)).toBeLessThanOrEqual(4);
    // Toasts leave the screen after a few seconds, but stay in the log
    step(mode, 6);
    expect(hud().toasts.some((t) => t.text === 'one')).toBe(false);
    expect(hud().log?.some((n) => n.text === 'one')).toBe(true);
  });
});

describe('ambience', () => {
  it('a heartbeat at low health, rain in the rain', () => {
    const { mode } = makeMode();
    step(mode, 0.1);
    expect(mode.ambience().heartbeat).toBe(0);
    p(mode).vitals = { ...p(mode).vitals, health: 15 };
    step(mode, 0.05);
    expect(mode.ambience().heartbeat).toBeGreaterThan(70);
    let h = 1;
    while (weatherAt(321, h) !== 'rain' && h < 200) h += 0.5;
    p(mode).elapsed = clockAt(h);
    step(mode, 0.05);
    expect(mode.ambience().rain).toBeGreaterThan(0);
    expect(mode.ambience().sheltered).toBe(false);
    step(mode, 0.05, { insideBuildingId: buildings[0].id });
    expect(mode.ambience().sheltered).toBe(true);
  });
});
