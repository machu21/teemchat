// ============================================================
// RETRO 16-BIT PIXEL-ART WORLD MAP: ROAST & READ BOOK CAFE
// ============================================================

export function renderCafeMap(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  // Base exterior garden & building footprint
  r(0, 0, iw, ih, '#2D6B26');

  const cx = 24;
  const cy = 20;
  const cw = iw - 48;
  const ch = ih - 40;

  // Cafe Outer Red Brick Walls & Foundation
  r(cx - 4, cy - 4, cw + 8, ch + 8, '#7F1D1D');
  r(cx, cy, cw, ch, '#991B1B');

  // Warm Honey Herringbone Hardwood Floor
  const fx = 32;
  const fy = 28;
  const fw = 650;
  const fh = 472;

  r(fx, fy, fw, fh, '#D97706');
  for (let y = fy; y < fy + fh; y += 8) {
    r(fx, y, fw, 1, '#B45309');
    r(fx, y + 1, fw, 1, '#FDE68A');
    // Vertical plank seams
    for (let x = fx + ((y / 8) % 3) * 16; x < fx + fw; x += 32) {
      r(x, y, 1, 8, '#92400E');
    }
  }

  // ── 1. ZONE: BARISTA ESPRESSO BAR & BAKERY (Top-Left: 32, 28 to 380, 240) ──
  const barX = 32;
  const barY = 28;
  const barW = 350;
  const barH = 220;

  // North Interior Wall & Hanging Chalkboard Menu
  r(barX, barY, barW, 12, '#F5F5F4');
  r(barX, barY + 12, barW, 2, '#D6D3D1');
  r(barX + barW - 4, barY, 4, barH, '#A8A29E');

  // Hanging Chalkboard Menu ("COFFEE & PASTRIES")
  const mX = barX + 60;
  const mY = barY + 2;
  const mW = 190;
  const mH = 10;
  r(mX - 1, mY - 1, mW + 2, mH + 2, '#451A03');
  r(mX, mY, mW, mH, '#1C1917');
  ctx.font = 'bold 5px monospace';
  ctx.fillStyle = '#FEF08A';
  ctx.fillText('☕ ESPRESSO $3.50  LATTE $4.75  MATCHA $5.00  CROISSANT $4.00 🥐', mX + 4, mY + 7);

  // Large L-Shaped Barista Service Counter (Dark Walnut with Marble Top)
  const ctrX = barX + 30;
  const ctrY = barY + 36;
  const ctrW = 280;
  const ctrH = 36;

  r(ctrX - 2, ctrY + ctrH, ctrW + 4, 6, 'rgba(0,0,0,0.3)');
  r(ctrX, ctrY, ctrW, ctrH, '#451A03');
  r(ctrX + 2, ctrY + 2, ctrW - 4, ctrH - 4, '#F8FAFC'); // White marble counter top

  // 1. Italian Chrome Espresso Machine (La Marzocco Style)
  const espX = ctrX + 20;
  const espY = ctrY + 6;
  r(espX, espY, 45, 24, '#0F172A');
  r(espX + 2, espY + 2, 41, 20, '#E2E8F0'); // Chrome body
  // Dual hoppers filled with brown roasted beans
  r(espX + 6, espY - 4, 12, 6, '#78350F');
  r(espX + 26, espY - 4, 12, 6, '#78350F');
  // Steam wands & cup tray
  r(espX + 4, espY + 14, 4, 6, '#CBD5E1');
  r(espX + 38, espY + 14, 4, 6, '#CBD5E1');
  // Red portafilter handles
  r(espX + 12, espY + 18, 6, 3, '#DC2626');
  r(espX + 26, espY + 18, 6, 3, '#DC2626');

  // 2. Pour-Over Dripper Bar & Gooseneck Kettles
  const poX = ctrX + 80;
  r(poX, ctrY + 8, 40, 18, '#78350F');
  r(poX + 4, ctrY + 4, 8, 8, '#F8FAFC'); // Ceramic dripper 1
  r(poX + 16, ctrY + 4, 8, 8, '#F8FAFC'); // Ceramic dripper 2
  r(poX + 28, ctrY + 4, 8, 8, '#CBD5E1'); // Chrome gooseneck kettle

  // 3. Curved Glass Pastry Display Case (Croissants, Muffins, Donuts)
  const pasX = ctrX + 135;
  const pasY = ctrY + 6;
  const pasW = 120;
  const pasH = 24;

  r(pasX, pasY, pasW, pasH, '#1E293B');
  r(pasX + 2, pasY + 2, pasW - 4, pasH - 4, 'rgba(240, 253, 250, 0.9)'); // Glass
  // Pastries inside
  // Golden Butter Croissants
  r(pasX + 10, pasY + 8, 16, 10, '#D97706');
  r(pasX + 12, pasY + 10, 12, 6, '#FBBF24');
  r(pasX + 32, pasY + 8, 16, 10, '#D97706');
  // Blueberry Muffins
  r(pasX + 56, pasY + 7, 14, 12, '#92400E');
  r(pasX + 58, pasY + 8, 10, 6, '#2563EB'); // Blueberries
  r(pasX + 74, pasY + 7, 14, 12, '#92400E');
  // Chocolate Glazed Donuts
  r(pasX + 94, pasY + 8, 14, 12, '#451A03');
  r(pasX + 98, pasY + 11, 6, 6, '#FEF08A');

  // Bar High-Top Seating in Front
  for (let s = 0; s < 5; s++) {
    const sx = ctrX + 40 + s * 48;
    const sy = ctrY + ctrH + 6;
    r(sx, sy, 14, 14, '#78350F');
    r(sx + 2, sy + 2, 10, 10, '#B45309');
  }

  // Small cafe tables in cafe area
  for (let t = 0; t < 2; t++) {
    const tx = barX + 50 + t * 140;
    const ty = barY + 125;
    r(tx, ty, 36, 32, '#78350F');
    r(tx + 2, ty + 2, 32, 28, '#92400E');
    // Latte cup with heart latte art
    r(tx + 12, ty + 10, 10, 10, '#F8FAFC');
    r(tx + 14, ty + 12, 6, 6, '#B45309'); // Crema
    r(tx + 16, ty + 14, 2, 2, '#FFFFFF'); // White foam heart
  }

  // ── 2. ZONE: FIREPLACE HEARTH & LEATHER ARMCHAIRS (Top-Right: 390, 28 to 680, 240) ──
  const fX = 390;
  const fY = 28;
  const fW = 290;
  const fH = 220;

  r(fX, fY, fW, 12, '#F5F5F4');
  r(fX, fY + 12, fW, 2, '#D6D3D1');
  r(fX + fW - 4, fY, 4, fH, '#A8A29E');

  // Stone River Brick Fireplace Chimney on North Wall
  const chX = fX + 90;
  const chY = fY + 2;
  const chW = 100;
  const chH = 55;

  r(chX - 2, chY + chH, chW + 4, 6, 'rgba(0,0,0,0.4)');
  r(chX, chY, chW, chH, '#57534E');
  r(chX + 2, chY + 2, chW - 4, chH - 4, '#78716C');
  // Firebox Hearth with Crackling Orange Flames
  r(chX + 25, chY + 16, 50, 34, '#1C1917');
  r(chX + 28, chY + 20, 44, 26, '#0C0A09');
  // Logs & Glowing Fire
  r(chX + 32, chY + 38, 36, 6, '#451A03'); // Wooden log
  r(chX + 36, chY + 26, 28, 14, '#DC2626'); // Red flame
  r(chX + 40, chY + 28, 20, 12, '#EA580C'); // Orange flame
  r(chX + 44, chY + 30, 12, 10, '#FDE047'); // Yellow flame heart

  // Wooden Mantle Shelf with Potted Ivy & Clock
  r(chX - 4, chY + 14, chW + 8, 4, '#78350F');
  r(chX + 12, chY + 4, 8, 10, '#15803D'); // Hanging ivy
  r(chX + Math.floor(chW / 2) - 4, chY + 4, 8, 8, '#F59E0B'); // Brass clock

  // Giant Persian Carpet in Front of Fireplace
  const rugX = fX + 45;
  const rugY = fY + 70;
  const rugW = 190;
  const rugH = 120;

  r(rugX - 2, rugY - 2, rugW + 4, rugH + 4, '#7F1D1D');
  r(rugX, rugY, rugW, rugH, '#991B1B');
  for (let ry = rugY + 4; ry < rugY + rugH; ry += 12) {
    for (let rx = rugX + 4; rx < rugX + rugW; rx += 12) {
      if ((Math.floor((rx - rugX) / 12) + Math.floor((ry - rugY) / 12)) % 2 === 0) {
        r(rx, ry, 12, 12, '#B91C1C');
      }
      r(rx + 4, ry + 4, 4, 4, '#FDE047'); // Gold medallion
    }
  }

  // 2 Cognac Leather Armchairs facing each other
  // Left Armchair
  r(fX + 55, fY + 95, 36, 36, '#78350F');
  r(fX + 58, fY + 98, 30, 30, '#92400E');
  r(fX + 62, fY + 102, 22, 22, '#B45309');
  // Right Armchair
  r(fX + 185, fY + 95, 36, 36, '#78350F');
  r(fX + 188, fY + 98, 30, 30, '#92400E');
  r(fX + 192, fY + 102, 22, 22, '#B45309');

  // Rustic Log Coffee Table in center
  const lTabX = fX + 115;
  const lTabY = fY + 105;
  r(lTabX, lTabY, 50, 24, '#451A03');
  r(lTabX + 2, lTabY + 2, 46, 20, '#78350F');
  r(lTabX + 12, lTabY + 6, 12, 10, '#38BDF8'); // Open book
  r(lTabX + 32, lTabY + 8, 8, 8, '#F8FAFC'); // Coffee cup

  // ── 3. ZONE: TOWERING BOOKSTORE STACKS (Bottom-Left: 32, 288 to 380, 500) ──
  const bstkX = 32;
  const bstkY = 288;
  const bstkW = 350;
  const bstkH = 212;

  r(bstkX, bstkY, bstkW, 10, '#F5F5F4');
  r(bstkX + bstkW - 4, bstkY, 4, bstkH, '#A8A29E');

  // 3 Massive Oak Bookcase Aisles
  for (let s = 0; s < 3; s++) {
    const sX = bstkX + 25 + s * 95;
    r(sX, bstkY + 20, 65, 120, '#451A03');
    r(sX + 2, bstkY + 22, 61, 116, '#78350F');

    // Bookshelf tiers packed with books
    for (let sy = bstkY + 25; sy < bstkY + 135; sy += 18) {
      r(sX + 2, sy + 15, 61, 2, '#291404');
      for (let bx = sX + 4; bx < sX + 59; bx += 5) {
        const spineColor = ['#991B1B', '#1E3A8A', '#14532D', '#B45309', '#6B21A8', '#0E7490'][(bx * 5) % 6];
        r(bx, sy + 2, 4, 13, spineColor);
        r(bx + 1, sy + 4, 2, 2, '#FEF08A');
      }
    }

    // Rolling Brass Library Ladder (on middle shelf)
    if (s === 1) {
      r(sX + 20, bstkY + 20, 4, 120, '#FACC15');
      r(sX + 32, bstkY + 20, 4, 120, '#FACC15');
      for (let ly = bstkY + 30; ly < bstkY + 130; ly += 16) {
        r(sX + 20, ly, 16, 2, '#EAB308');
      }
    }
  }

  // Reading Carrel Desks & Bankers Lamps
  r(bstkX + 40, bstkY + 155, 110, 30, '#78350F');
  r(bstkX + 42, bstkY + 157, 106, 26, '#92400E');
  r(bstkX + 60, bstkY + 160, 12, 6, '#15803D'); // Banker lamp 1
  r(bstkX + 110, bstkY + 160, 12, 6, '#15803D'); // Banker lamp 2

  r(bstkX + 180, bstkY + 155, 110, 30, '#78350F');
  r(bstkX + 182, bstkY + 157, 106, 26, '#92400E');
  r(bstkX + 200, bstkY + 160, 12, 6, '#15803D');
  r(bstkX + 250, bstkY + 160, 12, 6, '#15803D');

  // ── 4. ZONE: ACOUSTIC LIVE STAGE & CHESS (Bottom-Center: 390, 288 to 680, 500) ──
  const acX = 390;
  const acY = 288;
  const acW = 290;
  const acH = 212;

  r(acX, acY, acW, 10, '#F5F5F4');
  r(acX + acW - 4, acY, 4, acH, '#A8A29E');

  // Raised Acoustic Performance Stage
  const stgX = acX + 25;
  const stgY = acY + 25;
  const stgW = 105;
  const stgH = 80;

  r(stgX - 2, stgY + stgH, stgW + 4, 6, 'rgba(0,0,0,0.3)');
  r(stgX, stgY, stgW, stgH, '#78350F');
  r(stgX + 2, stgY + 2, stgW - 4, stgH - 4, '#B45309');

  // Acoustic Guitar on Wooden Stand
  const gX = stgX + 25;
  const gY = stgY + 20;
  r(gX, gY + 12, 18, 22, '#D97706'); // Lower body
  r(gX + 3, gY + 15, 12, 16, '#92400E');
  r(gX + 7, gY + 19, 4, 4, '#000000'); // Sound hole
  r(gX + 7, gY, 4, 14, '#78350F'); // Neck
  r(gX + 5, gY - 4, 8, 4, '#D97706'); // Headstock

  // Vintage Microphone on Chrome Stand
  const micX = stgX + 65;
  const micY = stgY + 20;
  r(micX + 4, micY, 8, 12, '#CBD5E1'); // Silver mic capsule
  r(micX + 7, micY + 12, 2, 28, '#94A3B8'); // Stand rod
  r(micX + 2, micY + 40, 12, 4, '#475569'); // Round base

  // Overhead Warm Stage Spotlight
  r(stgX + Math.floor(stgW / 2) - 18, stgY + 4, 36, 6, '#FBBF24');

  // Small Round Cafe Cabaret Tables with Chess Boards
  for (let ct = 0; ct < 2; ct++) {
    const chTableX = acX + 155 + ct * 60;
    const chTableY = acY + 40;
    r(chTableX, chTableY, 45, 45, '#451A03');
    r(chTableX + 2, chTableY + 2, 41, 41, '#78350F');
    // Chess board in center
    const chsX = chTableX + 10;
    const chsY = chTableY + 10;
    r(chsX, chsY, 24, 24, '#1C1917');
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if ((row + col) % 2 === 0) {
          r(chsX + col * 6, chsY + row * 6, 6, 6, '#FDE68A');
        }
      }
    }
  }

  // Cozy Modular Lounge Area (Bottom-right of cafe interior)
  const cSofaX = acX + 40;
  const cSofaY = acY + 125;
  r(cSofaX, cSofaY, 90, 30, '#15803D'); // Emerald velvet couch
  r(cSofaX + 3, cSofaY + 3, 84, 24, '#16A34A');
  r(cSofaX + 18, cSofaY + 40, 54, 16, '#78350F'); // Coffee table

  // ── 5. ZONE: SUNLIT GARDEN PATIO (East Wing: 692, 28 to 808, 500) ──
  const patX = 692;
  const patY = 28;
  const patW = 116;
  const patH = 472;

  // French Cobblestone Garden Patio Floor
  r(patX, patY, patW, patH, '#CBD5E1');
  for (let y = patY; y < patY + patH; y += 12) {
    for (let x = patX; x < patX + patW; x += 12) {
      if ((Math.floor((x - patX) / 12) + Math.floor((y - patY) / 12)) % 2 === 0) {
        r(x, y, 12, 12, '#E2E8F0');
      }
      r(x + 1, y + 1, 10, 10, '#94A3B8');
    }
  }

  // Garden Perimeter Ivy & Floral Planters
  r(patX + patW - 4, patY, 4, patH, '#15803D');
  r(patX, patY, patW, 4, '#15803D');
  r(patX, patY + patH - 4, patW, 4, '#15803D');

  // 2 Parisian Wrought-Iron Cafe Tables with Striped Parasols (Umbrellas)
  for (let p = 0; p < 2; p++) {
    const pY = patY + 50 + p * 150;
    // Cast iron table
    r(patX + 35, pY + 20, 46, 46, '#0F172A');
    r(patX + 37, pY + 22, 42, 42, '#334155');
    // Striped Green & White Parasol
    r(patX + 25, pY, 66, 26, '#15803D');
    r(patX + 33, pY, 14, 26, '#F8FAFC');
    r(patX + 57, pY, 14, 26, '#F8FAFC');
    r(patX + 56, pY + 26, 4, 30, '#0F172A'); // Pole

    // Bistro chairs
    r(patX + 16, pY + 30, 14, 18, '#0F172A');
    r(patX + 86, pY + 30, 14, 18, '#0F172A');
  }

  // Stone Birdbath & Flower Planter Fountain (Bottom)
  const ftnY = patY + 370;
  r(patX + 38, ftnY, 40, 40, '#64748B');
  r(patX + 41, ftnY + 3, 34, 34, '#94A3B8');
  r(patX + 46, ftnY + 8, 24, 24, '#38BDF8'); // Water
  r(patX + 52, ftnY + 14, 12, 12, '#F0FCFF'); // Ripple

  // Blooming lavender & rose planters along side
  for (let ply = patY + 15; ply < patY + patH - 20; ply += 40) {
    r(patX + 6, ply, 12, 22, '#B45309'); // Terracotta planter
    r(patX + 8, ply - 4, 8, 8, ply % 80 === 0 ? '#A855F7' : '#EF4444'); // Lavender or Roses
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

  label('BARISTA ESPRESSO BAR', barX + 10, barY + 12, '#B45309');
  label('FIREPLACE HEARTH', fX + 10, fY + 12, '#C2410C');
  label('BOOKSTORE STACKS', bstkX + 10, bstkY + 12, '#6D28D9');
  label('ACOUSTIC LIVE STAGE', acX + 10, acY + 12, '#047857');
  label('GARDEN PATIO', patX + 8, patY + 8, '#0369A1');
}
