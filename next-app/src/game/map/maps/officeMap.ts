// ============================================================
// RETRO 16-BIT PIXEL-ART WORLD MAP: MODERN TECH OFFICE
// ============================================================

export function renderOfficeMap(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  // Base building exterior & structural border
  r(0, 0, iw, ih, '#0F172A');

  const ox = 24;
  const oy = 20;
  const ow = iw - 48;
  const oh = ih - 40;

  // Exterior building glass & steel frame
  r(ox - 4, oy - 4, ow + 8, oh + 8, '#1E293B');
  r(ox, oy, ow, oh, '#334155');

  // ── 1. ZONE: OPEN ENGINEERING DESKS (Top-Left: 32, 28 to 380, 240) ──
  const dX = 32;
  const dY = 28;
  const dW = 350;
  const dH = 220;

  // Modern corporate charcoal carpet tiles
  r(dX, dY, dW, dH, '#1E293B');
  for (let y = dY; y < dY + dH; y += 16) {
    for (let x = dX; x < dX + dW; x += 16) {
      if ((Math.floor((x - dX) / 16) + Math.floor((y - dY) / 16)) % 2 === 0) {
        r(x, y, 16, 16, '#243248');
      }
    }
  }

  // Interior north wall & architectural trim
  r(dX, dY, dW, 10, '#E2E8F0');
  r(dX, dY + 10, dW, 2, '#94A3B8');
  r(dX + dW - 4, dY, 4, dH, '#64748B');

  // Glass Agile Whiteboard Wall on North Wall
  const wbX = dX + 60;
  const wbY = dY + 2;
  const wbW = 180;
  const wbH = 8;
  r(wbX - 1, wbY - 1, wbW + 2, wbH + 2, '#475569');
  r(wbX, wbY, wbW, wbH, '#F8FAFC');
  // Sticky notes (Sprint Kanban board)
  const stickyColors = ['#FDE047', '#38BDF8', '#4ADE80', '#F472B6', '#FB923C'];
  for (let sn = 0; sn < 14; sn++) {
    r(wbX + 10 + sn * 12, wbY + 2, 8, 5, stickyColors[sn % stickyColors.length]);
  }

  // Dual-Monitor Workstation Pods (4 pods of double desks)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const deskX = dX + 30 + col * 155;
      const deskY = dY + 45 + row * 85;
      const deskW = 135;
      const deskH = 34;

      // Birch wood desk surface
      r(deskX, deskY, deskW, deskH, '#D4B996');
      r(deskX + 2, deskY + 2, deskW - 4, deskH - 4, '#E8D5B5');
      // Cable grommets
      r(deskX + Math.floor(deskW / 2) - 3, deskY + 3, 6, 6, '#64748B');

      // Employee 1 Workstation (Left)
      // Dual monitors
      r(deskX + 10, deskY + 4, 18, 12, '#0F172A');
      r(deskX + 11, deskY + 5, 16, 9, '#38BDF8'); // Code on screen
      r(deskX + 30, deskY + 4, 18, 12, '#0F172A');
      r(deskX + 31, deskY + 5, 16, 9, '#10B981'); // Terminal on screen
      // Keyboard & mousepad
      r(deskX + 14, deskY + 20, 22, 6, '#334155');
      r(deskX + 40, deskY + 19, 8, 8, '#2563EB');
      // Ergonomic mesh task chair
      r(deskX + 20, deskY + 36, 16, 12, '#0F172A');
      r(deskX + 22, deskY + 38, 12, 8, '#475569');

      // Employee 2 Workstation (Right)
      r(deskX + 75, deskY + 4, 18, 12, '#0F172A');
      r(deskX + 76, deskY + 5, 16, 9, '#A855F7');
      r(deskX + 95, deskY + 4, 18, 12, '#0F172A');
      r(deskX + 96, deskY + 5, 16, 9, '#F59E0B');
      r(deskX + 79, deskY + 20, 22, 6, '#334155');
      r(deskX + 105, deskY + 19, 8, 8, '#EF4444');
      r(deskX + 85, deskY + 36, 16, 12, '#0F172A');
      r(deskX + 87, deskY + 38, 12, 8, '#475569');

      // Desk plant succulent
      r(deskX + 62, deskY + 8, 8, 8, '#15803D');
      r(deskX + 64, deskY + 12, 4, 4, '#F97316'); // Terracotta pot
    }
  }

  // ── 2. ZONE: EXECUTIVE BOARDROOM (Top-Right: 390, 28 to 680, 240) ──
  const bX = 390;
  const bY = 28;
  const bW = 290;
  const bH = 220;

  // Dark slate luxury herringbone floor
  r(bX, bY, bW, bH, '#111827');
  for (let y = bY; y < bY + bH; y += 12) {
    for (let x = bX; x < bX + bW; x += 12) {
      if ((Math.floor((x - bX) / 12) + Math.floor((y - bY) / 12)) % 2 === 0) {
        r(x, y, 12, 12, '#1F2937');
      }
    }
  }

  // Frosted Glass Boardroom Partitions (Semi-transparent wall look)
  r(bX, bY, bW, 10, '#E2E8F0');
  r(bX, bY + 10, bW, 2, '#38BDF8');
  r(bX + bW - 4, bY, 4, bH, '#38BDF8');
  r(bX, bY + 12, 4, bH - 12, '#38BDF8');

  // Massive 85" Wall Presentation Screen
  const tvX = bX + 60;
  const tvY = bY + 1;
  const tvW = 170;
  const tvH = 10;
  r(tvX - 1, tvY - 1, tvW + 2, tvH + 2, '#000000');
  r(tvX, tvY, tvW, tvH, '#1E1B4B');
  // Bar chart & revenue graph on presentation screen
  r(tvX + 15, tvY + 3, 8, 5, '#38BDF8');
  r(tvX + 27, tvY + 2, 8, 6, '#818CF8');
  r(tvX + 39, tvY + 1, 8, 7, '#C084FC');
  r(tvX + 60, tvY + 4, 80, 2, '#34D399');

  // Executive Mahogany Conference Table (Massive 12-person table)
  const ctX = bX + 35;
  const ctY = bY + 60;
  const ctW = 220;
  const ctH = 75;

  r(ctX - 2, ctY + ctH, ctW + 4, 6, 'rgba(0,0,0,0.4)');
  r(ctX, ctY, ctW, ctH, '#451A03');
  r(ctX + 3, ctY + 3, ctW - 6, ctH - 6, '#78350F');
  // Inlaid leather desk blotter strip
  r(ctX + 10, ctY + 10, ctW - 20, ctH - 20, '#1C1917');
  // Conference phone speaker puck in center
  r(ctX + Math.floor(ctW / 2) - 8, ctY + Math.floor(ctH / 2) - 8, 16, 16, '#000000');
  r(ctX + Math.floor(ctW / 2) - 6, ctY + Math.floor(ctH / 2) - 6, 12, 12, '#10B981'); // Green active call light

  // 10 Executive Leather Swivel Chairs around table
  // Top row chairs (5)
  for (let i = 0; i < 5; i++) {
    const cx = ctX + 20 + i * 40;
    r(cx, ctY - 14, 18, 12, '#0F172A');
    r(cx + 2, ctY - 12, 14, 8, '#334155');
  }
  // Bottom row chairs (5)
  for (let i = 0; i < 5; i++) {
    const cx = ctX + 20 + i * 40;
    r(cx, ctY + ctH + 2, 18, 12, '#0F172A');
    r(cx + 2, ctY + ctH + 4, 14, 8, '#334155');
  }

  // ── 3. ZONE: CENTRAL RECEPTION & MAIN CORRIDOR (Divider Strip y: 250 to 286) ──
  const cCorY = 250;
  const cCorH = 36;
  r(32, cCorY, 650, cCorH, '#E2E8F0');
  for (let x = 32; x < 682; x += 8) {
    r(x, cCorY, 1, cCorH, '#CBD5E1');
  }

  // Reception Desk
  const rcX = 320;
  r(rcX, cCorY + 4, 70, 24, '#0F172A');
  r(rcX + 2, cCorY + 6, 66, 20, '#1E293B');
  // Illuminated "TEEM" sign on desk front
  r(rcX + 14, cCorY + 14, 42, 6, '#38BDF8');

  // ── 4. ZONE: WATERCOOLER & KITCHENETTE (Bottom-Left: 32, 288 to 380, 500) ──
  const kX = 32;
  const kY = 288;
  const kW = 350;
  const kH = 212;

  // Modern checkered kitchen tile (black and white)
  r(kX, kY, kW, kH, '#F8FAFC');
  for (let y = kY; y < kY + kH; y += 14) {
    for (let x = kX; x < kX + kW; x += 14) {
      if ((Math.floor((x - kX) / 14) + Math.floor((y - kY) / 14)) % 2 === 0) {
        r(x, y, 14, 14, '#E2E8F0');
      }
    }
  }

  // Kitchen Wall
  r(kX, kY, kW, 10, '#334155');
  r(kX + kW - 4, kY, 4, kH, '#64748B');

  // L-Shaped Kitchen Island Counter
  r(kX + 16, kY + 20, kW - 40, 26, '#0F172A');
  r(kX + 18, kY + 22, kW - 44, 22, '#1E293B');

  // Espresso machines & cold brew tap
  r(kX + 35, kY + 24, 20, 16, '#94A3B8');
  r(kX + 38, kY + 22, 6, 4, '#CBD5E1'); // Chrome portafilter
  r(kX + 65, kY + 24, 20, 16, '#94A3B8');
  // Sink
  r(kX + 120, kY + 25, 24, 14, '#475569');
  r(kX + 130, kY + 23, 4, 4, '#CBD5E1'); // Chrome faucet

  // Water Cooler (iconic office watercooler!)
  const wcX = kX + 180;
  const wcY = kY + 22;
  r(wcX, wcY + 8, 16, 20, '#F8FAFC');
  r(wcX + 2, wcY, 12, 10, '#38BDF8'); // Blue water jug
  r(wcX + 5, wcY + 12, 3, 4, '#EF4444'); // Hot spout
  r(wcX + 9, wcY + 12, 3, 4, '#3B82F6'); // Cold spout

  // High-top round cafe tables & barstools
  for (let t = 0; t < 2; t++) {
    const tabX = kX + 60 + t * 140;
    const tabY = kY + 95;
    r(tabX - 2, tabY + 28, 36, 6, 'rgba(0,0,0,0.25)');
    r(tabX, tabY, 32, 28, '#78350F');
    r(tabX + 2, tabY + 2, 28, 24, '#A16207');
    // Stools
    r(tabX - 12, tabY + 6, 10, 16, '#0F172A');
    r(tabX + 34, tabY + 6, 10, 16, '#0F172A');
  }

  // Vending Machines & Snack Shelves along bottom wall
  r(kX + 30, kY + 165, 26, 35, '#2563EB');
  r(kX + 32, kY + 167, 22, 22, '#93C5FD');
  r(kX + 65, kY + 165, 26, 35, '#16A34A');
  r(kX + 67, kY + 167, 22, 22, '#86EFAC');

  // ── 5. ZONE: ALL-HANDS TOWN HALL & PING PONG (Bottom-Center: 390, 288 to 680, 500) ──
  const lX = 390;
  const lY = 288;
  const lW = 290;
  const lH = 212;

  // Warm natural bamboo parquet floor
  r(lX, lY, lW, lH, '#E0BA86');
  for (let y = lY; y < lY + lH; y += 6) {
    r(lX, y, lW, 1, '#C8985C');
  }

  // Lounge Wall
  r(lX, lY, lW, 10, '#334155');
  r(lX + lW - 4, lY, 4, lH, '#64748B');

  // Competition Ping Pong Table
  const ppX = lX + 45;
  const ppY = lY + 30;
  const ppW = 90;
  const ppH = 50;

  r(ppX - 2, ppY + ppH, ppW + 4, 6, 'rgba(0,0,0,0.3)');
  // Green table surface
  r(ppX, ppY, ppW, ppH, '#15803D');
  r(ppX + 2, ppY + 2, ppW - 4, ppH - 4, '#16A34A');
  // White perimeter line & center line
  r(ppX + 2, ppY + 2, ppW - 4, 1, '#FFFFFF');
  r(ppX + 2, ppY + ppH - 3, ppW - 4, 1, '#FFFFFF');
  r(ppX + 2, ppY + Math.floor(ppH / 2), ppW - 4, 1, '#FFFFFF');
  // Net
  r(ppX + Math.floor(ppW / 2) - 1, ppY - 2, 2, ppH + 4, '#FFFFFF');
  // Paddles & ball
  r(ppX + 15, ppY + 18, 8, 8, '#DC2626');
  r(ppX + 65, ppY + 24, 8, 8, '#2563EB');
  r(ppX + 40, ppY + 22, 3, 3, '#FEF08A');

  // Cozy Modular Blue Sofas & Bean Bags Area
  const sfX = lX + 160;
  const sfY = lY + 40;
  r(sfX, sfY, 80, 30, '#1E3A8A');
  r(sfX + 3, sfY + 3, 74, 24, '#2563EB');
  r(sfX + 15, sfY + 40, 50, 16, '#78350F'); // Coffee table

  // Giant all-hands drop-down projection screen
  r(lX + 30, lY + 120, 230, 70, '#0F172A');
  r(lX + 34, lY + 124, 222, 62, '#1E293B');
  r(lX + 70, lY + 130, 150, 8, '#38BDF8'); // "ALL-HANDS MEETING" text banner

  // ── 6. ZONE: PHONE PODS & SKYLINE BALCONY (East Wing: 692, 28 to 808, 500) ──
  const pX = 692;
  const pY = 28;
  const pW = 116;
  const pH = 472;

  // Split: Upper section = Private Soundproof Phone Pods (y: 28 to 260), Lower section = Penthouse Balcony (y: 264 to 500)
  r(pX, pY, pW, 232, '#0F172A');

  // 3 Acoustic Phone Pods
  for (let pod = 0; pod < 3; pod++) {
    const podY = pY + 15 + pod * 70;
    r(pX + 16, podY, 84, 55, '#334155');
    r(pX + 18, podY + 2, 80, 51, '#1E293B');
    // Sound dampening felt interior
    r(pX + 22, podY + 6, 72, 43, '#3B82F6');
    r(pX + 24, podY + 8, 68, 39, '#1D4ED8');
    // Shelf desk & stool
    r(pX + 30, podY + 20, 40, 12, '#F8FAFC');
    r(pX + 44, podY + 36, 12, 10, '#0F172A');
    // "IN USE" / "AVAILABLE" indicator light
    const lightCol = pod === 0 ? '#EF4444' : '#10B981';
    r(pX + 80, podY + 8, 6, 6, lightCol);
  }

  // Outdoor Skyline Balcony Terrace
  const terY = pY + 240;
  const terH = pH - 240;
  r(pX, terY, pW, terH, '#78350F'); // Rich redwood deck planks
  for (let y = terY; y < terY + terH; y += 8) {
    r(pX, y, pW, 1, '#451A03');
    r(pX, y + 1, pW, 1, '#9A3412');
  }

  // Glass safety balustrade railing
  r(pX + pW - 6, terY, 6, terH, '#38BDF8');
  r(pX, terY + terH - 6, pW, 6, '#38BDF8');

  // City skyline silhouette in background
  r(pX + pW - 2, terY, 2, terH, '#0284C7');

  // Outdoor lounge chairs & fire pit
  r(pX + 20, terY + 30, 30, 26, '#0F172A');
  r(pX + 22, terY + 32, 26, 22, '#475569');
  r(pX + 60, terY + 30, 30, 26, '#0F172A');
  r(pX + 62, terY + 32, 26, 22, '#475569');

  // Fire bowl on balcony
  r(pX + 45, terY + 90, 26, 26, '#18181B');
  r(pX + 48, terY + 93, 20, 20, '#F59E0B');
  r(pX + 52, terY + 97, 12, 12, '#EF4444');

  // ── 7. LABELS ─────────────────────────────────
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

  label('ENGINEERING HUB', dX + 10, dY + 12, '#2563EB');
  label('EXECUTIVE BOARDROOM', bX + 10, bY + 12, '#4F46E5');
  label('RECEPTION & LOBBY', 180, cCorY + 12, '#0F172A');
  label('BREAKROOM CAFE', kX + 10, kY + 12, '#059669');
  label('ALL-HANDS LOUNGE', lX + 10, lY + 12, '#D97706');
  label('PHONE BOOTHS', pX + 8, pY + 8, '#7C3AED');
  label('SKYLINE TERRACE', pX + 8, terY + 8, '#0284C7');
}
