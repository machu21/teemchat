// ============================================================
// HABBLAUD-INSPIRED 3/4 TOP-DOWN TECH OFFICE & COWORKING MAP
// ============================================================
// Features authentic Habblaud architectural systems:
// - 2-tile elevated North Walls (32px) with wallpaper trims & baseboards
// - Interactive wall mounts: Agile Kanban board, live analog clock, daylight window, presentation screen
// - Low South Parapet Walls (1-tile with 4px cap) that never occlude room interiors
// - Realistic floor surfaces: woven carpet pods, parquet wood, marble corridor, checkerboard pantry
// - Depth-sorted workstation pods with dual monitors, ergonomic mesh chairs, ping pong & lounge

export function renderOfficeMap(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  // Base building exterior & structural border
  r(0, 0, iw, ih, '#0B0F19');

  const ox = 24;
  const oy = 20;
  const ow = iw - 48;
  const oh = ih - 40;

  // Exterior building frame & sidewalk
  r(ox - 4, oy - 4, ow + 8, oh + 8, '#1E2538');
  r(ox, oy, ow, oh, '#2E384D');

  // Helper to draw a 3/4 North Wall (32px high: 4px cap, wallpaper face, 3px baseboard)
  const drawNorthWall = (
    wx: number,
    wy: number,
    ww: number,
    wallBase: string,
    wallTrim: string,
    pattern: 'plain' | 'stripes' | 'tiles' | 'wood_panel' = 'plain'
  ) => {
    const capH = 4;
    const baseH = 3;
    const faceH = 32 - capH - baseH;

    // Dark top wall cap
    r(wx, wy, ww, capH, '#272B3B');
    r(wx, wy, ww, 1, '#3D445A'); // Specular highlight on top edge

    // Wallpaper face
    r(wx, wy + capH, ww, faceH, wallBase);

    // Subtle drop shadow under cap
    r(wx, wy + capH, ww, 1, 'rgba(0, 0, 0, 0.25)');
    r(wx, wy + capH + 1, ww, 1, 'rgba(0, 0, 0, 0.12)');

    // Wall patterns
    if (pattern === 'stripes') {
      for (let px = wx + 4; px < wx + ww; px += 8) {
        r(px, wy + capH, 2, faceH, wallTrim);
      }
    } else if (pattern === 'tiles') {
      for (let py = wy + capH; py < wy + capH + faceH; py += 6) {
        r(wx, py, ww, 1, wallTrim);
      }
      for (let py = wy + capH; py < wy + capH + faceH; py += 6) {
        const offset = ((py - wy) % 12 === 0) ? 0 : 4;
        for (let px = wx + offset; px < wx + ww; px += 8) {
          r(px, py, 1, 6, wallTrim);
        }
      }
    } else if (pattern === 'wood_panel') {
      // Lower wainscoting panel
      const wainscotY = wy + capH + Math.floor(faceH * 0.45);
      const wainscotH = faceH - Math.floor(faceH * 0.45);
      r(wx, wainscotY, ww, wainscotH, wallTrim);
      r(wx, wainscotY, ww, 1, '#C99E72'); // Molding top highlight
      for (let px = wx; px < wx + ww; px += 12) {
        r(px, wainscotY, 1, wainscotH, '#5A3822');
      }
    }

    // Wooden baseboard trim at bottom
    r(wx, wy + capH + faceH, ww, baseH, '#332316');
    r(wx, wy + capH + faceH, ww, 1, '#5C402B');
  };

  // Helper to draw Low South Parapet Walls (16px high with doorway openings)
  const drawSouthWall = (wx: number, wy: number, ww: number, doorX?: number, doorW: number = 32) => {
    const capH = 4;
    const bodyH = 12;

    const drawSection = (sx: number, sw: number) => {
      if (sw <= 0) return;
      r(sx, wy, sw, capH, '#272B3B');
      r(sx, wy, sw, 1, '#3D445A');
      r(sx, wy + capH, sw, bodyH, '#1E2538');
      r(sx, wy + capH + bodyH - 1, sw, 1, '#111726');
    };

    if (doorX !== undefined && doorW > 0) {
      drawSection(wx, doorX - wx);
      drawSection(doorX + doorW, wx + ww - (doorX + doorW));
      // Doorway floor threshold
      r(doorX, wy, doorW, capH + bodyH, '#CBD5E1');
      r(doorX, wy, doorW, 1, '#94A3B8');
    } else {
      drawSection(wx, ww);
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 1. ZONE: OPEN ENGINEERING WORKSTATIONS (Top-Left: 32, 28 to 380, 248)
  // ════════════════════════════════════════════════════════════════
  const dX = 32;
  const dY = 28;
  const dW = 350;
  const dH = 220;

  // Woven corporate charcoal carpet tiles (Habblaud carpet style)
  r(dX, dY, dW, dH, '#1E293B');
  for (let y = dY; y < dY + dH; y += 16) {
    for (let x = dX; x < dX + dW; x += 16) {
      if ((Math.floor((x - dX) / 16) + Math.floor((y - dY) / 16)) % 2 === 0) {
        r(x, y, 16, 16, '#243248');
      }
    }
  }

  // 2-Tile Elevated North Wall with crisp tech off-white finish
  drawNorthWall(dX, dY, dW, '#E9EBF0', '#CBD5E1', 'plain');

  // Wall Item: Agile Kanban Whiteboard with colored post-it notes
  const wbX = dX + 50;
  const wbY = dY + 6;
  const wbW = 140;
  const wbH = 20;

  r(wbX - 1, wbY - 1, wbW + 2, wbH + 2, '#475569'); // Aluminum frame
  r(wbX, wbY, wbW, wbH, '#FFFFFF'); // Glossy whiteboard surface
  r(wbX, wbY, wbW, 1, 'rgba(255, 255, 255, 0.8)');
  r(wbX + Math.floor(wbW / 3), wbY, 1, wbH, '#E2E8F0'); // Column separator 1
  r(wbX + Math.floor((wbW * 2) / 3), wbY, 1, wbH, '#E2E8F0'); // Column separator 2
  // Colored sticky notes (Sprint tasks: To Do, In Progress, Done)
  const stickyColors = ['#FDE047', '#38BDF8', '#4ADE80', '#F472B6', '#FB923C'];
  for (let sn = 0; sn < 12; sn++) {
    const colIdx = sn % 3;
    const rowIdx = Math.floor(sn / 3);
    const snX = wbX + 6 + colIdx * 45 + (sn % 2) * 16;
    const snY = wbY + 3 + rowIdx * 5;
    r(snX, snY, 9, 4, stickyColors[sn % stickyColors.length]);
  }
  // Whiteboard marker tray and blue eraser
  r(wbX + 10, wbY + wbH, 40, 2, '#94A3B8');
  r(wbX + 15, wbY + wbH - 1, 6, 2, '#2563EB');

  // Wall Item: Diurnal Skyline Window (Habblaud window style)
  const winX = dX + 220;
  const winY = dY + 6;
  const winW = 44;
  const winH = 20;

  r(winX - 1, winY - 1, winW + 2, winH + 2, '#475569');
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const isNight = hour < 6 || hour > 19;

  if (isNight) {
    // Night sky with stars and crescent moon
    r(winX, winY, winW, winH, '#0F172A');
    r(winX + 8, winY + 4, 1, 1, '#F8FAFC');
    r(winX + 28, winY + 6, 1, 1, '#F8FAFC');
    r(winX + 36, winY + 12, 1, 1, '#FDE047');
    r(winX + 18, winY + 14, 1, 1, '#F8FAFC');
    // Crescent moon
    r(winX + 32, winY + 3, 5, 5, '#FDE047');
    r(winX + 30, winY + 3, 4, 5, '#0F172A');
  } else {
    // Daytime blue sky with soft white clouds
    r(winX, winY, winW, winH, '#38BDF8');
    r(winX + 6, winY + 8, 14, 4, '#FFFFFF');
    r(winX + 10, winY + 6, 8, 3, '#FFFFFF');
    r(winX + 24, winY + 12, 16, 4, '#FFFFFF');
  }
  // Window muntin panes (mullions)
  r(winX + Math.floor(winW / 2), winY, 1, winH, '#475569');
  r(winX, winY + Math.floor(winH / 2), winW, 1, '#475569');

  // Low South Parapet with Doorway
  drawSouthWall(dX, dY + dH - 16, dW, dX + 160, 32);

  // Dual-Monitor Workstation Pods (4 double pods)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const deskX = dX + 30 + col * 155;
      const deskY = dY + 54 + row * 82;
      const deskW = 135;
      const deskH = 34;

      // Birch wood desk surface with 3/4 edge
      r(deskX, deskY, deskW, deskH, '#D4B996');
      r(deskX, deskY, deskW, 2, '#F1DEC4'); // Highlight top edge
      r(deskX + 2, deskY + 2, deskW - 4, deskH - 4, '#E5CEAB');
      r(deskX, deskY + deskH - 2, deskW, 2, '#B5946A'); // Shadow front edge
      // Cable grommet
      r(deskX + Math.floor(deskW / 2) - 3, deskY + 3, 6, 6, '#64748B');

      // Left Workstation: Dual Monitors
      r(deskX + 8, deskY + 4, 18, 12, '#0F172A');
      r(deskX + 9, deskY + 5, 16, 9, '#38BDF8'); // Code editor on screen
      r(deskX + 28, deskY + 4, 18, 12, '#0F172A');
      r(deskX + 29, deskY + 5, 16, 9, '#10B981'); // Terminal on screen
      // Keyboard & blue mousepad
      r(deskX + 12, deskY + 20, 22, 6, '#334155');
      r(deskX + 38, deskY + 19, 8, 8, '#2563EB');
      // Coffee mug with steam
      r(deskX + 50, deskY + 18, 5, 6, '#E2604F');
      r(deskX + 51, deskY + 16, 3, 1, 'rgba(255, 255, 255, 0.6)');

      // Ergonomic mesh chair (Left)
      r(deskX + 18, deskY + 36, 16, 12, '#0F172A');
      r(deskX + 20, deskY + 38, 12, 8, '#475569');

      // Right Workstation: Dual Monitors
      r(deskX + 75, deskY + 4, 18, 12, '#0F172A');
      r(deskX + 76, deskY + 5, 16, 9, '#A855F7');
      r(deskX + 95, deskY + 4, 18, 12, '#0F172A');
      r(deskX + 96, deskY + 5, 16, 9, '#F59E0B');
      r(deskX + 79, deskY + 20, 22, 6, '#334155');
      r(deskX + 105, deskY + 19, 8, 8, '#EF4444');

      // Ergonomic mesh chair (Right)
      r(deskX + 85, deskY + 36, 16, 12, '#0F172A');
      r(deskX + 87, deskY + 38, 12, 8, '#475569');

      // Potted desk succulent
      r(deskX + 62, deskY + 8, 8, 8, '#15803D');
      r(deskX + 64, deskY + 12, 4, 4, '#F97316');
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 2. ZONE: EXECUTIVE BOARDROOM (Top-Right: 390, 28 to 680, 248)
  // ════════════════════════════════════════════════════════════════
  const bX = 390;
  const bY = 28;
  const bW = 290;
  const bH = 220;

  // Dark mahogany parquet floor with subtle wood grain
  r(bX, bY, bW, bH, '#2B1B14');
  for (let y = bY; y < bY + bH; y += 12) {
    for (let x = bX; x < bX + bW; x += 12) {
      if ((Math.floor((x - bX) / 12) + Math.floor((y - bY) / 12)) % 2 === 0) {
        r(x, y, 12, 12, '#38241B');
      }
    }
  }

  // 2-Tile Elevated North Wall with Walnut Wood Paneling
  drawNorthWall(bX, bY, bW, '#4A3222', '#362215', 'wood_panel');

  // Wall Mount: Massive 85" Presentation TV with glowing analytics
  const tvX = bX + 60;
  const tvY = bY + 5;
  const tvW = 170;
  const tvH = 22;

  r(tvX - 1, tvY - 1, tvW + 2, tvH + 2, '#0F172A');
  r(tvX, tvY, tvW, tvH, '#1E1B4B');
  // Bar chart and revenue curve on screen
  r(tvX + 15, tvY + 12, 10, 7, '#38BDF8');
  r(tvX + 30, tvY + 9, 10, 10, '#818CF8');
  r(tvX + 45, tvY + 6, 10, 13, '#C084FC');
  r(tvX + 60, tvY + 4, 10, 15, '#34D399');
  r(tvX + 80, tvY + 10, 70, 2, '#38BDF8'); // Metric line

  // Low South Parapet with Doorway
  drawSouthWall(bX, bY + bH - 16, bW, bX + 120, 32);

  // Executive Mahogany Conference Table (12-person table)
  const ctX = bX + 35;
  const ctY = bY + 65;
  const ctW = 220;
  const ctH = 75;

  r(ctX - 2, ctY + ctH, ctW + 4, 6, 'rgba(0, 0, 0, 0.35)'); // Contact shadow
  r(ctX, ctY, ctW, ctH, '#5A260B');
  r(ctX, ctY, ctW, 2, '#8C4318'); // Top highlight
  r(ctX + 3, ctY + 3, ctW - 6, ctH - 6, '#78350F');
  // Leather blotter inlay strip
  r(ctX + 12, ctY + 12, ctW - 24, ctH - 24, '#1C1917');
  // Central conference phone speaker puck
  r(ctX + Math.floor(ctW / 2) - 8, ctY + Math.floor(ctH / 2) - 8, 16, 16, '#0F172A');
  r(ctX + Math.floor(ctW / 2) - 6, ctY + Math.floor(ctH / 2) - 6, 12, 12, '#10B981'); // Green active indicator

  // 10 Executive Leather Chairs
  for (let i = 0; i < 5; i++) {
    const cx = ctX + 20 + i * 40;
    // Top chairs
    r(cx, ctY - 14, 18, 12, '#0F172A');
    r(cx + 2, ctY - 12, 14, 8, '#334155');
    // Bottom chairs
    r(cx, ctY + ctH + 2, 18, 12, '#0F172A');
    r(cx + 2, ctY + ctH + 4, 14, 8, '#334155');
  }

  // ════════════════════════════════════════════════════════════════
  // 3. ZONE: CENTRAL RECEPTION & MAIN LOBBY (y: 248 to 288)
  // ════════════════════════════════════════════════════════════════
  const cCorY = 248;
  const cCorH = 40;

  // Polished luxury marble floor
  r(32, cCorY, 648, cCorH, '#E2E8F0');
  for (let x = 32; x < 680; x += 16) {
    r(x, cCorY, 1, cCorH, '#CBD5E1');
    r(x + 4, cCorY + 4, 6, 1, '#94A3B8'); // Subtle marble veins
  }

  // Wall Mount: Live Functional Analog Wall Clock
  const clockX = 356;
  const clockY = cCorY + 2;
  const clockR = 8;
  r(clockX - clockR, clockY, clockR * 2, clockR * 2, '#0F172A'); // Outer bezel
  r(clockX - clockR + 1, clockY + 1, (clockR - 1) * 2, (clockR - 1) * 2, '#FFFFFF'); // Dial
  // Live hour and minute hand calculation
  const mins = now.getMinutes();
  const hrs = now.getHours() % 12;
  const hrAngle = (hrs + mins / 60) * ((Math.PI * 2) / 12) - Math.PI / 2;
  const minAngle = mins * ((Math.PI * 2) / 60) - Math.PI / 2;

  const clockCenterY = clockY + clockR;
  // Hour hand
  const hrX = clockX + Math.cos(hrAngle) * 4;
  const hrY = clockCenterY + Math.sin(hrAngle) * 4;
  r(Math.round(hrX), Math.round(hrY), 2, 2, '#0F172A');
  // Minute hand
  const mnX = clockX + Math.cos(minAngle) * 6;
  const mnY = clockCenterY + Math.sin(minAngle) * 6;
  r(Math.round(mnX), Math.round(mnY), 1, 1, '#EF4444');

  // Reception Desk
  const rcX = 290;
  r(rcX - 2, cCorY + 16, 84, 18, 'rgba(0,0,0,0.2)');
  r(rcX, cCorY + 14, 80, 18, '#0F172A');
  r(rcX, cCorY + 14, 80, 2, '#38BDF8'); // Illuminated cyan front trim
  r(rcX + 2, cCorY + 16, 76, 14, '#1E293B');

  // ════════════════════════════════════════════════════════════════
  // 4. ZONE: BREAKROOM KITCHENETTE & WATERCOOLER (Bottom-Left: 32, 288 to 380, 500)
  // ════════════════════════════════════════════════════════════════
  const kX = 32;
  const kY = 288;
  const kW = 350;
  const kH = 212;

  // Two-tone checkerboard kitchen tile
  r(kX, kY, kW, kH, '#F8FAFC');
  for (let y = kY; y < kY + kH; y += 14) {
    for (let x = kX; x < kX + kW; x += 14) {
      if ((Math.floor((x - kX) / 14) + Math.floor((y - kY) / 14)) % 2 === 0) {
        r(x, y, 14, 14, '#E2E8F0');
      }
    }
  }

  // 2-Tile Elevated North Wall with clean subway tile pattern
  drawNorthWall(kX, kY, kW, '#F1F5F9', '#CBD5E1', 'tiles');

  // Low South Parapet
  drawSouthWall(kX, kY + kH - 16, kW);

  // Kitchen Counter with Stainless Steel Sink & Espresso Station
  r(kX + 16, kY + 24, kW - 40, 26, '#0F172A');
  r(kX + 18, kY + 26, kW - 44, 22, '#1E293B');

  // Dual espresso machines
  r(kX + 35, kY + 28, 20, 16, '#94A3B8');
  r(kX + 38, kY + 26, 6, 4, '#CBD5E1'); // Portafilter
  r(kX + 65, kY + 28, 20, 16, '#94A3B8');
  // Sink
  r(kX + 120, kY + 29, 24, 14, '#475569');
  r(kX + 130, kY + 27, 4, 4, '#CBD5E1'); // Chrome faucet

  // Water Cooler (Habblaud signature water cooler with blue bottle)
  const wcX = kX + 180;
  const wcY = kY + 26;
  r(wcX, wcY + 8, 16, 20, '#F8FAFC');
  r(wcX + 2, wcY, 12, 10, '#38BDF8'); // Water bottle
  r(wcX + 4, wcY + 2, 4, 4, 'rgba(255, 255, 255, 0.7)'); // Highlight bubble
  r(wcX + 5, wcY + 12, 3, 4, '#EF4444'); // Hot spout
  r(wcX + 9, wcY + 12, 3, 4, '#3B82F6'); // Cold spout

  // High-top round cafe tables & stools
  for (let t = 0; t < 2; t++) {
    const tabX = kX + 60 + t * 140;
    const tabY = kY + 95;
    r(tabX - 2, tabY + 28, 36, 6, 'rgba(0,0,0,0.25)');
    r(tabX, tabY, 32, 28, '#78350F');
    r(tabX + 2, tabY + 2, 28, 24, '#A16207');
    r(tabX - 12, tabY + 6, 10, 16, '#0F172A');
    r(tabX + 34, tabY + 6, 10, 16, '#0F172A');
  }

  // Vending Machines along bottom wall
  r(kX + 30, kY + 160, 26, 35, '#2563EB');
  r(kX + 32, kY + 162, 22, 22, '#93C5FD');
  r(kX + 65, kY + 160, 26, 35, '#16A34A');
  r(kX + 67, kY + 162, 22, 22, '#86EFAC');

  // ════════════════════════════════════════════════════════════════
  // 5. ZONE: ALL-HANDS TOWN HALL & PING PONG (Bottom-Center: 390, 288 to 680, 500)
  // ════════════════════════════════════════════════════════════════
  const lX = 390;
  const lY = 288;
  const lW = 290;
  const lH = 212;

  // Warm natural oak parquet floor
  r(lX, lY, lW, lH, '#E0BA86');
  for (let y = lY; y < lY + lH; y += 8) {
    r(lX, y, lW, 1, '#C8985C');
  }

  // 2-Tile Elevated North Wall with Warm Paneling
  drawNorthWall(lX, lY, lW, '#B98A5E', '#8C5B32', 'wood_panel');

  // Low South Parapet
  drawSouthWall(lX, lY + lH - 16, lW);

  // Competition Ping Pong Table (Habblaud pingpong table)
  const ppX = lX + 45;
  const ppY = lY + 36;
  const ppW = 90;
  const ppH = 50;

  r(ppX - 2, ppY + ppH, ppW + 4, 6, 'rgba(0, 0, 0, 0.3)');
  r(ppX, ppY, ppW, ppH, '#15803D');
  r(ppX + 2, ppY + 2, ppW - 4, ppH - 4, '#16A34A');
  // White boundary lines & center line
  r(ppX + 2, ppY + 2, ppW - 4, 1, '#FFFFFF');
  r(ppX + 2, ppY + ppH - 3, ppW - 4, 1, '#FFFFFF');
  r(ppX + 2, ppY + Math.floor(ppH / 2), ppW - 4, 1, '#FFFFFF');
  // Net
  r(ppX + Math.floor(ppW / 2) - 1, ppY - 2, 2, ppH + 4, '#FFFFFF');
  // Paddles & ball
  r(ppX + 15, ppY + 18, 8, 8, '#DC2626');
  r(ppX + 65, ppY + 24, 8, 8, '#2563EB');
  r(ppX + 40, ppY + 22, 3, 3, '#FEF08A');

  // Modular Velvet Sofa & Area Rug
  const sfX = lX + 160;
  const sfY = lY + 44;
  // Area rug underneath
  r(sfX - 10, sfY - 10, 100, 70, '#1E3A8A');
  r(sfX - 8, sfY - 8, 96, 66, '#2563EB');
  r(sfX - 6, sfY - 6, 92, 62, '#1E3A8A');
  // Sofa
  r(sfX, sfY, 80, 30, '#1E1B4B');
  r(sfX + 3, sfY + 3, 74, 24, '#312E81');
  // Throw pillows
  r(sfX + 6, sfY + 6, 12, 12, '#F59E0B');
  r(sfX + 62, sfY + 6, 12, 12, '#F59E0B');
  // Coffee table
  r(sfX + 15, sfY + 42, 50, 16, '#78350F');

  // Large All-Hands Projection Screen
  r(lX + 30, lY + 120, 230, 68, '#0F172A');
  r(lX + 34, lY + 124, 222, 60, '#1E293B');
  r(lX + 60, lY + 130, 170, 8, '#38BDF8');

  // ════════════════════════════════════════════════════════════════
  // 6. ZONE: PHONE PODS & SKYLINE TERRACE (East Wing: 692, 28 to 808, 500)
  // ════════════════════════════════════════════════════════════════
  const pX = 692;
  const pY = 28;
  const pW = 116;
  const pH = 472;

  r(pX, pY, pW, 232, '#0F172A');

  // 3 Acoustic Phone Pods
  for (let pod = 0; pod < 3; pod++) {
    const podY = pY + 15 + pod * 70;
    r(pX + 16, podY, 84, 55, '#334155');
    r(pX + 18, podY + 2, 80, 51, '#1E293B');
    r(pX + 22, podY + 6, 72, 43, '#3B82F6');
    r(pX + 24, podY + 8, 68, 39, '#1D4ED8');
    r(pX + 30, podY + 20, 40, 12, '#F8FAFC');
    r(pX + 44, podY + 36, 12, 10, '#0F172A');
    const lightCol = pod === 0 ? '#EF4444' : '#10B981';
    r(pX + 80, podY + 8, 6, 6, lightCol);
  }

  // Penthouse Balcony Redwood Deck
  const terY = pY + 240;
  const terH = pH - 240;
  r(pX, terY, pW, terH, '#78350F');
  for (let y = terY; y < terY + terH; y += 8) {
    r(pX, y, pW, 1, '#451A03');
    r(pX, y + 1, pW, 1, '#9A3412');
  }

  // Glass safety balustrade
  r(pX + pW - 6, terY, 6, terH, '#38BDF8');
  r(pX, terY + terH - 6, pW, 6, '#38BDF8');

  // Outdoor lounge chairs
  r(pX + 20, terY + 30, 30, 26, '#0F172A');
  r(pX + 22, terY + 32, 26, 22, '#475569');
  r(pX + 60, terY + 30, 30, 26, '#0F172A');
  r(pX + 62, terY + 32, 26, 22, '#475569');

  // Fire bowl
  r(pX + 45, terY + 90, 26, 26, '#18181B');
  r(pX + 48, terY + 93, 20, 20, '#F59E0B');
  r(pX + 52, terY + 97, 12, 12, '#EF4444');

  // ════════════════════════════════════════════════════════════════
  // 7. ARCHITECTURAL LABELS
  // ════════════════════════════════════════════════════════════════
  const label = (text: string, lx: number, ly: number, bgCol: string) => {
    ctx.font = 'bold 6px monospace';
    const textWidth = ctx.measureText(text).width;
    const bw = Math.ceil(textWidth) + 8;
    const bh = 10;

    r(lx - 1, ly - 1, bw + 2, bh + 2, '#000000');
    r(lx, ly, bw, bh, bgCol);
    r(lx, ly, bw, 1, 'rgba(255,255,255,0.4)');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, lx + 4, ly + 7);
  };

  label('ENGINEERING HUB', dX + 10, dY + 34, '#2563EB');
  label('EXECUTIVE BOARDROOM', bX + 10, bY + 34, '#4F46E5');
  label('RECEPTION & LOBBY', 180, cCorY + 12, '#0F172A');
  label('BREAKROOM CAFE', kX + 10, kY + 34, '#059669');
  label('ALL-HANDS LOUNGE', lX + 10, lY + 34, '#D97706');
  label('PHONE BOOTHS', pX + 8, pY + 8, '#7C3AED');
  label('SKYLINE TERRACE', pX + 8, terY + 8, '#0284C7');
}
