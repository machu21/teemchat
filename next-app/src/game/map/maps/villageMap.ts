// ============================================================
// HIGH-FIDELITY RETRO 16-BIT PIXEL-ART WORLD MAP: VERDANT VILLAGE
// Habblaud Top-Down 3/4 Architectural & Landscape System:
// - Paved asphalt boulevard with aggregate grain & dashed road markings
// - Habblaud running-bond paver sidewalks with curb lines & stone joints
// - Walk-in Cozy Cottage with warm wood floor, glowing fireplace & apothecary
// - Walk-in Town Hall with checkered marble floor & council table
// - Multi-tier lush foliage with ambient drop shadows
// - River crossing bridge, Whispering Woods, Adventure Camp & Crystal Bay
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

  // ── 4. RIVER CROSSING STREAM ──────────────────────────────────────
  const drawRiver = () => {
    const rLi = T * 46;
    const rYi = T * 26;
    const rWi = T * 4;

    r(rLi - 3, rYi, rWi + 6, ih - rYi, '#7C5228');
    r(rLi - 1, rYi, 1, ih - rYi, '#A07038');
    r(rLi + rWi, rYi, 1, ih - rYi, '#A07038');

    r(rLi, rYi, rWi, ih - rYi, '#3AA8DC');
    r(rLi + Math.floor(rWi / 4), rYi, Math.floor(rWi / 2), ih - rYi, '#2288C4');

    for (let ty = rYi + 8; ty < ih; ty += 18) {
      r(rLi + 2, ty, 8, 1, '#A0E8FF');
      r(rLi + rWi - 10, ty + 8, 8, 1, '#A0E8FF');
    }

    const lily = (lx: number, ly: number) => {
      r(lx, ly, 8, 7, '#2E8024');
      r(lx + 2, ly + 2, 4, 4, '#1C5C16');
      r(lx + 3, ly + 1, 2, 2, '#F43F5E');
    };
    lily(rLi + 4, T * 29);
    lily(rLi + 16, T * 36);
    lily(rLi + 6, T * 51);
  };

  // ── 5. TIMBER RIVER BRIDGE ─────────────────────────────────────────
  const drawBridge = () => {
    const bx = T * 45;
    const by = T * 42;
    const bw = T * 6;
    const bh = T * 4;

    r(bx + 2, by + bh, bw, 6, 'rgba(0, 0, 0, 0.35)');
    for (let tx = bx; tx < bx + bw; tx += 6) {
      r(tx, by, 5, bh, '#B47832');
      r(tx + 1, by, 3, 2, '#D8A056');
      r(tx + 4, by, 1, bh, '#7A4814');
    }
    r(bx - 2, by, bw + 4, 3, '#6A3810');
    r(bx - 2, by + bh - 3, bw + 4, 3, '#6A3810');

    for (let tx = bx; tx <= bx + bw; tx += Math.floor(bw / 2)) {
      r(tx - 1, by - 4, 4, bh + 8, '#4E2408');
      r(tx, by - 4, 2, bh + 8, '#7A4814');
    }
  };

  // ── 6. REALISTIC ASPHALT BOULEVARD & HABBLAUD PAVER SIDEWALKS ──────
  // Draws authentic Habblaud 16x8 paver slab sidewalk in a rectangular patch
  const drawPaverSidewalk = (sx: number, sy: number, sw: number, sh: number, orientation: 'h' | 'v' = 'h') => {
    const tones = ['#D3CDC2', '#CFC8BC', '#D8D2C8'];
    const joint = '#B8B1A5';
    const highlight = '#E5DFD5';

    // Base fill
    r(sx, sy, sw, sh, tones[0]);

    if (orientation === 'h') {
      const slabH = 8;
      const slabW = 16;
      for (let y = sy; y < sy + sh; y += slabH) {
        const row = Math.floor((y - sy) / slabH);
        const off = (row % 2) * 8;
        const curH = Math.min(slabH, sy + sh - y);
        r(sx, y + curH - 1, sw, 1, joint);

        for (let x = sx - 8 + off; x < sx + sw; x += slabW) {
          if (x >= sx && x < sx + sw) {
            r(x, y, 1, curH, joint);
            if (curH > 1) r(x + 1, y, Math.min(slabW - 2, sx + sw - (x + 1)), 1, highlight);
          }
          // Slight stone tone speckle
          const toneIdx = (row + Math.floor(x / 16)) % tones.length;
          if (toneIdx > 0 && x + 3 >= sx && x + 10 <= sx + sw && curH > 3) {
            r(x + 3, y + 2, 6, curH - 3, tones[toneIdx]);
          }
        }
      }
    } else {
      const slabW = 8;
      const slabH = 16;
      for (let x = sx; x < sx + sw; x += slabW) {
        const col = Math.floor((x - sx) / slabW);
        const off = (col % 2) * 8;
        const curW = Math.min(slabW, sx + sw - x);
        r(x + curW - 1, sy, 1, sh, joint);

        for (let y = sy - 8 + off; y < sy + sh; y += slabH) {
          if (y >= sy && y < sy + sh) {
            r(x, y, curW, 1, joint);
            if (curW > 1) r(x, y + 1, 1, Math.min(slabH - 2, sy + sh - (y + 1)), highlight);
          }
        }
      }
    }
  };

  const drawRoadsAndSidewalks = () => {
    // ── MAIN VILLAGE BOULEVARD (ASPHALT ROAD) ──────────────────────
    // Runs East-West from West perimeter (x: 20) across to East (x: 370), curving down to River Bridge
    const roadY = 252;
    const roadH = 38;
    const roadX = 20;
    const roadW = 346;

    // Asphalt gravel / road bed foundation
    r(roadX - 2, roadY - 2, roadW + 4, roadH + 4, '#383B42');
    r(roadX, roadY, roadW, roadH, '#4B4F58');

    // Aggregate asphalt texture noise
    for (let y = roadY + 2; y < roadY + roadH - 2; y += 4) {
      for (let x = roadX + 4; x < roadX + roadW - 4; x += 6) {
        const hash = (x * 13 + y * 29) % 7;
        if (hash === 0) r(x, y, 2, 2, '#5A5F6B');
        else if (hash === 1) r(x, y, 1, 1, '#3E4149');
        else if (hash === 2) r(x, y, 2, 1, '#535762');
      }
    }

    // Concrete Stone Curbs (North & South)
    r(roadX, roadY - 3, roadW, 3, '#94A3B8');
    r(roadX, roadY - 1, roadW, 1, '#64748B');
    r(roadX, roadY + roadH, roadW, 3, '#64748B');
    r(roadX, roadY + roadH, roadW, 1, '#94A3B8');

    // Center Dashed White Road Line
    const centerLineY = roadY + Math.floor(roadH / 2) - 1;
    for (let x = roadX + 8; x < roadX + roadW - 12; x += 22) {
      // Don't draw line through zebra crosswalks
      if ((x >= 142 && x <= 178) || (x >= 324 && x <= 352)) continue;
      r(x, centerLineY, 14, 2, '#F8FAFC');
      r(x, centerLineY + 2, 14, 1, 'rgba(0, 0, 0, 0.25)'); // Road paint shadow
    }

    // Pedestrian Zebra Crosswalks
    const drawCrosswalk = (cx: number) => {
      for (let y = roadY + 3; y < roadY + roadH - 3; y += 6) {
        r(cx, y, 22, 3, '#F8FAFC');
        r(cx, y + 3, 22, 1, 'rgba(0,0,0,0.2)');
      }
    };
    drawCrosswalk(150); // Plaza South crosswalk
    drawCrosswalk(328); // Bridge approach crosswalk

    // ── HABBLAUD RUNNING-BOND PAVER SIDEWALKS ──────────────────────
    // 1. South sidewalk along the boulevard
    drawPaverSidewalk(roadX, roadY + roadH + 3, roadW, 16, 'h');

    // 2. North sidewalk along the boulevard
    drawPaverSidewalk(roadX, roadY - 19, roadW, 16, 'h');

    // 3. Central Promenade linking Boulevard to Village Plaza & Houses
    drawPaverSidewalk(146, 210, 28, roadY - 210 - 19, 'v');

    // 4. North Pedestrian Alley between Cottage & Town Hall leading to both doors
    drawPaverSidewalk(124, 78, 42, 60, 'v');
    drawPaverSidewalk(76, 92, 60, 16, 'h'); // Entrance path to Cottage door
    drawPaverSidewalk(186, 90, 48, 16, 'h'); // Entrance path to Town Hall door

    // ── PLAZA RUNNING-BOND COBBLESTONE PAVING ─────────────────────
    const px = 38;
    const py = 104;
    const pw = 240;
    const ph = 142;

    // Plaza perimeter border
    r(px - 4, py - 4, pw + 8, ph + 8, '#8C6032');
    r(px - 2, py - 2, pw + 4, ph + 4, '#CBD5E1');
    r(px - 2, py - 2, pw + 4, 2, '#F8FAFC');
    r(px - 2, py + ph, pw + 4, 2, '#64748B');

    // Plaza paving blocks with mortar
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

    // ── NORTH STAIRS FROM PLAZA TO WHISPERING WOODS ─────────────
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

    // Balustrade Stone Pillars with Lanterns
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
  };

  // ── 7. WALK-IN COZY COTTAGE / POTION SHOP (HABBLAUD 3/4 STYLE) ─────
  // Coordinates: x: 40, y: 24, w: 96, h: 74
  const drawCottage = () => {
    const bx = 40;
    const by = 24;
    const bw = 96;
    const bh = 74;

    const wallWood = '#78350F';
    const wallCap = '#451A03';
    const baseboard = '#543006';
    const plaster = '#FDE68A';

    // Ambient drop shadow around exterior
    r(bx - 3, by - 3, bw + 6, bh + 8, 'rgba(0, 0, 0, 0.28)');

    // ── INTERIOR PARQUET WOOD FLOOR ──
    const woodTones = ['#C99668', '#C48F61', '#CF9F72', '#C6925F'];
    for (let py = by + 24; py < by + bh - 6; py += 4) {
      const row = Math.floor((py - by) / 4);
      for (let px = bx + 6; px < bx + bw - 6; px += 24) {
        const tone = woodTones[(row + Math.floor(px / 24)) % woodTones.length];
        r(px, py, 23, 3, tone);
        r(px, py, 23, 1, '#DDB489'); // Plank top highlight
        r(px + 23, py, 1, 4, '#8E5A2D'); // Seam
        r(px, py + 3, 24, 1, '#8E5A2D');
      }
    }

    // ── NORTH ELEVATED WALL (32px High) ──
    const wallH = 24;
    r(bx, by, bw, wallH, plaster);
    // Vertical timber studs
    for (let tx = bx; tx <= bx + bw; tx += 16) {
      r(tx, by, 3, wallH, wallWood);
      r(tx + 1, by, 1, wallH, '#A16207');
    }
    // Top wall cap rail
    r(bx - 1, by - 2, bw + 2, 4, wallCap);
    r(bx, by - 2, bw, 1, '#8B5A2B');
    // Wooden baseboard
    r(bx, by + wallH - 3, bw, 3, baseboard);

    // ── STONE CHIMNEY & CRACKLING FIREPLACE ──
    const chX = bx + 8;
    const chY = by - 8;
    // Chimney exterior
    r(chX - 1, chY, 18, 32, '#334155');
    r(chX, chY, 16, 32, '#64748B');
    for (let cy = chY; cy < chY + 32; cy += 4) {
      r(chX, cy, 16, 1, '#475569');
      r(chX + ((cy % 8 === 0) ? 8 : 4), cy, 1, 4, '#475569');
    }
    r(chX - 2, chY - 3, 20, 3, '#94A3B8');

    // Fireplace Mantle & Hearth
    const fpX = bx + 10;
    const fpY = by + 8;
    r(fpX, fpY, 14, 16, '#1E293B'); // Firebox interior
    r(fpX - 2, fpY - 2, 18, 3, wallWood); // Mantle
    // Glowing embers & crackling flames
    r(fpX + 3, fpY + 11, 8, 3, '#EA580C');
    r(fpX + 4, fpY + 9, 6, 3, '#F97316');
    r(fpX + 5, fpY + 7, 4, 3, '#FBBF24');
    r(fpX + 6, fpY + 6, 2, 2, '#FFFFFF'); // Hot flame core

    // ── WALL-MOUNTED POTION APOTHECARY RACK ──
    const potX = bx + 36;
    const potY = by + 6;
    r(potX, potY, 28, 12, '#451A03'); // Wooden shelf
    r(potX + 2, potY + 2, 24, 2, '#78350F');
    r(potX + 2, potY + 8, 24, 2, '#78350F');
    // Colorful potion phials
    r(potX + 4, potY + 4, 3, 4, '#38BDF8'); // Mana blue
    r(potX + 9, potY + 4, 3, 4, '#EF4444'); // Health red
    r(potX + 14, potY + 4, 3, 4, '#22C55E'); // Stamina green
    r(potX + 19, potY + 4, 3, 4, '#A855F7'); // Void purple
    r(potX + 24, potY + 4, 3, 4, '#FACC15'); // Haste yellow

    // ── CIRCULAR WOVEN WOOL RUG ──
    const rugX = bx + 30;
    const rugY = by + 36;
    const rugW = 36;
    const rugH = 20;
    r(rugX + 4, rugY, rugW - 8, rugH, '#F59E0B');
    r(rugX, rugY + 3, rugW, rugH - 6, '#F59E0B');
    r(rugX + 5, rugY + 1, rugW - 10, rugH - 2, '#991B1B');
    r(rugX + 1, rugY + 4, rugW - 2, rugH - 8, '#991B1B');
    r(rugX + Math.floor(rugW / 2) - 3, rugY + Math.floor(rugH / 2) - 2, 6, 4, '#FBBF24');

    // ── ALCHEMIST STUDY DESK & GRIMOIRE ──
    const deskX = bx + 70;
    const deskY = by + 30;
    r(deskX, deskY, 18, 12, '#854D0E');
    r(deskX + 1, deskY + 1, 16, 10, '#A16207');
    r(deskX + 3, deskY + 3, 7, 5, '#FEF08A'); // Open book pages
    r(deskX + 6, deskY + 3, 1, 5, '#78350F'); // Book spine
    r(deskX + 13, deskY + 2, 2, 3, '#38BDF8'); // Inkwell
    r(deskX + 14, deskY + 1, 1, 2, '#FFFFFF'); // Candle flame

    // Wooden study stool
    r(deskX + 6, deskY + 14, 6, 6, '#78350F');
    r(deskX + 7, deskY + 15, 4, 4, '#B45309');

    // ── COZY ARMCHAIR NEAR FIREPLACE ──
    const chairX = bx + 28;
    const chairY = by + 36;
    r(chairX, chairY, 12, 12, '#B91C1C'); // Crimson upholstery
    r(chairX + 1, chairY + 1, 10, 10, '#DC2626');
    r(chairX - 1, chairY + 2, 2, 8, '#78350F'); // Armrest L
    r(chairX + 11, chairY + 2, 2, 8, '#78350F'); // Armrest R

    // ── WEST & EAST PERIMETER TIMBER WALLS ──
    r(bx, by + wallH, 6, bh - wallH, wallWood);
    r(bx + 1, by + wallH, 2, bh - wallH, '#A16207');
    r(bx + bw - 6, by + wallH, 6, bh - wallH, wallWood);
    r(bx + bw - 3, by + wallH, 2, bh - wallH, '#A16207');

    // ── LOW SOUTH PARAPET WALL WITH OPEN DOORWAY ──
    const southY = by + bh - 8;
    const doorX = bx + 42;
    const doorW = 20;

    // South wall left segment
    r(bx, southY, doorX - bx, 8, wallWood);
    r(bx, southY, doorX - bx, 2, wallCap);
    // South wall right segment
    r(doorX + doorW, southY, bx + bw - (doorX + doorW), 8, wallWood);
    r(doorX + doorW, southY, bx + bw - (doorX + doorW), 2, wallCap);

    // OPEN DOORWAY THRESHOLD WITH COZY WELCOME MAT
    r(doorX, southY - 2, doorW, 10, '#E2E8F0'); // Stone step
    r(doorX + 2, southY, doorW - 4, 6, '#78350F'); // Welcome mat
    r(doorX + 3, southY + 1, doorW - 6, 4, '#FDE68A');

    // Exterior Window Planter Boxes
    r(bx + 12, southY + 4, 16, 4, '#451A03');
    r(bx + 13, southY + 3, 14, 2, '#15803D');
    r(bx + 14, southY + 2, 3, 2, '#EF4444');
    r(bx + 20, southY + 2, 3, 2, '#FBBF24');

    r(bx + bw - 28, southY + 4, 16, 4, '#451A03');
    r(bx + bw - 27, southY + 3, 14, 2, '#15803D');
    r(bx + bw - 25, southY + 2, 3, 2, '#38BDF8');
    r(bx + bw - 19, southY + 2, 3, 2, '#F43F5E');
  };

  // ── 8. WALK-IN TOWN HALL / GUILD HOUSE (HABBLAUD 3/4 STYLE) ──────
  // Coordinates: x: 152, y: 16, w: 120, h: 78
  const drawTownHall = () => {
    const bx = 152;
    const by = 16;
    const bw = 120;
    const bh = 78;

    const stoneWall = '#FFFFFF';
    const stoneTrim = '#1E3A8A';
    const gold = '#F59E0B';

    // Ambient drop shadow around exterior
    r(bx - 3, by - 3, bw + 6, bh + 8, 'rgba(0, 0, 0, 0.28)');

    // ── INTERIOR CHECKERED MARBLE & CERAMIC FLOOR ──
    const tileA = '#F2EDE4';
    const tileB = '#D2D8DE';
    for (let py = by + 26; py < by + bh - 6; py += 8) {
      const row = Math.floor((py - by) / 8);
      for (let px = bx + 6; px < bx + bw - 6; px += 8) {
        const col = Math.floor((px - bx) / 8);
        const tileColor = (row + col) % 2 === 0 ? tileA : tileB;
        r(px, py, 7, 7, tileColor);
        r(px, py, 7, 1, '#FFFFFF'); // Gloss gleam
        r(px + 7, py, 1, 8, '#94A3B8'); // Grout line
        r(px, py + 7, 8, 1, '#94A3B8');
      }
    }

    // ── NORTH ELEVATED WALL (32px High) ──
    const wallH = 26;
    r(bx, by, bw, wallH, stoneWall);
    // Classical pilasters
    for (let tx = bx; tx <= bx + bw; tx += 24) {
      r(tx, by, 4, wallH, stoneTrim);
      r(tx + 1, by, 2, wallH, '#3B82F6');
    }
    // Grand crown cornice
    r(bx - 2, by - 3, bw + 4, 4, '#0F172A');
    r(bx - 1, by - 2, bw + 2, 2, gold);
    // Baseboard molding
    r(bx, by + wallH - 3, bw, 3, '#1E293B');

    // ── GRAND HERALDRY GUILD CREST BANNER ──
    const banX = bx + 16;
    const banY = by + 3;
    r(banX, banY, 16, 18, '#991B1B'); // Crimson banner
    r(banX + 2, banY + 2, 12, 14, '#DC2626');
    r(banX + 6, banY + 5, 4, 4, gold); // Gold lion/shield
    r(banX + 7, banY + 4, 2, 6, '#FEF08A');
    r(banX, banY + 18, 8, 3, '#991B1B'); // Banner swallow-tail L
    r(banX + 8, banY + 18, 8, 3, '#991B1B'); // Banner swallow-tail R

    // ── LARGE ARCHED STAINED-GLASS WINDOW ──
    const winX = bx + Math.floor(bw / 2) - 16;
    const winY = by + 4;
    r(winX - 1, winY - 1, 34, 18, '#0F172A');
    r(winX, winY, 32, 16, '#38BDF8');
    r(winX + 2, winY + 2, 28, 12, '#60A5FA');
    // Stained glass tracery
    r(winX + 15, winY, 2, 16, '#0F172A');
    r(winX, winY + 8, 32, 2, '#0F172A');
    r(winX + 4, winY + 3, 6, 4, '#FFFFFF'); // Sunlight gleam

    // ── MUNICIPAL BOOKSHELF DISPLAY ──
    const bookX = bx + bw - 32;
    const bookY = by + 5;
    r(bookX, bookY, 18, 16, '#78350F');
    r(bookX + 2, bookY + 2, 14, 2, '#451A03');
    r(bookX + 2, bookY + 8, 14, 2, '#451A03');
    // Books
    r(bookX + 3, bookY + 4, 3, 4, '#2563EB');
    r(bookX + 7, bookY + 4, 3, 4, '#DC2626');
    r(bookX + 11, bookY + 4, 3, 4, '#16A34A');

    // ── GRAND COUNCIL TABLE & EXECUTIVE CHAIRS ──
    const tabX = bx + 36;
    const tabY = by + 40;
    const tabW = 48;
    const tabH = 20;

    r(tabX, tabY, tabW, tabH, '#78350F'); // Mahogany table
    r(tabX + 2, tabY + 2, tabW - 4, tabH - 4, '#92400E');
    r(tabX + 4, tabY + 3, tabW - 8, 1, '#B45309'); // Table highlight

    // 4 High-Back Leather Chairs
    const drawChair = (cx: number, cy: number) => {
      r(cx, cy, 8, 8, '#0F172A');
      r(cx + 1, cy + 1, 6, 6, '#1E293B');
      r(cx + 2, cy + 2, 4, 4, '#2563EB');
    };
    drawChair(tabX + 8, tabY - 8);
    drawChair(tabX + 32, tabY - 8);
    drawChair(tabX + 8, tabY + tabH);
    drawChair(tabX + 32, tabY + tabH);

    // ── RECEPTION DESK & GUESTBOOK LEDGER ──
    const recX = bx + 94;
    const recY = by + 34;
    r(recX, recY, 18, 24, '#78350F');
    r(recX + 1, recY + 1, 16, 22, '#A16207');
    r(recX + 3, recY + 4, 6, 5, '#FEF08A'); // Ledger pages
    r(recX + 12, recY + 3, 2, 3, '#F59E0B'); // Desk bell

    // Decorative Potted Indoor Ficus
    r(bx + 14, by + 42, 10, 10, '#C2410C'); // Terracotta urn
    r(bx + 12, by + 32, 14, 12, '#15803D'); // Lush leaves
    r(bx + 14, by + 34, 10, 8, '#22C55E');

    // Water Dispenser Cooler
    r(bx + 14, by + 58, 8, 12, '#CBD5E1');
    r(bx + 15, by + 52, 6, 6, '#38BDF8'); // Water bottle
    r(bx + 17, by + 53, 2, 2, '#FFFFFF');

    // ── WEST & EAST PERIMETER STONE WALLS ──
    r(bx, by + wallH, 6, bh - wallH, '#475569');
    r(bx + 1, by + wallH, 2, bh - wallH, '#94A3B8');
    r(bx + bw - 6, by + wallH, 6, bh - wallH, '#475569');
    r(bx + bw - 3, by + wallH, 2, bh - wallH, '#94A3B8');

    // ── LOW SOUTH PARAPET WALL WITH DOUBLE DOORWAY ──
    const southY = by + bh - 8;
    const doorX = bx + 48;
    const doorW = 24;

    // South wall left segment
    r(bx, southY, doorX - bx, 8, '#334155');
    r(bx, southY, doorX - bx, 2, '#64748B');
    // South wall right segment
    r(doorX + doorW, southY, bx + bw - (doorX + doorW), 8, '#334155');
    r(doorX + doorW, southY, bx + bw - (doorX + doorW), 2, '#64748B');

    // OPEN DOUBLE DOORWAY THRESHOLD
    r(doorX, southY - 2, doorW, 10, '#E2E8F0');
    r(doorX, southY - 2, doorW, 1, '#F8FAFC');
    r(doorX + Math.floor(doorW / 2) - 1, southY - 2, 2, 10, '#94A3B8'); // Threshold divider
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

  // ── 10. RETRO FANTASY ZONE LABELS ─────────────────────────────────
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
    label('VERDANT VILLAGE PLAZA', T * 20, T * 13, '#15803D');
    label('WHISPERING WOODS', T * 46, T * 3, '#1E6020');
    label('CRYSTAL BAY', T * 82, T * 3, '#1878B0');
    label('CRAGGY RIDGE', T * 5, T * 32, '#8B5020');
    label('ADVENTURE CAMP', T * 52, T * 30, '#B87820');
    label('RIVER CROSSING', T * 52, T * 47, '#1E8868');
  };

  // ── EXECUTE ALL RENDER PASSES ─────────────────────────────────────
  drawGrass();
  drawForestZone();
  drawWater();
  drawRiver();
  drawBridge();
  drawRoadsAndSidewalks();
  drawCottage();
  drawTownHall();
  drawCliffs();
  drawLabels();
}
