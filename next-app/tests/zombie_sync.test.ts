import { describe, it, expect } from 'vitest';
import { HostElection, HOST_TIMEOUT_MS, electHost } from '../src/lib/services/zombieSync';

const m = (key: string, joinedAt: number) => ({ key, joinedAt });

describe('electHost', () => {
  it('prefers the longest-present member, then the smallest key', () => {
    expect(electHost([m('b', 5), m('a', 9)])).toBe('b');
    expect(electHost([m('b', 5), m('a', 5)])).toBe('a');
    expect(electHost([])).toBeNull();
  });
});

describe('HostElection', () => {
  it('the senior member hosts and gets epoch 1', () => {
    const e = new HostElection('a');
    e.setMembers([m('a', 1)], 0);
    expect(e.isHost()).toBe(true);
    expect(e.epoch).toBe(1);
  });

  it('a newcomer never takes over from a live senior host', () => {
    const e = new HostElection('new');
    e.setMembers([m('old', 1), m('new', 2)], 0);
    expect(e.hostId).toBe('old');
    e.heard('old', 1, 500);
    e.watchdog(500 + HOST_TIMEOUT_MS);
    expect(e.hostId).toBe('old');
  });

  it('skips a ghost host that never sends anything', () => {
    const e = new HostElection('me');
    e.setMembers([m('ghost', 1), m('me', 2)], 0);
    expect(e.hostId).toBe('ghost');
    expect(e.watchdog(HOST_TIMEOUT_MS + 1)).toBe(true);
    expect(e.isHost()).toBe(true);
  });

  it('a frozen host that wakes up is ignored and yields to the newer epoch', () => {
    // "old" hosted at epoch 1, froze; "me" took over at epoch 2
    const me = new HostElection('me');
    me.setMembers([m('old', 1), m('me', 2)], 0);
    me.heard('old', 1, 0);
    me.watchdog(HOST_TIMEOUT_MS + 1);
    expect(me.isHost()).toBe(true);
    expect(me.epoch).toBe(2);
    // The old host's stale snapshots are dropped
    expect(me.heard('old', 1, HOST_TIMEOUT_MS + 100)).toBe(false);
    expect(me.isHost()).toBe(true);

    // From the old host's point of view: it hears epoch 2 and steps down
    const old = new HostElection('old');
    old.setMembers([m('old', 1), m('me', 2)], 0);
    expect(old.isHost()).toBe(true);
    expect(old.heard('me', 2, 10_000)).toBe(true);
    expect(old.isHost()).toBe(false);
    expect(old.hostId).toBe('me');
  });

  it('re-elects when the host leaves presence', () => {
    const e = new HostElection('b');
    e.setMembers([m('a', 1), m('b', 2), m('c', 3)], 0);
    expect(e.hostId).toBe('a');
    e.setMembers([m('b', 2), m('c', 3)], 100);
    expect(e.isHost()).toBe(true);
  });
});
