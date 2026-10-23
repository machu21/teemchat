import { AvatarConfig } from '@/lib/models/avatar';
import { renderCharacter, CHAR_W, CHAR_H } from '../art/character/render';
import { configToAppearance, appearanceKey } from '../art/character/appearance';
import type { CharacterFrameRequest, Dir, Pose } from '../art/api';
import { PixelBuf } from '../art/core/pixbuf';

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

// Offscreen canvas cache for full-body frames and bust crops
const spriteCache = new Map<string, HTMLCanvasElement>();
const bustCache = new Map<string, HTMLCanvasElement>();

function getOrCreateCanvas(key: string, makeCanvas: () => HTMLCanvasElement | null): HTMLCanvasElement | null {
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const canvas = makeCanvas();
  if (canvas) {
    if (spriteCache.size > 1024) spriteCache.clear();
    spriteCache.set(key, canvas);
  }
  return canvas;
}

/**
 * Authentic Habblaud 24x34 Pixel Art Chibi Avatar Renderer.
 *
 * Full-body rendering:
 * - 24x34 pixel grid with feet center anchor (12, 31)
 * - 4 directions: down (front), up (back), left (side), right (mirrored side)
 * - Layered hairstyles with front bangs and back length
 * - 4-frame walk cycle with arm swing and head bob
 * - Seated posture with 4px seat drop
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

  const app = configToAppearance(config);
  const frame = Math.floor(Math.abs(walkFrame)) % 4;
  const pose: Pose = isSitting ? 'sit' : (frame > 0 ? 'walk' : 'stand');

  const cacheKey = `${appearanceKey(app)}|${direction}|${pose}|${frame}|${isSitting ? 1 : 0}`;

  const spriteCanvas = getOrCreateCanvas(cacheKey, () => {
    const req: CharacterFrameRequest = {
      appearance: app,
      dir: direction as Dir,
      pose,
      frame,
      seated: isSitting,
    };
    const res = renderCharacter(req);
    return res.buf.toCanvas();
  });

  // Scale internal 24x34 space to targetSize
  // Baseline: targetSize 64px corresponds to scale ~1.9 (24*1.9 ~ 46px, 34*1.9 ~ 64px)
  const scale = targetSize / 34;

  if (typeof ctx.drawImage === 'function' && spriteCanvas) {
    const destW = CHAR_W * scale;
    const destH = CHAR_H * scale;
    // Draw centered on targetSize box
    const destX = Math.round((targetSize - destW) / 2);
    const destY = Math.round(targetSize - destH);
    ctx.drawImage(spriteCanvas, destX, destY, destW, destH);
  } else {
    // Direct PixelBuf rendering fallback (draws pixels via fillRect, supporting mock test contexts)
    const req: CharacterFrameRequest = {
      appearance: app,
      dir: direction as Dir,
      pose,
      frame,
      seated: isSitting,
    };
    const res = renderCharacter(req);
    const buf = res.buf;
    const destW = CHAR_W * scale;
    const destH = CHAR_H * scale;
    const destX = Math.round((targetSize - destW) / 2);
    const destY = Math.round(targetSize - destH);

    for (let y = 0; y < buf.h; y++) {
      for (let x = 0; x < buf.w; x++) {
        const i = (y * buf.w + x) * 4;
        const a = buf.data[i + 3];
        if (a > 0) {
          ctx.fillStyle = `rgba(${buf.data[i]},${buf.data[i + 1]},${buf.data[i + 2]},${a / 255})`;
          ctx.fillRect(
            Math.floor(destX + x * scale),
            Math.floor(destY + y * scale),
            Math.ceil(scale),
            Math.ceil(scale)
          );
        }
      }
    }
  }

  ctx.restore();
}

/**
 * Head & Shoulders Bust Portrait Renderer for UI Badges (Call tiles, Friends hub, Messenger).
 * Crops the 20x20 head and upper torso area from the 24x34 Habblaud sprite and scales it crisp and centered.
 */
export function renderAvatarBust(
  ctx: CanvasRenderingContext2D,
  config: AvatarConfig,
  targetSize: number = 48
) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const app = configToAppearance(config);
  const cacheKey = `bust|${appearanceKey(app)}`;

  let bustCanvas = bustCache.get(cacheKey);
  if (!bustCanvas) {
    const req: CharacterFrameRequest = {
      appearance: app,
      dir: 'down',
      pose: 'stand',
      frame: 0,
      seated: false,
    };
    const res = renderCharacter(req);
    // Crop 20x20 area: x=2, y=3 (top of hair/head), w=20, h=20
    const cropBuf: PixelBuf = res.buf.crop(2, 3, 20, 20);
    const canvas = cropBuf.toCanvas();
    if (canvas) {
      if (bustCache.size > 512) bustCache.clear();
      bustCache.set(cacheKey, canvas);
      bustCanvas = canvas;
    }
  }

  if (bustCanvas) {
    ctx.drawImage(bustCanvas, 0, 0, targetSize, targetSize);
  } else {
    renderPixelAvatar(ctx, config, targetSize, 'down', 0, false);
  }

  ctx.restore();
}
