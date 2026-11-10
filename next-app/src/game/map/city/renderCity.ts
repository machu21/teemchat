// ============================================================
// ZOMBIE CITY — PROCEDURAL PIXEL-ART RENDERER
// - renderCityChunk: one world-px rect of the ground layer (cacheable)
// - renderCityFloor: an upper (or ground) floor at its own origin
// - renderCityRoof:  a flat rooftop at the footprint's origin
// - renderCityProp / renderCityEntrance: per-frame dynamic bits
// All drawing is 1:1 world px with fillRect only (no images, no smoothing).
// ============================================================

import type { Rect } from '../../collision';
import { h3 } from '../../art/surfaces/floor';
import { shade } from '../../art/core/color';
import type { Entrance } from '../../zombie/entrances';
import { GROUND, type CityFurnitureKind } from './templates';
import { FT, MARK, type CityBuilding, type CityFloor, type CityPlan, type CityProp } from './types';
import { drawIcon } from '@/game/art/drawIcon';

type Ctx = CanvasRenderingContext2D;

const SEED = 0x51c7;

function fr(ctx: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
}

// ------------------------------------------------------------------ ground tiles

function drawGroundTile(ctx: Ctx, kind: number, c: number, r: number, x: number, y: number): void {
  const n = h3(c, r, kind, SEED);
  switch (kind) {
    case GROUND.GRASS: {
      fr(ctx, x, y, 16, 16, (c + r) % 2 === 0 ? '#5E9E3E' : '#62A442');
      if ((n & 7) === 0) {
        fr(ctx, x + (n >>> 4) % 12 + 2, y + (n >>> 8) % 10 + 3, 1, 3, '#7FC25A');
        fr(ctx, x + (n >>> 4) % 12 + 4, y + (n >>> 8) % 10 + 2, 1, 4, '#7FC25A');
      } else if ((n & 31) === 1) {
        fr(ctx, x + (n >>> 6) % 12 + 2, y + (n >>> 10) % 12 + 2, 2, 2, '#F2E36B');
      }
      if ((n & 3) === 2) fr(ctx, x + (n >>> 12) % 14, y + (n >>> 16) % 14, 2, 1, '#4C8A32');
      break;
    }
    case GROUND.ASPHALT:
    case GROUND.PARKING: {
      fr(ctx, x, y, 16, 16, kind === GROUND.ASPHALT ? '#3D4145' : '#4A4E52');
      for (let k = 0; k < 3; k++) {
        const v = h3(c, r, k, SEED + 1);
        fr(ctx, x + (v % 15), y + ((v >>> 8) % 15), 1, 1, (v >>> 16) & 1 ? '#4B5055' : '#33373A');
      }
      if ((n & 63) === 5) {
        fr(ctx, x + 3, y + 7, 5, 1, '#2A2D30');
        fr(ctx, x + 8, y + 8, 4, 1, '#2A2D30');
      }
      break;
    }
    case GROUND.SIDEWALK: {
      fr(ctx, x, y, 16, 16, '#B9B5AA');
      fr(ctx, x, y, 16, 1, '#A19D92');
      fr(ctx, x, y, 1, 16, '#A19D92');
      fr(ctx, x + 1, y + 1, 15, 1, '#C8C4B9');
      if ((n & 15) === 3) fr(ctx, x + 4 + (n >>> 8) % 6, y + 5 + (n >>> 12) % 6, 3, 2, '#A9A598');
      break;
    }
    case GROUND.ALLEY: {
      fr(ctx, x, y, 16, 16, '#4C4B47');
      if ((n & 7) === 1) fr(ctx, x + (n >>> 4) % 10 + 2, y + (n >>> 8) % 10 + 2, 4, 3, '#3F3E3A');
      if ((n & 15) === 4) fr(ctx, x + (n >>> 6) % 12 + 2, y + (n >>> 10) % 12 + 2, 2, 1, '#6A675E');
      break;
    }
    case GROUND.PLAZA: {
      fr(ctx, x, y, 16, 16, '#C7BCA2');
      for (let row = 0; row < 4; row++) {
        const off = row % 2 === 0 ? 0 : 4;
        fr(ctx, x, y + row * 4 + 3, 16, 1, '#B3A88E');
        fr(ctx, x + off, y + row * 4, 1, 3, '#B3A88E');
        fr(ctx, x + off + 8, y + row * 4, 1, 3, '#B3A88E');
      }
      break;
    }
    case GROUND.DIRT: {
      fr(ctx, x, y, 16, 16, '#86694A');
      for (let k = 0; k < 3; k++) {
        const v = h3(c, r, k, SEED + 2);
        fr(ctx, x + (v % 14), y + ((v >>> 8) % 14), 2, 1, (v >>> 16) & 1 ? '#977A57' : '#735A3E');
      }
      break;
    }
    case GROUND.FLOOR_WOOD: {
      fr(ctx, x, y, 16, 16, '#A9784A');
      for (let k = 0; k < 4; k++) {
        fr(ctx, x, y + k * 4 + 3, 16, 1, '#8C5F36');
        const seam = (h3(c, r * 4 + k, 0, SEED + 3) % 16);
        fr(ctx, x + seam, y + k * 4, 1, 3, '#8C5F36');
      }
      fr(ctx, x, y, 16, 1, '#B8875A');
      break;
    }
    case GROUND.FLOOR_TILE: {
      fr(ctx, x, y, 16, 16, '#E2E5E8');
      fr(ctx, x + 8, y, 8, 8, '#CDD3D8');
      fr(ctx, x, y + 8, 8, 8, '#CDD3D8');
      fr(ctx, x, y, 16, 1, '#B9C0C6');
      fr(ctx, x, y, 1, 16, '#B9C0C6');
      break;
    }
    case GROUND.FLOOR_CARPET: {
      fr(ctx, x, y, 16, 16, '#66748F');
      for (let k = 0; k < 4; k++) {
        const v = h3(c, r, k, SEED + 4);
        fr(ctx, x + (v % 15), y + ((v >>> 8) % 15), 1, 1, (v >>> 16) & 1 ? '#72809B' : '#5B6883');
      }
      break;
    }
    case GROUND.FLOOR_LINO: {
      fr(ctx, x, y, 16, 16, '#D6CFB9');
      fr(ctx, x, y, 16, 1, '#C1B9A1');
      fr(ctx, x, y, 1, 16, '#C1B9A1');
      fr(ctx, x + 8, y + 8, 1, 1, '#C1B9A1');
      break;
    }
    case GROUND.FLOOR_CONCRETE:
    default: {
      fr(ctx, x, y, 16, 16, '#9A9C9E');
      if ((n & 7) === 0) fr(ctx, x + (n >>> 4) % 12, y + (n >>> 8) % 12, 3, 2, '#8D8F91');
      break;
    }
  }
}

