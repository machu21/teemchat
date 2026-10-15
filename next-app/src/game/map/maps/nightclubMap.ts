// ============================================================
// RETRO 16-BIT PIXEL-ART WORLD MAP: NEON VELVET NIGHTCLUB
// ============================================================

export function renderNightclubMap(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  // Base background: Deep midnight noir atmosphere
  r(0, 0, iw, ih, '#030712');

  const nx = 24;
  const ny = 20;
  const nw = iw - 48;
  const nh = ih - 40;

  // Club Exterior Foundation & Dark Steel Trim
  r(nx - 4, ny - 4, nw + 8, nh + 8, '#090D16');
  r(nx, ny, nw, nh, '#0B0F19');

  // Deep dark polished slate dance hall floor
  for (let ty = ny; ty < ny + nh; ty += 24) {
    for (let tx = nx; tx < nx + nw; tx += 24) {
      if ((Math.floor((tx - nx) / 24) + Math.floor((ty - ny) / 24)) % 2 === 0) {
        r(tx, ty, 24, 24, '#111827');
      }
    }
  }

  // ── 1. ZONE: MAIN STAGE & DJ TURNTABLE BOOTH (Top-Left: 32, 28 to 380, 120) ──
  const djX = 32;
  const djY = 28;
  const djW = 350;
  const djH = 92;

  // Elevated DJ Stage Riser
  r(djX, djY, djW, djH, '#1F2937');
  r(djX + 2, djY + 2, djW - 4, djH - 4, '#374151');
  // Front stage gold brass edge
  r(djX, djY + djH - 3, djW, 3, '#F59E0B');

  // Backstage Stage Truss & Laser Spotlight Arrays
  r(djX + 20, djY + 4, djW - 40, 8, '#111827');
  for (let s = 0; s < 8; s++) {
    const lx = djX + 35 + s * 38;
    const lCol = ['#F43F5E', '#06B6D4', '#A855F7', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#06B6D4'][s];
    r(lx, djY + 4, 8, 8, lCol);
    // Overhead laser beam shooting downwards
    r(lx + 3, djY + 12, 2, djH + 120, 'rgba(244, 63, 94, 0.15)');
  }

  // Neon Marquee Sign: "TEEM BEATS 🪩"
  const nSignX = djX + 90;
  r(nSignX - 2, djY + 12, 174, 16, '#0F172A');
  r(nSignX, djY + 14, 170, 12, '#4C1D95');
  r(nSignX + 4, djY + 16, 162, 8, '#C084FC');
  ctx.font = 'bold 7px monospace';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('⚡ TEEM LIVE DJ ⚡', nSignX + 24, djY + 23);

  // Central DJ Console & Turntables
  const boothX = djX + 115;
  const boothY = djY + 40;
  const boothW = 120;
  const boothH = 34;

  r(boothX - 2, boothY + boothH, boothW + 4, 6, 'rgba(0,0,0,0.5)');
  r(boothX, boothY, boothW, boothH, '#0F172A');
  r(boothX + 2, boothY + 2, boothW - 4, boothH - 4, '#1E293B');

  // Left Vinyl Turntable
  r(boothX + 8, boothY + 6, 26, 22, '#020617');
  r(boothX + 11, boothY + 9, 20, 16, '#000000');
  r(boothX + 19, boothY + 15, 4, 4, '#EF4444'); // Vinyl center label

  // Central Audio Mixer & VU Meters
  r(boothX + 44, boothY + 6, 32, 22, '#020617');
  for (let v = 0; v < 4; v++) {
    r(boothX + 48 + v * 6, boothY + 8, 3, 14, '#10B981');
    r(boothX + 48 + v * 6, boothY + 8, 3, 3, '#EF4444'); // Peak red
  }

  // Right Vinyl Turntable
  r(boothX + 86, boothY + 6, 26, 22, '#020617');
  r(boothX + 89, boothY + 9, 20, 16, '#000000');
  r(boothX + 97, boothY + 15, 4, 4, '#38BDF8');

  // Massive Stage Subwoofer Towers (Flanking the DJ stage)
  // Left Speaker Stack
  r(djX + 14, djY + 26, 28, 56, '#0F172A');
  r(djX + 16, djY + 28, 24, 24, '#1E293B');
  r(djX + 20, djY + 32, 16, 16, '#475569'); // Top cone
  r(djX + 16, djY + 54, 24, 26, '#1E293B');
  r(djX + 19, djY + 57, 18, 20, '#334155'); // Subwoofer cone

  // Right Speaker Stack
  r(djX + djW - 42, djY + 26, 28, 56, '#0F172A');
  r(djX + djW - 40, djY + 28, 24, 24, '#1E293B');
  r(djX + djW - 36, djY + 32, 16, 16, '#475569');
  r(djX + djW - 40, djY + 54, 24, 26, '#1E293B');
  r(djX + djW - 37, djY + 57, 18, 20, '#334155');

  // ── 2. ZONE: PULSING LED NEON DANCE FLOOR (Center-Left: 32, 126 to 380, 360) ──
  const dfX = 40;
  const dfY = 126;
  const dfW = 334;
  const dfH = 230;

  // Dance floor outer glow rim
  r(dfX - 3, dfY - 3, dfW + 6, dfH + 6, '#EC4899');
  r(dfX - 1, dfY - 1, dfW + 2, dfH + 2, '#06B6D4');

  // High-Energy Illuminated 18x18 LED Tiles Grid
  const tileSize = 20;
  const tileCols = ['#F43F5E', '#06B6D4', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#D946EF'];
  for (let y = dfY; y < dfY + dfH - tileSize + 1; y += tileSize) {
    for (let x = dfX; x < dfX + dfW - tileSize + 1; x += tileSize) {
      const idx = (Math.floor((x - dfX) / tileSize) * 3 + Math.floor((y - dfY) / tileSize) * 5) % tileCols.length;
      const baseCol = tileCols[idx];
      r(x + 1, y + 1, tileSize - 2, tileSize - 2, baseCol);
      // Bright center pulse highlight
      r(x + 4, y + 4, tileSize - 8, tileSize - 8, 'rgba(255, 255, 255, 0.45)');
    }
  }

  // Overhead disco mirror ball shadow / reflection in center
  const mX = dfX + Math.floor(dfW / 2);
  const mY = dfY + Math.floor(dfH / 2);
  r(mX - 12, mY - 12, 24, 24, 'rgba(255, 255, 255, 0.7)');
  r(mX - 8, mY - 8, 16, 16, '#F8FAFC');

  // ── 3. ZONE: VIP VELVET BOTTLE LOUNGE (Top-Right: 390, 28 to 680, 240) ──
  const vipX = 390;
  const vipY = 28;
  const vipW = 290;
  const vipH = 220;

  // Ultra-luxe dark crimson carpet
  r(vipX, vipY, vipW, vipH, '#4C0519');
  for (let y = vipY; y < vipY + vipH; y += 16) {
    for (let x = vipX; x < vipX + vipW; x += 16) {
      if ((Math.floor((x - vipX) / 16) + Math.floor((y - vipY) / 16)) % 2 === 0) {
        r(x, y, 16, 16, '#700924');
      }
    }
  }

  // VIP Gold Stanchions & Red Velvet Rope Border
  r(vipX, vipY, 4, vipH, '#F59E0B');
  for (let py = vipY + 10; py < vipY + vipH; py += 32) {
    r(vipX - 2, py, 8, 8, '#FACC15'); // Gold post head
    r(vipX, py + 8, 4, 24, '#E11D48'); // Red rope
  }

  // 2 Curved Deep Velvet Booths (Left & Right)
  for (let b = 0; b < 2; b++) {
    const boothLeft = vipX + 24 + b * 130;
    const boothTop = vipY + 30;

    // Outer plush curved velvet backrest
    r(boothLeft, boothTop, 110, 80, '#881337');
    r(boothLeft + 4, boothTop + 4, 102, 72, '#9F1239');
    r(boothLeft + 16, boothTop + 16, 78, 54, '#4C0519'); // Inner recess

    // Velvet Cushion Seating
    r(boothLeft + 8, boothTop + 8, 94, 14, '#BE123C');
    r(boothLeft + 8, boothTop + 22, 14, 46, '#BE123C');
    r(boothLeft + 88, boothTop + 22, 14, 46, '#BE123C');

    // Central Smoked-Glass Champagne Table
    const tbX = boothLeft + 30;
    const tbY = boothTop + 30;
    r(tbX, tbY, 50, 32, '#0F172A');
    r(tbX + 2, tbY + 2, 46, 28, '#1E293B');
    // Gold rim
    r(tbX, tbY, 50, 2, '#F59E0B');
    r(tbX, tbY + 30, 50, 2, '#F59E0B');

    // Silver Ice Bucket with Champagne Bottles & Flutes
    r(tbX + 18, tbY + 8, 14, 14, '#CBD5E1');
    r(tbX + 20, tbY + 6, 4, 6, '#15803D'); // Green bottle neck
    r(tbX + 26, tbY + 6, 4, 6, '#F59E0B'); // Gold foil bottle neck
    r(tbX + 10, tbY + 10, 4, 8, '#FDE047'); // Flute 1
    r(tbX + 36, tbY + 10, 4, 8, '#FDE047'); // Flute 2
  }

  // VIP Neon Wall Art
  const vArtX = vipX + 70;
  r(vArtX, vipY + 130, 150, 60, '#1E1B4B');
  r(vArtX + 2, vipY + 132, 146, 56, '#312E81');
  ctx.font = 'bold 8px monospace';
  ctx.fillStyle = '#F43F5E';
  ctx.fillText('✨ VIP CHAMPAGNE LOUNGE ✨', vArtX + 10, vipY + 155);

  // ── 4. ZONE: NEON COCKTAIL BAR & MIXOLOGY (Bottom: 32, 370 to 680, 500) ──
  const barX = 32;
  const barY = 370;
  const barW = 648;
  const barH = 130;

  // Dark polished checkerboard
  r(barX, barY, barW, barH, '#090D16');

  // Back-Bar Liquor Bottles Display Shelf (Wall tier with neon backlight)
  const bbY = barY + 10;
  r(barX + 30, bbY, barW - 60, 28, '#1E1B4B');
  r(barX + 32, bbY + 2, barW - 64, 24, '#0F172A');
  // Cyan neon back shelf glow
  r(barX + 32, bbY + 2, barW - 64, 2, '#06B6D4');
  r(barX + 32, bbY + 14, barW - 64, 2, '#F43F5E');

  // 40+ Glowing Liquor bottles along the bar back
  for (let b = 0; b < 32; b++) {
    const bx = barX + 45 + b * 18;
    const bCol = ['#38BDF8', '#F59E0B', '#EF4444', '#10B981', '#A855F7', '#EC4899'][b % 6];
    // Shelf 1
    r(bx, bbY + 4, 6, 9, bCol);
    r(bx + 1, bbY + 3, 4, 2, '#FFFFFF');
    // Shelf 2
    r(bx, bbY + 16, 6, 9, bCol);
  }

  // Massive Curved Front Cocktail Counter
  const ctrY = barY + 54;
  const ctrH = 34;
  r(barX + 20, ctrY, barW - 40, ctrH, '#0F172A');
  r(barX + 22, ctrY + 2, barW - 44, ctrH - 4, '#1E293B');
  // Illuminated Neon Edge on Counter Front
  r(barX + 20, ctrY + ctrH - 3, barW - 40, 3, '#06B6D4');

  // Bartender Tap Stations & Cocktail Shakers
  for (let tap = 0; tap < 3; tap++) {
    const tx = barX + 90 + tap * 180;
    // Beer taps
    r(tx, ctrY + 6, 16, 8, '#CBD5E1');
    r(tx + 2, ctrY + 2, 3, 5, '#F59E0B');
    r(tx + 7, ctrY + 2, 3, 5, '#EF4444');
    r(tx + 12, ctrY + 2, 3, 5, '#10B981');
    // Silver cocktail shaker & fruit cutting board
    r(tx + 30, ctrY + 6, 8, 14, '#E2E8F0');
    r(tx + 42, ctrY + 10, 14, 8, '#84CC16'); // Lime garnish
  }

  // 14 Round Leather Brass Barstools in front of counter
  for (let s = 0; s < 14; s++) {
    const sx = barX + 42 + s * 42;
    const sy = ctrY + ctrH + 6;
    r(sx - 1, sy + 14, 18, 4, 'rgba(0,0,0,0.4)');
    // Brass stool post
    r(sx + 6, sy + 8, 4, 10, '#F59E0B');
    // Red padded round seat
    r(sx, sy, 16, 8, '#BE123C');
    r(sx + 2, sy + 2, 12, 4, '#F43F5E');
  }

  // ── 5. ZONE: ROOFTOP SKYLINE BALCONY (East Wing: 692, 28 to 808, 500) ──
  const rX = 692;
  const rY = 28;
  const rW = 116;
  const rH = 472;

  // Dark Brazilian walnut deck under starry sky
  r(rX, rY, rW, rH, '#1C1917');
  for (let y = rY; y < rY + rH; y += 8) {
    r(rX, y, rW, 1, '#292524');
    r(rX, y + 1, rW, 1, '#44403C');
  }

  // Glass safety railing looking over city
  r(rX + rW - 4, rY, 4, rH, '#38BDF8');
  r(rX, rY, rW, 4, '#38BDF8');
  r(rX, rY + rH - 4, rW, 4, '#38BDF8');

  // Distant glowing city skyscrapers in background
  for (let bld = 0; bld < 6; bld++) {
    const bY = rY + 15 + bld * 75;
    r(rX + rW - 14, bY, 12, 55, '#020617');
    // Golden window grids
    for (let wy = bY + 6; wy < bY + 50; wy += 8) {
      r(rX + rW - 11, wy, 2, 3, '#FDE047');
      r(rX + rW - 6, wy, 2, 3, '#FDE047');
    }
  }

  // Modern Gas Fire Pit Lounge Tables (2 pits)
  for (let fp = 0; fp < 2; fp++) {
    const fpY = rY + 80 + fp * 190;
    // Circular stone pit
    r(rX + 28, fpY, 56, 56, '#27272A');
    r(rX + 32, fpY + 4, 48, 48, '#3F3F46');
    r(rX + 38, fpY + 10, 36, 36, '#18181B');
    // Violet / Cyan Fire Pit Flames
    r(rX + 44, fpY + 16, 24, 24, '#8B5CF6');
    r(rX + 48, fpY + 20, 16, 16, '#EC4899');
    r(rX + 52, fpY + 24, 8, 8, '#06B6D4');

    // Circular lounge bench surrounding fire pit
    r(rX + 12, fpY + 12, 10, 32, '#52525B');
    r(rX + 90, fpY + 12, 10, 32, '#52525B');
  }

  // Fairy string lights hanging along rooftop
  for (let fy = rY + 10; fy < rY + rH - 10; fy += 20) {
    r(rX + 8, fy, 4, 4, '#FEF08A');
  }

  // ── 6. LABELS ─────────────────────────────────
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

  label('DJ STAGE & BOOTH', djX + 10, djY + 12, '#7C3AED');
  label('PULSING DANCE FLOOR', dfX + 8, dfY + 8, '#E11D48');
  label('VIP VELVET LOUNGE', vipX + 10, vipY + 12, '#9F1239');
  label('NEON COCKTAIL BAR', barX + 18, barY + 40, '#0891B2');
  label('SKYLINE BALCONY', rX + 8, rY + 12, '#2563EB');
}
