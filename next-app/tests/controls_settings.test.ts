import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BINDINGS,
  DEFAULT_SETTINGS,
  actionForCode,
  clampPos,
  isBindable,
  keyLabel,
  primaryLabel,
  rebind,
  sanitizeSettings,
} from '../src/lib/settings/controls';

describe('key bindings', () => {
  it('maps default keys to actions', () => {
    expect(actionForCode(DEFAULT_BINDINGS, 'KeyW')).toBe('moveUp');
    expect(actionForCode(DEFAULT_BINDINGS, 'ArrowUp')).toBe('moveUp');
    expect(actionForCode(DEFAULT_BINDINGS, 'KeyF')).toBe('fire');
    expect(actionForCode(DEFAULT_BINDINGS, 'KeyZ')).toBeNull();
  });

  it('rebinds and swaps a key that another action owned', () => {
    // Fire → E: interact takes fire's old key (F) so nothing is unbound or doubled
    const b = rebind(DEFAULT_BINDINGS, 'fire', 0, 'KeyE');
    expect(b.fire[0]).toBe('KeyE');
    expect(b.interact[0]).toBe('KeyF');
    expect(actionForCode(b, 'KeyE')).toBe('fire');
    // The defaults object is untouched
    expect(DEFAULT_BINDINGS.fire[0]).toBe('KeyF');
  });

  it('moving a key between slots of the same action clears the old slot', () => {
    const b = rebind(DEFAULT_BINDINGS, 'moveUp', 1, 'KeyW');
    expect(b.moveUp).toEqual(['KeyW', null]);
  });

  it('clearing the primary promotes the alternate key', () => {
    expect(rebind(DEFAULT_BINDINGS, 'moveUp', 0, null).moveUp).toEqual(['ArrowUp', null]);
  });

  it('refuses reserved keys (zoom, weapon slots, Esc)', () => {
    for (const k of ['Escape', 'Digit1', 'Equal', 'Minus']) {
      expect(isBindable(k)).toBe(false);
      expect(rebind(DEFAULT_BINDINGS, 'fire', 0, k)).toBe(DEFAULT_BINDINGS);
    }
  });

  it('labels keys for the HUD', () => {
    expect(keyLabel('KeyF')).toBe('F');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel(null)).toBe('—');
    expect(primaryLabel(DEFAULT_BINDINGS, 'jump')).toBe('Space');
  });
});

describe('stored settings', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and repairs the rest', () => {
    const s = sanitizeSettings({
      bindings: { fire: ['KeyG', null], reload: ['Escape', null], jump: 'Space', moveUp: ['KeyG', 'ArrowUp'] },
      touch: { hand: 'left', size: 'huge', opacity: 9, sprintMode: 'hold', positions: { portrait: { joystick: { x: 2, y: 0.5 }, bogus: { x: 0, y: 0 } } } },
    });
    expect(s.bindings.moveUp).toEqual(['KeyG', 'ArrowUp']);
    // Duplicate G dropped from fire, which falls back to its free default instead of having no key
    expect(s.bindings.fire).toEqual(['KeyF', null]);
    expect(s.bindings.reload).toEqual(DEFAULT_BINDINGS.reload); // reserved key rejected
    expect(s.bindings.jump).toEqual(DEFAULT_BINDINGS.jump); // wrong shape rejected
    expect(s.touch).toMatchObject({ hand: 'left', size: 'md', opacity: 1, sprintMode: 'hold' });
    expect(s.touch.positions.portrait).toEqual({ joystick: { x: 1, y: 0.5 } });
  });
});

describe('touch layout', () => {
  it('keeps a dragged control fully on screen', () => {
    const area = { w: 400, h: 800 };
    const size = { w: 128, h: 128 };
    const p = clampPos({ x: 0, y: 1 }, area, size);
    expect(p.x * area.w - size.w / 2).toBeGreaterThanOrEqual(0);
    expect(p.y * area.h + size.h / 2).toBeLessThanOrEqual(area.h);
    expect(clampPos({ x: 0.5, y: 0.5 }, area, size)).toEqual({ x: 0.5, y: 0.5 });
  });
});