function drawMarks(ctx: Ctx, m: number, x: number, y: number, c: number, r: number): void {
  if (m & MARK.DASH_H && c % 3 !== 0) fr(ctx, x, y + 15, 16, 2, '#E8C33A');
  if (m & MARK.DASH_V && r % 3 !== 0) fr(ctx, x + 15, y, 2, 16, '#E8C33A');
  if (m & MARK.ZEBRA_H) {
    fr(ctx, x + 1, y + 2, 14, 4, '#E9E9E4');
    fr(ctx, x + 1, y + 10, 14, 4, '#E9E9E4');
  }
  if (m & MARK.ZEBRA_V) {
    fr(ctx, x + 2, y + 1, 4, 14, '#E9E9E4');
    fr(ctx, x + 10, y + 1, 4, 14, '#E9E9E4');
  }
}

// ------------------------------------------------------------------ walls

function drawWallTile(ctx: Ctx, x: number, y: number, top: string, face: string, openN: boolean, openS: boolean): void {
  fr(ctx, x, y, 16, 16, top);
  if (openN) fr(ctx, x, y, 16, 2, shade(top, 0.12));
  if (openS) {
    fr(ctx, x, y + 10, 16, 6, face);
    fr(ctx, x, y + 10, 16, 1, shade(face, -0.12));
    fr(ctx, x, y + 15, 16, 1, shade(face, -0.25));
  }
}

