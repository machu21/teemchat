/**
 * Private rooms: preset areas on each map where voice and screen shares stay inside,
 * and which occupants can lock (outsiders knock to enter).
 *
 * Pure module (no DOM / canvas) so the page, the game loop and tests share it.
 * Rects are world px and mirror each map's getCurrentZone() boundaries in
 * game/map/mapRegistry.ts (maps are 1680×1080 with 32px perimeter walls).
 */

import { FocusTimerState, parseTimerPayload } from './focusTimer';
import type { IconName } from '@/lib/icons';

export interface RoomRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomKind = 'meeting' | 'pod' | 'classroom' | 'lounge';

export interface RoomDefinition {
  id: string;
  name: string;
  icon: IconName;
  kind: RoomKind;
  rect: RoomRect;
}

const r = (x: number, y: number, w: number, h: number): RoomRect => ({ x, y, w, h });

export const MAP_ROOMS: Record<string, RoomDefinition[]> = {
  office: [
    { id: 'office-boardroom', name: 'Boardroom', icon: 'presentation', kind: 'meeting', rect: r(760, 32, 600, 458) },
    { id: 'office-pod-1', name: 'Phone Pod 1', icon: 'smartphone', kind: 'pod', rect: r(1416, 86, 168, 110) },
    { id: 'office-pod-2', name: 'Phone Pod 2', icon: 'smartphone', kind: 'pod', rect: r(1416, 226, 168, 110) },
    { id: 'office-pod-3', name: 'Phone Pod 3', icon: 'smartphone', kind: 'pod', rect: r(1416, 366, 168, 110) },
  ],
  school: [
    { id: 'school-classroom', name: 'Classroom 101', icon: 'book', kind: 'classroom', rect: r(32, 32, 708, 458) },
    { id: 'school-library', name: 'Library', icon: 'library', kind: 'meeting', rect: r(32, 580, 708, 468) },
  ],
  village: [
    { id: 'village-cottage', name: 'Cottage', icon: 'house', kind: 'lounge', rect: r(96, 64, 160, 116) },
    { id: 'village-townhall', name: 'Town Hall', icon: 'landmark', kind: 'meeting', rect: r(320, 48, 208, 124) },
  ],
  nightclub: [
    { id: 'nightclub-vip', name: 'VIP Lounge', icon: 'wine', kind: 'lounge', rect: r(760, 32, 600, 708) },
  ],
  cafe: [
    { id: 'cafe-fireplace', name: 'Fireplace Nook', icon: 'flame', kind: 'lounge', rect: r(760, 32, 600, 458) },
    { id: 'cafe-study', name: 'Study Nook', icon: 'book', kind: 'meeting', rect: r(32, 490, 728, 558) },
  ],
  arcade: [
    { id: 'arcade-lan', name: 'LAN Party Nook', icon: 'gamepad', kind: 'lounge', rect: r(1360, 32, 288, 1016) },
  ],
};

export function roomsForMap(mapTheme: string | null | undefined): RoomDefinition[] {
  return MAP_ROOMS[mapTheme || 'village'] || [];
}

export function rectContains(rect: RoomRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/** Room containing the point (an avatar's centre), or null when out in the open. */
export function roomAt(mapTheme: string | null | undefined, x: number, y: number): RoomDefinition | null {
  for (const room of roomsForMap(mapTheme)) {
    if (rectContains(room.rect, x, y)) return room;
  }
  return null;
}

export function roomById(mapTheme: string | null | undefined, id: string): RoomDefinition | null {
  return roomsForMap(mapTheme).find((room) => room.id === id) || null;
}

/**
 * Audio stays inside rooms: you hear someone only when you are both in the same
 * room, or both out in the open. Room ids (null = open area).
 */
export function canHear(myRoomId: string | null, peerRoomId: string | null): boolean {
  return myRoomId === peerRoomId;
}

// ── Room events (lock / knock / focus timer / notes) carried over the world broadcast channel ──


export type RoomEvent =
  | { type: 'room_lock'; roomId: string; locked: boolean; actorId: string }
  | {
      type: 'room_state';
      roomId: string;
      locked: boolean;
      actorId: string;
      targetId: string;
      /** Current focus timer in the room (undefined = sender didn't say). */
      timer?: FocusTimerState | null;
      notesOn?: boolean;
      sentAt?: number;
    }
  | { type: 'knock'; roomId: string; actorId: string; actorName: string }
  | { type: 'knock_reply'; roomId: string; actorId: string; targetId: string; allow: boolean }
  | { type: 'focus_timer'; roomId: string; actorId: string; timer: FocusTimerState | null; sentAt: number }
  | { type: 'notes_state'; roomId: string; actorId: string; actorName: string; on: boolean };

export type RoomEventName = 'room_lock' | 'room_state' | 'knock' | 'knock_reply' | 'focus_timer' | 'notes_state';
export const ROOM_EVENT_NAMES: readonly RoomEventName[] = [
  'room_lock',
  'room_state',
  'knock',
  'knock_reply',
  'focus_timer',
  'notes_state',
];

const ID = /^[a-z0-9-]{1,48}$/;

/**
 * Validates an inbound room broadcast. Payloads are client-supplied, so anything
 * malformed, unknown, or addressed to someone else is dropped (returns null).
 */
export function parseRoomEvent(event: string, data: Record<string, unknown>, selfUserId: string): RoomEvent | null {
  const roomId = data.room_id;
  const actorId = data.actor_id;
  if (typeof roomId !== 'string' || !ID.test(roomId)) return null;
  if (typeof actorId !== 'string' || !actorId || actorId === selfUserId) return null;

  switch (event) {
    case 'room_lock':
      if (typeof data.locked !== 'boolean') return null;
      return { type: 'room_lock', roomId, locked: data.locked, actorId };
    case 'room_state': {
      if (typeof data.locked !== 'boolean' || data.target_id !== selfUserId) return null;
      const out: RoomEvent = { type: 'room_state', roomId, locked: data.locked, actorId, targetId: selfUserId };
      if ('timer' in data) {
        const timer = parseTimerPayload(data.timer);
        if (timer !== undefined && (timer === null || timer.roomId === roomId)) out.timer = timer;
      }
      if (typeof data.notes_on === 'boolean') out.notesOn = data.notes_on;
      if (typeof data.sent_at === 'number' && Number.isFinite(data.sent_at)) out.sentAt = data.sent_at;
      return out;
    }
    case 'focus_timer': {
      const timer = parseTimerPayload(data.timer);
      const sentAt = Number(data.sent_at);
      if (timer === undefined || !Number.isFinite(sentAt)) return null;
      if (timer && timer.roomId !== roomId) return null;
      return { type: 'focus_timer', roomId, actorId, timer, sentAt };
    }
    case 'notes_state': {
      if (typeof data.on !== 'boolean') return null;
      const name = typeof data.actor_name === 'string' ? data.actor_name.trim().slice(0, 32) : '';
      return { type: 'notes_state', roomId, actorId, actorName: name || 'Someone', on: data.on };
    }
    case 'knock': {
      const name = typeof data.actor_name === 'string' ? data.actor_name.trim().slice(0, 32) : '';
      return { type: 'knock', roomId, actorId, actorName: name || 'Someone' };
    }
    case 'knock_reply':
      if (typeof data.allow !== 'boolean' || data.target_id !== selfUserId) return null;
      return { type: 'knock_reply', roomId, actorId, targetId: selfUserId, allow: data.allow };
    default:
      return null;
  }
}

/** How long a "let in" pass lasts once granted. */
export const KNOCK_PASS_MS = 30_000;
