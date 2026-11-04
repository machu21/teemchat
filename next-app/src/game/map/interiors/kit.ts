// ============================================================
// INTERIOR PIXEL-ART KIT (top-down 3/4 apartment style)
// - Thick light wall caps with dark outlines, tinted wall faces
// - Warm plank floors, tiled wet rooms, terracotta balconies
// - Every piece draws in the map's internal 8px grid (ctx is scaled 2x)
// ============================================================

export const PAL = {
  outline: '#3A3F4B',
  outlineSoft: '#5B6472',
  cap: '#E9EDF1',
  capShade: '#C9D0D8',
  faceBlue: '#A9D6EC',
  faceBlueTrim: '#D3ECF7',
  faceWhite: '#F1F3F5',
  faceWhiteTrim: '#FFFFFF',
  faceCream: '#EFE3C8',
  faceCreamTrim: '#FBF4E2',
  baseboard: '#7C8A99',
  wood: '#D9A35F',
  woodLight: '#E8BC7A',
  woodLine: '#B57E3E',
  woodSeam: '#A66C30',
  darkWood: '#8A5A2B',
  darkWoodLight: '#A8743F',
  tileWhite: '#E5E7EB',
  tileGrout: '#C7CBD1',
  tileBlue: '#DCEFF7',
  tileBlueGrout: '#B3D6E6',
  terracotta: '#C8643A',
  terracottaGrout: '#9C4A2A',
  leaf: '#5DAA4A',
  leafDark: '#3C7F33',
  leafLight: '#8FD16F',
  pot: '#E4E4E4',
  potShade: '#B8B8B8',
  glass: 'rgba(186, 230, 253, 0.55)',
  glassEdge: '#7DD3FC',
  linen: '#F8FAFC',
  linenShade: '#D9DEE5',
  metal: '#B8C0CA',
  metalDark: '#7E8894',
};

export type Ctx = CanvasRenderingContext2D;

export function px(ctx: Ctx, x: number, y: number, w: number, h: number, col: string) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = col;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

/** Filled box with a 1px dark outline. */
export function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, outline: string = PAL.outline) {
  px(ctx, x, y, w, h, outline);
  px(ctx, x + 1, y + 1, w - 2, h - 2, fill);
}

/** Box with a lighter top highlight and darker bottom lip (simple 3/4 volume). */
export function block(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, light: string, dark: string) {
  box(ctx, x, y, w, h, fill);
  px(ctx, x + 1, y + 1, w - 2, 1, light);
  px(ctx, x + 1, y + h - 3, w - 2, 2, dark);
}

// ── FLOORS ─────────────────────────────────────────────────

export function plankFloor(ctx: Ctx, x: number, y: number, w: number, h: number) {
  px(ctx, x, y, w, h, PAL.wood);
  const plankH = 5;
  for (let yy = y; yy < y + h; yy += plankH) {
    px(ctx, x, yy, w, 1, PAL.woodLight);
    px(ctx, x, yy + plankH - 1, w, 1, PAL.woodLine);
    const row = Math.floor((yy - y) / plankH);
    for (let xx = x + ((row * 11) % 24); xx < x + w; xx += 24) {
      px(ctx, xx, yy, 1, plankH, PAL.woodSeam);
    }
  }
}

export function tileFloor(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, grout: string, size: number = 6) {
  px(ctx, x, y, w, h, base);
  for (let yy = y; yy < y + h; yy += size) px(ctx, x, yy, w, 1, grout);
  for (let xx = x; xx < x + w; xx += size) px(ctx, xx, y, 1, h, grout);
}

export function checkerFloor(ctx: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, size: number = 8) {
  for (let yy = y; yy < y + h; yy += size) {
    for (let xx = x; xx < x + w; xx += size) {
      const even = (Math.floor((xx - x) / size) + Math.floor((yy - y) / size)) % 2 === 0;
      px(ctx, xx, yy, Math.min(size, x + w - xx), Math.min(size, y + h - yy), even ? a : b);
    }
  }
  // Soft sheen line on each tile row
  for (let yy = y + 1; yy < y + h; yy += size) px(ctx, x, yy, w, 1, 'rgba(255, 255, 255, 0.12)');
}