function drawWindowGlass(ctx: Ctx, x: number, y: number, horizontal: boolean): void {
  if (horizontal) {
    fr(ctx, x + 1, y + 5, 14, 6, '#4E6878');
    fr(ctx, x + 2, y + 6, 12, 4, '#9CC9DE');
    fr(ctx, x + 3, y + 6, 3, 1, '#E3F4FB');
  } else {
    fr(ctx, x + 5, y + 1, 6, 14, '#4E6878');
    fr(ctx, x + 6, y + 2, 4, 12, '#9CC9DE');
    fr(ctx, x + 6, y + 3, 1, 3, '#E3F4FB');
  }
}

function drawFence(ctx: Ctx, x: number, y: number, nb: { n: boolean; s: boolean; w: boolean; e: boolean }): void {
  const rail = '#8A6038';
  const post = '#6B4626';
  if (nb.w || nb.e || (!nb.n && !nb.s)) {
    fr(ctx, nb.w ? x : x + 6, y + 5, nb.w && nb.e ? 16 : 10, 2, rail);
    fr(ctx, nb.w ? x : x + 6, y + 10, nb.w && nb.e ? 16 : 10, 2, rail);
  }
  if (nb.n || nb.s) fr(ctx, x + 7, nb.n ? y : y + 6, 3, nb.n && nb.s ? 16 : 10, rail);
  fr(ctx, x + 6, y + 3, 4, 11, post);
  fr(ctx, x + 6, y + 3, 4, 1, '#A47A4E');
}

// ------------------------------------------------------------------ stairs & furniture

function drawStairs(ctx: Ctx, rect: Rect, up: boolean): void {
  fr(ctx, rect.x, rect.y, rect.w, rect.h, up ? '#8E8A80' : '#4E4B45');
  const steps = Math.floor(rect.h / 4);
  for (let k = 0; k < steps; k++) {
    const yy = rect.y + k * 4;
    const t = up ? 1 - k / steps : k / steps;
    fr(ctx, rect.x + 1, yy, rect.w - 2, 3, shade(up ? '#B7B2A6' : '#6E6A62', (t - 0.5) * 0.2));
    fr(ctx, rect.x + 1, yy + 3, rect.w - 2, 1, '#3A3833');
  }
  fr(ctx, rect.x, rect.y, 1, rect.h, '#3A3833');
  fr(ctx, rect.x + rect.w - 1, rect.y, 1, rect.h, '#3A3833');
  // Arrow
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const col = up ? '#F5F1E6' : '#C9C2B0';
  if (up) {
    fr(ctx, cx - 1, cy - 4, 2, 8, col);
    fr(ctx, cx - 3, cy - 2, 6, 2, col);
  } else {
    fr(ctx, cx - 1, cy - 4, 2, 8, col);
    fr(ctx, cx - 3, cy + 1, 6, 2, col);
  }
}

const FURN_COLORS: Record<CityFurnitureKind, [string, string]> = {
  bed: ['#E8E2D6', '#5677A8'],
  sofa: ['#7A5A8C', '#5E446E'],
  table: ['#9A6B3E', '#7A522C'],
  desk: ['#8C6A48', '#6A4E34'],
  counter: ['#B8B2A6', '#8E887C'],
  shelf: ['#7E5B3A', '#C9A15A'],
  fridge: ['#E6EAEE', '#AEB6BE'],
  stove: ['#3E4246', '#D0D4D8'],
  locker: ['#6A7C8E', '#4E5E6E'],
  hospitalBed: ['#F2F4F6', '#7FB3D5'],
  cabinet: ['#8B6B4A', '#6B4F34'],
  toilet: ['#F4F6F8', '#C9D1D8'],
  checkout: ['#C7C9CC', '#3E8E5A'],
  cell: ['#5A5E63', '#2E3134'],
};

