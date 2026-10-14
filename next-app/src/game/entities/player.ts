import { AvatarConfig } from '@/lib/models/avatar';
import { renderPixelAvatar } from '../render/avatar';
import { isPositionInWater } from '../map/zones';

export class PlayerEntity {
  x: number;
  y: number;
  displayName: string;
  avatarConfig: AvatarConfig;
  direction: 'up' | 'down' | 'left' | 'right' = 'down';
  isMoving: boolean = false;
  isSwimming: boolean = false;
  speechBubble?: string;
  speechExpiresAt?: number;

  private animTimer: number = 0;
  private swimTimer: number = 0;

  constructor(x: number, y: number, displayName: string, avatarConfig: AvatarConfig) {
    this.x = x;
    this.y = y;
    this.displayName = displayName;
    this.avatarConfig = avatarConfig;
  }

  update(dt: number) {
    if (this.isMoving) {
      this.animTimer += dt * 8;
    } else {
      this.animTimer = 0;
    }

    this.isSwimming = isPositionInWater(this.x + 16, this.y + 24);
    if (this.isSwimming) {
      this.swimTimer += dt * 4;
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Swimming effect (water ripple underneath)
    if (this.isSwimming) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.beginPath();
      const rippleSize = 18 + Math.sin(this.swimTimer) * 3;
      ctx.ellipse(16, 26, rippleSize, rippleSize * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Subtle ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(16, 30, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Walking vertical bobbing
    const bob = this.isMoving && !this.isSwimming ? Math.sin(this.animTimer) * 2 : 0;
    ctx.translate(0, bob);

    // Render 32x32 Avatar
    renderPixelAvatar(ctx, this.avatarConfig, 32);

    // Swimming mask (cut off lower legs in water)
    if (this.isSwimming) {
      ctx.fillStyle = 'rgba(37, 99, 235, 0.6)';
      ctx.fillRect(8, 24, 16, 8);
    }

    // Name tag
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    const textWidth = ctx.measureText(this.displayName).width;

    ctx.fillStyle = 'rgba(24, 24, 27, 0.75)';
    ctx.fillRect(16 - textWidth / 2 - 4, -14, textWidth + 8, 14);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(this.displayName, 16, -3);

    // Speech Bubble
    if (this.speechBubble && this.speechExpiresAt && Date.now() < this.speechExpiresAt) {
      ctx.font = 'bold 12px sans-serif';
      const bubbleW = Math.min(ctx.measureText(this.speechBubble).width + 16, 180);
      const bubbleH = 22;

      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 2;

      ctx.fillRect(16 - bubbleW / 2, -42, bubbleW, bubbleH);
      ctx.strokeRect(16 - bubbleW / 2, -42, bubbleW, bubbleH);

      ctx.fillStyle = '#18181B';
      ctx.fillText(this.speechBubble, 16, -26);
    }

    ctx.restore();
  }
}
