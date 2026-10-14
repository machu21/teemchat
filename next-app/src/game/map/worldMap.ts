import { MAP_WIDTH, MAP_HEIGHT } from '../collision';

// ============================================================
// BRIGHT & VIBRANT PIXEL-ART WORLD MAP — 1:1 Complete Port from Flutter tile_map.dart
//
// Internal render resolution = mapWidth / 2 x mapHeight / 2 (840 x 540)
// ctx.scale(2, 2) makes every pixel a visible 2×2 block on 1680x1080 canvas.
// Strict pixel rects only, sharp pixel quality.
// ============================================================

export function createPreRenderedWorldMap(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH;
  canvas.height = MAP_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const iw = 840;
  const ih = 540;
  const T = 8;

  // Pixel rect helper function matching Flutter's _r
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  ctx.save();
  ctx.scale(2.0, 2.0);

  // ── 1. GRASS TILES ── Bright sunlit meadow ────────────────────
  const drawGrass = () => {
    // Solid vibrant meadow base
    r(0, 0, iw, ih, '#6CB840');

    // Warm sunlit checkerboard fields (40x40 grid)
    const fieldSize = 40;
    for (let ty = 0; ty < ih; ty += fieldSize) {
      for (let tx = 0; tx < iw; tx += fieldSize) {
        if ((Math.floor(tx / fieldSize) + Math.floor(ty / fieldSize)) % 2 === 0) {
          const w = tx + fieldSize <= iw ? fieldSize : iw - tx;
          const h = ty + fieldSize <= ih ? fieldSize : ih - ty;
          r(tx, ty, w, h, '#7EC850');
        }
      }
    }

    // Decorative details — grass blades, white daisies, yellow blossoms
    for (let ty = 20; ty < ih; ty += 56) {
      for (let tx = 20; tx < iw; tx += 56) {
        const hash = Math.floor((tx * 13 + ty * 7) / 16) % 5;
        if (hash === 0) {
          r(tx + 2, ty + 2, 2, 4, '#9EE870');
          r(tx + 6, ty + 1, 2, 5, '#9EE870');
        } else if (hash === 1) {
          // White daisy
          r(tx + 4, ty + 4, 3, 3, '#FFFFFF');
          r(tx + 5, ty + 5, 1, 1, '#FDE047');
        } else if (hash === 2) {
          // Yellow blossom
          r(tx + 3, ty + 5, 3, 3, '#FDE047');
        } else if (hash === 3) {
          // Light green accent blade
          r(tx + 1, ty + 3, 2, 3, '#B4F080');
        }
      }
    }
  };

  // ── 2. FOREST ZONE ── Rich emerald canopy with dappled sunlight ─
  const pixelTree = (tx: number, ty: number) => {
    // Lush multi-shade canopy — dark outline, vibrant greens
    r(tx, ty + 2, T * 3, T * 2 + 2, '#1E5018');
    r(tx + 2, ty, T * 3 - 4, T * 4, '#1E5018');
    r(tx + 1, ty + 2, T * 3 - 2, T * 2, '#3A8030');
    r(tx + 3, ty + 1, T * 3 - 6, T * 3 + 2, '#3A8030');
    r(tx + 2, ty + 3, T * 3 - 4, T * 2, '#52A842');
    r(tx + 4, ty + 1, T * 3 - 8, T * 3, '#52A842');
    // Crown highlight
    r(tx + 4, ty + 1, 4, 3, '#78D058');
    r(tx + 2, ty + 3, 3, 2, '#78D058');
    // Trunk
    r(tx + T, ty + T * 3, 4, T, '#8B5E2C');
    r(tx + T + 4, ty + T * 3, 4, T, '#5C3A18');
  };

  const drawForestZone = () => {
    const fx = T * 38;
    const fw = T * 40;
    const fh = T * 26;

    // Solid rich forest base
    r(fx, 0, fw, fh, '#3E7E36');

    // Dappled emerald canopy patches
    const canopySize = 40;
    for (let ty = 0; ty < fh; ty += canopySize) {
      for (let tx = fx; tx < fx + fw; tx += canopySize) {
        if ((Math.floor(tx / canopySize) + Math.floor(ty / canopySize)) % 2 === 0) {
          const w = tx + canopySize <= fx + fw ? canopySize : fx + fw - tx;
          const h = ty + canopySize <= fh ? canopySize : fh - ty;
          r(tx, ty, w, h, '#4A9040');
        }
      }
    }

    // Perimeter dense forest border — spaced trees
    for (let tx = 0; tx < iw; tx += T * 6) {
      pixelTree(tx, 0);
    }
    for (let ty = T * 6; ty < ih - T * 6; ty += T * 6) {
      pixelTree(0, ty);
    }
    for (let tx = 0; tx < iw; tx += T * 6) {
      pixelTree(tx, ih - T * 4);
    }
    for (let tx = fx + T * 3; tx < fx + fw - T * 3; tx += T * 8) {
      for (let ty = T * 3; ty < fh - T * 3; ty += T * 8) {
        pixelTree(tx, ty);
      }
    }
  };

  // ── 3. WATER / OCEAN ── Sparkling tropical crystal bay ────────
  const drawWater = () => {
    const beachX = 640;
    const waveX = 696;

    // Sandy beach — warm golden sand base
    r(beachX, 0, waveX - beachX, ih, '#EACC88');
    r(beachX + 14, 0, 20, ih, '#F5DDA0');

    // Shell / pebble details
    for (let ty = 16; ty < ih; ty += 48) {
      r(beachX + 6, ty, 3, 2, '#D4A860');
      r(beachX + 26, ty + 24, 3, 2, '#FFE8C0');
    }

    // Beach-to-water transition line
    r(waveX - 4, 0, 4, ih, '#D4B878');

    // Crystal ocean water — bright tropical gradient bands
    const oc = ['#5CE0F8', '#40C0F0', '#28A0E0', '#1880C8'];
    const bandW = Math.floor((iw - waveX) / 4);
    for (let i = 0; i < 4; i++) {
      r(waveX + i * bandW, 0, bandW, ih, oc[i]);
    }

    // Sparkling wave foam
    for (let ty = 0; ty < ih; ty += T * 6) {
      const stagger = Math.floor(ty / (T * 6)) % 2 === 0 ? 8 : 0;
      for (let tx = waveX + stagger; tx < iw - 4; tx += T * 6) {
        r(tx, ty, 16, 2, '#B0E8FF');
        r(tx + 2, ty + 1, 10, 1, '#F0FCFF');
      }
    }

    // Shoreline cresting foam
    for (let ty = 0; ty < ih; ty += T * 2) {
      const odd = Math.floor(ty / (T * 2)) % 2 === 0;
      r(waveX, ty + (odd ? 0 : 4), 3, 6, '#F0FCFF');
    }

    // Wooden Pier / Jetty — warm timber
    const px2 = 648;
    const py2 = 232;
    const pw2 = 144;
    const ph2 = 32;
    for (let tx = px2; tx < px2 + pw2; tx += 7) {
      r(tx, py2, 6, ph2, '#B87838');
      r(tx, py2, 6, 2, '#D8A058');
    }
    r(px2, py2, pw2, 3, '#784020');
    r(px2, py2 + ph2 - 3, pw2, 3, '#784020');
    for (let tx = px2; tx <= px2 + pw2; tx += 32) {
      r(tx - 1, py2 + ph2, 4, 14, '#5C2E10');
    }
  };

  // ── 4. RIVER ── Clear sparkling blue stream ────────────────────
  const drawRiver = () => {
    const rLi = T * 46;
    const rYi = T * 26;
    const rWi = T * 4;

    // River banks — warm dirt border
    r(rLi - 2, rYi, rWi + 4, ih - rYi, '#A87848');

    // Main river water — bright crystal blue
    r(rLi, rYi, rWi, ih - rYi, '#48B8E8');
    // Deeper center channel
    r(rLi + Math.floor(rWi / 3), rYi, Math.floor(rWi / 3), ih - rYi, '#3098D0');

    // Sparkling ripple highlights
    for (let ty = rYi + T; ty < ih; ty += T * 3) {
      r(rLi + 2, ty, 6, 1, '#A0E0FF');
      r(rLi + rWi - 8, ty + T, 6, 1, '#A0E0FF');
    }

    // Edge foam
    for (let ty = rYi; ty < ih; ty += T) {
      const odd = Math.floor(ty / T) % 2 === 0;
      r(rLi, ty + (odd ? 0 : 3), 2, 3, '#F0FCFF');
      r(rLi + rWi - 2, ty + (odd ? 3 : 0), 2, 3, '#F0FCFF');
    }

    // Lily pads with flowers
    const lily = (lx: number, ly: number) => {
      r(lx, ly, T, T, '#40A838');
      r(lx + 2, ly + 2, 4, 4, '#2E8428');
      r(lx + 3, ly + 1, 2, 2, '#F06088'); // Pink lily flower
    };
    lily(rLi + 4, T * 29);
    lily(rLi + 10, T * 35);
    lily(rLi + 2, T * 50);
  };

  // ── 5. BRIDGE ── Warm timber crossing ──────────────────────────
  const drawBridge = () => {
    const bx = T * 45;
    const by = T * 42;
    const bw = T * 6;
    const bh = T * 4;

    // Soft shadow under bridge
    r(bx + 2, by + bh, bw, 6, 'rgba(0,0,0,0.19)');

    // Planks
    for (let tx = bx; tx < bx + bw; tx += 7) {
      r(tx, by, 5, bh, '#C08038');
      r(tx + 1, by, 3, 2, '#E0A858');
    }

    // Guard rails
    r(bx - 2, by, bw + 4, 4, '#8B5020');
    r(bx - 2, by + bh - 4, bw + 4, 4, '#8B5020');

    // Support pillars
    for (let tx = bx; tx <= bx + bw; tx += Math.floor(bw / 2)) {
      r(tx - 1, by - 4, 4, bh + 8, '#6B3818');
    }
  };

  // ── 6. DIRT PATHS ── Golden warm footpaths ─────────────────────
  const drawPaths = () => {
    const path = (x: number, y: number, w: number, h: number) => {
      // Warm golden dirt
      r(x, y, w, h, '#E8C88C');
      // Highlight edges
      r(x, y, w, 2, '#F4DCA0');
      r(x, y, 2, h, '#F4DCA0');
      // Shadow edges
      r(x + w - 2, y, 2, h, '#C4A060');
      r(x, y + h - 2, w, 2, '#C4A060');
      // Cart tracks / foot ruts
      if (w > h) {
        r(x + 4, y + Math.floor(h / 3), w - 8, 1, '#D0A868');
        r(x + 4, y + Math.floor((2 * h) / 3), w - 8, 1, '#D0A868');
      } else {
        r(x + Math.floor(w / 3), y + 4, 1, h - 8, '#D0A868');
        r(x + Math.floor((2 * w) / 3), y + 4, 1, h - 8, '#D0A868');
      }
    };

    path(T * 34, T * 16, T * 11, T * 3);
    path(T * 45, T * 16, T * 31, T * 3);
    path(T * 75, T * 16, T * 3, T * 14);
    path(T * 75, T * 29, T * 6, T * 3);
    path(T * 54, T * 19, T * 3, T * 13);
    path(T * 39, T * 42, T * 6, T * 4);
    path(T * 51, T * 42, T * 8, T * 4);
    path(T * 17, T * 27, T * 2, T * 7);
    path(T * 21, T * 40, T * 2, T * 8);
  };

  // ── 7. COBBLESTONE PLAZA ── Warm grey stone market square ──────
  const drawPlaza = () => {
    const px = T * 6;
    const py = T * 11;
    const pw = T * 29;
    const ph = T * 16;

    // Warm stone base
    r(px, py, pw, ph, '#D8D4C8');

    // Brick pattern
    const bh = T;
    const bw = T * 2;
    for (let ty = py; ty < py + ph; ty += bh) {
      const row = Math.floor((ty - py) / bh);
      const offset = (row % 2) * Math.floor(bw / 2);
      // Mortar line
      r(px, ty, pw, 1, '#A09888');
      for (let tx = px + offset; tx < px + pw; tx += bw) {
        r(tx, ty, 1, bh, '#A09888');
        // Brick highlight
        r(tx + 1, ty + 1, bw - 3, 1, '#EAE6DA');
        r(tx + 1, ty + 2, 1, bh - 3, '#EAE6DA');
        // Occasional darker brick variation
        if ((row + Math.floor(tx / bw)) % 3 === 0) {
          r(tx + 2, ty + 2, bw - 5, bh - 4, '#C8C0B4');
        }
      }
    }

    // Border trim
    r(px, py, pw, 2, '#887860');
    r(px, py + ph - 2, pw, 2, '#887860');
    r(px, py, 2, ph, '#887860');
    r(px + pw - 2, py, 2, ph, '#887860');

    // Central plaza medallion (decorative mosaic circle)
    const cx = px + Math.floor(pw / 2);
    const cy = py + Math.floor(ph / 2);
    r(cx - 12, cy - 12, 24, 24, '#887860');
    r(cx - 10, cy - 10, 20, 20, '#B88838');
    r(cx - 8, cy - 8, 16, 16, '#DCAA50');
    r(cx - 4, cy - 4, 8, 8, '#F5C868');
    r(cx - 1, cy - 1, 2, 2, '#6B3818');
  };

  // ── 8. COZY CABIN COTTAGE (Building 1) ─────────────────────────
  const drawCottage = () => {
    const bx = T * 5;
    const by = T * 3;
    const bw = 96;
    const rh = 38;
    const wh = 36;

    const out = '#2E1A0C';
    const roofBase = '#C87040';
    const roofLt = '#E08850';
    const roofHi = '#F0A868';
    const roofDk = '#A05828';
    const ridgeLt = '#D88848';
    const ridgeMid = '#B86828';
    const ridgeDk = '#804018';
    const wallBase = '#8B5E34';
    const wallLt = '#A87848';
    const wallDk = '#6B4020';
    const cornerPost = '#5C3218';

    // Stone Chimney
    r(bx + 10, by - 6, 10, 16, '#687080');
    r(bx + 9, by - 7, 12, 3, '#889098');
    r(bx + 11, by - 5, 4, 10, '#98A0A8');
    // Warm smoke puff
    r(bx + 12, by - 12, 5, 4, 'rgba(232, 236, 240, 0.5)');
    r(bx + 14, by - 16, 4, 3, 'rgba(232, 236, 240, 0.3)');

    // Ground shadow
    r(bx - 2, by + rh + wh - 4, bw + 4, 8, 'rgba(0, 0, 0, 0.19)');

    // Roof A-frame
    const cx = bx + Math.floor(bw / 2);
    for (let i = 0; i < rh; i++) {
      const progress = i / rh;
      const halfW = Math.floor(10 + progress * (bw / 2 - 6));
      const y = by + i;
      const left = cx - halfW;
      const right = cx + halfW;
      const lineW = right - left + 1;

      r(left, y, lineW, 1, roofBase);

      if (i % 6 < 2) {
        r(left + 2, y, lineW - 4, 1, roofHi);
      } else if (i % 6 >= 4) {
        r(left + 2, y, lineW - 4, 1, roofDk);
      } else {
        r(left + 2, y, lineW - 4, 1, roofLt);
      }

      for (let sx = left + 12; sx < right - 8; sx += 14) {
        if (Math.floor(i / 6) % 2 === 0) {
          r(sx, y, 1, 1, roofDk);
        } else {
          r(sx + 7, y, 1, 1, roofDk);
        }
      }

      r(left, y, 2, 1, out);
      r(right - 1, y, 2, 1, out);
    }

    // Center Ridge Beam
    const rcx = bx + Math.floor(bw / 2);
    for (let y = by; y < by + rh; y++) {
      r(rcx - 5, y, 10, 1, ridgeMid);
      r(rcx - 4, y, 3, 1, ridgeLt);
      r(rcx + 2, y, 3, 1, ridgeDk);
      r(rcx - 6, y, 1, 1, out);
      r(rcx + 5, y, 1, 1, out);
    }
    // Peak cap
    r(rcx - 6, by - 2, 12, 2, out);
    r(rcx - 4, by - 1, 8, 2, ridgeLt);

    // Eave shadow
    r(bx - 4, by + rh - 3, bw + 8, 3, '#3C1808');
    r(bx - 6, by + rh - 1, bw + 12, 2, out);

    // Walls: Timber Planks
    const wy = by + rh + 1;
    r(bx, wy, bw, wh, wallBase);

    for (let y = wy; y < wy + wh; y += 7) {
      r(bx, y, bw, 1, wallLt);
      r(bx, y + 1, bw, 5, wallBase);
      r(bx, y + 6, bw, 1, wallDk);
    }

    r(bx + 42, wy + 2, 1, 12, wallDk);
    r(bx + 22, wy + 14, 1, 12, wallDk);
    r(bx + 52, wy + 14, 1, 12, wallDk);

    for (let y = wy; y < wy + wh; y++) {
      r(bx, y, 6, 1, cornerPost);
      r(bx + 1, y, 2, 1, wallLt);
      r(bx + bw - 6, y, 6, 1, cornerPost);
      r(bx + bw - 5, y, 2, 1, wallLt);
    }
    r(bx, wy, 1, wh, out);
    r(bx + bw - 1, wy, 1, wh, out);

    // Foundation
    r(bx, wy + wh - 4, bw, 4, '#483018');
    r(bx, wy + wh - 1, bw, 2, out);

    // Window with golden glow
    const wx = bx + 16;
    const windowY = wy + 7;
    const ww = 22;
    const windowH = 18;

    r(wx - 1, windowY - 1, ww + 2, windowH + 2, out);
    r(wx, windowY, ww, windowH, '#B87838');
    r(wx + 1, windowY + 1, ww - 2, 2, '#D8A060');
    r(wx + 3, windowY + 3, ww - 6, windowH - 6, '#FDE68A');
    r(wx + 4, windowY + 4, 4, 4, '#FFF3C0');
    r(wx + 4, windowY + 5, 2, 2, '#FFFFFF');
    // Mullion cross
    r(wx + Math.floor(ww / 2) - 1, windowY + 3, 2, windowH - 6, '#8B5020');
    r(wx + 3, windowY + Math.floor(windowH / 2) - 1, ww - 6, 2, '#8B5020');

    // Door
    const dx = bx + 56;
    const dy = wy + 6;
    const dw = 24;
    const dh = wh - 6;

    r(dx - 1, dy - 1, dw + 2, dh + 1, out);
    r(dx, dy, dw, dh, '#B87838');
    r(dx + 1, dy + 1, dw - 2, 2, '#D8A060');
    r(dx + 1, dy + 1, 2, dh, '#D8A060');
    // Dark interior
    r(dx + 3, dy + 3, dw - 6, dh - 3, '#2E1A10');
    // Stone threshold
    r(dx - 2, dy + dh - 1, dw + 4, 3, '#889098');
    r(dx - 2, dy + dh - 1, dw + 4, 1, '#A8B0B8');
  };

  // ── 9. VILLAGE CENTER / TOWN HALL (Building 2) ─────────────────
  const drawTownHall = () => {
    const bx = T * 19;
    const by = T * 2;
    const bw = 120;
    const rh = 36;
    const wh = 42;

    const out = '#1A2038';
    const roofBlue = '#3060D0';
    const roofLt = '#5090F0';
    const roofHi = '#A0C8FF';
    const roofDk = '#203880';
    const wallPlaster = '#FAF5E8';
    const wallLt = '#FFFDF5';
    const timber = '#7C4020';
    const timberLt = '#A05830';

    // Ground shadow
    r(bx - 2, by + rh + wh - 4, bw + 4, 8, 'rgba(0, 0, 0, 0.19)');

    // Ceramic Blue Tile Roof
    const cx = bx + Math.floor(bw / 2);
    for (let i = 0; i < rh; i++) {
      const progress = i / rh;
      const halfW = Math.floor(16 + progress * (bw / 2 - 12));
      const y = by + i;
      const left = cx - halfW;
      const right = cx + halfW;
      const lineW = right - left + 1;

      r(left, y, lineW, 1, roofBlue);

      if (i % 4 < 2) {
        r(left + 2, y, lineW - 4, 1, roofLt);
      } else {
        r(left + 2, y, lineW - 4, 1, roofDk);
      }

      if (i < 3) {
        r(left + 4, y, lineW - 8, 1, roofHi);
      }

      r(left, y, 2, 1, out);
      r(right - 1, y, 2, 1, out);
    }

    // White ridge cap
    const rcx = bx + Math.floor(bw / 2);
    r(rcx - 20, by - 2, 40, 2, out);
    r(rcx - 18, by - 1, 36, 2, '#FFFFFF');
    r(rcx - 18, by + 1, 36, 1, '#D8E0E8');

    // Eave shadow
    r(bx - 4, by + rh - 3, bw + 8, 3, '#182040');
    r(bx - 6, by + rh - 1, bw + 12, 2, out);

    // Half-Timbered Plaster Walls
    const wy = by + rh + 1;
    r(bx, wy, bw, wh, wallPlaster);

    // Corner timber pillars
    for (let y = wy; y < wy + wh; y++) {
      r(bx, y, 5, 1, timber);
      r(bx + 1, y, 2, 1, timberLt);
      r(bx + bw - 5, y, 5, 1, timber);
      r(bx + bw - 4, y, 2, 1, timberLt);
    }

    // Mid timber pillars
    for (let y = wy; y < wy + wh; y++) {
      r(bx + 36, y, 4, 1, timber);
      r(bx + 80, y, 4, 1, timber);
    }

    // Horizontal beams
    r(bx, wy, bw, 3, timber);
    r(bx, wy + 16, bw, 3, timber);
    r(bx, wy + wh - 4, bw, 4, timber);
    r(bx, wy + wh - 1, bw, 2, out);

    // Plaster highlights
    r(bx + 8, wy + 4, 24, 10, wallLt);
    r(bx + 88, wy + 4, 24, 10, wallLt);

    // Double entrance doors
    const dx = bx + Math.floor(bw / 2) - 14;
    const dy = wy + 12;
    const dw = 28;
    const dh = wh - 12;

    r(dx - 1, dy - 1, dw + 2, dh + 1, out);
    r(dx, dy, dw, dh, '#8B5020');
    r(dx + Math.floor(dw / 2) - 1, dy, 2, dh, '#5C3010');
    // Sky blue upper panes
    r(dx + 3, dy + 4, 8, 10, '#A0D0FF');
    r(dx + 17, dy + 4, 8, 10, '#A0D0FF');
    r(dx + 4, dy + 5, 3, 3, '#FFFFFF');
    r(dx + 18, dy + 5, 3, 3, '#FFFFFF');
    // Brass handles
    r(dx + 10, dy + 18, 2, 3, '#FDE047');
    r(dx + 16, dy + 18, 2, 3, '#FDE047');
    // Welcome mat
    r(dx - 2, dy + dh - 1, dw + 4, 3, '#A06028');
    r(dx, dy + dh - 1, dw, 2, '#F59E0B');

    // Signboard above entrance
    r(dx - 2, dy - 9, dw + 4, 8, out);
    r(dx - 1, dy - 8, dw + 2, 6, '#D97706');
    r(dx, dy - 7, dw, 4, '#FDE68A');
    r(dx + Math.floor(dw / 2) - 2, dy - 6, 4, 2, '#D97706');

    // Windows with flower planter boxes
    const villageWindow = (wx: number) => {
      const wy2 = wy + 4;
      r(wx - 1, wy2 - 1, 18, 14, out);
      r(wx, wy2, 16, 12, '#A0D0FF');
      r(wx + 1, wy2 + 1, 4, 4, '#FFFFFF');
      r(wx + 7, wy2, 2, 12, timber);
      r(wx, wy2 + 5, 16, 2, timber);

      // Flower planter box
      r(wx - 2, wy2 + 12, 20, 5, out);
      r(wx - 1, wy2 + 13, 18, 3, '#A05828');
      // Blossoms
      r(wx, wy2 + 11, 2, 2, '#EF4444');
      r(wx + 4, wy2 + 11, 2, 2, '#FDE047');
      r(wx + 8, wy2 + 11, 2, 2, '#60A5FA');
      r(wx + 12, wy2 + 11, 2, 2, '#F472B6');
    };

    villageWindow(bx + 11);
    villageWindow(bx + 91);
  };

  // ── 10. CLIFF LEDGES ── Warm sandstone rock ────────────────────
  const cliffLedge = (x: number, y: number, w: number) => {
    const h = T * 2;
    r(x, y, w, h, '#B88848');
    r(x, y, w, 2, '#D8A860');
    r(x, y + 2, w, 2, '#C89850');
    r(x, y + Math.floor(h / 2), w, 2, '#A07838');
    r(x, y + h - 3, w, 3, '#886028');
    // Crack fissures
    let ci = x + 12;
    while (ci < x + w) {
      r(ci, y + 3, 1, h - 5, '#886028');
      ci += 24;
    }
  };

  const drawCliffs = () => {
    cliffLedge(T * 2, T * 34, T * 36);
    cliffLedge(T * 2, T * 48, T * 36);

    // Mine entrance / cave
    const cx = T * 11;
    const cy = T * 35;
    r(cx, cy, 16, 3, '#3C2810');
    r(cx - 2, cy + 3, 4, 16, '#3C2810');
    r(cx + 14, cy + 3, 4, 16, '#3C2810');
    r(cx, cy + 3, 16, 16, '#1C1008');
    r(cx - 4, cy + 2, 24, 3, '#887060');
  };

  // ── 11. ZONE LABELS ── Clean readable pixel signboards ─────────
  const label = (text: string, x: number, y: number, bgCol: string) => {
    ctx.font = 'bold 6px monospace';
    const textWidth = ctx.measureText(text).width;
    const bw = Math.ceil(textWidth) + 8;
    const bh = 10;

    r(x - 1, y - 1, bw + 2, bh + 2, '#000000');
    r(x, y, bw, bh, bgCol);
    r(x, y, bw, 1, 'rgba(255,255,255,0.4)');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, x + 4, y + 7);
  };

  const drawLabels = () => {
    label('VERDANT VILLAGE', T * 8, T * 3, '#2E8028');
    label('WHISPERING WOODS', T * 46, T * 3, '#1E6020');
    label('CRYSTAL BAY', T * 82, T * 3, '#1878B0');
    label('CRAGGY RIDGE', T * 5, T * 32, '#8B5020');
    label('ADVENTURE CAMP', T * 52, T * 30, '#B87820');
    label('RIVER CROSSING', T * 52, T * 47, '#1E8868');
  };

  // Execute all 11 passes
  drawGrass();
  drawForestZone();
  drawWater();
  drawRiver();
  drawBridge();
  drawPaths();
  drawPlaza();
  drawCottage();
  drawTownHall();
  drawCliffs();
  drawLabels();

  ctx.restore();
  return canvas;
}