function drawFurniture(ctx: Ctx, kind: CityFurnitureKind, x: number, y: number, w: number, h: number): void {
  const [base, accent] = FURN_COLORS[kind];
  // Shadow + body + top highlight + outline (Neo-ish 1px dark edge).
  fr(ctx, x + 2, y + 2, w - 2, h - 1, 'rgba(0,0,0,0.22)');
  fr(ctx, x + 1, y + 1, w - 3, h - 3, base);
  fr(ctx, x + 1, y + 1, w - 3, 2, shade(base, 0.1));
  fr(ctx, x + 1, y + h - 4, w - 3, 2, shade(base, -0.12));
  switch (kind) {
    case 'bed':
    case 'hospitalBed': {
      const vertical = h >= w;
      if (vertical) {
        fr(ctx, x + 3, y + 3, w - 7, 5, '#FFFFFF');
        fr(ctx, x + 2, y + 10, w - 5, h - 14, accent);
      } else {
        fr(ctx, x + 3, y + 3, 5, h - 7, '#FFFFFF');
        fr(ctx, x + 10, y + 2, w - 14, h - 5, accent);
      }
      break;
    }
    case 'sofa':
      if (w >= h) fr(ctx, x + 1, y + 1, w - 3, 4, accent);
      else fr(ctx, x + 1, y + 1, 4, h - 3, accent);
      break;
    case 'shelf':
      for (let k = 4; k < Math.max(w, h) - 4; k += 5) {
        if (w >= h) fr(ctx, x + k, y + 3, 3, h - 7, accent);
        else fr(ctx, x + 3, y + k, w - 7, 3, accent);
      }
      break;
    case 'desk':
      fr(ctx, x + 4, y + 3, 8, 5, '#2E3238');
      fr(ctx, x + 5, y + 4, 6, 3, '#6FA8DC');
      break;
    case 'stove':
      fr(ctx, x + 3, y + 3, 4, 4, accent);
      fr(ctx, x + 8, y + 7, 4, 4, accent);
      break;
    case 'fridge':
      fr(ctx, x + w - 5, y + 4, 1, 6, accent);
      break;
    case 'checkout':
      fr(ctx, x + 3, y + 3, 6, 6, '#2E3238');
      fr(ctx, x + 10, y + 4, w - 14, 4, accent);
      break;
    case 'toilet':
      fr(ctx, x + 4, y + 5, 7, 7, accent);
      break;
    case 'cell':
      for (let k = 2; k < w - 2; k += 4) fr(ctx, x + k, y + 1, 1, h - 3, '#A9AEB3');
      break;
    case 'locker':
      for (let k = 3; k < w - 3; k += 6) fr(ctx, x + k, y + 3, 1, h - 7, accent);
      break;
    default:
      fr(ctx, x + 3, y + 3, w - 7, 1, accent);
  }
  fr(ctx, x, y, w - 1, 1, 'rgba(0,0,0,0.35)');
}

function drawFloorDetails(ctx: Ctx, f: CityFloor, dx: number, dy: number): void {
  if (f.up) drawStairs(ctx, { ...f.up.rect, x: f.up.rect.x + dx, y: f.up.rect.y + dy }, true);
  if (f.down) drawStairs(ctx, { ...f.down.rect, x: f.down.rect.x + dx, y: f.down.rect.y + dy }, false);
  for (const fu of f.furniture) drawFurniture(ctx, fu.kind, fu.x + dx, fu.y + dy, fu.w, fu.h);
}

// ------------------------------------------------------------------ public API

/**
 * Draws one world-px rect of the city ground layer: terrain, road markings,
 * ground-floor interiors (floors, stairs, furniture) and walls/fences.
 * The ctx is translated so `rect`'s top-left is the origin (1:1 world px).
 * Doors and windows are left as open thresholds — draw them per frame with
 * `renderCityEntrance` so state changes never invalidate cached chunks.
 */
