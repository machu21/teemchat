// ============================================================
// RETRO 16-BIT PIXEL-ART WORLD MAP: HORIZON ACADEMY & SCHOOL
// ============================================================

export function renderSchoolMap(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  // Base background: Perimeter campus grounds (brick and green grass)
  r(0, 0, iw, ih, '#3E7B34');

  // School Outer Brick Wall & Foundation
  const wx = 24;
  const wy = 20;
  const ww = iw - 48;
  const wh = ih - 40;

  // Exterior courtyard grass patches
  for (let ty = 0; ty < ih; ty += 32) {
    for (let tx = 0; tx < iw; tx += 32) {
      if ((tx < wx || tx > wx + ww || ty < wy || ty > wy + wh) && (tx + ty) % 64 === 0) {
        r(tx + 4, ty + 4, 3, 3, '#5BA848');
      }
    }
  }

  // Shadow under school building
  r(wx - 4, wy + wh, ww + 8, 8, 'rgba(0,0,0,0.3)');

  // Main Academy Building Foundation: Red School Brick Exterior
  r(wx, wy, ww, wh, '#991B1B');
  r(wx + 2, wy + 2, ww - 4, wh - 4, '#B91C1C');

  // ── 1. ZONE: LECTURE CLASSROOM 101 (Top Left: 32, 28 to 360, 240) ──
  const c1x = 32;
  const c1y = 28;
  const c1w = 340;
  const c1h = 220;

  // Wood parquet classroom floor
  r(c1x, c1y, c1w, c1h, '#D97706');
  for (let y = c1y; y < c1y + c1h; y += 8) {
    r(c1x, y, c1w, 1, '#B45309');
    r(c1x, y + 1, c1w, 1, '#FBBF24');
  }

  // Interior Classroom Walls (North & East divider)
  r(c1x, c1y, c1w, 12, '#F1F5F9');
  r(c1x, c1y + 12, c1w, 2, '#CBD5E1');
  r(c1x + c1w - 6, c1y, 6, c1h, '#CBD5E1');

  // Chalkboard (Large green chalkboard with wood frame)
  const cbX = c1x + 80;
  const cbY = c1y + 2;
  const cbW = 180;
  const cbH = 10;
  r(cbX - 1, cbY - 1, cbW + 2, cbH + 2, '#78350F');
  r(cbX, cbY, cbW, cbH, '#14532D');
  // Chalk math formulas & diagrams
  r(cbX + 10, cbY + 2, 20, 2, '#DCFCE7'); // "E = mc²"
  r(cbX + 45, cbY + 2, 14, 4, '#86EFAC'); // Triangle
  r(cbX + 75, cbY + 3, 35, 1, '#DCFCE7'); // Coordinate axis
  r(cbX + 125, cbY + 2, 25, 3, '#FEF08A'); // Solar model
  r(cbX + 160, cbY + 3, 12, 2, '#DCFCE7');

  // Wall Clock
  r(c1x + 20, c1y + 2, 8, 8, '#FFFFFF');
  r(c1x + 22, c1y + 4, 4, 4, '#0F172A');

  // Teacher podium & desk
  r(c1x + 140, c1y + 24, 60, 22, '#78350F');
  r(c1x + 142, c1y + 26, 56, 18, '#9A3412');
  r(c1x + 148, c1y + 28, 8, 8, '#DC2626'); // Red apple
  r(c1x + 150, c1y + 26, 2, 2, '#15803D'); // Stem
  r(c1x + 165, c1y + 28, 14, 10, '#38BDF8'); // Book stack
  r(c1x + 185, c1y + 28, 8, 8, '#F59E0B'); // Desk globe

  // Rows of student desks (4 rows of 4 desks)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const dX = c1x + 40 + col * 72;
      const dY = c1y + 65 + row * 48;
      // Desk
      r(dX, dY, 44, 20, '#92400E');
      r(dX + 2, dY + 2, 40, 16, '#B45309');
      // Notebook & pencil
      r(dX + 6, dY + 4, 12, 10, '#FFFFFF');
      r(dX + 7, dY + 5, 10, 8, '#E2E8F0');
      r(dX + 24, dY + 6, 8, 2, '#FBBF24');
      // Wooden Chair
      r(dX + 12, dY + 24, 20, 14, '#78350F');
      r(dX + 14, dY + 26, 16, 10, '#9A3412');
    }
  }

  // ── 2. ZONE: CHEMISTRY & SCIENCE LAB (Top Center-Right: 384, 28 to 680, 240) ──
  const sX = 384;
  const sY = 28;
  const sW = 300;
  const sH = 220;

  // Slate acid-resistant lab tiles
  r(sX, sY, sW, sH, '#1E293B');
  for (let y = sY; y < sY + sH; y += 16) {
    for (let x = sX; x < sX + sW; x += 16) {
      if ((Math.floor((x - sX) / 16) + Math.floor((y - sY) / 16)) % 2 === 0) {
        r(x, y, 16, 16, '#334155');
      }
    }
  }

  // Lab Wall & Periodic Table
  r(sX, sY, sW, 12, '#E2E8F0');
  r(sX, sY + 12, sW, 2, '#94A3B8');
  r(sX + sW - 6, sY, 6, sH, '#94A3B8');

  // Periodic Table Wall Chart
  const ptX = sX + 60;
  const ptY = sY + 2;
  const ptW = 160;
  const ptH = 10;
  r(ptX - 1, ptY - 1, ptW + 2, ptH + 2, '#0F172A');
  r(ptX, ptY, ptW, ptH, '#FFFFFF');
  // Colored element cells
  const colors = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#8B5CF6'];
  for (let ci = 0; ci < 18; ci++) {
    r(ptX + ci * 8 + 4, ptY + 2, 6, 6, colors[ci % colors.length]);
  }

  // Long chemical lab workstations (3 benches)
  for (let b = 0; b < 3; b++) {
    const bY = sY + 36 + b * 56;
    r(sX + 20, bY, sW - 40, 24, '#0F172A');
    r(sX + 22, bY + 2, sW - 44, 20, '#1E293B');

    // Lab sinks & brass faucets
    r(sX + 40, bY + 4, 18, 14, '#475569');
    r(sX + 46, bY + 2, 4, 6, '#FACC15'); // Brass tap
    r(sX + sW - 60, bY + 4, 18, 14, '#475569');
    r(sX + sW - 54, bY + 2, 4, 6, '#FACC15');

    // Beakers and test tube racks
    r(sX + 90, bY + 4, 8, 12, '#38BDF8'); // Blue flask
    r(sX + 102, bY + 5, 6, 10, '#EF4444'); // Red beaker
    r(sX + 112, bY + 4, 8, 12, '#10B981'); // Green beaker
    r(sX + 140, bY + 6, 28, 8, '#78350F'); // Test tube rack
    r(sX + 144, bY + 4, 3, 6, '#F59E0B');
    r(sX + 150, bY + 4, 3, 6, '#A855F7');
    r(sX + 156, bY + 4, 3, 6, '#06B6D4');
    r(sX + 162, bY + 4, 3, 6, '#EC4899');

    // Bunsen burner & microscope
    r(sX + 210, bY + 6, 12, 10, '#64748B'); // Microscope
    r(sX + 214, bY + 3, 6, 4, '#94A3B8');
  }

  // Safety eyewash station & hazard cabinet
  r(sX + 8, sY + 20, 10, 24, '#FACC15');
  r(sX + 9, sY + 22, 8, 8, '#DC2626');

  // ── 3. ZONE: CENTRAL LOCKER CORRIDOR (Divider Strip y: 250 to 286) ──
  const corY = 250;
  const corH = 36;
  r(32, corY, sW + c1w + 12, corH, '#F8FAFC');

  // Checkered hallway linoleum
  for (let x = 32; x < 32 + sW + c1w + 12; x += 12) {
    for (let y = corY; y < corY + corH; y += 12) {
      if ((Math.floor(x / 12) + Math.floor(y / 12)) % 2 === 0) {
        r(x, y, 12, 12, '#E2E8F0');
      }
    }
  }

  // High School Locker Banks (Red & Royal Blue Lockers with vents)
  for (let lx = 48; lx < 660; lx += 24) {
    if ((lx >= 320 && lx <= 370) || (lx >= 540 && lx <= 580)) continue; // Doorways
    const lockerColor = Math.floor(lx / 48) % 2 === 0 ? '#DC2626' : '#2563EB';
    const lockerTrim = Math.floor(lx / 48) % 2 === 0 ? '#991B1B' : '#1D4ED8';
    r(lx, corY + 1, 20, 8, lockerColor);
    r(lx + 1, corY + 2, 18, 6, lockerTrim);
    // Vents & handle
    r(lx + 4, corY + 3, 12, 1, '#FFFFFF');
    r(lx + 4, corY + 5, 12, 1, '#FFFFFF');
    r(lx + 15, corY + 6, 2, 2, '#FDE047');
  }

  // Championship Trophy Case
  const tcX = 330;
  r(tcX, corY + 2, 34, 10, '#78350F');
  r(tcX + 2, corY + 3, 30, 8, '#FDE68A');
  r(tcX + 6, corY + 4, 6, 6, '#EAB308'); // Golden Cup 1
  r(tcX + 16, corY + 4, 6, 6, '#EAB308'); // Golden Cup 2
  r(tcX + 24, corY + 4, 6, 6, '#EAB308'); // Golden Cup 3

  // Water drinking fountain
  r(550, corY + 2, 14, 10, '#CBD5E1');
  r(554, corY + 4, 6, 4, '#38BDF8');

  // ── 4. ZONE: ACADEMY LIBRARY & STUDY PODS (Bottom Left: 32, 288 to 360, 500) ──
  const libX = 32;
  const libY = 288;
  const libW = 340;
  const libH = 212;

  // Rich royal blue quiet carpet
  r(libX, libY, libW, libH, '#1E3A8A');
  for (let y = libY; y < libY + libH; y += 12) {
    for (let x = libX; x < libX + libW; x += 12) {
      if ((Math.floor(x / 12) + Math.floor(y / 12)) % 2 === 0) {
        r(x, y, 12, 12, '#1E40AF');
      }
    }
  }

  // Library Walls
  r(libX, libY, libW, 10, '#E2E8F0');
  r(libX + libW - 6, libY, 6, libH, '#CBD5E1');

  // Tall mahogany bookshelves (3 massive double-sided book stacks)
  for (let s = 0; s < 3; s++) {
    const bsX = libX + 20 + s * 95;
    r(bsX, libY + 24, 60, 110, '#78350F');
    r(bsX + 2, libY + 26, 56, 106, '#9A3412');

    // Shelf dividers & colorful books
    for (let sy = libY + 28; sy < libY + 130; sy += 18) {
      r(bsX + 2, sy + 15, 56, 2, '#451A03');
      for (let bx = bsX + 4; bx < bsX + 54; bx += 5) {
        const spineColor = ['#DC2626', '#2563EB', '#16A34A', '#D97706', '#9333EA', '#0891B2'][(bx * 3) % 6];
        r(bx, sy + 2, 4, 13, spineColor);
        r(bx + 1, sy + 3, 2, 2, '#FEF08A'); // Gold title stamp
      }
    }
  }

  // Reading Desks & Green Banker Lamps
  const rDeskY = libY + 150;
  r(libX + 40, rDeskY, 110, 28, '#854D0E');
  r(libX + 42, rDeskY + 2, 106, 24, '#A16207');
  // Green glass banker lamps
  r(libX + 60, rDeskY + 4, 14, 6, '#15803D');
  r(libX + 64, rDeskY + 6, 6, 4, '#FEF08A');
  r(libX + 110, rDeskY + 4, 14, 6, '#15803D');
  r(libX + 114, rDeskY + 6, 6, 4, '#FEF08A');

  r(libX + 190, rDeskY, 110, 28, '#854D0E');
  r(libX + 192, rDeskY + 2, 106, 24, '#A16207');
  r(libX + 210, rDeskY + 4, 14, 6, '#15803D');
  r(libX + 214, rDeskY + 6, 6, 4, '#FEF08A');
  r(libX + 260, rDeskY + 4, 14, 6, '#15803D');
  r(libX + 264, rDeskY + 6, 6, 4, '#FEF08A');

  // ── 5. ZONE: CAFETERIA & NUTRITION COMMONS (Bottom Center: 384, 288 to 680, 500) ──
  const cafX = 384;
  const cafY = 288;
  const cafW = 300;
  const cafH = 212;

  // Cheerful terracotta & cream checkered floor
  r(cafX, cafY, cafW, cafH, '#FED7AA');
  for (let y = cafY; y < cafY + cafH; y += 14) {
    for (let x = cafX; x < cafX + cafW; x += 14) {
      if ((Math.floor(x / 14) + Math.floor(y / 14)) % 2 === 0) {
        r(x, y, 14, 14, '#FB923C');
      }
    }
  }

  // Cafeteria Wall & Lunch Service Counter
  r(cafX, cafY, cafW, 10, '#E2E8F0');
  r(cafX + cafW - 6, cafY, 6, cafH, '#CBD5E1');

  // Food Service Line (Stainless steel counter with hot trays)
  r(cafX + 16, cafY + 20, cafW - 32, 20, '#64748B');
  r(cafX + 18, cafY + 22, cafW - 36, 16, '#94A3B8');
  // Sneeze guard glass & hot trays
  for (let t = 0; t < 6; t++) {
    const tx = cafX + 30 + t * 40;
    r(tx, cafY + 24, 28, 12, '#CBD5E1');
    const foodCol = ['#EA580C', '#EAB308', '#16A34A', '#DC2626', '#7C2D12', '#FACC15'][t];
    r(tx + 2, cafY + 26, 24, 8, foodCol);
  }

  // Long cafeteria dining tables (2 big tables with orange benches)
  for (let tab = 0; tab < 2; tab++) {
    const tabY = cafY + 70 + tab * 64;
    // Top bench
    r(cafX + 30, tabY, cafW - 60, 6, '#EA580C');
    // Table
    r(cafX + 26, tabY + 8, cafW - 52, 22, '#D1D5DB');
    r(cafX + 28, tabY + 10, cafW - 56, 18, '#E5E7EB');
    // Lunch trays
    for (let l = 0; l < 4; l++) {
      r(cafX + 45 + l * 56, tabY + 12, 18, 14, '#DC2626');
      r(cafX + 47 + l * 56, tabY + 14, 6, 6, '#FBBF24');
      r(cafX + 55 + l * 56, tabY + 14, 6, 6, '#10B981');
    }
    // Bottom bench
    r(cafX + 30, tabY + 32, cafW - 60, 6, '#EA580C');
  }

  // Snack vending machines & recycling bins
  r(cafX + 20, cafY + 175, 24, 26, '#3B82F6');
  r(cafX + 22, cafY + 177, 20, 16, '#93C5FD');
  r(cafX + 50, cafY + 175, 24, 26, '#EF4444');
  r(cafX + 52, cafY + 177, 20, 16, '#FCA5A5');
  r(cafX + 80, cafY + 185, 14, 16, '#10B981'); // Recycle bin

  // ── 6. ZONE: ATHLETIC COURT & OUTDOOR QUAD (East Wing: 692, 28 to 808, 500) ──
  const gymX = 692;
  const gymY = 28;
  const gymW = 116;
  const gymH = 472;

  // Split: Upper section is Polished Basketball Gym (y: 28 to 280), Lower section is Outdoor Quad (y: 284 to 500)
  const bballH = 250;
  r(gymX, gymY, gymW, bballH, '#F59E0B');
  for (let y = gymY; y < gymY + bballH; y += 6) {
    r(gymX, y, gymW, 1, '#D97706');
    r(gymX, y + 1, gymW, 1, '#FDE68A');
  }

  // Basketball Court Lines
  r(gymX, gymY, gymW, 4, '#1E3A8A');
  r(gymX, gymY + bballH - 4, gymW, 4, '#1E3A8A');
  r(gymX, gymY, 4, bballH, '#1E3A8A');
  r(gymX + gymW - 4, gymY, 4, bballH, '#1E3A8A');

  // Center court logo & line
  r(gymX, gymY + Math.floor(bballH / 2), gymW, 2, '#FFFFFF');
  r(gymX + Math.floor(gymW / 2) - 16, gymY + Math.floor(bballH / 2) - 16, 32, 32, '#1E3A8A');
  r(gymX + Math.floor(gymW / 2) - 14, gymY + Math.floor(bballH / 2) - 14, 28, 28, '#F59E0B');

  // Basketball Hoops & Key
  // Top Hoop
  r(gymX + Math.floor(gymW / 2) - 20, gymY + 4, 40, 36, '#FFFFFF');
  r(gymX + Math.floor(gymW / 2) - 18, gymY + 6, 36, 32, '#DC2626');
  r(gymX + Math.floor(gymW / 2) - 8, gymY + 38, 16, 6, '#EA580C'); // Backboard & rim
  // Bottom Hoop
  r(gymX + Math.floor(gymW / 2) - 20, gymY + bballH - 40, 40, 36, '#FFFFFF');
  r(gymX + Math.floor(gymW / 2) - 18, gymY + bballH - 38, 36, 32, '#DC2626');
  r(gymX + Math.floor(gymW / 2) - 8, gymY + bballH - 44, 16, 6, '#EA580C');

  // Bleachers spectator bench
  r(gymX + 6, gymY + 90, 14, 70, '#475569');
  r(gymX + 8, gymY + 92, 10, 66, '#64748B');

  // Outdoor Green Quad Courtyard (Bottom Right)
  const quadY = gymY + bballH + 4;
  const quadH = gymH - bballH - 4;
  r(gymX, quadY, gymW, quadH, '#22C55E');
  r(gymX, quadY, gymW, 4, '#15803D');

  // Cobblestone walkway through quad
  for (let y = quadY; y < quadY + quadH; y += 12) {
    r(gymX + 42, y, 32, 10, '#E2E8F0');
    r(gymX + 44, y + 2, 28, 6, '#CBD5E1');
  }

  // Flower Planters & Garden Benches
  r(gymX + 8, quadY + 20, 24, 14, '#78350F');
  r(gymX + 10, quadY + 22, 20, 10, '#EF4444');
  r(gymX + 12, quadY + 24, 6, 6, '#FACC15');

  r(gymX + 8, quadY + 70, 24, 14, '#78350F');
  r(gymX + 10, quadY + 72, 20, 10, '#EC4899');
  r(gymX + 12, quadY + 74, 6, 6, '#FFFFFF');

  r(gymX + 84, quadY + 30, 24, 12, '#92400E'); // Bench
  r(gymX + 84, quadY + 80, 24, 12, '#92400E');

  // ── 7. ZONE BANNER LABELS ─────────────────────────────────
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

  label('CLASSROOM 101', c1x + 10, c1y + 14, '#2563EB');
  label('SCIENCE LAB', sX + 10, sY + 14, '#059669');
  label('LOCKER COMMONS', 180, corY + 13, '#D97706');
  label('CAMPUS LIBRARY', libX + 10, libY + 12, '#7C3AED');
  label('CAFETERIA', cafX + 10, cafY + 12, '#EA580C');
  label('GYMNASIUM', gymX + 8, gymY + 8, '#DC2626');
  label('CAMPUS QUAD', gymX + 8, quadY + 6, '#15803D');
}
