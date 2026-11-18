// Wayfinding cues for doors and windows in Zombie Survival.
//
// - Roof markers: a closed roof hides the building's walls, so every exterior
//   door/window gets a marker on the roof edge (doorway notch + awning stub for
//   doors, a glass strip for windows), coloured by state.
// - Reach highlight: the opening your interact key will act on gets a pulsing
//   outline and a small tag naming its state.
//
// Pure helpers (entranceCue, exteriorSide) are DOM-free for tests.

import type { IconName } from '@/lib/icons';
import { drawIcon } from '../art/drawIcon';
import { Entrance, MAX_PLANKS, entranceBlocksMovement } from './entrances';
import { TileGrid, inBounds, tileIndex } from './grid';

/** Side of a tile that faces outdoors. */
export type Side = 'n' | 's' | 'e' | 'w';

export const CUE_COLORS = {
  passable: '#4ADE80',
  closed: '#FDE047',
  locked: '#F87171',
  boarded: '#C08A4E',
  glass: '#9CC9DE',
  ink: '#1E2124',
  paper: '#FFFFFF',
} as const;

export interface EntranceCue {
  /** Marker / outline colour. */
  tone: string;
  /** Short state label for the reach tag. */
  label: string;
  icon: IconName;
  /** Can be walked (or climbed) through right now. */
  passable: boolean;
}

export function entranceCue(e: Entrance): EntranceCue {
  const passable = !entranceBlocksMovement(e);
  const door = e.kind === 'door';
  switch (e.state) {
    case 'open':
      return { tone: CUE_COLORS.passable, label: 'Open', icon: door ? 'doorOpen' : 'window', passable };
    case 'broken':
      return { tone: CUE_COLORS.passable, label: door ? 'Broken' : 'Smashed', icon: door ? 'doorOpen' : 'window', passable };
    case 'locked':
      return { tone: CUE_COLORS.locked, label: 'Locked', icon: 'lock', passable };
    case 'barricaded':
      return { tone: CUE_COLORS.boarded, label: `Boarded ${e.planks}/${MAX_PLANKS}`, icon: 'hammer', passable };
    default:
      return {
        tone: door ? CUE_COLORS.closed : CUE_COLORS.glass,
        label: 'Closed',
        icon: door ? 'door' : 'window',
        passable,
      };
  }
}

/** The side of the entrance tile that opens to the outdoors, or null for interior doorways. */
export function exteriorSide(grid: TileGrid, e: Entrance): Side | null {
  const sides: [Side, number, number][] = [
    ['s', 0, 1],
    ['n', 0, -1],
    ['e', 1, 0],
    ['w', -1, 0],
  ];
  for (const [side, dc, dr] of sides) {
    const c = e.col + dc;
    const r = e.row + dr;
    if (!inBounds(grid, c, r)) continue;
    if (grid.buildingIndex[tileIndex(grid, c, r)] === 0) return side;
  }
  return null;
}

/**
 * Rect of a band along the tile's outer edge. `from`/`to` are distances
 * measured outward from that edge (negative = inside the tile), `inset` trims
 * the band's ends.
 */
function edgeBand(x: number, y: number, ts: number, side: Side, from: number, to: number, inset: number) {
  const along = ts - inset * 2;
  switch (side) {
    case 's':
      return { x: x + inset, y: y + ts + from, w: along, h: to - from };
    case 'n':
      return { x: x + inset, y: y - to, w: along, h: to - from };
    case 'e':
      return { x: x + ts + from, y: y + inset, w: to - from, h: along };
    default:
      return { x: x - to, y: y + inset, w: to - from, h: along };
  }
}

function fillBand(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(b.x, b.y, b.w, b.h);
}

/** Leaves of one opening share an id up to a `:N` suffix (double doors). */
export function entranceGroupId(e: Entrance): string {
  return e.id.replace(/:\d+$/, '');
}

const BADGE_R = 6;
/**
 * How far outside the roof edge the badge centre sits (world px): on the
 * awning, clear of roof art such as storefront signs, chimneys and HVAC units.
 */
const BADGE_OUT = 3;

/** World point for a door's roof badge: on its awning at the roof edge, centred on the opening. */
export function badgePoint(leaves: Entrance[], side: Side, ts: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const e of leaves) {
    x += (e.col + 0.5) * ts;
    y += (e.row + 0.5) * ts;
  }
  x /= leaves.length;
  y /= leaves.length;
  const d = ts / 2 + BADGE_OUT;
  if (side === 's') y += d;
  else if (side === 'n') y -= d;
  else if (side === 'e') x += d;
  else x -= d;
  return { x, y };
}