export function renderCityChunk(ctx: Ctx, plan: CityPlan, rect: Rect): void {
  const T = plan.tile;
  const c0 = Math.max(0, Math.floor(rect.x / T));
  const r0 = Math.max(0, Math.floor(rect.y / T));
  const c1 = Math.min(plan.cols - 1, Math.ceil((rect.x + rect.w) / T) - 1);
  const r1 = Math.min(plan.rows - 1, Math.ceil((rect.y + rect.h) / T) - 1);
  ctx.save();
  ctx.translate(-rect.x, -rect.y);
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * plan.cols + c;
      drawGroundTile(ctx, plan.ground[i], c, r, c * T, r * T);
      if (plan.marks[i]) drawMarks(ctx, plan.marks[i], c * T, r * T, c, r);
    }
  }

  for (const b of plan.buildings) {
    const fp = b.footprint;
    if (fp.x >= rect.x + rect.w || fp.x + fp.w <= rect.x || fp.y >= rect.y + rect.h || fp.y + fp.h <= rect.y) continue;
    drawFloorDetails(ctx, b.floors[0], 0, 0);
  }

  const owner = (c: number, r: number) => (c < 0 || r < 0 || c >= plan.cols || r >= plan.rows ? -2 : plan.wallOwner[r * plan.cols + c]);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const o = owner(c, r);
      if (o === 0) continue;
      const x = c * T;
      const y = r * T;
      if (o === -1) {
        drawFence(ctx, x, y, { n: owner(c, r - 1) === -1, s: owner(c, r + 1) === -1, w: owner(c - 1, r) === -1, e: owner(c + 1, r) === -1 });
      } else if (o === -2) {
        drawWallTile(ctx, x, y, '#5B5F63', '#3F4246', owner(c, r - 1) !== -2, owner(c, r + 1) !== -2);
      } else {
        const b = plan.buildings[o - 1];
        drawWallTile(ctx, x, y, b.color, b.wallFace, owner(c, r - 1) <= 0, owner(c, r + 1) <= 0);
      }
    }
  }
  ctx.restore();
}

/**
 * Draws one floor of a building with the ctx origin at the floor's
 * `bounds` top-left (1:1 world px). Works for the ground floor too (doors
 * are drawn as thresholds there).
 */
export function renderCityFloor(ctx: Ctx, plan: CityPlan, building: CityBuilding, floorIndex: number): void {
  const f = building.floors[floorIndex];
  if (!f) return;
  const T = plan.tile;
  const at = (c: number, r: number) => (c < 0 || r < 0 || c >= f.cols || r >= f.rows ? -1 : f.tiles[r * f.cols + c]);
  const solid = (v: number) => v === FT.WALL || v === FT.WINDOW;
  const gc = Math.floor(f.bounds.x / T);
  const gr = Math.floor(f.bounds.y / T);
  for (let r = 0; r < f.rows; r++) {
    for (let c = 0; c < f.cols; c++) {
      const v = at(c, r);
      const x = c * T;
      const y = r * T;
      if (!solid(v)) {
        drawGroundTile(ctx, building.floorKind, gc + c, gr + r, x, y);
        continue;
      }
      drawWallTile(ctx, x, y, building.color, building.wallFace, !solid(at(c, r - 1)), !solid(at(c, r + 1)));
      if (v === FT.WINDOW) drawWindowGlass(ctx, x, y, r === 0 || r === f.rows - 1);
    }
  }
  drawFloorDetails(ctx, f, -f.bounds.x, -f.bounds.y);
}

