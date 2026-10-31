// ============================================================
// HIGH-FIDELITY RETRO 16-BIT PIXEL-ART WORLD MAP: VERDANT VILLAGE
// Habblaud Top-Down 3/4 Architectural & Landscape System:
// - Paved village thoroughfare with curved bridge approach & granite curbs
// - Scenic Riverfront Esplanade with stone balustrade, lanterns & benches
// - Natural woodland cascade stream & timber river crossing bridge
// - Connected trail system linking Bridge to Adventure Camp & Crystal Bay Pier
// - Walk-in Cozy Cottage with warm wood floor, glowing fireplace & apothecary
// - Walk-in Town Hall with checkered marble floor & council table
// - Multi-tier lush foliage with ambient drop shadows & meadow wildflowers
// ============================================================

export function renderVillageMap(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  const T = 8; // Internal grid unit: 8px (scales 2x to 16px world coords)

  // Pixel rect helper function
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  // ── 1. GBA MEADOW GRASS & LUSH FOLIAGE VERGES ──────────────────────
  const drawGrass = () => {
    // Rich natural meadow palette matching Habblaud grass
    const grassBase = '#55A03A';
    const grassHighlight = '#68B648';
    const seamColor = '#326820';

    r(0, 0, iw, ih, grassBase);

    // Subtle natural grass tone variations (soft non-harsh field patches)
    const fieldSize = 16;
    for (let ty = 0; ty < ih; ty += fieldSize) {
      for (let tx = 0; tx < iw; tx += fieldSize) {
        if ((Math.floor(tx / fieldSize) + Math.floor(ty / fieldSize)) % 2 === 0) {
          const w = tx + fieldSize <= iw ? fieldSize : iw - tx;
          const h = ty + fieldSize <= ih ? fieldSize : ih - ty;
          r(tx, ty, w, h, grassHighlight);
        }
      }
    }

    // Natural wild grass tufts & flower buds sprinkled across the landscape
    for (let ty = 8; ty < ih; ty += 24) {
      for (let tx = 8; tx < iw; tx += 24) {
        const hash = Math.floor((tx * 19 + ty * 23) / 8) % 11;
        if (hash === 0) {
          // Double tall grass blade
          r(tx + 2, ty + 2, 2, 4, '#8EE058');
          r(tx + 5, ty + 1, 2, 5, '#8EE058');
          r(tx + 2, ty + 5, 2, 1, seamColor);
          r(tx + 5, ty + 5, 2, 1, seamColor);
        } else if (hash === 1) {
          // White field daisy with golden core
          r(tx + 3, ty + 3, 3, 3, '#FFFFFF');
          r(tx + 4, ty + 4, 1, 1, '#FACC15');
          r(tx + 4, ty + 6, 1, 2, '#15803D');
        } else if (hash === 2) {
          // Wild blue flower
          r(tx + 3, ty + 3, 3, 3, '#60A5FA');
          r(tx + 4, ty + 4, 1, 1, '#EFF6FF');
          r(tx + 4, ty + 6, 1, 2, '#15803D');
        } else if (hash === 3) {
          // Pink meadow blossom
          r(tx + 3, ty + 3, 3, 3, '#F472B6');
          r(tx + 4, ty + 4, 1, 1, '#FEF08A');
          r(tx + 4, ty + 6, 1, 2, '#15803D');
        } else if (hash === 4) {
          // Subtle dirt pebble
          r(tx + 2, ty + 3, 3, 2, '#7C5A30');
          r(tx + 3, ty + 3, 1, 1, '#A07844');
        }
      }
    }
  };

  // ── 2. VOLUMETRIC ROUND CANOPY TREES ──────────────────────────────
  const pixelTree = (tx: number, ty: number) => {
    const outDk = '#122E15';
    const folDk = '#235A22';
    const folMid = '#3C8832';
    const folLt = '#5CAE44';
    const folHi = '#82D858';
    const trunkLt = '#926034';
    const trunkMid = '#744420';
    const trunkDk = '#46240E';

    // Ambient ground drop-shadow under the entire tree
    r(tx + 2, ty + 24, 24, 7, 'rgba(18, 46, 21, 0.4)');

    // Flared woody trunk & exposed roots
    r(tx + 11, ty + 18, 6, 9, trunkMid);
    r(tx + 11, ty + 18, 2, 9, trunkLt);
    r(tx + 15, ty + 18, 2, 9, trunkDk);
    r(tx + 9, ty + 25, 4, 3, trunkMid);
    r(tx + 15, ty + 25, 4, 3, trunkDk);

    // Foliage Silhouette & volumetric bulges
    r(tx + 4, ty + 1, 20, 20, outDk);
    r(tx + 1, ty + 4, 26, 14, outDk);
    r(tx + 2, ty + 3, 24, 16, folDk);
    r(tx + 3, ty + 4, 22, 14, folMid);
    r(tx + 5, ty + 2, 18, 17, folMid);
    r(tx + 4, ty + 3, 12, 10, folLt);
    r(tx + 3, ty + 5, 8, 8, folLt);
    r(tx + 14, ty + 3, 8, 6, folLt);
    r(tx + 6, ty + 2, 7, 4, folHi);
    r(tx + 5, ty + 4, 4, 4, folHi);
    r(tx + 15, ty + 3, 4, 2, folHi);
    r(tx + 16, ty + 13, 8, 6, folDk);
    r(tx + 8, ty + 15, 12, 5, folDk);
  };

  const drawForestZone = () => {
    const fx = T * 38;
    const fw = T * 40;
    const fh = T * 26;

    // Whispering Woods forest undergrowth
    r(fx + 8, 0, fw - 8, fh - 12, '#2C5E28');
    for (let ty = 0; ty < fh; ty += 12) {
      const odd = Math.floor(ty / 12) % 2 === 0;
      r(fx - (odd ? 10 : 4), ty, 16, 12, '#386D32');
      r(fx + 4, ty, 12, 12, '#2C5E28');
    }
    for (let tx = fx; tx < fx + fw; tx += 16) {
      const odd = Math.floor(tx / 16) % 2 === 0;
      r(tx, fh - (odd ? 14 : 6), 16, 14, '#386D32');
      r(tx + 2, fh - (odd ? 8 : 2), 12, 8, '#44823A');
    }

    // Dense perimeter tree line
    for (let tx = 0; tx < iw; tx += 28) {
      pixelTree(tx, -4);
    }
    for (let ty = 24; ty < ih - 36; ty += 28) {
      pixelTree(-4, ty);
    }
    for (let tx = 0; tx < iw; tx += 28) {
      pixelTree(tx, ih - 32);
    }

    // Interior Whispering Woods stands
    const groveOffsets = [
      [fx + 16, 20], [fx + 56, 14], [fx + 92, 28], [fx + 130, 16], [fx + 170, 24],
      [fx + 32, 60], [fx + 76, 72], [fx + 114, 58], [fx + 154, 66], [fx + 192, 52],
      [fx + 18, 108], [fx + 64, 118], [fx + 104, 104], [fx + 144, 112], [fx + 184, 100],
      [fx + 44, 154], [fx + 88, 160], [fx + 128, 148], [fx + 168, 156],
    ];
    for (const [tx, ty] of groveOffsets) {
      if (tx < fx + fw - 24 && ty < fh - 24) {
        pixelTree(tx, ty);
      }
    }
  };

  // ── 3. CRYSTAL BAY WATER & OCEAN ──────────────────────────────────
  const drawWater = () => {
    const beachX = 640;
    const waveX = 696;

    // Golden sand shore with wet sand gradients
    r(beachX, 0, waveX - beachX, ih, '#E6C078');
    r(beachX + 16, 0, 24, ih, '#D2AA5E');
    r(waveX - 6, 0, 6, ih, '#BC944A');

    // Multi-shade ocean depth bands
    const oc = ['#4AD4F0', '#30B4E4', '#1E8CC8', '#1468A8'];
    const bandW = Math.floor((iw - waveX) / 4);
    for (let i = 0; i < 4; i++) {
      r(waveX + i * bandW, 0, bandW, ih, oc[i]);
    }

    // Rhythmic ocean surf & foam crests
    for (let ty = 0; ty < ih; ty += 18) {
      const stagger = Math.floor(ty / 18) % 2 === 0 ? 10 : 0;
      for (let tx = waveX + stagger; tx < iw - 8; tx += 28) {
        r(tx, ty, 18, 2, '#A6EEFF');
        r(tx + 2, ty + 1, 14, 1, '#FFFFFF');
      }
    }

    // Shoreline surf foam
    for (let ty = 0; ty < ih; ty += 12) {
      const odd = Math.floor(ty / 12) % 2 === 0;
      r(waveX, ty + (odd ? 0 : 3), 4, 7, '#FFFFFF');
      r(waveX + 3, ty + (odd ? 2 : 5), 2, 4, '#E0F8FF');
    }

    // Crystal Bay Wooden Fishing Pier
    const px2 = 648;
    const py2 = 232;
    const pw2 = 144;
    const ph2 = 32;

    r(px2, py2 + ph2, pw2, 8, 'rgba(10, 40, 80, 0.4)');
    for (let tx = px2; tx < px2 + pw2; tx += 8) {
      r(tx, py2, 7, ph2, '#A66E30');
      r(tx + 1, py2, 5, 2, '#CCA060');
      r(tx + 6, py2, 1, ph2, '#744618');
    }
    r(px2, py2, pw2, 3, '#6A3E14');
    r(px2, py2 + ph2 - 3, pw2, 3, '#6A3E14');

    for (let tx = px2 + 12; tx <= px2 + pw2 - 12; tx += 32) {
      r(tx - 2, py2 + ph2, 6, 16, '#46260C');
      r(tx, py2 + ph2, 2, 16, '#744618');
    }
  };

  // ── 4. NATURAL WOODLAND SPRING & RIVER STREAM ──────────────────────
  const drawRiver = () => {
    const rLi = T * 46; // 368px
    const rYi = T * 26; // 208px
    const rWi = T * 4;  // 32px

    // 1. Natural Forest Spring Source (Headwaters emerging from Whispering Woods)
    // Rocky culvert & waterfall pool at y = 196..212
    r(rLi - 8, rYi - 14, rWi + 16, 16, '#2E4C24'); // Forest clearing pool base
    r(rLi - 6, rYi - 12, rWi + 12, 14, '#1E3A18');
    // Mossy granite boulders framing the spring
    r(rLi - 10, rYi - 12, 10, 12, '#475569');
    r(rLi - 8, rYi - 10, 6, 8, '#64748B');
    r(rLi - 6, rYi - 12, 4, 3, '#15803D'); // Moss cap
    r(rLi + rWi, rYi - 12, 10, 12, '#475569');
    r(rLi + rWi + 2, rYi - 10, 6, 8, '#64748B');
    r(rLi + rWi + 2, rYi - 12, 4, 3, '#15803D'); // Moss cap
    // Bubbling waterfall foam & spray at spring mouth
    r(rLi - 2, rYi - 8, rWi + 4, 8, '#38BDF8');
    r(rLi, rYi - 6, rWi, 6, '#7DD3FC');
    r(rLi + 2, rYi - 4, rWi - 4, 4, '#FFFFFF');
    r(rLi + 4, rYi - 2, rWi - 8, 2, '#E0F2FE');

    // 2. Riverbed Excavation & Sandy/Rocky Embankment
    r(rLi - 4, rYi, rWi + 8, ih - rYi, '#6A4420'); // Dark earthy bed
    r(rLi - 2, rYi, rWi + 4, ih - rYi, '#8C6032'); // Sandy wet bank
    r(rLi - 1, rYi, 1, ih - rYi, '#A67C52');       // West waterline highlight
    r(rLi + rWi, rYi, 1, ih - rYi, '#A67C52');     // East waterline highlight

    // 3. Flowing Water Channel (Multi-shade depth)
    r(rLi, rYi, rWi, ih - rYi, '#38BDF8'); // Outer clear water
    r(rLi + 4, rYi, rWi - 8, ih - rYi, '#0284C7'); // Deep central current
    r(rLi + 8, rYi, rWi - 16, ih - rYi, '#0369A1'); // Deepest trench

    // 4. Dynamic Water Currents & Foaming Ripples
    for (let ty = rYi + 4; ty < ih; ty += 14) {
      const shift = ((ty * 7) % 9) - 4;
      r(rLi + 3 + shift, ty, 8, 1, '#E0F2FE');
      r(rLi + rWi - 11 - shift, ty + 7, 7, 1, '#BAE6FD');
    }

    // 5. Riverbank Pebbles & River Rocks
    const riverPebble = (px: number, py: number, col: string) => {
      r(px, py, 3, 2, '#334155');
      r(px + 1, py, 2, 1, col);
    };
    riverPebble(rLi - 3, rYi + 18, '#94A3B8');
    riverPebble(rLi + rWi + 1, rYi + 32, '#CBD5E1');
    riverPebble(rLi - 2, rYi + 75, '#94A3B8');
    riverPebble(rLi + rWi + 1, rYi + 110, '#CBD5E1');
    riverPebble(rLi - 3, rYi + 160, '#94A3B8');
    riverPebble(rLi + rWi + 2, rYi + 220, '#CBD5E1');

    // 6. Blooming Water Lilies
    const lily = (lx: number, ly: number) => {
      r(lx, ly, 7, 6, '#15803D');
      r(lx + 2, ly + 1, 3, 3, '#166534');
      r(lx + 3, ly + 2, 2, 2, '#F43F5E'); // Pink blossom
      r(lx + 3, ly + 2, 1, 1, '#FEF08A'); // Core
    };
    lily(rLi + 3, T * 29);
    lily(rLi + 18, T * 36);
    lily(rLi + 5, T * 51);
    lily(rLi + 16, T * 58);
  };

  // ── 5. TIMBER & STONE RIVER CROSSING BRIDGE ──────────────────────
  // Coordinates: bx: 354, by: 330, bw: 62, bh: 42 (scales 2x to world x: 708..832, y: 660..744)
  const drawBridge = () => {
    const bx = 354;
    const by = 330;
    const bw = 62;
    const bh = 42;

    // 1. Soft bridge drop shadow cast onto the river water
    r(bx + 4, by + bh, bw - 8, 8, 'rgba(0, 0, 0, 0.4)');

    // 2. Heavy Stone Abutments on West & East banks
    // West Stone Abutment Pier (x: 350..362)
    r(bx - 4, by - 2, 12, bh + 4, '#1E293B');
    r(bx - 2, by, 8, bh, '#475569');
    r(bx - 2, by, 2, bh, '#94A3B8'); // Stone highlight
    r(bx + 4, by, 2, bh, '#334155'); // Mortar shadow
    // East Stone Abutment Pier (x: 404..416)
    r(bx + bw - 8, by - 2, 12, bh + 4, '#1E293B');
    r(bx + bw - 6, by, 8, bh, '#475569');
    r(bx + bw - 6, by, 2, bh, '#94A3B8');
    r(bx + bw, by, 2, bh, '#334155');

    // 3. Heavy Timber Longitudinal Stringer Beams (Underneath decking)
    r(bx + 4, by + 2, bw - 8, 4, '#451A03');
    r(bx + 4, by + bh - 6, bw - 8, 4, '#451A03');
    r(bx + 4, by + Math.floor(bh / 2) - 2, bw - 8, 4, '#3E1802');

    // 4. Horizontal Weathered Oak Timber Decking Planks
    const plankW = 7;
    for (let tx = bx + 4; tx < bx + bw - 4; tx += plankW) {
      const curW = Math.min(plankW - 1, bx + bw - 4 - tx);
      // Main plank face
      r(tx, by + 3, curW, bh - 6, '#B47832');
      // Plank top highlight
      r(tx + 1, by + 3, curW - 1, 2, '#D8A056');
      // Plank right seam shadow
      r(tx + curW - 1, by + 3, 1, bh - 6, '#7A4814');
      // Iron nail spikes on plank ends
      r(tx + 1, by + 5, 1, 1, '#271708');
      r(tx + curW - 2, by + 5, 1, 1, '#271708');
      r(tx + 1, by + bh - 7, 1, 1, '#271708');
      r(tx + curW - 2, by + bh - 7, 1, 1, '#271708');
    }

    // 5. Heavy Timber Guardrails (North & South Rails)
    // North Rail
    r(bx - 4, by - 3, bw + 8, 5, '#5C2E0A');
    r(bx - 4, by - 3, bw + 8, 1, '#8C4B18'); // Specular wood grain
    r(bx - 4, by + 1, bw + 8, 1, '#3B1C05');
    // South Rail
    r(bx - 4, by + bh - 2, bw + 8, 5, '#5C2E0A');
    r(bx - 4, by + bh - 2, bw + 8, 1, '#8C4B18');
    r(bx - 4, by + bh + 2, bw + 8, 1, '#3B1C05');

    // Vertical Baluster Spindles along Guardrails
    for (let tx = bx; tx <= bx + bw; tx += 12) {
      r(tx - 1, by - 4, 3, 7, '#3B1C05');
      r(tx, by - 4, 1, 7, '#7A4814');
      r(tx - 1, by + bh - 3, 3, 7, '#3B1C05');
      r(tx, by + bh - 3, 1, 7, '#7A4814');
    }

    // 6. Carved Corner Lantern Posts with Warm Glowing Amber Lanterns
    const bridgeLantern = (lx: number, ly: number) => {
      // Wood/stone post
      r(lx - 2, ly - 6, 5, 10, '#1E293B');
      r(lx - 1, ly - 5, 3, 8, '#64748B');
      r(lx, ly - 5, 1, 8, '#94A3B8');
      // Brass lantern hood
      r(lx - 2, ly - 10, 5, 2, '#78350F');
      r(lx - 1, ly - 12, 3, 2, '#B45309');
      // Glowing amber core
      r(lx - 2, ly - 8, 5, 3, '#F59E0B');
      r(lx - 1, ly - 7, 3, 1, '#FEF08A');
    };
    bridgeLantern(bx - 2, by);
    bridgeLantern(bx - 2, by + bh);
    bridgeLantern(bx + bw + 1, by);
    bridgeLantern(bx + bw + 1, by + bh);
  };

  // ── 6. MULTI-PASS LAYERED VILLAGE STREET & PROMENADE NETWORK ──────
  const drawRoadsAndSidewalks = () => {
    const swW = 12; // Sidewalk width

    // Street Lantern helper
    const streetLantern = (lx: number, ly: number) => {
      r(lx - 1, ly - 14, 3, 14, '#1E293B');
      r(lx, ly - 14, 1, 14, '#475569');
      r(lx - 3, ly - 18, 7, 4, '#0F172A');
      r(lx - 2, ly - 16, 5, 3, '#F59E0B');
      r(lx - 1, ly - 15, 3, 1, '#FEF08A');
    };

    // ── A. WEST BANK MULTI-PASS LAYERED ROAD NETWORK ───────────────
    // Three orthogonal segments forming a continuous S-avenue from West border to River Bridge:
    // - seg1: Plaza Boulevard (x: 16..296, y: 252..292)
    // - seg2: River Approach Avenue (x: 256..296, y: 252..370) — stays 30px east of Right Tent (x: 210)
    // - seg3: Bridge Entrance Avenue (x: 256..354, y: 330..370) — joins Bridge deck at x: 354
    const roadSegments = [
      { x: 16, y: 252, w: 280, h: 40 },
      { x: 256, y: 252, w: 40, h: 118 },
      { x: 256, y: 330, w: 98, h: 40 },
    ];

    // PASS 1: Outer Sidewalk Stone & Expansion Joints (drawn for all segments first)
    for (const seg of roadSegments) {
      const sx = Math.max(16, seg.x - swW - 2);
      const sy = seg.y - swW - 2;
      const sxEnd = Math.min(354, seg.x + seg.w + swW + 2);
      const sw = sxEnd - sx;
      const sh = seg.h + (swW + 2) * 2;
      r(sx - 1, sy - 1, sw + 2, sh + 2, '#64748B');
    }
    for (const seg of roadSegments) {
      const sx = Math.max(16, seg.x - swW - 2);
      const sy = seg.y - swW - 2;
      const sxEnd = Math.min(354, seg.x + seg.w + swW + 2);
      const sw = sxEnd - sx;
      const sh = seg.h + (swW + 2) * 2;
      r(sx, sy, sw, sh, '#D8D2C8');

      // Subtle sidewalk paver grid lines every 16px
      for (let gx = Math.ceil(sx / 16) * 16; gx < sx + sw; gx += 16) {
        r(gx, sy, 1, sh, '#B8B1A5');
      }
      for (let gy = Math.ceil(sy / 16) * 16; gy < sy + sh; gy += 16) {
        r(sx, gy, sw, 1, '#B8B1A5');
      }
    }

    // PASS 2: Granite Curb Border (drawn around all road segments)
    for (const seg of roadSegments) {
      const cx = Math.max(16, seg.x - 2);
      const cy = seg.y - 2;
      const cxEnd = Math.min(354, seg.x + seg.w + 2);
      const cw = cxEnd - cx;
      const ch = seg.h + 4;
      r(cx, cy, cw, ch, '#64748B');
      r(cx, cy, cw, 1, '#CBD5E1');
      r(cx, cy, 1, ch, '#CBD5E1');
    }

    // PASS 3: Continuous Roadbed Fill (carves out all intersections seamlessly with zero internal bars!)
    for (const seg of roadSegments) {
      r(seg.x, seg.y, seg.w, seg.h, '#334155');
      // Subtle aggregate texture inside roadbed
      for (let py = seg.y + 2; py < seg.y + seg.h - 2; py += 4) {
        for (let px = seg.x + 2; px < seg.x + seg.w - 2; px += 4) {
          const hash = ((px * 37 + py * 59) ^ (px * 19)) % 11;
          if (hash === 0) r(px, py, 1, 1, '#475569');
          else if (hash === 1) r(px, py, 1, 1, '#273142');
        }
      }
    }

    // PASS 4: Road Markings & Pedestrian Crosswalks
    // Center dashed line along Plaza Boulevard (seg1)
    for (let x = 24; x < 260; x += 22) {
      const dashW = Math.min(12, 260 - x);
      r(x, 271, dashW, 2, '#F8FAFC');
      r(x, 273, dashW, 1, 'rgba(0, 0, 0, 0.25)');
    }
    // Center dashed line along River Approach Avenue (seg2)
    for (let y = 278; y < 342; y += 22) {
      const dashH = Math.min(12, 342 - y);
      r(275, y, 2, dashH, '#F8FAFC');
      r(277, y, 1, dashH, 'rgba(0, 0, 0, 0.25)');
    }
    // Center dashed line along Bridge Entrance Avenue (seg3)
    for (let x = 284; x < 336; x += 22) {
      const dashW = Math.min(12, 336 - x);
      r(x, 349, dashW, 2, '#F8FAFC');
      r(x, 351, dashW, 1, 'rgba(0, 0, 0, 0.25)');
    }

    // Crosswalk 1: Plaza Promenade to Adventure Camp (x: 168..180)
    for (let zy = 255; zy <= 287; zy += 5) {
      r(166, zy, 18, 3, '#F8FAFC');
      r(166, zy + 3, 18, 1, 'rgba(0, 0, 0, 0.25)');
    }
    // Crosswalk 2: Bridge Entrance (x: 342..352)
    for (let zy = 333; zy <= 365; zy += 5) {
      r(341, zy, 11, 3, '#F8FAFC');
      r(341, zy + 3, 11, 1, 'rgba(0, 0, 0, 0.25)');
    }

    // ── B. PLAZA CONNECTIONS & ADVENTURE CAMP ENTRANCE PATH ────────
    // North sidewalk connector from Boulevard to Plaza (x: 146..174, y: 210..240)
    r(146, 210, 28, 30, '#D8D2C8');
    r(146, 210, 1, 30, '#64748B');
    r(173, 210, 1, 30, '#64748B');

    // South stone walkway from Boulevard straight between the two Camp Tents (x: 166..184, y: 306..368)
    // Left Tent is at x=140, Right Tent is at x=210, Campfire is at (175, 390) — zero overlap!
    r(165, 306, 20, 62, '#64748B');
    r(166, 306, 18, 61, '#D8D2C8');
    for (let py = 312; py < 366; py += 8) {
      r(166, py, 18, 1, '#B8B1A5');
      r(167, py + 1, 16, 1, '#E5DFD5');
    }

    // Alley between Cottage and Town Hall
    r(124, 78, 42, 60, '#D8D2C8');
    r(76, 92, 60, 16, '#D8D2C8');
    r(186, 90, 48, 16, '#D8D2C8');

    // Street Lanterns along West Bank avenues
    streetLantern(142, 238);
    streetLantern(242, 314);
    streetLantern(312, 316);
    streetLantern(346, 316);
    streetLantern(346, 384);

    // ── C. PLAZA RUNNING-BOND COBBLESTONE PAVING ───────────────────
    const px = 38;
    const py = 104;
    const pw = 240;
    const ph = 142;

    r(px - 4, py - 4, pw + 8, ph + 8, '#8C6032');
    r(px - 2, py - 2, pw + 4, ph + 4, '#CBD5E1');
    r(px - 2, py - 2, pw + 4, 2, '#F8FAFC');
    r(px - 2, py + ph, pw + 4, 2, '#64748B');

    const stoneColA = '#E2E8F0';
    const stoneColB = '#CBD5E1';
    const stoneHi = '#F8FAFC';
    const stoneSh = '#94A3B8';
    const mortar = '#475569';

    r(px, py, pw, ph, mortar);
    const stoneW = 12;
    const stoneH = 7;
    for (let y = py + 2; y < py + ph - 2; y += stoneH) {
      const row = Math.floor((y - py) / stoneH);
      const rowOffset = (row % 2) * 6;
      for (let x = px + 2 + rowOffset - 6; x < px + pw - 2; x += stoneW) {
        if (x < px || x + stoneW - 1 > px + pw) continue;
        const useAlt = (row + Math.floor(x / stoneW)) % 3 === 0;
        const baseCol = useAlt ? stoneColB : stoneColA;

        r(x + 1, y, stoneW - 2, stoneH - 1, baseCol);
        r(x, y + 1, stoneW, stoneH - 3, baseCol);
        r(x + 2, y + 1, stoneW - 4, 1, stoneHi);
        r(x + 1, y + 2, 1, stoneH - 4, stoneHi);
        r(x + 2, y + stoneH - 2, stoneW - 3, 1, stoneSh);
        r(x + stoneW - 1, y + 2, 1, stoneH - 4, stoneSh);
      }
    }

    // North stairs from Plaza to Whispering Woods
    const stairX = 276;
    const stairY = 56;
    const stairW = 44;
    const stairH = 26;

    r(stairX - 3, stairY - 2, stairW + 6, stairH + 4, '#475569');
    r(stairX - 2, stairY - 2, 2, stairH + 4, '#94A3B8');
    r(stairX + stairW, stairY - 2, 2, stairH + 4, '#64748B');

    const numSteps = 4;
    const stepH = Math.floor(stairH / numSteps);
    for (let s = 0; s < numSteps; s++) {
      const sy = stairY + s * stepH;
      r(stairX, sy, stairW, 2, '#475569');
      r(stairX, sy + 2, stairW, stepH - 2, '#CBD5E1');
      r(stairX, sy + 2, stairW, 1, '#F8FAFC');
    }

    const drawPillar = (plX: number, plY: number) => {
      r(plX - 1, plY - 1, 6, 12, '#1E293B');
      r(plX, plY, 4, 10, '#94A3B8');
      r(plX, plY, 4, 1, '#F8FAFC');
      r(plX, plY + 9, 4, 1, '#475569');
      r(plX + 1, plY - 3, 2, 3, '#0F172A');
      r(plX, plY - 4, 4, 2, '#F59E0B');
    };
    drawPillar(stairX - 4, stairY);
    drawPillar(stairX - 4, stairY + stairH - 4);
    drawPillar(stairX + stairW + 1, stairY);
    drawPillar(stairX + stairW + 1, stairY + stairH - 4);

    // ── D. EAST BANK MULTI-PASS STONE PROMENADE (TO PIER & WOODS) ──
    // Grounded stone walkway connecting River Bridge (x: 416) to Crystal Bay Pier (x: 648, y: 232)
    // and Whispering Woods (y: 204). Rendered in 2 global passes so corners have zero seams!
    const eastPromenadeSegments = [
      { x: 416, y: 337, w: 112, h: 28 }, // East from Bridge
      { x: 500, y: 234, w: 28, h: 131 }, // North avenue toward Coast & Woods
      { x: 500, y: 234, w: 148, h: 28 }, // East straight into Crystal Bay Pier (x: 648, y: 232)
      { x: 502, y: 204, w: 24, h: 32 },  // North entrance into Whispering Woods
    ];

    // PASS 1: Stone Curb Border for all East Bank Promenade segments
    for (const seg of eastPromenadeSegments) {
      r(seg.x - 2, seg.y - 2, seg.w + 4, seg.h + 4, '#64748B');
      r(seg.x - 1, seg.y - 1, seg.w + 2, seg.h + 2, '#94A3B8');
    }

    // PASS 2: Continuous Stone Paver Fill & Subtle Running-Bond Joints
    for (const seg of eastPromenadeSegments) {
      r(seg.x, seg.y, seg.w, seg.h, '#D8D2C8');
      for (let gx = Math.ceil(seg.x / 14) * 14; gx < seg.x + seg.w; gx += 14) {
        r(gx, seg.y, 1, seg.h, '#B8B1A5');
      }
      for (let gy = Math.ceil(seg.y / 14) * 14; gy < seg.y + seg.h; gy += 14) {
        r(seg.x, gy, seg.w, 1, '#B8B1A5');
      }
      r(seg.x, seg.y, seg.w, 1, '#E5DFD5');
    }

    // Lanterns along East Bank Promenade
    streetLantern(432, 334);
    streetLantern(532, 366);
    streetLantern(496, 232);
    streetLantern(632, 232);
  };

  // ── 7. WALK-IN COZY COTTAGE / POTION SHOP (HABBLAUD 3/4 STYLE) ─────
  // Coordinates: x: 40, y: 24, w: 96, h: 74
  const drawCottage = () => {
    const bx = 40;
    const by = 24;
    const bw = 96;
    const bh = 74;
    const wallH = 16;

    r(bx - 3, by + bh, bw + 6, 6, 'rgba(0, 0, 0, 0.4)');

    const floorY = by + wallH;
    const floorH = bh - wallH;
    r(bx, floorY, bw, floorH, '#B47832');

    const plankH = 8;
    for (let y = floorY; y < floorY + floorH; y += plankH) {
      r(bx, y + plankH - 1, bw, 1, '#7A4814');
      r(bx, y, bw, 1, '#D8A056');
      const row = Math.floor((y - floorY) / plankH);
      for (let x = bx + (row % 2) * 16; x < bx + bw; x += 32) {
        r(x, y, 1, plankH, '#5A3208');
      }
    }

    const rx = bx + 16;
    const ry = floorY + 12;
    const rw = 40;
    const rh = 28;
    r(rx - 1, ry - 1, rw + 2, rh + 2, '#451A03');
    r(rx, ry, rw, rh, '#991B1B');
    r(rx + 2, ry + 2, rw - 4, rh - 4, '#DC2626');
    r(rx + 4, ry + 4, rw - 8, rh - 8, '#F59E0B');
    r(rx + 6, ry + 6, rw - 12, rh - 12, '#FEF08A');

    r(bx, by, bw, wallH, '#E2E8F0');
    r(bx, by, bw, 2, '#CBD5E1');
    r(bx, by, bw, 1, '#F8FAFC');
    r(bx, by + wallH - 2, bw, 2, '#94A3B8');

    for (let px = bx + 6; px < bx + bw - 6; px += 10) {
      r(px, by + 2, 2, wallH - 4, '#64748B');
    }

    // Glowing Stone Fireplace
    const fpX = bx + 6;
    const fpY = by + 2;
    const fpW = 24;
    const fpH = wallH + 10;
    r(fpX, fpY, fpW, fpH, '#334155');
    r(fpX + 1, fpY + 1, fpW - 2, 2, '#64748B');
    r(fpX + 3, fpY + 4, fpW - 6, fpH - 6, '#0F172A');
    r(fpX + 5, fpY + 8, fpW - 10, fpH - 10, '#DC2626');
    r(fpX + 7, fpY + 11, fpW - 14, fpH - 13, '#F59E0B');
    r(fpX + 9, fpY + 13, fpW - 18, 3, '#FEF08A');

    // Apothecary Shelves
    const apX = bx + 36;
    const apY = by + 2;
    const apW = 52;
    r(apX, apY, apW, 12, '#5A3208');
    r(apX, apY + 5, apW, 2, '#8C5218');
    r(apX, apY + 11, apW, 2, '#8C5218');

    const botCols = ['#EF4444', '#10B981', '#3B82F6', '#A855F7', '#F59E0B', '#06B6D4'];
    for (let i = 0; i < 5; i++) {
      r(apX + 3 + i * 10, apY + 1, 4, 4, botCols[i % botCols.length]);
      r(apX + 4 + i * 10, apY - 1, 2, 2, '#CBD5E1');
      r(apX + 3 + i * 10, apY + 7, 4, 4, botCols[(i + 3) % botCols.length]);
      r(apX + 4 + i * 10, apY + 5, 2, 2, '#CBD5E1');
    }

    // Perimeter walls
    r(bx, by + wallH, 4, bh - wallH, '#475569');
    r(bx + 1, by + wallH, 1, bh - wallH, '#94A3B8');
    r(bx + bw - 4, by + wallH, 4, bh - wallH, '#475569');
    r(bx + bw - 2, by + wallH, 1, bh - wallH, '#94A3B8');

    // Low south parapet wall with open doorway
    const southY = by + bh - 6;
    const doorX = bx + 42;
    const doorW = 20;

    r(bx, southY, doorX - bx, 6, '#334155');
    r(bx, southY, doorX - bx, 2, '#64748B');
    r(doorX + doorW, southY, bx + bw - (doorX + doorW), 6, '#334155');
    r(doorX + doorW, southY, bx + bw - (doorX + doorW), 2, '#64748B');

    // Open Doorway Threshold
    r(doorX, southY - 2, doorW, 8, '#CBD5E1');
    r(doorX, southY - 2, doorW, 1, '#F8FAFC');
  };

  // ── 8. WALK-IN TOWN HALL / GUILD HOUSE (HABBLAUD 3/4 STYLE) ────────
  // Coordinates: x: 152, y: 16, w: 120, h: 78
  const drawTownHall = () => {
    const bx = 152;
    const by = 16;
    const bw = 120;
    const bh = 78;
    const wallH = 16;

    r(bx - 3, by + bh, bw + 6, 6, 'rgba(0, 0, 0, 0.4)');

    const floorY = by + wallH;
    const floorH = bh - wallH;
    const tileSize = 8;
    for (let y = floorY; y < floorY + floorH; y += tileSize) {
      for (let x = bx; x < bx + bw; x += tileSize) {
        const isWhite = (Math.floor((x - bx) / tileSize) + Math.floor((y - floorY) / tileSize)) % 2 === 0;
        const curW = Math.min(tileSize, bx + bw - x);
        const curH = Math.min(tileSize, floorY + floorH - y);
        r(x, y, curW, curH, isWhite ? '#F8FAFC' : '#1E293B');
        if (isWhite && curW > 1 && curH > 1) {
          r(x + 1, y + 1, curW - 2, 1, '#FFFFFF');
        }
      }
    }

    r(bx, by, bw, wallH, '#1E293B');
    r(bx, by, bw, 2, '#475569');
    r(bx, by, bw, 1, '#94A3B8');
    r(bx, by + wallH - 2, bw, 2, '#0F172A');

    for (let px = bx + 8; px < bx + bw - 8; px += 8) {
      r(px, by + 2, 1, wallH - 4, '#334155');
    }

    // Grand Guild Banner
    const banX = bx + 48;
    const banY = by + 2;
    r(banX, banY, 24, 13, '#1E3A8A');
    r(banX + 2, banY + 2, 20, 9, '#2563EB');
    r(banX + 10, banY + 4, 4, 5, '#FBBF24');
    r(banX + 8, banY + 6, 8, 2, '#FBBF24');

    // Grand Council Table
    const tblX = bx + 36;
    const tblY = floorY + 16;
    const tblW = 48;
    const tblH = 22;

    r(tblX - 1, tblY + tblH, tblW + 2, 4, 'rgba(0, 0, 0, 0.3)');
    r(tblX, tblY, tblW, tblH, '#451A03');
    r(tblX + 2, tblY + 2, tblW - 4, tblH - 4, '#78350F');
    r(tblX + 2, tblY + 2, tblW - 4, 1, '#B45309');

    // Leather Armchairs
    const chair = (cx: number, cy: number) => {
      r(cx, cy, 8, 8, '#7F1D1D');
      r(cx + 1, cy + 1, 6, 6, '#991B1B');
      r(cx + 2, cy + 2, 4, 4, '#DC2626');
    };
    chair(tblX + 6, tblY - 7);
    chair(tblX + 20, tblY - 7);
    chair(tblX + 34, tblY - 7);
    chair(tblX + 6, tblY + tblH - 1);
    chair(tblX + 20, tblY + tblH - 1);
    chair(tblX + 34, tblY + tblH - 1);

    // Perimeter walls
    r(bx, by + wallH, 6, bh - wallH, '#475569');
    r(bx + 1, by + wallH, 2, bh - wallH, '#94A3B8');
    r(bx + bw - 6, by + wallH, 6, bh - wallH, '#475569');
    r(bx + bw - 3, by + wallH, 2, bh - wallH, '#94A3B8');

    // Low south parapet wall with open double doorway
    const southY = by + bh - 8;
    const doorX = bx + 48;
    const doorW = 24;

    r(bx, southY, doorX - bx, 8, '#334155');
    r(bx, southY, doorX - bx, 2, '#64748B');
    r(doorX + doorW, southY, bx + bw - (doorX + doorW), 8, '#334155');
    r(doorX + doorW, southY, bx + bw - (doorX + doorW), 2, '#64748B');

    // Open double doorway threshold
    r(doorX, southY - 2, doorW, 10, '#E2E8F0');
    r(doorX, southY - 2, doorW, 1, '#F8FAFC');
    r(doorX + Math.floor(doorW / 2) - 1, southY - 2, 2, 10, '#94A3B8');
  };

  // ── 9. CLIFF ROCK FORMATIONS & CRAGGY RIDGE ──────────────────────
  const drawCliffs = () => {
    const drawRockCluster = (rx: number, ry: number, rw: number, rh: number) => {
      r(rx - 1, ry - 1, rw + 2, rh + 2, '#2E1A0C');
      r(rx, ry, rw, rh, '#74543C');
      r(rx, ry, rw, 2, '#A67C52');
      r(rx, ry + rh - 3, rw, 3, '#4A301C');
      r(rx + 4, ry + 2, 2, rh - 4, '#3E2412');
      r(rx + Math.floor(rw / 2), ry + rh - 2, 4, 2, '#2E8024');
    };

    drawRockCluster(12, 280, 24, 18);
    drawRockCluster(10, 310, 28, 22);
    drawRockCluster(14, 342, 22, 16);
    drawRockCluster(8, 370, 30, 24);
    drawRockCluster(12, 404, 26, 20);

    const cx = 16;
    const cy = 346;
    r(cx, cy, 14, 12, '#140A04');
    r(cx + 2, cy - 2, 10, 3, '#74543C');
  };

  // ── 10. RETRO FANTASY CARVED WAYMARKERS & SIGNPOSTS ───────────────
  // Replaces harsh black boxes with authentic RPG wooden/stone signboards
  const drawWaymarkers = () => {
    const waymarker = (text: string, x: number, y: number, color: string) => {
      ctx.font = 'bold 6px monospace';
      const textWidth = ctx.measureText(text).width;
      const bw = Math.ceil(textWidth) + 8;
      const bh = 11;

      // Wooden signpost drop shadow
      r(x, y + 1, bw, bh, 'rgba(0, 0, 0, 0.35)');
      // Carved wood frame
      r(x, y, bw, bh, '#3E1D08');
      r(x + 1, y + 1, bw - 2, bh - 2, color);
      r(x + 1, y + 1, bw - 2, 1, 'rgba(255, 255, 255, 0.4)');
      r(x + 1, y + bh - 2, bw - 2, 1, 'rgba(0, 0, 0, 0.3)');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(text, x + 4, y + 8);
    };

    waymarker('🏡 VERDANT PLAZA', T * 20, T * 13, '#15803D');
    waymarker('🌲 WHISPERING WOODS', T * 54, T * 3, '#1E6020');
    waymarker('🏖️ CRYSTAL BAY', T * 82, T * 3, '#0284C7');
    waymarker('⛰️ CRAGGY RIDGE', T * 5, T * 32, '#854D0E');
    waymarker('🔥 ADVENTURE CAMP', T * 26, T * 54, '#B45309');
    waymarker('🌉 RIVER CROSSING', T * 42, T * 40, '#0D9488');
  };

  // ── EXECUTE ALL RENDER PASSES IN DEPTH-SORTED SEQUENCE ───────────
  drawGrass();
  drawForestZone();
  drawWater();
  drawRiver();
  drawRoadsAndSidewalks();
  drawBridge();
  drawCottage();
  drawTownHall();
  drawCliffs();
  drawWaymarkers();
}
