// ============================================================
// RETRO 16-BIT PIXEL-ART WORLD MAP: RETRO CYBER ARCADE & ESPORTS
// ============================================================

export function renderArcadeMap(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  // Base building perimeter
  r(0, 0, iw, ih, '#090514');

  const ax = 24;
  const ay = 20;
  const aw = iw - 48;
  const ah = ih - 40;

  // Exterior building trim
  r(ax - 4, ay - 4, aw + 8, ah + 8, '#1E1B4B');
  r(ax, ay, aw, ah, '#171336');

  // Iconic 90s Retro Arcade Carpet (Triangles & squiggles on dark violet)
  for (let ty = ay; ty < ay + ah; ty += 18) {
    for (let tx = ax; tx < ax + aw; tx += 18) {
      if ((Math.floor(tx / 18) + Math.floor(ty / 18)) % 2 === 0) {
        r(tx, ty, 18, 18, '#231B54');
      }
      // Neon carpet geometric confettis
      const confetti = (tx * 7 + ty * 13) % 11;
      if (confetti === 0) {
        r(tx + 4, ty + 4, 3, 3, '#F43F5E'); // Neon pink triangle
      } else if (confetti === 1) {
        r(tx + 12, ty + 6, 4, 2, '#06B6D4'); // Cyan dash
      } else if (confetti === 2) {
        r(tx + 6, ty + 12, 3, 3, '#FBBF24'); // Yellow diamond
      } else if (confetti === 3) {
        r(tx + 10, ty + 10, 3, 3, '#10B981'); // Emerald star
      }
    }
  }

  // ── 1. ZONE: CLASSIC RETRO ARCADE ALLEY (Top-Left: 32, 28 to 380, 240) ──
  const arcX = 32;
  const arcY = 28;
  const arcW = 350;
  const arcH = 220;

  // North Wall & High Score Leaderboard
  r(arcX, arcY, arcW, 10, '#0F172A');
  r(arcX, arcY + 10, arcW, 2, '#F43F5E'); // Neon pink wall trim
  r(arcX + arcW - 4, arcY, 4, arcH, '#4338CA');

  // Wall Leaderboard Sign ("HIGH SCORES")
  const hsX = arcX + 90;
  r(hsX, arcY + 2, 160, 8, '#000000');
  r(hsX + 2, arcY + 3, 156, 6, '#18181B');
  ctx.font = 'bold 5px monospace';
  ctx.fillStyle = '#FEF08A';
  ctx.fillText('🏆 HIGH SCORES: 1. ACE 999999  2. RED 885400 🏆', hsX + 6, arcY + 7);

  // 2 Rows of 4 Pixel Arcade Cabinets (8 machines total)
  const cabThemes = [
    { name: 'PAC-8', body: '#FACC15', marquee: '#EF4444', screen: '#1E3A8A' },
    { name: 'FIGHT', body: '#DC2626', marquee: '#FEF08A', screen: '#B91C1C' },
    { name: 'SPACE', body: '#2563EB', marquee: '#38BDF8', screen: '#0F172A' },
    { name: 'RACER', body: '#16A34A', marquee: '#86EFAC', screen: '#064E3B' },
    { name: 'CYBER', body: '#9333EA', marquee: '#F472B6', screen: '#581C87' },
    { name: 'NINJA', body: '#0F172A', marquee: '#EF4444', screen: '#450A0A' },
    { name: 'TETRA', body: '#0891B2', marquee: '#67E8F9', screen: '#164E63' },
    { name: 'QUEST', body: '#D97706', marquee: '#FDE68A', screen: '#78350F' },
  ];

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const cIdx = row * 4 + col;
      const theme = cabThemes[cIdx];
      const cX = arcX + 25 + col * 82;
      const cY = arcY + 30 + row * 95;
      const cW = 48;
      const cH = 68;

      // Shadow
      r(cX - 2, cY + cH, cW + 4, 6, 'rgba(0,0,0,0.5)');

      // Arcade Cabinet Shell
      r(cX, cY, cW, cH, '#0F172A');
      r(cX + 2, cY + 2, cW - 4, cH - 4, theme.body);

      // Glowing Marquee Header
      r(cX + 4, cY + 4, cW - 8, 14, '#000000');
      r(cX + 5, cY + 5, cW - 10, 12, theme.marquee);
      // CRT Monitor Bezel & Screen
      r(cX + 6, cY + 20, cW - 12, 22, '#000000');
      r(cX + 8, cY + 22, cW - 16, 18, theme.screen);
      // Pixel game graphics on CRT screen
      r(cX + 12, cY + 28, 6, 6, '#FEF08A');
      r(cX + 26, cY + 26, 8, 8, '#EF4444');

      // Control Panel Deck (Angled Shelf)
      r(cX + 4, cY + 44, cW - 8, 14, '#1E293B');
      // Red Balltop Joystick
      r(cX + 12, cY + 48, 6, 6, '#EF4444');
      r(cX + 14, cY + 53, 2, 4, '#CBD5E1'); // Chrome shaft
      // 6 Action Buttons
      r(cX + 24, cY + 47, 4, 4, '#3B82F6');
      r(cX + 30, cY + 47, 4, 4, '#10B981');
      r(cX + 36, cY + 47, 4, 4, '#F59E0B');
      r(cX + 24, cY + 52, 4, 4, '#EC4899');
      r(cX + 30, cY + 52, 4, 4, '#EF4444');
      r(cX + 36, cY + 52, 4, 4, '#A855F7');

      // Coin Door with Glowing 25¢ Insert Slots
      r(cX + 14, cY + 60, 20, 7, '#000000');
      r(cX + 18, cY + 61, 3, 5, '#EF4444'); // Glowing coin slot 1
      r(cX + 27, cY + 61, 3, 5, '#EF4444'); // Glowing coin slot 2
    }
  }

  // ── 2. ZONE: ESPORTS TOURNAMENT ARENA (Top-Right: 390, 28 to 680, 240) ──
  const espX = 390;
  const espY = 28;
  const espW = 290;
  const espH = 220;

  // Stadium dark stage floor with RGB neon edge
  r(espX, espY, espW, espH, '#0B0F19');
  r(espX, espY, espW, 10, '#0F172A');
  r(espX, espY + 10, espW, 2, '#38BDF8');
  r(espX + espW - 4, espY, 4, espH, '#4338CA');

  // Raised Tournament Arena Battle Stage
  const stgX = espX + 20;
  const stgY = espY + 30;
  const stgW = espW - 40;
  const stgH = 100;

  r(stgX - 2, stgY + stgH, stgW + 4, 6, 'rgba(0,0,0,0.5)');
  r(stgX, stgY, stgW, stgH, '#111827');
  r(stgX + 2, stgY + 2, stgW - 4, stgH - 4, '#1F2937');

  // Center Stage Divider Line: Red Team (Left) vs Blue Team (Right)
  r(stgX + Math.floor(stgW / 2) - 1, stgY, 2, stgH, '#FACC15');

  // Massive Spectator Broadcast Screen suspended over stage
  const bcastX = stgX + 35;
  const bcastY = stgY + 4;
  const bcastW = stgW - 70;
  const bcastH = 26;
  r(bcastX - 1, bcastY - 1, bcastW + 2, bcastH + 2, '#000000');
  r(bcastX, bcastY, bcastW, bcastH, '#1E1B4B');
  // Match score display
  r(bcastX + 10, bcastY + 6, 50, 14, '#DC2626');
  r(bcastX + bcastW - 60, bcastY + 6, 50, 14, '#2563EB');
  ctx.font = 'bold 7px monospace';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('RED 14', bcastX + 18, bcastY + 16);
  ctx.fillText('VS', bcastX + Math.floor(bcastW / 2) - 6, bcastY + 16);
  ctx.fillText('BLUE 12', bcastX + bcastW - 52, bcastY + 16);

  // Team Red Battlestations (3 PC Gaming rigs on left)
  for (let rpc = 0; rpc < 3; rpc++) {
    const pcX = stgX + 15 + rpc * 34;
    const pcY = stgY + 42;
    // Desk
    r(pcX, pcY, 30, 24, '#0F172A');
    r(pcX + 2, pcY + 2, 26, 20, '#DC2626'); // Red LED desk trim
    // Monitor
    r(pcX + 5, pcY + 3, 20, 12, '#020617');
    r(pcX + 6, pcY + 4, 18, 9, '#FCA5A5');
    // Chair
    r(pcX + 9, pcY + 26, 12, 10, '#991B1B');
  }

  // Team Blue Battlestations (3 PC Gaming rigs on right)
  for (let bpc = 0; bpc < 3; bpc++) {
    const pcX = stgX + Math.floor(stgW / 2) + 15 + bpc * 34;
    const pcY = stgY + 42;
    r(pcX, pcY, 30, 24, '#0F172A');
    r(pcX + 2, pcY + 2, 26, 20, '#2563EB'); // Blue LED desk trim
    r(pcX + 5, pcY + 3, 20, 12, '#020617');
    r(pcX + 6, pcY + 4, 18, 9, '#93C5FD');
    r(pcX + 9, pcY + 26, 12, 10, '#1D4ED8');
  }

  // Spectator Bleacher Benches below stage
  for (let row = 0; row < 2; row++) {
    const blY = espY + 145 + row * 34;
    r(espX + 30, blY, espW - 60, 16, '#1F2937');
    r(espX + 32, blY + 2, espW - 64, 12, '#374151');
    // Spectator seat numbers
    for (let s = 0; s < 6; s++) {
      r(espX + 45 + s * 34, blY + 4, 8, 8, '#F59E0B');
    }
  }

  // ── 3. ZONE: RHYTHM DANCE & AIR HOCKEY (Bottom-Left: 32, 288 to 380, 500) ──
  const rhyX = 32;
  const rhyY = 288;
  const rhyW = 350;
  const rhyH = 212;

  r(rhyX, rhyY, rhyW, 10, '#0F172A');
  r(rhyX + rhyW - 4, rhyY, 4, rhyH, '#4338CA');

  // DDR Dual Stage (Flashing Directional Dance Pads)
  const ddrX = rhyX + 30;
  const ddrY = rhyY + 30;
  const ddrW = 120;
  const ddrH = 75;

  r(ddrX - 2, ddrY + ddrH, ddrW + 4, 6, 'rgba(0,0,0,0.5)');
  r(ddrX, ddrY, ddrW, ddrH, '#0F172A');
  r(ddrX + 2, ddrY + 2, ddrW - 4, ddrH - 4, '#1E293B');

  // Player 1 Pad (Left)
  const p1X = ddrX + 8;
  const p1Y = ddrY + 10;
  // Up, Down, Left, Right arrow tiles
  r(p1X + 16, p1Y, 14, 14, '#38BDF8'); // Up (Blue)
  r(p1X + 16, p1Y + 32, 14, 14, '#38BDF8'); // Down
  r(p1X, p1Y + 16, 14, 14, '#EF4444'); // Left (Red)
  r(p1X + 32, p1Y + 16, 14, 14, '#EF4444'); // Right
  r(p1X + 16, p1Y + 16, 14, 14, '#475569'); // Center

  // Player 2 Pad (Right)
  const p2X = ddrX + 64;
  const p2Y = ddrY + 10;
  r(p2X + 16, p2Y, 14, 14, '#10B981'); // Up (Green)
  r(p2X + 16, p2Y + 32, 14, 14, '#10B981'); // Down
  r(p2X, p2Y + 16, 14, 14, '#F59E0B'); // Left (Yellow)
  r(p2X + 32, p2Y + 16, 14, 14, '#F59E0B'); // Right
  r(p2X + 16, p2Y + 16, 14, 14, '#475569');

  // Air Hockey Table
  const ahX = rhyX + 180;
  const ahY = rhyY + 30;
  const ahW = 120;
  const ahH = 65;

  r(ahX - 2, ahY + ahH, ahW + 4, 6, 'rgba(0,0,0,0.5)');
  r(ahX, ahY, ahW, ahH, '#0F172A');
  r(ahX + 2, ahY + 2, ahW - 4, ahH - 4, '#F8FAFC'); // White air surface
  // Center red circle & goal slots
  r(ahX + Math.floor(ahW / 2) - 12, ahY + Math.floor(ahH / 2) - 12, 24, 24, '#EF4444');
  r(ahX + Math.floor(ahW / 2) - 9, ahY + Math.floor(ahH / 2) - 9, 18, 18, '#F8FAFC');
  r(ahX + Math.floor(ahW / 2) - 1, ahY + 2, 2, ahH - 4, '#EF4444');
  // Goals & Mallets
  r(ahX + 2, ahY + 18, 4, 28, '#0F172A'); // Goal 1
  r(ahX + ahW - 6, ahY + 18, 4, 28, '#0F172A'); // Goal 2
  r(ahX + 25, ahY + 28, 10, 10, '#DC2626'); // Red mallet
  r(ahX + ahW - 35, ahY + 28, 10, 10, '#2563EB'); // Blue mallet
  r(ahX + Math.floor(ahW / 2) + 12, ahY + 30, 6, 6, '#000000'); // Puck

  // Skeeball Ramps (Bottom section)
  for (let sk = 0; sk < 3; sk++) {
    const skX = rhyX + 40 + sk * 95;
    const skY = rhyY + 120;
    r(skX, skY, 65, 80, '#78350F');
    r(skX + 3, skY + 3, 59, 74, '#9A3412');
    // Ramp runway & target rings
    r(skX + 8, skY + 8, 49, 28, '#0F172A');
    r(skX + 24, skY + 12, 18, 18, '#F59E0B');
    r(skX + 28, skY + 16, 10, 10, '#EF4444');
  }

  // ── 4. ZONE: PRIZE COUNTER & SODA FOUNTAIN (Bottom-Center: 390, 288 to 680, 500) ──
  const przX = 390;
  const przY = 288;
  const przW = 290;
  const przH = 212;

  r(przX, przY, przW, 10, '#0F172A');
  r(przX + przW - 4, przY, 4, przH, '#4338CA');

  // Prize Redemption Counter
  const pcY = przY + 30;
  r(przX + 20, pcY, przW - 40, 26, '#1E1B4B');
  r(przX + 22, pcY + 2, przW - 44, 22, '#312E81');
  // Back Wall Prize Shelves (Plush toys, retro consoles, pixel swords)
  r(przX + 20, przY + 4, przW - 40, 22, '#0F172A');
  // Giant Teddy Bears on Shelf
  r(przX + 40, przY + 6, 18, 16, '#92400E');
  r(przX + 42, przY + 8, 14, 12, '#B45309');
  r(przX + 90, przY + 6, 18, 16, '#EC4899'); // Pink bear
  r(przX + 150, przY + 8, 26, 10, '#38BDF8'); // Game Console Box
  r(przX + 210, przY + 6, 30, 8, '#FACC15'); // Golden Pixel Sword

  // Slushie & Retro Soda Machine Counter
  const smY = przY + 80;
  r(przX + 30, smY, 120, 28, '#0F172A');
  r(przX + 32, smY + 2, 116, 24, '#1E293B');
  // Slushie Dispensers (Blue Raspberry & Cherry)
  r(przX + 42, smY + 4, 18, 20, '#06B6D4'); // Blue Slush
  r(przX + 70, smY + 4, 18, 20, '#EF4444'); // Red Slush
  r(przX + 98, smY + 4, 18, 20, '#10B981'); // Lime Slush
  r(przX + 120, smY + 8, 18, 16, '#FBBF24'); // Popcorn warmer machine

  // Claw Machines (2 arcade claw machines)
  for (let cm = 0; cm < 2; cm++) {
    const cmX = przX + 175 + cm * 46;
    const cmY = przY + 75;
    r(cmX, cmY, 40, 60, '#0F172A');
    r(cmX + 2, cmY + 2, 36, 56, cm === 0 ? '#EC4899' : '#06B6D4');
    // Glass prize window with toys inside
    r(cmX + 6, cmY + 8, 28, 30, '#F8FAFC');
    r(cmX + 8, cmY + 16, 10, 10, '#F59E0B');
    r(cmX + 20, cmY + 20, 10, 10, '#8B5CF6');
    r(cmX + 14, cmY + 4, 8, 8, '#CBD5E1'); // Claw
    // Joystick
    r(cmX + 12, cmY + 44, 4, 8, '#EF4444');
  }

  // ── 5. ZONE: RETRO LAN PARTY LOUNGE (East Wing: 692, 28 to 808, 500) ──
  const lanX = 692;
  const lanY = 28;
  const lanW = 116;
  const lanH = 472;

  // Dark moody wood panel floor
  r(lanX, lanY, lanW, lanH, '#1E1B4B');
  for (let y = lanY; y < lanY + lanH; y += 8) {
    r(lanX, y, lanW, 1, '#171336');
  }

  // Wall CRT Monitors Stack
  for (let crt = 0; crt < 4; crt++) {
    const crtY = lanY + 20 + crt * 54;
    r(lanX + 18, crtY, 80, 44, '#0F172A');
    r(lanX + 22, crtY + 4, 72, 36, '#18181B');
    // Curved CRT glass glow
    const scrCol = ['#38BDF8', '#10B981', '#A855F7', '#F59E0B'][crt];
    r(lanX + 26, crtY + 8, 64, 28, scrCol);
    r(lanX + 32, crtY + 12, 16, 16, 'rgba(255,255,255,0.4)');
  }

  // Comfy Retro Gamer Lounge Bean Bags & Pizza Table (Bottom section)
  const lTabY = lanY + 260;
  r(lanX + 20, lTabY, 76, 40, '#78350F');
  r(lanX + 22, lTabY + 2, 72, 36, '#9A3412');
  // Open Pizza Box with pixel pepperoni slices
  r(lanX + 32, lTabY + 8, 26, 24, '#E5E7EB');
  r(lanX + 34, lTabY + 10, 22, 20, '#F59E0B');
  r(lanX + 38, lTabY + 14, 4, 4, '#DC2626');
  r(lanX + 46, lTabY + 16, 4, 4, '#DC2626');

  // Red & Blue Bean Bags
  r(lanX + 14, lTabY + 55, 36, 26, '#DC2626');
  r(lanX + 66, lTabY + 55, 36, 26, '#2563EB');
  r(lanX + 40, lTabY + 95, 36, 26, '#F59E0B');

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

  label('CLASSIC ARCADE ROW', arcX + 10, arcY + 12, '#D97706');
  label('ESPORTS ARENA', espX + 10, espY + 12, '#DC2626');
  label('DDR & AIR HOCKEY', rhyX + 10, rhyY + 12, '#EC4899');
  label('PRIZE & SODA BAR', przX + 10, przY + 12, '#059669');
  label('LAN PARTY LOUNGE', lanX + 8, lanY + 8, '#7C3AED');
}