/** Flat rooftop drawn procedurally, origin at the footprint's top-left (1:1 world px). */
export function renderCityRoof(ctx: Ctx, building: CityBuilding): void {
  const { w, h } = building.footprint;
  const seed = building.index * 7919;
  const base = building.roofColor;
  if (building.kind === 'house') {
    // Low hip roof: two shingled halves with a ridge.
    const mid = Math.floor(h / 2);
    fr(ctx, 0, 0, w, mid, shade(base, 0.08));
    fr(ctx, 0, mid, w, h - mid, shade(base, -0.06));
    for (let y = 3; y < h; y += 4) {
      const off = (y >> 2) % 2 === 0 ? 0 : 4;
      fr(ctx, 0, y, w, 1, shade(base, -0.16));
      for (let x = off; x < w; x += 8) fr(ctx, x, y - 3, 1, 3, shade(base, -0.12));
    }
    fr(ctx, 4, mid - 1, w - 8, 3, shade(base, -0.25));
    fr(ctx, 4, mid - 1, w - 8, 1, shade(base, 0.2));
    const chimney = (h3(seed, 1, 0, SEED) % Math.max(1, w - 28)) + 8;
    fr(ctx, chimney, mid - 14, 10, 12, '#8E4B3A');
    fr(ctx, chimney, mid - 14, 10, 2, '#B0614B');
  } else {
    fr(ctx, 0, 0, w, h, base);
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        const v = h3(x, y, seed, SEED + 9);
        if ((v & 3) === 0) fr(ctx, x + (v >>> 4) % 3, y + (v >>> 6) % 3, 1, 1, shade(base, (v >>> 8) & 1 ? 0.1 : -0.1));
      }
    }
    // HVAC units
    const units = 1 + (h3(seed, 2, 0, SEED) % 3);
    for (let k = 0; k < units; k++) {
      const v = h3(seed, k, 3, SEED);
      const ux = 12 + (v % Math.max(1, w - 48));
      const uy = 12 + ((v >>> 10) % Math.max(1, h - 40));
      fr(ctx, ux + 2, uy + 2, 26, 18, 'rgba(0,0,0,0.25)');
      fr(ctx, ux, uy, 26, 18, '#9EA4AA');
      fr(ctx, ux, uy, 26, 2, '#C3C8CD');
      fr(ctx, ux + 13, uy + 4, 10, 10, '#5E646A');
      fr(ctx, ux + 15, uy + 8, 6, 2, '#9EA4AA');
      fr(ctx, ux + 3, uy + 5, 7, 1, '#7A8086');
      fr(ctx, ux + 3, uy + 8, 7, 1, '#7A8086');
      fr(ctx, ux + 3, uy + 11, 7, 1, '#7A8086');
    }
    if (building.kind === 'hospital') {
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      fr(ctx, cx - 28, cy - 28, 56, 56, '#3E8E5A');
      fr(ctx, cx - 26, cy - 26, 52, 52, '#4FA36B');
      fr(ctx, cx - 14, cy - 16, 6, 32, '#F4F6F8');
      fr(ctx, cx + 8, cy - 16, 6, 32, '#F4F6F8');
      fr(ctx, cx - 8, cy - 3, 16, 6, '#F4F6F8');
    }
    if (building.kind === 'gasStation') {
      fr(ctx, 0, 0, w, 6, '#F4F6F8');
      fr(ctx, 0, 6, w, 3, '#C0392B');
    }
  }
  // Roof hatch over the stairwell.
  if (building.stairwell) {
    const sx = building.stairwell.x - building.footprint.x + 8;
    const sy = building.stairwell.y - building.footprint.y + 4;
    fr(ctx, sx, sy, 20, 16, '#4E5359');
    fr(ctx, sx + 2, sy + 2, 16, 12, '#6E747A');
    fr(ctx, sx + 2, sy + 2, 16, 2, '#8E949A');
  }
  // Parapet
  const lip = shade(base, 0.22);
  const dark = shade(base, -0.3);
  fr(ctx, 0, 0, w, 3, lip);
  fr(ctx, 0, h - 3, w, 3, dark);
  fr(ctx, 0, 0, 3, h, lip);
  fr(ctx, w - 3, 0, 3, h, dark);
  fr(ctx, 3, 3, w - 6, 1, dark);
  fr(ctx, 0, 0, w, 1, '#1E2124');
  fr(ctx, 0, h - 1, w, 1, '#1E2124');
  fr(ctx, 0, 0, 1, h, '#1E2124');
  fr(ctx, w - 1, 0, 1, h, '#1E2124');
  if (building.sign) drawStorefrontSign(ctx, building, w, h);
}

/**
 * Store sign on the street edge of the roof: a bold coloured board with the
 * icon and name, readable from the street at any zoom. Convenience stores add
 * a red-and-white awning stripe so the corner shop is spotted at a glance.
 */