export function rug(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, border: string) {
  box(ctx, x, y, w, h, border);
  px(ctx, x + 2, y + 2, w - 4, h - 4, base);
  px(ctx, x + 4, y + 4, w - 8, 1, border);
  px(ctx, x + 4, y + h - 5, w - 8, 1, border);
}

// ── WALLS ──────────────────────────────────────────────────

export interface ShellOptions {
  /** North wall face colour + its top trim. */
  face: string;
  faceTrim: string;
  /** Side wall thickness, south wall thickness, north wall height (internal px). */
  side: number;
  south: number;
  north: number;
  /** Open doorway in the south wall. */
  door?: { x: number; w: number };
  /** Glass balcony railing segment in the south wall (replaces the solid cap). */
  glass?: { x: number; w: number };
}

/** Outer walls of a room/building: north face + caps on west, east and south. */
export function wallShell(ctx: Ctx, ox: number, oy: number, w: number, h: number, o: ShellOptions) {
  const capH = 4;
  // North wall: cap + tinted face + baseboard
  px(ctx, ox, oy, w, capH, PAL.cap);
  px(ctx, ox, oy, w, 1, PAL.outline);
  px(ctx, ox, oy + capH - 1, w, 1, PAL.outlineSoft);
  px(ctx, ox, oy + capH, w, o.north - capH, o.face);
  px(ctx, ox, oy + capH, w, 1, o.faceTrim);
  px(ctx, ox, oy + o.north - 2, w, 2, PAL.baseboard);

  // West + east caps
  const sideCap = (sx: number) => {
    px(ctx, sx, oy, o.side, h, PAL.cap);
    px(ctx, sx, oy, 1, h, PAL.outline);
    px(ctx, sx + o.side - 1, oy, 1, h, PAL.outline);
    px(ctx, sx + 1, oy + 1, o.side - 2, 1, PAL.faceWhiteTrim);
  };
  sideCap(ox);
  sideCap(ox + w - o.side);

  // South cap (with optional doorway / glass rail)
  const sy = oy + h - o.south;
  const southCap = (x0: number, x1: number) => {
    px(ctx, x0, sy, x1 - x0, o.south, PAL.cap);
    px(ctx, x0, sy, x1 - x0, 1, PAL.outline);
    px(ctx, x0, sy + o.south - 1, x1 - x0, 1, PAL.outline);
    px(ctx, x0, sy + 1, x1 - x0, 1, PAL.faceWhiteTrim);
  };
  const gaps = [o.door, o.glass].filter((g): g is { x: number; w: number } => !!g).sort((a, b) => a.x - b.x);
  let cursor = ox;
  for (const g of gaps) {
    southCap(cursor, ox + g.x);
    cursor = ox + g.x + g.w;
  }
  southCap(cursor, ox + w);

  if (o.door) {
    const dx = ox + o.door.x;
    px(ctx, dx, sy, o.door.w, o.south, PAL.capShade);
    px(ctx, dx, sy, o.door.w, 1, PAL.linen);
    px(ctx, dx - 1, sy - 2, 1, o.south + 2, PAL.outline);
    px(ctx, dx + o.door.w, sy - 2, 1, o.south + 2, PAL.outline);
  }
  if (o.glass) glassRail(ctx, ox + o.glass.x, sy, o.glass.w, o.south);
}

/** Interior partition wall seen from above (3px cap). */
export function partitionV(ctx: Ctx, x: number, y: number, h: number) {
  px(ctx, x, y, 3, h, PAL.cap);
  px(ctx, x, y, 1, h, PAL.outline);
  px(ctx, x + 2, y, 1, h, PAL.outline);
  px(ctx, x, y + h - 1, 3, 1, PAL.outline);
}

export function partitionH(ctx: Ctx, x: number, y: number, w: number, face: string = PAL.faceWhite) {
  px(ctx, x, y, w, 3, PAL.cap);
  px(ctx, x, y, w, 1, PAL.outline);
  px(ctx, x, y + 2, w, 1, PAL.outline);
  // Short wall face below the cap, like the reference's room dividers
  px(ctx, x, y + 3, w, 3, face);
  px(ctx, x, y + 5, w, 1, PAL.baseboard);
}