/** Round door badge on the roof (once per opening) so doors stand out from windows. */
export function drawRoofDoorBadge(ctx: CanvasRenderingContext2D, e: Entrance, at: { x: number; y: number }): void {
  const cue = entranceCue(e);
  ctx.fillStyle = CUE_COLORS.ink;
  ctx.beginPath();
  ctx.arc(at.x + 1, at.y + 1, BADGE_R + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cue.tone;
  ctx.beginPath();
  ctx.arc(at.x, at.y, BADGE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = CUE_COLORS.ink;
  ctx.lineWidth = 1;
  ctx.stroke();
  drawIcon(ctx, cue.icon, at.x, at.y, BADGE_R * 1.7, { color: CUE_COLORS.ink, strokeWidth: 2.5, pad: 0 });
}

/** Marker for one exterior door/window, drawn on top of its building's roof. */
export function drawRoofEntranceMarker(ctx: CanvasRenderingContext2D, e: Entrance, side: Side, ts: number): void {
  const x = e.col * ts;
  const y = e.row * ts;
  const cue = entranceCue(e);
  if (e.kind === 'door') {
    // Doorway notch cut into the parapet
    fillBand(ctx, edgeBand(x, y, ts, side, -7, 0, 1), CUE_COLORS.ink);
    fillBand(ctx, edgeBand(x, y, ts, side, -6, -1, 2), cue.tone);
    // Awning / step stub sticking out toward the street
    fillBand(ctx, edgeBand(x, y, ts, side, 0, 6, 0), CUE_COLORS.ink);
    fillBand(ctx, edgeBand(x, y, ts, side, 0, 5, 1), cue.tone);
    if (e.state === 'barricaded') {
      // Plank stripes across the notch
      for (const d of [-5, -3]) fillBand(ctx, edgeBand(x, y, ts, side, d, d + 1, 2), CUE_COLORS.ink);
    } else if (e.state === 'broken') {
      fillBand(ctx, edgeBand(x, y, ts, side, -6, -1, 6), CUE_COLORS.ink);
    }
  } else {
    // Window: glass strip along the parapet
    fillBand(ctx, edgeBand(x, y, ts, side, -5, 0, 2), CUE_COLORS.ink);
    fillBand(ctx, edgeBand(x, y, ts, side, -4, -1, 3), cue.tone);
    if (e.state === 'barricaded') {
      fillBand(ctx, edgeBand(x, y, ts, side, -3, -2, 3), CUE_COLORS.ink);
    } else if (e.state === 'broken') {
      fillBand(ctx, edgeBand(x, y, ts, side, -4, -1, 7), CUE_COLORS.ink);
    }
  }
}

/**
 * Pulsing outline around the opening the player can act on (every leaf of a
 * double door) plus a tag above it with the state. `pulse` is 0–1.
 */
export function drawEntranceReach(ctx: CanvasRenderingContext2D, leaves: Entrance[], ts: number, pulse: number): void {
  if (!leaves.length) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const e of leaves) {
    x0 = Math.min(x0, e.col * ts);
    y0 = Math.min(y0, e.row * ts);
    x1 = Math.max(x1, (e.col + 1) * ts);
    y1 = Math.max(y1, (e.row + 1) * ts);
  }
  const cue = entranceCue(leaves[0]);
  const w = x1 - x0;
  const h = y1 - y0;

  ctx.save();
  ctx.globalAlpha = 0.2 + 0.2 * pulse;
  ctx.fillStyle = cue.tone;
  ctx.fillRect(x0, y0, w, h);
  ctx.globalAlpha = 0.65 + 0.35 * pulse;
  ctx.strokeStyle = CUE_COLORS.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(x0 - 1.5, y0 - 1.5, w + 3, h + 3);
  ctx.strokeStyle = cue.tone;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 - 1.5, y0 - 1.5, w + 3, h + 3);

  // Tag: icon + state, Neo-brutalist chip (ink border, hard offset shadow)
  ctx.globalAlpha = 1;
  ctx.font = '700 7px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const icon = 8;
  const padX = 3;
  const tagH = 11;
  const tagW = padX * 2 + icon + 2 + ctx.measureText(cue.label).width;
  const tx = Math.round(x0 + w / 2 - tagW / 2);
  const ty = Math.round(y0 - tagH - 5);
  ctx.fillStyle = CUE_COLORS.ink;
  ctx.fillRect(tx + 1.5, ty + 1.5, tagW, tagH);
  ctx.fillStyle = CUE_COLORS.paper;
  ctx.fillRect(tx, ty, tagW, tagH);
  ctx.fillStyle = cue.tone;
  ctx.fillRect(tx, ty, 2, tagH);
  ctx.strokeStyle = CUE_COLORS.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(tx + 0.5, ty + 0.5, tagW - 1, tagH - 1);
  drawIcon(ctx, cue.icon, tx + padX + icon / 2 + 1, ty + tagH / 2, icon, { color: CUE_COLORS.ink, strokeWidth: 2.5, pad: 0.1 });
  ctx.fillStyle = CUE_COLORS.ink;
  ctx.fillText(cue.label, tx + padX + icon + 3, ty + tagH / 2 + 0.5);
  ctx.restore();
}