function drawStorefrontSign(ctx: Ctx, building: CityBuilding, w: number, h: number): void {
  const sign = building.sign;
  if (!sign) return;
  const boardH = 18;
  const front = building.facing === 'n';
  const y = front ? 6 : h - 6 - boardH;
  if (building.kind === 'convenience') {
    const sy = front ? y + boardH + 2 : y - 8;
    for (let x = 4; x < w - 4; x += 8) fr(ctx, x, sy, 4, 6, '#DC2626');
    for (let x = 8; x < w - 4; x += 8) fr(ctx, x, sy, 4, 6, '#F8FAFC');
  }
  // Big icon roundel mid-roof so the store type reads from a distance (the hospital has its cross)
  if (building.kind !== 'hospital') {
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2) + (front ? 8 : -8);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 3, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.arc(cx, cy, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sign.color;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawIcon(ctx, sign.icon, cx, cy, 20, { color: '#FFFFFF', strokeWidth: 2.4 });
  }
  fr(ctx, 5, y + 2, w - 8, boardH, 'rgba(0,0,0,0.35)'); // drop shadow
  fr(ctx, 3, y, w - 8, boardH, '#18181B');
  fr(ctx, 5, y + 2, w - 12, boardH - 4, sign.color);
  fr(ctx, 5, y + 2, w - 12, 1, 'rgba(255,255,255,0.35)');
  // Fit the label: shrink, then truncate with an ellipsis
  const iconPx = Math.max(8, Math.min(14, boardH - 6));
  const maxW = w - 18 - iconPx - 3;
  let size = 11;
  let label = sign.text;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const font = (px: number) => `800 ${px}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.font = font(size);
  while (size > 7 && ctx.measureText(label).width > maxW) ctx.font = font(--size);
  while (label.length > 4 && ctx.measureText(label).width > maxW) label = `${label.slice(0, -2)}…`;
  // Icon + name, centred together on the board
  const textW = ctx.measureText(label).width;
  const left = w / 2 - 1 - (iconPx + 3 + textW) / 2;
  ctx.textAlign = 'left';
  drawIcon(ctx, sign.icon, left + iconPx / 2 + 1, y + boardH / 2 + 1, iconPx, { color: '#18181B', strokeWidth: 2.6 });
  drawIcon(ctx, sign.icon, left + iconPx / 2, y + boardH / 2, iconPx, { color: '#FFFFFF', strokeWidth: 2.6 });
  ctx.fillStyle = '#18181B';
  ctx.fillText(label, left + iconPx + 3 + 1, y + boardH / 2 + 1);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, left + iconPx + 3, y + boardH / 2);
  ctx.restore();
}

const CAR_COLORS = ['#C0392B', '#2E86C1', '#F1C40F', '#7F8C8D', '#27AE60', '#ECF0F1', '#1F2D44', '#F4F6F8'];

/**
 * Draws a city-only prop (car, dumpster, fuelPump, trashCan) at world px.
 * Existing `FurnitureType` props are drawn by FurnitureEntity — returns false for those.
 */
export function renderCityProp(ctx: Ctx, p: CityProp): boolean {
  const { x, y } = p;
  switch (p.type) {
    case 'car': {
      const body = CAR_COLORS[(p.variant ?? 0) % CAR_COLORS.length];
      const v = p.dir === 'v';
      const w = v ? 28 : 48;
      const h = v ? 48 : 28;
      fr(ctx, x + 2, y + 3, w, h, 'rgba(0,0,0,0.28)');
      fr(ctx, x, y, w, h, '#1E2124');
      fr(ctx, x + 1, y + 1, w - 2, h - 2, body);
      fr(ctx, x + 1, y + 1, w - 2, 2, shade(body, 0.15));
      // Windscreen + roof
      if (v) {
        fr(ctx, x + 4, y + 10, w - 8, 8, '#2C3E50');
        fr(ctx, x + 4, y + 30, w - 8, 6, '#2C3E50');
        fr(ctx, x + 4, y + 18, w - 8, 12, shade(body, -0.1));
      } else {
        fr(ctx, x + 30, y + 4, 8, h - 8, '#2C3E50');
        fr(ctx, x + 12, y + 4, 6, h - 8, '#2C3E50');
        fr(ctx, x + 18, y + 4, 12, h - 8, shade(body, -0.1));
      }
      if (p.variant === 6 || p.variant === 7) {
        const lx = v ? x + 6 : x + 21;
        const ly = v ? y + 22 : y + 6;
        fr(ctx, lx, ly, v ? 8 : 3, v ? 3 : 8, '#E74C3C');
        fr(ctx, lx + (v ? 8 : 0), ly + (v ? 0 : 8), v ? 8 : 3, v ? 3 : 8, '#3498DB');
      }
      return true;
    }
    case 'dumpster':
      fr(ctx, x + 2, y + 3, 32, 20, 'rgba(0,0,0,0.25)');
      fr(ctx, x, y, 32, 20, '#1F3A2A');
      fr(ctx, x + 1, y + 1, 30, 18, '#2F6B45');
      fr(ctx, x + 1, y + 1, 30, 5, '#3C8457');
      fr(ctx, x + 4, y + 9, 24, 1, '#24533A');
      return true;
    case 'fuelPump':
      fr(ctx, x + 2, y + 3, 16, 24, 'rgba(0,0,0,0.25)');
      fr(ctx, x, y, 16, 24, '#1E2124');
      fr(ctx, x + 1, y + 1, 14, 22, '#D9DDE1');
      fr(ctx, x + 1, y + 1, 14, 5, '#C0392B');
      fr(ctx, x + 4, y + 8, 8, 5, '#2C3E50');
      fr(ctx, x + 12, y + 14, 3, 6, '#2E3238');
      return true;
    case 'trashCan':
      fr(ctx, x + 1, y + 2, 12, 12, 'rgba(0,0,0,0.25)');
      fr(ctx, x, y, 12, 12, '#2E3238');
      fr(ctx, x + 1, y + 1, 10, 10, '#6E767E');
      fr(ctx, x + 1, y + 1, 10, 3, '#8E969E');
      return true;
    default:
      return false;
  }
}

/** Draws a door/window in its current state at its world tile. Call per frame (or on change). */
export function renderCityEntrance(ctx: Ctx, plan: CityPlan, e: Entrance): void {
  const T = plan.tile;
  const x = e.col * T;
  const y = e.row * T;
  const o = (c: number, r: number) => (c < 0 || r < 0 || c >= plan.cols || r >= plan.rows ? 0 : plan.wallOwner[r * plan.cols + c]);
  const horizontal = o(e.col - 1, e.row) > 0 || o(e.col + 1, e.row) > 0;
  if (e.kind === 'window') {
    if (e.state === 'broken') {
      fr(ctx, horizontal ? x : x + 5, horizontal ? y + 5 : y, horizontal ? 16 : 6, horizontal ? 6 : 16, '#4E6878');
      fr(ctx, x + 4, y + 6, 2, 2, '#9CC9DE');
      fr(ctx, x + 10, y + 8, 2, 2, '#9CC9DE');
    } else {
      drawWindowGlass(ctx, x, y, horizontal);
      if (e.state === 'open') fr(ctx, horizontal ? x + 2 : x + 6, horizontal ? y + 6 : y + 2, horizontal ? 6 : 4, horizontal ? 4 : 6, '#3B5566');
    }
  } else if (e.state === 'open') {
    // Door swung inward: thin leaf along one jamb.
    fr(ctx, x, y, horizontal ? 3 : 16, horizontal ? 16 : 3, '#6B4626');
  } else if (e.state === 'broken') {
    fr(ctx, x + 1, y + 6, 6, 3, '#6B4626');
    fr(ctx, x + 9, y + 10, 5, 3, '#6B4626');
  } else {
    fr(ctx, x, y, 16, 16, '#4A2F18');
    fr(ctx, x + 1, y + 1, 14, 14, '#8A5A30');
    fr(ctx, x + 2, y + 2, 12, 2, '#A06C3E');
    fr(ctx, horizontal ? x + 11 : x + 7, horizontal ? y + 7 : y + 11, 2, 2, e.state === 'locked' ? '#C0392B' : '#E8C33A');
  }
  if (e.state === 'barricaded') {
    for (let k = 0; k < e.planks; k++) {
      const py = y + 2 + k * 3;
      fr(ctx, x - 1, py, 18, 3, '#7A5230');
      fr(ctx, x - 1, py, 18, 1, '#9C6E44');
    }
  }
}