export function glassRail(ctx: Ctx, x: number, y: number, w: number, h: number) {
  px(ctx, x, y, w, h, PAL.glass);
  px(ctx, x, y, w, 1, PAL.glassEdge);
  px(ctx, x, y + h - 1, w, 1, PAL.outline);
  for (let xx = x; xx <= x + w - 1; xx += 8) px(ctx, xx, y, 1, h, PAL.outlineSoft);
  px(ctx, x + 2, y + 1, 3, 1, '#FFFFFF');
}

export function windowPane(ctx: Ctx, x: number, y: number, w: number, h: number) {
  box(ctx, x, y, w, h, '#BFE6F7');
  px(ctx, x + 1, y + 1, w - 2, 2, '#E8F7FD');
  px(ctx, x + Math.floor(w / 2), y + 1, 1, h - 2, PAL.outlineSoft);
  px(ctx, x + 1, y + h - 2, w - 2, 1, PAL.metal);
}

export function wallArt(ctx: Ctx, x: number, y: number, w: number, h: number, sky: string = '#7EC8E3') {
  box(ctx, x, y, w, h, sky, PAL.darkWood);
  px(ctx, x + 2, y + h - 4, w - 4, 2, '#4C9A4A');
  px(ctx, x + 4, y + h - 6, 4, 2, '#6BBF59');
  px(ctx, x + w - 6, y + 2, 2, 2, '#FDE68A');
}

// ── FURNITURE ──────────────────────────────────────────────

export function plant(ctx: Ctx, x: number, y: number) {
  // Leaves (8x7) over a pot (6x4)
  px(ctx, x + 1, y + 1, 6, 5, PAL.leafDark);
  px(ctx, x, y + 2, 8, 3, PAL.leaf);
  px(ctx, x + 2, y, 4, 2, PAL.leaf);
  px(ctx, x + 2, y + 1, 2, 1, PAL.leafLight);
  px(ctx, x + 5, y + 3, 2, 1, PAL.leafLight);
  box(ctx, x + 1, y + 6, 6, 4, PAL.pot);
  px(ctx, x + 2, y + 8, 4, 1, PAL.potShade);
}

export function sofa(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, shade: string) {
  box(ctx, x, y, w, h, shade);
  px(ctx, x + 1, y + 1, w - 2, 3, color); // backrest
  px(ctx, x + 1, y + 4, 3, h - 5, color); // arm L
  px(ctx, x + w - 4, y + 4, 3, h - 5, color); // arm R
  px(ctx, x + 4, y + 4, w - 8, h - 5, color);
  px(ctx, x + 4, y + 4, w - 8, 1, shade);
  // Cushion seam
  if (w > 14) px(ctx, x + Math.floor(w / 2), y + 5, 1, h - 6, shade);
}

export function armchair(ctx: Ctx, x: number, y: number, color: string, shade: string) {
  sofa(ctx, x, y, 9, 9, color, shade);
}

export function bed(ctx: Ctx, x: number, y: number, w: number, h: number, blanket: string, blanketShade: string) {
  block(ctx, x, y, w, h, PAL.darkWood, PAL.darkWoodLight, PAL.darkWood);
  px(ctx, x + 1, y + 3, w - 2, h - 4, PAL.linen);
  box(ctx, x + 2, y + 3, Math.floor(w / 2) - 3, 4, '#FFFFFF', PAL.linenShade);
  box(ctx, x + Math.floor(w / 2) + 1, y + 3, Math.floor(w / 2) - 3, 4, '#FFFFFF', PAL.linenShade);
  px(ctx, x + 1, y + 9, w - 2, h - 10, blanket);
  px(ctx, x + 1, y + 9, w - 2, 1, PAL.linen);
  px(ctx, x + 1, y + h - 3, w - 2, 2, blanketShade);
}

export function nightstand(ctx: Ctx, x: number, y: number) {
  block(ctx, x, y, 6, 6, PAL.wood, PAL.woodLight, PAL.woodLine);
  px(ctx, x + 2, y - 3, 2, 3, PAL.metalDark);
  px(ctx, x + 1, y - 5, 4, 2, '#FDE68A');
}

