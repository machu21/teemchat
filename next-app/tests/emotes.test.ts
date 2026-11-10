import { describe, it, expect } from 'vitest';
import {
  EMOTES,
  createEmoteThrottle,
  emoteDef,
  isDoNotDisturb,
  isEmoteId,
  isPlayerStatus,
  statusIcon,
} from '../src/lib/world/emotes';

describe('emotes', () => {
  it('validates emote ids from the network', () => {
    expect(isEmoteId('wave')).toBe(true);
    expect(isEmoteId('dance')).toBe(true);
    expect(isEmoteId('explode')).toBe(false);
    expect(isEmoteId(42)).toBe(false);
    expect(emoteDef('heart').icon).toBe('heart');
    expect(new Set(EMOTES.map((e) => e.id)).size).toBe(EMOTES.length);
  });

  it('throttles emotes to one per cooldown window', () => {
    let t = 1000;
    const allow = createEmoteThrottle(750, () => t);
    expect(allow()).toBe(true);
    t += 100;
    expect(allow()).toBe(false);
    t += 649;
    expect(allow()).toBe(false);
    t += 1;
    expect(allow()).toBe(true);
  });

  it('keeps the throttle well under the 10 msg/s realtime budget', () => {
    let t = 0;
    const allow = createEmoteThrottle(undefined, () => t);
    let sent = 0;
    for (; t < 10_000; t += 16) if (allow()) sent++;
    expect(sent).toBeLessThanOrEqual(14); // ~1.3/s over 10s
  });
});

describe('player status', () => {
  it('accepts only known statuses', () => {
    expect(isPlayerStatus('focus')).toBe(true);
    expect(isPlayerStatus('offline')).toBe(false);
    expect(isPlayerStatus(undefined)).toBe(false);
  });

  it('treats busy and focus as do-not-disturb', () => {
    expect(isDoNotDisturb('busy')).toBe(true);
    expect(isDoNotDisturb('focus')).toBe(true);
    expect(isDoNotDisturb('available')).toBe(false);
    expect(isDoNotDisturb('away')).toBe(false);
  });

  it('shows a badge only for non-available statuses', () => {
    expect(statusIcon('available')).toBeNull();
    expect(statusIcon(undefined)).toBeNull();
    expect(statusIcon('focus')?.icon).toBe('headphones');
  });
});
