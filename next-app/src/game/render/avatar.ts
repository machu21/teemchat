import { AvatarConfig } from '@/lib/models/avatar';

export type AvatarDirection = 'up' | 'down' | 'left' | 'right';

// Helper to shade hex color for highlights (+percent) and shadows (-percent)
export function shadeHexColor(color: string, percent: number): string {
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(hex, 16);
  if (isNaN(num)) return color;

  const r = (num >> 16) + Math.round(255 * (percent / 100));
  const g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  const b = (num & 0x0000ff) + Math.round(255 * (percent / 100));

  const clamp = (val: number) => Math.min(255, Math.max(0, val));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b))
    .toString(16)
    .slice(1)}`;
}

/**
 * Authentic Retro Game Boy Advance (GBA) / Pokemon / Gather-town style Chibi Avatar Renderer.
 *
 * Internal 16x22 pixel grid scaled to targetSize.
 * Features:
 * - Binary Gender Support: Distinct Male (athletic, boyish hair, trousers, sneakers) and
 *   Female (curved eyelashes, sparkle eyes, blush, feminine hair styles, pleated skirt with socks).
 * - 4 Directions: down (front), up (back), left (profile), right (profile)
 * - 4-frame walk cycle with arm swing, foot step, skirt sway, and 1px head bob
 * - Volumetric multi-shade hair (short, long, buzz, spiky, ponytail, bob)
 * - Accessories in all 4 directions (trainer cap, glasses, headband, headphones, ribbon)
 * - Sitting posture support for couches/chairs
 */
export function renderPixelAvatar(
  ctx: CanvasRenderingContext2D,
  config: AvatarConfig,
  targetSize: number = 64,
  direction: AvatarDirection = 'down',
  walkFrame: number = 0,
  isSitting: boolean = false
) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Scale internal 16x22 coordinate space to targetSize
  const scale = targetSize / 20;
  ctx.scale(scale, scale);

  // Helper pixel drawer
  const p = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  const isFemale = config.gender === 'female';

  // Color palette derived from config
  const skin = config.skinColor;
  const skinShadow = shadeHexColor(skin, -22);
  const skinHighlight = shadeHexColor(skin, 15);

  const hair = config.hairColor;
  const hairHighlight = shadeHexColor(hair, 28);
  const hairShadow = shadeHexColor(hair, -32);
  const hairOutline = shadeHexColor(hair, -50);

  const shirt = config.shirtColor;
  const shirtHighlight = shadeHexColor(shirt, 25);
  const shirtShadow = shadeHexColor(shirt, -28);

  const pants = '#1E293B';
  const pantsShadow = '#0F172A';
  const skirtHem = '#FFFFFF';
  const socksColor = '#FFFFFF';
  const shoes = '#09090B';
  const shoeSole = '#E4E4E7';

  // Walk cycle animation offsets
  // walkFrame: 0 = idle, 1 = left step, 2 = pass, 3 = right step
  const frame = Math.floor(walkFrame) % 4;
  const isWalking = frame === 1 || frame === 3;
  const headBob = isWalking && !isSitting ? 1 : 0;

  // ──────────────────────────────────────────────────────────
  // 1. DIRECTION: DOWN (FRONT VIEW)
  // ──────────────────────────────────────────────────────────
  if (direction === 'down') {
    // Ground shadow
    p(3, 19, 10, 2, 'rgba(0,0,0,0.18)');

    // Head base (Y: 2 + headBob to 10 + headBob)
    const hy = 2 + headBob;

    // Hair Back Outline (visible behind ears)
    p(2, hy + 2, 12, 7, hairOutline);

    // Face / Skin Base
    p(3, hy + 2, 10, 6, skin);
    p(4, hy + 1, 8, 8, skin);
    p(5, hy + 1, 6, 1, skinHighlight); // Forehead highlight
    // Chin shadow
    p(5, hy + 8, 6, 1, skinShadow);

    // Cheeks / Blush
    if (isFemale) {
      p(3, hy + 6, 2, 1, '#FB7185'); // Rosy cheeks
      p(11, hy + 6, 2, 1, '#FB7185');
    } else {
      p(3, hy + 6, 1, 1, '#FCA5A5');
      p(12, hy + 6, 1, 1, '#FCA5A5');
    }

    // Eyes
    if (isFemale) {
      // Eyelash winged tips
      p(4, hy + 3, 2, 1, '#18181B');
      p(10, hy + 3, 2, 1, '#18181B');
      // Dark pupils
      p(5, hy + 4, 2, 2, '#18181B');
      p(9, hy + 4, 2, 2, '#18181B');
      // Sparkling anime highlights
      p(5, hy + 4, 1, 1, '#FFFFFF');
      p(6, hy + 5, 1, 1, '#93C5FD');
      p(9, hy + 4, 1, 1, '#FFFFFF');
      p(10, hy + 5, 1, 1, '#93C5FD');
    } else {
      // Eyebrow lines
      p(5, hy + 3, 2, 1, hairShadow);
      p(9, hy + 3, 2, 1, hairShadow);
      // Expressive dark pupils
      p(5, hy + 4, 2, 2, '#18181B');
      p(9, hy + 4, 2, 2, '#18181B');
      p(5, hy + 4, 1, 1, '#FFFFFF');
      p(9, hy + 4, 1, 1, '#FFFFFF');
    }

    // Nose & Smile
    p(7, hy + 6, 2, 1, skinShadow);

    // Hair Top & Front Bangs
    renderHairFront(p, config.hairStyle, hy, hair, hairHighlight, hairShadow, isFemale);

    // Torso (Shirt / Blouse)
    const by = 10;
    if (isFemale) {
      // Feminine fitted top with neckline
      p(4, by, 8, 4, shirt);
      p(5, by + 1, 6, 2, shirtHighlight);
      p(4, by + 3, 8, 1, shirtShadow);
      // Sweetheart collar accent
      p(7, by, 2, 1, '#FFFFFF');
      p(7, by + 1, 2, 1, '#FB7185');
    } else {
      // Classic athletic crewneck
      p(4, by, 8, 5, shirt);
      p(5, by + 1, 6, 3, shirtHighlight);
      p(4, by + 4, 8, 1, shirtShadow);
      // Collar detail
      p(7, by, 2, 1, '#FFFFFF');
      p(7, by + 1, 2, 1, skinShadow);
    }

    // Arms & Hands
    let lArmY = by;
    let rArmY = by;
    if (frame === 1) {
      lArmY -= 1;
      rArmY += 1;
    } else if (frame === 3) {
      lArmY += 1;
      rArmY -= 1;
    }
    // Left arm
    p(2, lArmY, 2, 4, shirt);
    p(2, lArmY + 3, 2, 1, skin); // Hand
    // Right arm
    p(12, rArmY, 2, 4, shirt);
    p(12, rArmY + 3, 2, 1, skin); // Hand

    // Lower Body: Skirt (Female) vs Trousers (Male)
    if (isFemale) {
      if (isSitting) {
        // Sitting pleated skirt fold
        p(3, by + 4, 10, 3, pants);
        p(3, by + 6, 10, 1, skirtHem);
        p(4, by + 7, 8, 2, shoes);
      } else {
        // Flared Pleated Skirt with sway
        const skirtSway = frame === 1 ? -1 : frame === 3 ? 1 : 0;
        p(3 + skirtSway, by + 4, 10, 3, pants);
        p(5 + skirtSway, by + 4, 1, 3, '#334155'); // Pleat lines
        p(8 + skirtSway, by + 4, 1, 3, '#334155');
        p(10 + skirtSway, by + 4, 1, 3, '#334155');
        p(3 + skirtSway, by + 6, 10, 1, skirtHem); // White hem trim

        // Legs with cute socks & shoes
        let lFootY = by + 7;
        let rFootY = by + 7;
        if (frame === 1) {
          lFootY -= 1;
          rFootY += 1;
        } else if (frame === 3) {
          lFootY += 1;
          rFootY -= 1;
        }

        // Left leg
        p(5, lFootY, 2, 1, socksColor);
        p(5, lFootY + 1, 2, 2, shoes);
        p(4, lFootY + 3, 3, 1, shoeSole);

        // Right leg
        p(9, rFootY, 2, 1, socksColor);
        p(9, rFootY + 1, 2, 2, shoes);
        p(9, rFootY + 3, 3, 1, shoeSole);
      }
    } else {
      // Male Trousers
      if (isSitting) {
        p(4, by + 5, 8, 3, pants);
        p(4, by + 7, 8, 1, shoes);
      } else {
        p(5, by + 5, 6, 2, pants);

        let lFootY = by + 7;
        let rFootY = by + 7;
        if (frame === 1) {
          lFootY -= 1;
          rFootY += 1;
        } else if (frame === 3) {
          lFootY += 1;
          rFootY -= 1;
        }

        // Left leg & sneaker
        p(5, lFootY, 2, 2, pantsShadow);
        p(4, lFootY + 2, 3, 1, shoes);
        p(4, lFootY + 3, 3, 1, shoeSole);

        // Right leg & sneaker
        p(9, rFootY, 2, 2, pantsShadow);
        p(9, rFootY + 2, 3, 1, shoes);
        p(9, rFootY + 3, 3, 1, shoeSole);
      }
    }

    // Accessories
    renderAccessory(p, config.accessory, hy, 'down');
  }

  // ──────────────────────────────────────────────────────────
  // 2. DIRECTION: UP (BACK VIEW)
  // ──────────────────────────────────────────────────────────
  else if (direction === 'up') {
    p(3, 19, 10, 2, 'rgba(0,0,0,0.18)');
    const hy = 2 + headBob;

    // Full Back of Hair
    p(2, hy + 1, 12, 8, hairOutline);
    p(3, hy + 2, 10, 7, hair);
    p(4, hy + 2, 8, 3, hairHighlight);
    p(3, hy + 6, 10, 3, hairShadow);

    // Hair style specific back volume
    if (config.hairStyle === 'long') {
      p(3, hy + 8, 10, 5, hair);
      p(4, hy + 9, 8, 4, hairShadow);
      p(2, hy + 8, 2, 4, hairOutline);
      p(12, hy + 8, 2, 4, hairOutline);
    } else if (config.hairStyle === 'ponytail') {
      // Ponytail arching back
      p(7, hy + 1, 2, 2, '#EF4444'); // Ponytail hair tie
      p(6, hy + 3, 4, 6, hair);
      p(7, hy + 3, 2, 5, hairHighlight);
      p(6, hy + 7, 4, 2, hairShadow);
    } else if (config.hairStyle === 'bob') {
      p(3, hy + 7, 10, 3, hair);
      p(4, hy + 8, 8, 2, hairShadow);
    } else if (config.hairStyle === 'spiky') {
      p(4, hy, 2, 2, hairHighlight);
      p(7, hy - 1, 2, 2, hairHighlight);
      p(10, hy, 2, 2, hairHighlight);
    }

    // Neck
    p(6, hy + 8, 4, 1, skinShadow);

    // Torso (Back of Shirt)
    const by = 10;
    p(4, by, 8, isFemale ? 4 : 5, shirt);
    p(5, by + 1, 6, 3, shirtHighlight);
    p(4, by + (isFemale ? 3 : 4), 8, 1, shirtShadow);
    p(7, by + 1, 2, isFemale ? 3 : 4, shirtShadow); // Center back seam

    // Arms
    let lArmY = by;
    let rArmY = by;
    if (frame === 1) {
      lArmY += 1;
      rArmY -= 1;
    } else if (frame === 3) {
      lArmY -= 1;
      rArmY += 1;
    }
    p(2, lArmY, 2, 4, shirt);
    p(12, rArmY, 2, 4, shirt);

    // Lower body (Back view)
    if (isFemale) {
      if (isSitting) {
        p(3, by + 4, 10, 3, pants);
        p(3, by + 6, 10, 1, skirtHem);
      } else {
        const skirtSway = frame === 1 ? -1 : frame === 3 ? 1 : 0;
        p(3 + skirtSway, by + 4, 10, 3, pants);
        p(3 + skirtSway, by + 6, 10, 1, skirtHem);

        let lFootY = by + 7;
        let rFootY = by + 7;
        if (frame === 1) {
          lFootY += 1;
          rFootY -= 1;
        } else if (frame === 3) {
          lFootY -= 1;
          rFootY += 1;
        }

        p(5, lFootY, 2, 1, socksColor);
        p(5, lFootY + 1, 2, 2, shoes);
        p(5, lFootY + 3, 2, 1, shoeSole);

        p(9, rFootY, 2, 1, socksColor);
        p(9, rFootY + 1, 2, 2, shoes);
        p(9, rFootY + 3, 2, 1, shoeSole);
      }
    } else {
      if (isSitting) {
        p(4, by + 5, 8, 3, pants);
      } else {
        p(5, by + 5, 6, 2, pants);

        let lFootY = by + 7;
        let rFootY = by + 7;
        if (frame === 1) {
          lFootY += 1;
          rFootY -= 1;
        } else if (frame === 3) {
          lFootY -= 1;
          rFootY += 1;
        }

        p(5, lFootY, 2, 2, pantsShadow);
        p(5, lFootY + 2, 2, 1, shoes);
        p(5, lFootY + 3, 2, 1, shoeSole);

        p(9, rFootY, 2, 2, pantsShadow);
        p(9, rFootY + 2, 2, 1, shoes);
        p(9, rFootY + 3, 2, 1, shoeSole);
      }
    }

    renderAccessory(p, config.accessory, hy, 'up');
  }

  // ──────────────────────────────────────────────────────────
  // 3. DIRECTION: LEFT (SIDE PROFILE)
  // ──────────────────────────────────────────────────────────
  else if (direction === 'left') {
    p(4, 19, 8, 2, 'rgba(0,0,0,0.18)');
    const hy = 2 + headBob;

    // Head base
    p(3, hy + 2, 9, 7, skin);
    p(4, hy + 1, 7, 8, skin);
    // Profile nose tip
    p(2, hy + 5, 1, 2, skin);

    // Eye
    if (isFemale) {
      // Eyelash winged leftward
      p(2, hy + 3, 2, 1, '#18181B');
      p(3, hy + 4, 3, 2, '#18181B');
      p(3, hy + 4, 1, 1, '#FFFFFF');
      p(4, hy + 5, 1, 1, '#93C5FD');
      // Cheek blush
      p(3, hy + 6, 2, 1, '#FB7185');
    } else {
      p(4, hy + 4, 2, 2, '#18181B');
      p(4, hy + 4, 1, 1, '#FFFFFF');
      p(3, hy + 6, 1, 1, '#FCA5A5');
    }

    // Hair side & back
    p(5, hy + 1, 7, 7, hair);
    p(4, hy + 1, 6, 2, hairHighlight);
    p(8, hy + 4, 4, 5, hairShadow);
    p(11, hy + 2, 2, 6, hairOutline);

    if (config.hairStyle === 'long') {
      p(8, hy + 7, 4, 6, hair);
      p(9, hy + 8, 3, 5, hairShadow);
    } else if (config.hairStyle === 'ponytail') {
      // High ponytail extending back
      p(11, hy + 2, 2, 2, '#EF4444'); // Scrunchie
      p(12, hy + 3, 3, 5, hair);
      p(13, hy + 4, 2, 4, hairShadow);
    } else if (config.hairStyle === 'bob') {
      p(7, hy + 6, 4, 3, hair);
    } else if (config.hairStyle === 'spiky') {
      p(9, hy - 1, 3, 3, hairHighlight);
    }

    // Torso
    const by = 10;
    p(5, by, 6, isFemale ? 4 : 5, shirt);
    p(5, by + 1, 5, 3, shirtHighlight);
    p(5, by + (isFemale ? 3 : 4), 6, 1, shirtShadow);

    // Arm (Swinging front and back)
    let armX = 6;
    let armY = by;
    if (frame === 1) {
      armX = 4;
      armY = by - 1;
    } else if (frame === 3) {
      armX = 8;
      armY = by + 1;
    }
    p(armX, armY, 3, 4, shirt);
    p(armX, armY + 3, 2, 1, skin);

    // Lower body (Side profile)
    if (isFemale) {
      if (isSitting) {
        p(4, by + 4, 6, 3, pants);
        p(4, by + 6, 6, 1, skirtHem);
        p(2, by + 7, 4, 2, shoes);
      } else {
        // A-line skirt flared sideways
        p(4, by + 4, 7, 3, pants);
        p(4, by + 6, 7, 1, skirtHem);

        let frontFootX = 4;
        let backFootX = 7;
        if (frame === 1) {
          frontFootX = 2;
          backFootX = 8;
        } else if (frame === 3) {
          frontFootX = 6;
          backFootX = 4;
        }

        // Back leg
        p(backFootX, by + 7, 2, 1, socksColor);
        p(backFootX - 1, by + 8, 3, 1, shoes);
        p(backFootX - 1, by + 9, 3, 1, shoeSole);

        // Front leg
        p(frontFootX, by + 7, 2, 1, socksColor);
        p(frontFootX - 1, by + 8, 3, 1, shoes);
        p(frontFootX - 1, by + 9, 3, 1, shoeSole);
      }
    } else {
      if (isSitting) {
        p(4, by + 5, 6, 3, pants);
        p(2, by + 7, 4, 2, shoes);
      } else {
        p(5, by + 5, 5, 2, pants);

        let frontFootX = 4;
        let backFootX = 7;
        if (frame === 1) {
          frontFootX = 2;
          backFootX = 8;
        } else if (frame === 3) {
          frontFootX = 6;
          backFootX = 4;
        }

        p(backFootX, by + 7, 2, 2, pantsShadow);
        p(backFootX - 1, by + 8, 3, 1, shoes);
        p(backFootX - 1, by + 9, 3, 1, shoeSole);

        p(frontFootX, by + 7, 2, 2, pants);
        p(frontFootX - 1, by + 8, 3, 1, shoes);
        p(frontFootX - 1, by + 9, 3, 1, shoeSole);
      }
    }

    renderAccessory(p, config.accessory, hy, 'left');
  }

  // ──────────────────────────────────────────────────────────
  // 4. DIRECTION: RIGHT (SIDE PROFILE)
  // ──────────────────────────────────────────────────────────
  else if (direction === 'right') {
    p(4, 19, 8, 2, 'rgba(0,0,0,0.18)');
    const hy = 2 + headBob;

    // Head base
    p(4, hy + 2, 9, 7, skin);
    p(5, hy + 1, 7, 8, skin);
    // Profile nose tip
    p(13, hy + 5, 1, 2, skin);

    // Eye
    if (isFemale) {
      // Eyelash winged rightward
      p(12, hy + 3, 2, 1, '#18181B');
      p(10, hy + 4, 3, 2, '#18181B');
      p(11, hy + 4, 1, 1, '#FFFFFF');
      p(12, hy + 5, 1, 1, '#93C5FD');
      // Cheek blush
      p(11, hy + 6, 2, 1, '#FB7185');
    } else {
      p(10, hy + 4, 2, 2, '#18181B');
      p(11, hy + 4, 1, 1, '#FFFFFF');
      p(12, hy + 6, 1, 1, '#FCA5A5');
    }

    // Hair side & back
    p(4, hy + 1, 7, 7, hair);
    p(6, hy + 1, 6, 2, hairHighlight);
    p(4, hy + 4, 4, 5, hairShadow);
    p(3, hy + 2, 2, 6, hairOutline);

    if (config.hairStyle === 'long') {
      p(4, hy + 7, 4, 6, hair);
      p(4, hy + 8, 3, 5, hairShadow);
    } else if (config.hairStyle === 'ponytail') {
      p(3, hy + 2, 2, 2, '#EF4444'); // Scrunchie
      p(1, hy + 3, 3, 5, hair);
      p(1, hy + 4, 2, 4, hairShadow);
    } else if (config.hairStyle === 'bob') {
      p(5, hy + 6, 4, 3, hair);
    } else if (config.hairStyle === 'spiky') {
      p(4, hy - 1, 3, 3, hairHighlight);
    }

    // Torso
    const by = 10;
    p(5, by, 6, isFemale ? 4 : 5, shirt);
    p(6, by + 1, 5, 3, shirtHighlight);
    p(5, by + (isFemale ? 3 : 4), 6, 1, shirtShadow);

    // Arm (Swinging front and back)
    let armX = 7;
    let armY = by;
    if (frame === 1) {
      armX = 9;
      armY = by - 1;
    } else if (frame === 3) {
      armX = 5;
      armY = by + 1;
    }
    p(armX, armY, 3, 4, shirt);
    p(armX + 1, armY + 3, 2, 1, skin);

    // Lower body (Side profile)
    if (isFemale) {
      if (isSitting) {
        p(6, by + 4, 6, 3, pants);
        p(6, by + 6, 6, 1, skirtHem);
        p(10, by + 7, 4, 2, shoes);
      } else {
        p(5, by + 4, 7, 3, pants);
        p(5, by + 6, 7, 1, skirtHem);

        let frontFootX = 9;
        let backFootX = 6;
        if (frame === 1) {
          frontFootX = 11;
          backFootX = 5;
        } else if (frame === 3) {
          frontFootX = 7;
          backFootX = 9;
        }

        // Back leg
        p(backFootX, by + 7, 2, 1, socksColor);
        p(backFootX, by + 8, 3, 1, shoes);
        p(backFootX, by + 9, 3, 1, shoeSole);

        // Front leg
        p(frontFootX, by + 7, 2, 1, socksColor);
        p(frontFootX, by + 8, 3, 1, shoes);
        p(frontFootX, by + 9, 3, 1, shoeSole);
      }
    } else {
      if (isSitting) {
        p(6, by + 5, 6, 3, pants);
        p(10, by + 7, 4, 2, shoes);
      } else {
        p(6, by + 5, 5, 2, pants);

        let frontFootX = 9;
        let backFootX = 6;
        if (frame === 1) {
          frontFootX = 11;
          backFootX = 5;
        } else if (frame === 3) {
          frontFootX = 7;
          backFootX = 9;
        }

        p(backFootX, by + 7, 2, 2, pantsShadow);
        p(backFootX, by + 8, 3, 1, shoes);
        p(backFootX, by + 9, 3, 1, shoeSole);

        p(frontFootX, by + 7, 2, 2, pants);
        p(frontFootX, by + 8, 3, 1, shoes);
        p(frontFootX, by + 9, 3, 1, shoeSole);
      }
    }

    renderAccessory(p, config.accessory, hy, 'right');
  }

  ctx.restore();
}

// ────────────────────────────────────────────────────────────
// HAIR RENDER HELPERS
// ────────────────────────────────────────────────────────────
function renderHairFront(
  p: (x: number, y: number, w: number, h: number, fill: string) => void,
  style: AvatarConfig['hairStyle'],
  hy: number,
  hair: string,
  hairLt: string,
  hairDk: string,
  isFemale: boolean
) {
  // Top Crown Outline & Base
  p(3, hy, 10, 3, hair);
  p(4, hy, 8, 1, hairLt);

  switch (style) {
    case 'buzz':
      p(3, hy + 1, 10, 2, hair);
      p(2, hy + 2, 1, 3, hairDk);
      p(13, hy + 2, 1, 3, hairDk);
      break;

    case 'spiky':
      p(4, hy - 2, 2, 2, hairLt);
      p(7, hy - 3, 2, 3, hairLt);
      p(10, hy - 2, 2, 2, hairLt);
      p(2, hy + 1, 2, 4, hair);
      p(12, hy + 1, 2, 4, hair);
      p(4, hy + 2, 3, 2, hair);
      p(9, hy + 2, 3, 2, hair);
      break;

    case 'ponytail':
      // Front swept bangs with side ponytail crest
      p(3, hy + 1, 10, 3, hair);
      p(2, hy + 2, 2, 5, hair);
      p(12, hy + 2, 2, 5, hair);
      // Swept front fringe
      p(4, hy + 2, 5, 2, hairLt);
      p(9, hy + 2, 3, 1, hairDk);
      // Ponytail arch peek on side
      p(13, hy - 1, 2, 3, hair);
      p(13, hy - 2, 2, 1, '#EF4444'); // Scrunchie accent
      break;

    case 'bob':
      // Rounded chin-framing bob
      p(3, hy + 1, 10, 3, hair);
      p(2, hy + 2, 2, 6, hair);
      p(12, hy + 2, 2, 6, hair);
      p(3, hy + 6, 2, 2, hairDk);
      p(11, hy + 6, 2, 2, hairDk);
      // Soft curved fringe
      p(4, hy + 2, 8, 2, hairLt);
      p(5, hy + 3, 6, 1, hair);
      break;

    case 'long':
      p(3, hy + 1, 10, 3, hair);
      p(2, hy + 2, 2, 9, hair);
      p(12, hy + 2, 2, 9, hair);
      p(2, hy + 8, 2, 3, hairDk);
      p(12, hy + 8, 2, 3, hairDk);
      // Glossy Bangs
      p(4, hy + 2, 2, 2, hairLt);
      p(10, hy + 2, 2, 2, hairLt);
      p(6, hy + 2, 4, 1, hairLt);
      break;

    case 'short':
    default:
      p(3, hy + 1, 10, 2, hair);
      p(2, hy + 2, 2, 4, hair);
      p(12, hy + 2, 2, 4, hair);
      // Swept Bangs
      if (isFemale) {
        p(4, hy + 2, 5, 2, hairLt);
        p(9, hy + 2, 3, 1, hair);
      } else {
        p(4, hy + 2, 4, 1, hairLt);
        p(8, hy + 2, 4, 1, hair);
        p(4, hy + 3, 2, 1, hair);
        p(10, hy + 3, 2, 1, hairDk);
      }
      break;
  }
}

// ────────────────────────────────────────────────────────────
// ACCESSORY RENDER HELPERS
// ────────────────────────────────────────────────────────────
function renderAccessory(
  p: (x: number, y: number, w: number, h: number, fill: string) => void,
  acc: AvatarConfig['accessory'],
  hy: number,
  dir: AvatarDirection
) {
  if (acc === 'none') return;

  switch (acc) {
    case 'ribbon': {
      const redRibbon = '#EF4444';
      const redDk = '#991B1B';
      const ribbonCenter = '#FDE047';

      if (dir === 'down') {
        // Cute ribbon bow perched on side of hair
        p(11, hy, 3, 2, redRibbon);
        p(12, hy + 1, 1, 1, ribbonCenter);
        p(10, hy - 1, 2, 2, redRibbon);
        p(13, hy - 1, 2, 2, redRibbon);
      } else if (dir === 'up') {
        p(7, hy + 1, 2, 2, ribbonCenter);
        p(5, hy + 1, 2, 2, redRibbon);
        p(9, hy + 1, 2, 2, redRibbon);
        p(6, hy + 3, 1, 2, redDk);
        p(9, hy + 3, 1, 2, redDk);
      } else if (dir === 'left') {
        p(9, hy, 2, 2, redRibbon);
        p(10, hy + 1, 1, 2, redDk);
      } else if (dir === 'right') {
        p(5, hy, 2, 2, redRibbon);
        p(5, hy + 1, 1, 2, redDk);
      }
      break;
    }

    case 'cap': {
      const redCap = '#EF4444';
      const redDk = '#B91C1C';
      const whiteLogo = '#FFFFFF';

      if (dir === 'down') {
        p(3, hy - 1, 10, 4, redCap);
        p(4, hy - 1, 8, 1, '#F87171');
        p(7, hy + 1, 2, 2, whiteLogo); // Poke logo
        // Front visor shadow
        p(2, hy + 3, 12, 1, redDk);
      } else if (dir === 'up') {
        p(3, hy - 1, 10, 4, redCap);
        p(4, hy - 1, 8, 1, '#F87171');
        p(7, hy + 2, 2, 1, redDk); // Back strap
      } else if (dir === 'left') {
        p(4, hy - 1, 8, 4, redCap);
        p(5, hy - 1, 6, 1, '#F87171');
        p(1, hy + 2, 4, 1, redDk); // Visor sticking out left
      } else if (dir === 'right') {
        p(4, hy - 1, 8, 4, redCap);
        p(5, hy - 1, 6, 1, '#F87171');
        p(11, hy + 2, 4, 1, redDk); // Visor sticking out right
      }
      break;
    }

    case 'glasses': {
      if (dir === 'down') {
        p(4, hy + 3, 8, 1, '#18181B');
        p(4, hy + 4, 3, 2, '#18181B');
        p(9, hy + 4, 3, 2, '#18181B');
        // Glare shine
        p(5, hy + 4, 1, 1, '#38BDF8');
        p(10, hy + 4, 1, 1, '#38BDF8');
      } else if (dir === 'left') {
        p(2, hy + 4, 4, 2, '#18181B');
        p(3, hy + 4, 1, 1, '#38BDF8');
        p(6, hy + 4, 3, 1, '#18181B'); // Frame temple
      } else if (dir === 'right') {
        p(10, hy + 4, 4, 2, '#18181B');
        p(12, hy + 4, 1, 1, '#38BDF8');
        p(7, hy + 4, 3, 1, '#18181B'); // Frame temple
      }
      break;
    }

    case 'headband': {
      const red = '#EF4444';
      const redLt = '#FCA5A5';
      if (dir === 'down') {
        p(3, hy + 2, 10, 2, red);
        p(4, hy + 2, 8, 1, redLt);
      } else if (dir === 'up') {
        p(3, hy + 2, 10, 2, red);
        // Knot and ribbons
        p(7, hy + 3, 2, 2, '#991B1B');
        p(8, hy + 5, 2, 3, red);
      } else if (dir === 'left') {
        p(3, hy + 2, 9, 2, red);
        p(11, hy + 3, 2, 3, red); // Ribbon tail
      } else if (dir === 'right') {
        p(4, hy + 2, 9, 2, red);
        p(3, hy + 3, 2, 3, red); // Ribbon tail
      }
      break;
    }

    case 'headphones': {
      const hpGreen = '#10B981';
      const hpDk = '#047857';
      if (dir === 'down') {
        p(4, hy - 1, 8, 1, hpDk); // Headband
        p(2, hy + 3, 2, 4, hpGreen); // Left ear cup
        p(12, hy + 3, 2, 4, hpGreen); // Right ear cup
        p(2, hy + 4, 1, 2, '#FFFFFF'); // Specular
      } else if (dir === 'up') {
        p(4, hy - 1, 8, 1, hpDk);
        p(2, hy + 3, 2, 4, hpGreen);
        p(12, hy + 3, 2, 4, hpGreen);
      } else if (dir === 'left') {
        p(6, hy - 1, 3, 1, hpDk);
        p(5, hy + 3, 3, 4, hpGreen);
        p(6, hy + 4, 1, 2, '#FFFFFF');
      } else if (dir === 'right') {
        p(7, hy - 1, 3, 1, hpDk);
        p(8, hy + 3, 3, 4, hpGreen);
        p(9, hy + 4, 1, 2, '#FFFFFF');
      }
      break;
    }
  }
}
