import { describe, expect, it } from 'vitest';
import { FeedbackLayer, NoticeLog, SOUND_RANGE, Shake, proximity, spatialMix } from './feedback';
import { DEFAULT_SURVIVAL_SETTINGS, parseSurvivalSettings } from '@/lib/settings/survivalSettings';
import { AIM_DEADZONE, PAD_BUTTONS, deadzone, readPad } from '@/lib/input/gamepad';
import { MAP_COLORS, mapPixels } from '../map/mapImage';
import { CONTROL_ACTIONS, DEFAULT_BINDINGS } from '@/lib/settings/controls';

// Phase 8: sound placement, notifications, floaters, shake, settings, gamepad, map image.

describe('sound placement', () => {
  const me = { x: 0, y: 0 };

  it('your own sounds play at full volume, centred', () => {
    expect(spatialMix(me, { id: 'pickup' })).toEqual({ gain: 1, pan: 0 });
    expect(spatialMix(me, { id: 'pickup', vol: 0.4 })).toEqual({ gain: 0.4, pan: 0 });
  });

  it('fades with distance, pans to the side it comes from, and stops at its range', () => {
    const near = spatialMix(me, { id: 'groan', x: 30, y: 0 })!;
    const far = spatialMix(me, { id: 'groan', x: 200, y: 0 })!;
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(near.pan).toBeGreaterThan(0);
    expect(spatialMix(me, { id: 'groan', x: -200, y: 0 })!.pan).toBeLessThan(0);
    expect(spatialMix(me, { id: 'groan', x: SOUND_RANGE.groan! + 1, y: 0 })).toBeNull();
    // Gunfire carries much further than a groan
    expect(spatialMix(me, { id: 'shot_heavy', x: 700, y: 0 })).not.toBeNull();
    expect(proximity(50, 100)).toBe(0.5);
    expect(proximity(150, 100)).toBe(0);
  });
});

describe('notifications', () => {
  it('keeps a short history and shows the newest few', () => {
    const log = new NoticeLog();
    log.push('A', null, 0);
    log.push('B', null, 1);
    log.push('C', null, 2);
    log.push('D', null, 3);
    expect(log.recent(3.5, 4).map((n) => n.text)).toEqual(['B', 'C', 'D']);
    // Older than the toast time: off screen, still in the log
    expect(log.recent(10, 4)).toEqual([]);
    expect(log.history.map((n) => n.text)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('the same message again refreshes instead of stacking; the log is capped', () => {
    const log = new NoticeLog();
    log.push('Bag full', null, 0);
    log.push('Bag full', null, 1);
    expect(log.history).toHaveLength(1);
    expect(log.history[0].at).toBe(1);
    for (let i = 0; i < 60; i++) log.push(`n${i}`, null, i * 10);
    expect(log.history).toHaveLength(NoticeLog.KEEP);
  });
});

describe('floaters and shake', () => {
  it('numbers rise and fade; particles fall; all expire', () => {
    const f = new FeedbackLayer();
    f.text(100, 100, '-12', '#f00');
    f.burst('blood', 50, 50, 6, '#900');
    expect(f.floaters).toHaveLength(7);
    const t = f.floaters[0];
    f.update(0.5);
    expect(t.y).toBeLessThan(100);
    f.update(2);
    expect(f.floaters).toHaveLength(0);
  });

  it('texts at the same spot stack; turning numbers off stops them', () => {
    const f = new FeedbackLayer();
    f.text(10, 100, '+1 A', '#fff');
    f.text(10, 100, '+1 B', '#fff');
    expect(f.floaters[1].y).toBeLessThan(f.floaters[0].y - 6);
    f.numbers = false;
    f.text(10, 100, 'x', '#fff');
    expect(f.floaters).toHaveLength(2);
  });

  it('shake builds with hits, decays, and can be switched off', () => {
    const s = new Shake();
    expect(s.offset(1)).toEqual({ x: 0, y: 0 });
    s.add(0.6);
    const o = s.offset(1.234);
    expect(Math.abs(o.x) + Math.abs(o.y)).toBeGreaterThan(0);
    s.update(1);
    expect(s.level).toBe(0);
    s.enabled = false;
    s.add(1);
    expect(s.level).toBe(0);
  });
});

describe('survival settings', () => {
  it('fall back to defaults for junk, clamp volume', () => {
    expect(parseSurvivalSettings(null)).toEqual(DEFAULT_SURVIVAL_SETTINGS);
    expect(parseSurvivalSettings('x')).toEqual(DEFAULT_SURVIVAL_SETTINGS);
    expect(parseSurvivalSettings({ volume: 7, sfx: false, shake: 'yes' })).toEqual({ ...DEFAULT_SURVIVAL_SETTINGS, volume: 1, sfx: false });
  });
});

describe('controls', () => {
  it('the map has a key, and every survival action a binding', () => {
    expect(DEFAULT_BINDINGS.map[0]).toBe('KeyM');
    for (const a of CONTROL_ACTIONS) expect(DEFAULT_BINDINGS[a.id][0], a.id).toBeTruthy();
    // No two actions share a default key
    const keys = CONTROL_ACTIONS.map((a) => DEFAULT_BINDINGS[a.id][0]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('gamepad', () => {
  const pad = (axes: number[], pressed: number[] = []) => ({
    axes,
    buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  });

  it('sticks: a deadzone, then movement; the right stick aims', () => {
    expect(deadzone(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const m = readPad(pad([1, 0, 0, 0]), []).move;
    expect(m.x).toBeCloseTo(1);
    expect(readPad(pad([0, 0, 0, 1]), []).aim).toBeCloseTo(Math.PI / 2);
    expect(readPad(pad([0, 0, AIM_DEADZONE / 2, 0]), []).aim).toBeNull();
  });

  it('buttons map to actions on press and release, once each', () => {
    const first = readPad(pad([0, 0, 0, 0], [0, 7]), []);
    expect(first.pressed.map((p) => p.action).sort()).toEqual(['fire', 'interact']);
    const held = readPad(pad([0, 0, 0, 0], [0, 7]), first.buttons);
    expect(held.pressed).toEqual([]);
    const up = readPad(pad([0, 0, 0, 0], [0]), held.buttons);
    expect(up.released.map((p) => p.action)).toEqual(['fire']);
    // Every mapped action exists in the bindings
    for (const a of Object.values(PAD_BUTTONS)) expect(DEFAULT_BINDINGS[a!]).toBeDefined();
  });
});

describe('map image', () => {
  it('one pixel per tile, coloured by the ground', () => {
    const px = mapPixels(2, 1, (x) => (x < 16 ? 'grass' : 'paved'));
    expect(Array.from(px.slice(0, 3))).toEqual(MAP_COLORS.grass);
    expect(Array.from(px.slice(4, 7))).toEqual(MAP_COLORS.paved);
    expect(px[3]).toBe(255);
    expect(Array.from(mapPixels(1, 1, undefined).slice(0, 3))).toEqual(MAP_COLORS.none);
  });
});
