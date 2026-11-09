import { describe, it, expect } from 'vitest';
import { MAP_ROOMS, canHear, parseRoomEvent, roomAt, roomsForMap } from '../src/lib/world/rooms';

const ME = 'me-user';

describe('private rooms', () => {
  it('finds the boardroom and phone pods on the office map', () => {
    expect(roomAt('office', 1000, 200)?.id).toBe('office-boardroom');
    expect(roomAt('office', 1500, 120)?.id).toBe('office-pod-1');
    expect(roomAt('office', 1500, 260)?.id).toBe('office-pod-2');
    expect(roomAt('office', 300, 300)).toBeNull(); // open-plan desks
    expect(roomAt('office', 1000, 600)).toBeNull(); // lounge
  });

  it('treats rect edges as half-open', () => {
    const boardroom = MAP_ROOMS.office[0].rect;
    expect(roomAt('office', boardroom.x, boardroom.y)?.id).toBe('office-boardroom');
    expect(roomAt('office', boardroom.x + boardroom.w, boardroom.y)?.id).not.toBe('office-boardroom');
  });

  it('has rooms on every social map and none in zombie city', () => {
    for (const map of ['office', 'school', 'village', 'nightclub', 'cafe', 'arcade']) {
      expect(roomsForMap(map).length, map).toBeGreaterThan(0);
    }
    expect(roomsForMap('zombie_city')).toEqual([]);
    expect(roomsForMap(null)).toEqual(MAP_ROOMS.village);
  });

  it('keeps room ids unique and rooms from overlapping on the same map', () => {
    const ids = Object.values(MAP_ROOMS).flat().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rooms of Object.values(MAP_ROOMS)) {
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i].rect;
          const b = rooms[j].rect;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${rooms[i].id} vs ${rooms[j].id}`).toBe(false);
        }
      }
    }
  });

  it('only lets people in the same room (or both outside) hear each other', () => {
    expect(canHear(null, null)).toBe(true);
    expect(canHear('office-boardroom', 'office-boardroom')).toBe(true);
    expect(canHear('office-boardroom', null)).toBe(false);
    expect(canHear(null, 'office-boardroom')).toBe(false);
    expect(canHear('office-pod-1', 'office-pod-2')).toBe(false);
  });
});

describe('parseRoomEvent', () => {
  it('accepts well-formed lock and knock events', () => {
    expect(parseRoomEvent('room_lock', { room_id: 'office-boardroom', actor_id: 'a', locked: true }, ME)).toEqual({
      type: 'room_lock',
      roomId: 'office-boardroom',
      locked: true,
      actorId: 'a',
    });
    expect(parseRoomEvent('knock', { room_id: 'office-pod-1', actor_id: 'a', actor_name: '  Sam  ' }, ME)).toMatchObject({
      type: 'knock',
      actorName: 'Sam',
    });
  });

  it('drops events from ourselves, malformed ids and unknown types', () => {
    expect(parseRoomEvent('room_lock', { room_id: 'x', actor_id: ME, locked: true }, ME)).toBeNull();
    expect(parseRoomEvent('room_lock', { room_id: '<script>', actor_id: 'a', locked: true }, ME)).toBeNull();
    expect(parseRoomEvent('room_lock', { room_id: 'x', actor_id: 'a', locked: 'yes' }, ME)).toBeNull();
    expect(parseRoomEvent('teleport', { room_id: 'x', actor_id: 'a' }, ME)).toBeNull();
  });

  it('only accepts replies and state addressed to us', () => {
    expect(parseRoomEvent('knock_reply', { room_id: 'x', actor_id: 'a', target_id: 'someone-else', allow: true }, ME)).toBeNull();
    expect(parseRoomEvent('knock_reply', { room_id: 'x', actor_id: 'a', target_id: ME, allow: true }, ME)).toMatchObject({
      type: 'knock_reply',
      allow: true,
    });
    expect(parseRoomEvent('room_state', { room_id: 'x', actor_id: 'a', target_id: 'other', locked: true }, ME)).toBeNull();
  });

  it('caps knocker names and falls back when missing', () => {
    const long = parseRoomEvent('knock', { room_id: 'x', actor_id: 'a', actor_name: 'n'.repeat(80) }, ME);
    expect(long && long.type === 'knock' && long.actorName.length).toBe(32);
    const anon = parseRoomEvent('knock', { room_id: 'x', actor_id: 'a' }, ME);
    expect(anon && anon.type === 'knock' && anon.actorName).toBe('Someone');
  });
});
