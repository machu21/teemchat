// ============================================================
// BRIGHT & VIBRANT RETRO GAMEBOY / GBA PIXEL-ART WORLD MAP: VILLAGE
// ============================================================

export function renderVillageMap(ctx: CanvasRenderingContext2D, iw: number, ih: number): void {
  const T = 8;

  // Pixel rect helper function
  const r = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  // ── 1. GBA MEADOW GRASS ───────────────────
  const drawGrass = () => {
    r(0, 0, iw, ih, '#62B444');

    const fieldSize = 32;
    for (let ty = 0; ty < ih; ty += fieldSize) {
      for (let tx = 0; tx < iw; tx += fieldSize) {
        if ((Math.floor(tx / fieldSize) + Math.floor(ty / fieldSize)) % 2 === 0) {
          const w = tx + fieldSize <= iw ? fieldSize : iw - tx;
          const h = ty + fieldSize <= ih ? fieldSize : ih - ty;
          r(tx, ty, w, h, '#74C652');
        }
      }
    }

    for (let ty = 16; ty < ih; ty += 48) {
      for (let tx = 16; tx < iw; tx += 48) {
        const hash = Math.floor((tx * 17 + ty * 11) / 16) % 6;
        if (hash === 0) {
          r(tx + 2, ty + 2, 2, 4, '#9EE870');
          r(tx + 5, ty + 1, 2, 5, '#9EE870');
        } else if (hash === 1) {
          r(tx + 3, ty + 3, 3, 3, '#EF4444');
          r(tx + 4, ty + 4, 1, 1, '#FEF08A');
          r(tx + 4, ty + 6, 1, 2, '#15803D');
        } else if (hash === 2) {
          r(tx + 4, ty + 3, 3, 3, '#FACC15');
          r(tx + 5, ty + 4, 1, 1, '#78350F');
        } else if (hash === 3) {
          r(tx + 3, ty + 4, 3, 3, '#FFFFFF');
          r(tx + 4, ty + 5, 1, 1, '#FACC15');
        } else if (hash === 4) {
          r(tx + 1, ty + 3, 2, 3, '#B4F080');
        }
      }
    }
  };

  // ── 2. GBA ROUND CONICAL TREES ───────────
  const pixelTree = (tx: number, ty: number) => {
    const out = '#133D16';
    const darkG = '#2D6B26';
    const midG = '#489A38';
    const lightG = '#6FC452';
    const crownG = '#9CEE72';
    const trunk = '#8B5A2B';
    const trunkDk = '#5A3414';

    r(tx + T, ty + T * 3, 4, T + 2, trunk);
    r(tx + T + 4, ty + T * 3, 4, T + 2, trunkDk);

    r(tx, ty + 6, T * 3, T * 2 + 2, darkG);
    r(tx + 2, ty + 4, T * 3 - 4, T * 3, midG);
    r(tx + 4, ty + 6, T * 3 - 8, T * 2 - 2, lightG);

    r(tx + 2, ty + 2, T * 3 - 4, T * 2, darkG);
    r(tx + 4, ty + 1, T * 3 - 8, T * 2 + 2, midG);
    r(tx + 6, ty + 3, T * 3 - 12, T * 2 - 2, lightG);

    r(tx + 5, ty, T * 3 - 10, T + 2, crownG);
    r(tx + 3, ty + 2, 4, 3, crownG);

    r(tx + 1, ty + 5, 1, 1, out);
    r(tx + T * 3 - 2, ty + 5, 1, 1, out);
  };

  const drawForestZone = () => {
    const fx = T * 38;
    const fw = T * 40;
    const fh = T * 26;

    r(fx, 0, fw, fh, '#3E7E36');

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

  // ── 3. WATER / OCEAN & POND ───────────────
  const drawWater = () => {
    const beachX = 640;
    const waveX = 696;

    r(beachX, 0, waveX - beachX, ih, '#EACC88');
    r(beachX + 14, 0, 20, ih, '#F5DDA0');

    for (let ty = 16; ty < ih; ty += 48) {
      r(beachX + 6, ty, 3, 2, '#D4A860');
      r(beachX + 26, ty + 24, 3, 2, '#FFE8C0');
    }

    r(waveX - 4, 0, 4, ih, '#D4B878');

    const oc = ['#5CE0F8', '#40C0F0', '#28A0E0', '#1880C8'];
    const bandW = Math.floor((iw - waveX) / 4);
    for (let i = 0; i < 4; i++) {
      r(waveX + i * bandW, 0, bandW, ih, oc[i]);
    }

    for (let ty = 0; ty < ih; ty += T * 6) {
      const stagger = Math.floor(ty / (T * 6)) % 2 === 0 ? 8 : 0;
      for (let tx = waveX + stagger; tx < iw - 4; tx += T * 6) {
        r(tx, ty, 16, 2, '#B0E8FF');
        r(tx + 2, ty + 1, 10, 1, '#F0FCFF');
      }
    }

    for (let ty = 0; ty < ih; ty += T * 2) {
      const odd = Math.floor(ty / (T * 2)) % 2 === 0;
      r(waveX, ty + (odd ? 0 : 4), 3, 6, '#F0FCFF');
    }

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

  // ── 4. RIVER ──────────────────────────────────────────
  const drawRiver = () => {
    const rLi = T * 46;
    const rYi = T * 26;
    const rWi = T * 4;

    r(rLi - 2, rYi, rWi + 4, ih - rYi, '#A87848');
    r(rLi, rYi, rWi, ih - rYi, '#48B8E8');
    r(rLi + Math.floor(rWi / 3), rYi, Math.floor(rWi / 3), ih - rYi, '#3098D0');

    for (let ty = rYi + T; ty < ih; ty += T * 3) {
      r(rLi + 2, ty, 6, 1, '#A0E0FF');
      r(rLi + rWi - 8, ty + T, 6, 1, '#A0E0FF');
    }

    for (let ty = rYi; ty < ih; ty += T) {
      const odd = Math.floor(ty / T) % 2 === 0;
      r(rLi, ty + (odd ? 0 : 3), 2, 3, '#F0FCFF');
      r(rLi + rWi - 2, ty + (odd ? 3 : 0), 2, 3, '#F0FCFF');
    }

    const lily = (lx: number, ly: number) => {
      r(lx, ly, T, T, '#40A838');
      r(lx + 2, ly + 2, 4, 4, '#2E8428');
      r(lx + 3, ly + 1, 2, 2, '#F06088');
    };
    lily(rLi + 4, T * 29);
    lily(rLi + 10, T * 35);
    lily(rLi + 2, T * 50);
  };

  // ── 5. BRIDGE ────────────────────────────────────────────────
  const drawBridge = () => {
    const bx = T * 45;
    const by = T * 42;
    const bw = T * 6;
    const bh = T * 4;

    r(bx + 2, by + bh, bw, 6, 'rgba(0,0,0,0.19)');

    for (let tx = bx; tx < bx + bw; tx += 7) {
      r(tx, by, 5, bh, '#C08038');
      r(tx + 1, by, 3, 2, '#E0A858');
    }

    r(bx - 2, by, bw + 4, 4, '#8B5020');
    r(bx - 2, by + bh - 4, bw + 4, 4, '#8B5020');

    for (let tx = bx; tx <= bx + bw; tx += Math.floor(bw / 2)) {
      r(tx - 1, by - 4, 4, bh + 8, '#6B3818');
    }
  };

  // ── 6. DIRT FOOTPATHS ─────────────────────
  const drawPaths = () => {
    const path = (x: number, y: number, w: number, h: number) => {
      r(x, y, w, h, '#E8C88C');
      r(x, y, w, 2, '#F4DCA0');
      r(x, y, 2, h, '#F4DCA0');
      r(x + w - 2, y, 2, h, '#C4A060');
      r(x, y + h - 2, w, 2, '#C4A060');
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

  // ── 7. TEEMCHAT PIXEL LOUNGE & CLUBROOM ───
  const drawClubhouseLounge = () => {
    const px = T * 5;
    const py = T * 10;
    const pw = T * 30;
    const ph = T * 18;

    r(px - 2, py + ph, pw + 4, 6, 'rgba(0,0,0,0.25)');
    r(px, py, pw, ph, '#E0BA86');

    const plankH = 6;
    for (let ty = py; ty < py + ph; ty += plankH) {
      r(px, ty, pw, 1, '#C8985C');
      r(px, ty + 1, pw, 1, '#ECCEA2');

      const row = Math.floor((ty - py) / plankH);
      const jointOffset = (row % 3) * 16;
      for (let tx = px + jointOffset; tx < px + pw; tx += 32) {
        r(tx, ty, 1, plankH, '#BA884C');
      }
    }

    r(px, py, pw, 8, '#F1F5F9');
    r(px, py + 8, pw, 2, '#CBD5E1');
    r(px, py, pw, 1, '#18181B');

    const fx1 = px + 8;
    const fy1 = py + 1;
    r(fx1, fy1, 24, 7, '#78350F');
    r(fx1 + 1, fy1 + 1, 22, 5, '#38BDF8');
    r(fx1 + 3, fy1 + 3, 8, 3, '#1E293B');
    r(fx1 + 9, fy1 + 2, 10, 4, '#0F172A');
    r(fx1 + 18, fy1 + 2, 4, 4, '#F59E0B');

    const rx1 = px + 8;
    const ry1 = py + 14;
    const rw1 = 92;
    const rh1 = 78;

    r(rx1 - 2, ry1 - 2, rw1 + 4, rh1 + 4, '#1E5830');
    r(rx1, ry1, rw1, rh1, '#3A9456');

    const rugTile = 8;
    for (let ty = ry1; ty < ry1 + rh1; ty += rugTile) {
      for (let tx = rx1; tx < rx1 + rw1; tx += rugTile) {
        if ((Math.floor((tx - rx1) / rugTile) + Math.floor((ty - ry1) / rugTile)) % 2 === 0) {
          r(tx, ty, rugTile, rugTile, '#4CA868');
        }
        r(tx + 3, ty + 3, 2, 2, '#2C7E44');
      }
    }
    for (let tx = rx1; tx < rx1 + rw1; tx += 4) {
      r(tx, ry1 - 2, 2, 1, '#FFFFFF');
      r(tx, ry1 + rh1 + 1, 2, 1, '#FFFFFF');
    }

    const rx2 = px + 120;
    const ry2 = py + 18;
    const rw2 = 104;
    const rh2 = 72;

    r(rx2 - 2, ry2 - 2, rw2 + 4, rh2 + 4, '#CBD5E1');
    r(rx2, ry2, rw2, rh2, '#F8FAFC');

    for (let ty = ry2 + 2; ty < ry2 + rh2; ty += 4) {
      r(rx2 + 2, ty, rw2 - 4, 1, '#E2E8F0');
    }
    r(rx2, ry2, rw2, 2, '#E2E8F0');
    r(rx2, ry2 + rh2 - 2, rw2, 2, '#E2E8F0');

    r(px, py, pw, 2, '#78350F');
    r(px, py + ph - 2, pw, 2, '#78350F');
    r(px, py, 2, ph, '#78350F');
    r(px + pw - 2, py, 2, ph, '#78350F');

    const doorX = px + Math.floor(pw / 2) - 12;
    r(doorX, py + ph - 3, 24, 4, '#F59E0B');
    r(doorX + 2, py + ph - 2, 20, 2, '#B45309');
  };

  // ── 8. COZY CABIN COTTAGE ─────────────────────────
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

    r(bx + 10, by - 6, 10, 16, '#687080');
    r(bx + 9, by - 7, 12, 3, '#889098');
    r(bx + 11, by - 5, 4, 10, '#98A0A8');
    r(bx + 12, by - 12, 5, 4, 'rgba(232, 236, 240, 0.5)');
    r(bx + 14, by - 16, 4, 3, 'rgba(232, 236, 240, 0.3)');

    r(bx - 2, by + rh + wh - 4, bw + 4, 8, 'rgba(0, 0, 0, 0.19)');

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

    const rcx = bx + Math.floor(bw / 2);
    for (let y = by; y < by + rh; y++) {
      r(rcx - 5, y, 10, 1, ridgeMid);
      r(rcx - 4, y, 3, 1, ridgeLt);
      r(rcx + 2, y, 3, 1, ridgeDk);
      r(rcx - 6, y, 1, 1, out);
      r(rcx + 5, y, 1, 1, out);
    }
    r(rcx - 6, by - 2, 12, 2, out);
    r(rcx - 4, by - 1, 8, 2, ridgeLt);

    r(bx - 4, by + rh - 3, bw + 8, 3, '#3C1808');
    r(bx - 6, by + rh - 1, bw + 12, 2, out);

    const wy = by + rh + 1;
    r(bx, wy, bw, wh, wallBase);

    for (let y = wy; y < wy + wh; y += 7) {
      r(bx, y, bw, 1, wallLt);
      r(bx, y + 1, bw, 5, wallBase);
      r(bx, y + 6, bw, 1, wallDk);
    }

    for (let y = wy; y < wy + wh; y++) {
      r(bx, y, 6, 1, cornerPost);
      r(bx + 1, y, 2, 1, wallLt);
      r(bx + bw - 6, y, 6, 1, cornerPost);
      r(bx + bw - 5, y, 2, 1, wallLt);
    }
    r(bx, wy, 1, wh, out);
    r(bx + bw - 1, wy, 1, wh, out);

    r(bx, wy + wh - 4, bw, 4, '#483018');
    r(bx, wy + wh - 1, bw, 2, out);

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
    r(wx + Math.floor(ww / 2) - 1, windowY + 3, 2, windowH - 6, '#8B5020');
    r(wx + 3, windowY + Math.floor(windowH / 2) - 1, ww - 6, 2, '#8B5020');

    const dx = bx + 56;
    const dy = wy + 6;
    const dw = 24;
    const dh = wh - 6;

    r(dx - 1, dy - 1, dw + 2, dh + 1, out);
    r(dx, dy, dw, dh, '#B87838');
    r(dx + 1, dy + 1, dw - 2, 2, '#D8A060');
    r(dx + 1, dy + 1, 2, dh, '#D8A060');
    r(dx + 3, dy + 3, dw - 6, dh - 3, '#2E1A10');
    r(dx - 2, dy + dh - 1, dw + 4, 3, '#889098');
    r(dx - 2, dy + dh - 1, dw + 4, 1, '#A8B0B8');
  };

  // ── 9. GBA POKEMON TOWN HALL ──────
  const drawTownHall = () => {
    const bx = T * 19;
    const by = T * 2;
    const bw = 120;
    const rh = 36;
    const wh = 42;

    const out = '#1A2038';
    const roofBlue = '#DC2626';
    const roofLt = '#EF4444';
    const roofHi = '#FCA5A5';
    const roofDk = '#991B1B';
    const wallSiding = '#FAF5E8';
    const timber = '#7C4020';
    const timberLt = '#A05830';

    r(bx - 2, by + rh + wh - 4, bw + 4, 8, 'rgba(0, 0, 0, 0.19)');

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

    const rcx = bx + Math.floor(bw / 2);
    r(rcx - 20, by - 2, 40, 2, out);
    r(rcx - 18, by - 1, 36, 2, '#FFFFFF');
    r(rcx - 18, by + 1, 36, 1, '#D8E0E8');

    r(bx - 4, by + rh - 3, bw + 8, 3, '#182040');
    r(bx - 6, by + rh - 1, bw + 12, 2, out);

    const wy = by + rh + 1;
    r(bx, wy, bw, wh, wallSiding);

    for (let y = wy; y < wy + wh; y += 4) {
      r(bx, y, bw, 1, '#E2E8F0');
    }

    for (let y = wy; y < wy + wh; y++) {
      r(bx, y, 5, 1, timber);
      r(bx + 1, y, 2, 1, timberLt);
      r(bx + bw - 5, y, 5, 1, timber);
      r(bx + bw - 4, y, 2, 1, timberLt);
    }

    const villageWindow = (wx: number) => {
      const wy2 = wy + 6;
      r(wx - 1, wy2 - 1, 20, 14, out);
      r(wx, wy2, 18, 12, '#38BDF8');
      r(wx + 1, wy2 + 1, 5, 5, '#FFFFFF');
      r(wx + 8, wy2, 2, 12, '#0F172A');
      r(wx, wy2 + 5, 18, 2, '#0F172A');
    };

    villageWindow(bx + 11);
    villageWindow(bx + 89);

    const dx = bx + Math.floor(bw / 2) - 12;
    const dy = wy + 14;
    const dw = 24;
    const dh = wh - 14;

    r(dx - 1, dy - 1, dw + 2, dh + 1, out);
    r(dx, dy, dw, dh, '#8B5020');
    r(dx + 2, dy + 2, dw - 4, dh - 2, '#B45309');
    r(dx + dw - 5, dy + Math.floor(dh / 2), 2, 2, '#FDE047');

    const mbx = bx + bw + 4;
    const mby = wy + wh - 14;
    r(mbx, mby, 6, 12, '#94A3B8');
    r(mbx, mby, 6, 4, '#CBD5E1');
    r(mbx + 2, mby + 12, 2, 6, '#475569');
  };

  // ── 10. CLIFF LEDGES ─────────────────────────────────────────
  const cliffLedge = (x: number, y: number, w: number) => {
    const h = T * 2;
    r(x, y, w, h, '#B88848');
    r(x, y, w, 2, '#D8A860');
    r(x, y + 2, w, 2, '#C89850');
    r(x, y + Math.floor(h / 2), w, 2, '#A07838');
    r(x, y + h - 3, w, 3, '#886028');
    let ci = x + 12;
    while (ci < x + w) {
      r(ci, y + 3, 1, h - 5, '#886028');
      ci += 24;
    }
  };

  const drawCliffs = () => {
    cliffLedge(T * 2, T * 34, T * 36);
    cliffLedge(T * 2, T * 48, T * 36);

    const cx = T * 11;
    const cy = T * 35;
    r(cx, cy, 16, 3, '#3C2810');
    r(cx - 2, cy + 3, 4, 16, '#3C2810');
    r(cx + 14, cy + 3, 4, 16, '#3C2810');
    r(cx, cy + 3, 16, 16, '#1C1008');
    r(cx - 4, cy + 2, 24, 3, '#887060');
  };

  // ── 11. ZONE LABELS ──────────────────────────────────────────
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
    label('CLUBHOUSE LOUNGE', T * 8, T * 8, '#3B82F6');
    label('VERDANT VILLAGE', T * 20, T * 1, '#15803D');
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
  drawClubhouseLounge();
  drawCottage();
  drawTownHall();
  drawCliffs();
  drawLabels();
}
