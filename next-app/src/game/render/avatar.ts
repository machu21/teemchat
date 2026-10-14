import { AvatarConfig } from '@/lib/models/avatar';

export function renderPixelAvatar(
  ctx: CanvasRenderingContext2D,
  config: AvatarConfig,
  targetSize: number = 64
) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Render on internal 16x16 grid
  const scale = targetSize / 16;
  ctx.scale(scale, scale);

  // Clear
  ctx.clearRect(0, 0, 16, 16);

  // Helper rect function
  const rect = (x: number, y: number, w: number, h: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  };

  // 1. Head Base (Skin)
  rect(4, 3, 8, 7, config.skinColor);

  // 2. Eyes
  rect(5, 6, 2, 2, '#18181B');
  rect(9, 6, 2, 2, '#18181B');
  rect(5, 6, 1, 1, '#FFFFFF');
  rect(9, 6, 1, 1, '#FFFFFF');

  // 3. Hair
  switch (config.hairStyle) {
    case 'buzz':
      rect(4, 2, 8, 2, config.hairColor);
      break;
    case 'spiky':
      rect(4, 2, 8, 2, config.hairColor);
      rect(5, 1, 2, 1, config.hairColor);
      rect(9, 1, 2, 1, config.hairColor);
      break;
    case 'long':
      rect(4, 2, 8, 2, config.hairColor);
      rect(3, 4, 1, 6, config.hairColor);
      rect(12, 4, 1, 6, config.hairColor);
      break;
    case 'short':
    default:
      rect(4, 2, 8, 2, config.hairColor);
      rect(3, 4, 1, 2, config.hairColor);
      rect(12, 4, 1, 2, config.hairColor);
      break;
  }

  // 4. Body (Shirt)
  rect(4, 10, 8, 4, config.shirtColor);

  // 5. Pants / Legs
  rect(5, 14, 2, 2, '#1E293B');
  rect(9, 14, 2, 2, '#1E293B');

  // 6. Accessories
  switch (config.accessory) {
    case 'glasses':
      ctx.fillStyle = '#000000';
      ctx.fillRect(4, 6, 8, 1);
      rect(5, 5, 2, 3, '#000000');
      rect(9, 5, 2, 3, '#000000');
      rect(6, 6, 1, 1, '#38BDF8');
      rect(10, 6, 1, 1, '#38BDF8');
      break;
    case 'headband':
      rect(4, 3, 8, 1, '#EF4444');
      break;
    case 'headphones':
      rect(4, 1, 8, 1, '#10B981');
      rect(3, 4, 1, 3, '#10B981');
      rect(12, 4, 1, 3, '#10B981');
      break;
    case 'cap':
      rect(3, 2, 10, 2, '#3B82F6');
      rect(3, 3, 11, 1, '#1D4ED8');
      break;
  }

  ctx.restore();
}
