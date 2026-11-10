/**
 * Placed objects players can walk up to and open (E / tap): whiteboards,
 * task boards and sticky notes. Pure, shared by the game loop and the page.
 */

import type { IconName } from '@/lib/icons';

export type InteractableType = 'whiteboard' | 'taskBoard' | 'stickyNote';

export interface ObjectRef {
  id: string;
  type: InteractableType;
}

export interface InteractableDef {
  /** Prompt / button text. */
  label: string;
  icon: IconName;
  /** How close (px, from the object's base) the player must be. */
  reach: number;
}

export const INTERACTABLES: Record<InteractableType, InteractableDef> = {
  whiteboard: { label: 'Open whiteboard', icon: 'presentation', reach: 60 },
  taskBoard: { label: 'Open task board', icon: 'clipboardList', reach: 60 },
  stickyNote: { label: 'Read note', icon: 'stickyNote', reach: 48 },
};

export function isInteractableType(value: unknown): value is InteractableType {
  return value === 'whiteboard' || value === 'taskBoard' || value === 'stickyNote';
}

const OBJECT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Default props and unsaved placements have local ids; only saved objects can be opened. */
export function isPersistedObjectId(id: string): boolean {
  return OBJECT_UUID.test(id);
}

// ── Sticky notes ──

export const NOTE_COLORS = ['#FDE047', '#F9A8D4', '#86EFAC', '#93C5FD', '#FDBA74'] as const;
export const NOTE_MAX_CHARS = 200;

export interface StickyNoteProps {
  text: string;
  color: string;
}

/** Reads note properties from world_objects.properties (client-supplied, so validated). */
export function parseStickyNote(props: Record<string, unknown> | undefined | null): StickyNoteProps {
  const text = typeof props?.text === 'string' ? props.text.slice(0, NOTE_MAX_CHARS) : '';
  const color =
    typeof props?.color === 'string' && (NOTE_COLORS as readonly string[]).includes(props.color)
      ? props.color
      : NOTE_COLORS[0];
  return { text, color };
}

/** Greedy word wrap for the tiny canvas note (character budget per line). */
export function wrapNoteText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const w = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = w;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }
  return lines;
}