export function wardrobe(ctx: Ctx, x: number, y: number, w: number, h: number) {
  block(ctx, x, y, w, h, PAL.woodLight, '#F3D29B', PAL.woodLine);
  px(ctx, x + Math.floor(w / 2), y + 2, 1, h - 4, PAL.woodLine);
  px(ctx, x + Math.floor(w / 2) - 2, y + Math.floor(h / 2), 1, 2, PAL.outline);
  px(ctx, x + Math.floor(w / 2) + 2, y + Math.floor(h / 2), 1, 2, PAL.outline);
}

export function bookshelf(ctx: Ctx, x: number, y: number, w: number, h: number) {
  box(ctx, x, y, w, h, PAL.darkWood);
  const books = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#A855F7', '#F1F5F9'];
  for (let row = 0; row < Math.floor((h - 2) / 4); row++) {
    const ry = y + 1 + row * 4;
    px(ctx, x + 1, ry + 3, w - 2, 1, PAL.darkWoodLight);
    for (let i = 0, bx = x + 1; bx < x + w - 2; i++, bx += 2) {
      px(ctx, bx, ry, 1, 3, books[(i + row * 2) % books.length]);
    }
  }
}

export function table(ctx: Ctx, x: number, y: number, w: number, h: number, top: string = PAL.wood, light: string = PAL.woodLight) {
  px(ctx, x + 1, y + h, w - 2, 2, 'rgba(0, 0, 0, 0.22)');
  block(ctx, x, y, w, h, top, light, PAL.woodLine);
}

export function chair(ctx: Ctx, x: number, y: number, color: string) {
  box(ctx, x, y, 5, 5, color);
  px(ctx, x + 1, y + 1, 3, 1, 'rgba(255, 255, 255, 0.35)');
}

export function counter(ctx: Ctx, x: number, y: number, w: number, h: number) {
  box(ctx, x, y, w, h, '#F4F4F5');
  px(ctx, x + 1, y + 1, w - 2, 1, '#FFFFFF');
  px(ctx, x + 1, y + h - 3, w - 2, 2, '#A1A1AA');
}

export function sink(ctx: Ctx, x: number, y: number) {
  box(ctx, x, y, 7, 5, PAL.metal);
  px(ctx, x + 1, y + 1, 5, 3, '#9FB6C8');
  px(ctx, x + 3, y - 1, 1, 2, PAL.metalDark);
}

export function stove(ctx: Ctx, x: number, y: number) {
  box(ctx, x, y, 8, 5, '#3F3F46');
  px(ctx, x + 1, y + 1, 2, 2, '#71717A');
  px(ctx, x + 5, y + 1, 2, 2, '#71717A');
  px(ctx, x + 5, y + 1, 1, 1, '#F97316');
}

export function fridge(ctx: Ctx, x: number, y: number, w: number, h: number) {
  block(ctx, x, y, w, h, '#F4F4F5', '#FFFFFF', '#C4C4CC');
  px(ctx, x + 1, y + Math.floor(h * 0.4), w - 2, 1, PAL.outlineSoft);
  px(ctx, x + w - 3, y + 2, 1, 3, PAL.metalDark);
  px(ctx, x + w - 3, y + Math.floor(h * 0.4) + 2, 1, 3, PAL.metalDark);
}

export function toilet(ctx: Ctx, x: number, y: number) {
  box(ctx, x, y, 6, 3, '#FFFFFF');
  box(ctx, x, y + 2, 6, 6, '#FFFFFF');
  px(ctx, x + 2, y + 4, 2, 2, PAL.tileBlueGrout);
}

export function bathtub(ctx: Ctx, x: number, y: number, w: number, h: number) {
  box(ctx, x, y, w, h, '#FFFFFF');
  px(ctx, x + 2, y + 2, w - 4, h - 4, '#93C5FD');
  px(ctx, x + 2, y + 2, w - 4, 1, '#DBEAFE');
  px(ctx, x + Math.floor(w / 2), y + 1, 1, 1, PAL.metalDark);
}

export function tv(ctx: Ctx, x: number, y: number, w: number) {
  box(ctx, x, y, w, 7, '#18181B');
  px(ctx, x + 1, y + 1, w - 2, 5, '#334155');
  px(ctx, x + 2, y + 2, 3, 1, '#64748B');
}

export function floorLamp(ctx: Ctx, x: number, y: number) {
  px(ctx, x + 2, y + 3, 1, 8, PAL.metalDark);
  box(ctx, x, y, 5, 4, '#FDE68A', PAL.darkWood);
  px(ctx, x + 1, y + 10, 3, 1, PAL.outline);
}

export function fireplace(ctx: Ctx, x: number, y: number, w: number, h: number) {
  box(ctx, x, y, w, h, '#57534E');
  px(ctx, x + 1, y + 1, w - 2, 2, '#A8A29E');
  px(ctx, x + 3, y + 4, w - 6, h - 5, '#1C1917');
  px(ctx, x + 4, y + h - 5, w - 8, 3, '#DC2626');
  px(ctx, x + 6, y + h - 6, w - 12, 2, '#F59E0B');
  px(ctx, x + 7, y + h - 7, w - 14, 1, '#FEF08A');
}

/** Staircase seen from above; 'up' brightens toward the top, 'down' darkens into the opening. */
export function stairs(ctx: Ctx, x: number, y: number, w: number, h: number, dir: 'up' | 'down') {
  box(ctx, x, y, w, h, PAL.woodLine);
  const steps = Math.floor((h - 2) / 3);
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps - 1);
    const shade = dir === 'up' ? 0.25 * (1 - t) : 0.45 * (1 - t);
    const sy = y + 1 + i * 3;
    px(ctx, x + 2, sy, w - 4, 3, PAL.woodLight);
    px(ctx, x + 2, sy + 2, w - 4, 1, PAL.woodSeam);
    px(ctx, x + 2, sy, w - 4, 3, `rgba(20, 16, 12, ${shade.toFixed(2)})`);
  }
  // Rails
  px(ctx, x + 1, y + 1, 1, h - 2, PAL.darkWood);
  px(ctx, x + w - 2, y + 1, 1, h - 2, PAL.darkWood);
  // Direction arrow
  const ax = x + Math.floor(w / 2);
  const ay = y + Math.floor(h / 2);
  ctx.fillStyle = '#FFFFFF';
  if (dir === 'up') {
    px(ctx, ax - 1, ay - 3, 2, 1, '#FFFFFF');
    px(ctx, ax - 2, ay - 2, 4, 1, '#FFFFFF');
    px(ctx, ax - 3, ay - 1, 6, 1, '#FFFFFF');
    px(ctx, ax - 1, ay, 2, 3, '#FFFFFF');
  } else {
    px(ctx, ax - 1, ay - 3, 2, 3, '#FFFFFF');
    px(ctx, ax - 3, ay, 6, 1, '#FFFFFF');
    px(ctx, ax - 2, ay + 1, 4, 1, '#FFFFFF');
    px(ctx, ax - 1, ay + 2, 2, 1, '#FFFFFF');
  }
}

export function banner(ctx: Ctx, x: number, y: number) {
  box(ctx, x, y, 20, 11, '#1E3A8A');
  px(ctx, x + 2, y + 2, 16, 7, '#2563EB');
  px(ctx, x + 9, y + 3, 2, 5, '#FBBF24');
  px(ctx, x + 7, y + 5, 6, 1, '#FBBF24');
}

export function globe(ctx: Ctx, x: number, y: number) {
  box(ctx, x, y, 6, 6, '#38BDF8');
  px(ctx, x + 1, y + 2, 3, 2, '#22C55E');
  px(ctx, x + 2, y + 6, 2, 2, PAL.darkWood);
  px(ctx, x + 1, y + 8, 4, 1, PAL.outline);
}

export function cabinet(ctx: Ctx, x: number, y: number, w: number, h: number) {
  block(ctx, x, y, w, h, '#9CA3AF', '#D1D5DB', '#6B7280');
  for (let yy = y + 3; yy < y + h - 2; yy += 3) px(ctx, x + Math.floor(w / 2) - 1, yy, 2, 1, PAL.outline);
}
