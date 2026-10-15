import { AvatarConfig } from '@/lib/models/avatar';
import { renderPixelAvatar, AvatarDirection } from '../render/avatar';
import { isPositionInWater } from '../map/zones';

export class RemotePlayerEntity {
  userId: string;
  displayName: string;
  avatarConfig: AvatarConfig;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  direction: AvatarDirection = 'down';
  isMoving: boolean = false;
  isSwimming: boolean = false;
  isSitting: boolean = false;
  role: 'captain' | 'developer' = 'developer'; // (D) badge for peers
  speechBubble?: string;
  speechExpiresAt?: number;

  private animTimer: number = 0;
  private swimTimer: number = 0;

  constructor(
    userId: string,
    displayName: string,
    avatarConfig: AvatarConfig,
    x: number,
    y: number
  ) {
    this.userId = userId;
    this.displayName = displayName;
    this.avatarConfig = avatarConfig;
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
  }

  updateState(params: {
    x: number;
    y: number;
    direction: AvatarDirection;
    isMoving: boolean;
    speechBubble?: string;
    speechExpiresAt?: number;
  }) {
    this.targetX = params.x;
    this.targetY = params.y;
    this.direction = params.direction;
    this.isMoving = params.isMoving;
    if (params.speechBubble) {
      this.speechBubble = params.speechBubble;
      this.speechExpiresAt = params.speechExpiresAt;
    }
  }

  mapTheme: string = 'village';

  update(dt: number) {
    // Smooth lerp interpolation toward network position
    this.x += (this.targetX - this.x) * Math.min(1, dt * 14);
    this.y += (this.targetY - this.y) * Math.min(1, dt * 14);

    if (this.isMoving) {
      this.animTimer += dt * 8;
    } else {
      this.animTimer = 0;
    }

    this.isSwimming = isPositionInWater(this.x + 16, this.y + 24, this.mapTheme);
    if (this.isSwimming) {
      this.swimTimer += dt * 4;
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(Math.floor(this.x), Math.floor(this.y));

    // Ground Shadow or Swimming Water Ripples
    if (this.isSwimming) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      const rippleSize = 18 + Math.sin(this.swimTimer) * 3;
      ctx.ellipse(16, 26, rippleSize, rippleSize * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(16, 32, 11, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render 4-Direction Pixel Chibi Avatar
    const walkFrame = this.isMoving ? Math.floor(this.animTimer) % 4 : 0;
    renderPixelAvatar(
      ctx,
      this.avatarConfig,
      36,
      this.direction,
      walkFrame,
      this.isSitting
    );

    if (this.isSwimming) {
      ctx.fillStyle = 'rgba(37, 99, 235, 0.65)';
      ctx.fillRect(6, 26, 20, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(8, 26, 4, 1);
      ctx.fillRect(18, 27, 4, 1);
    }

    // Retro Pill Name Tag with Circular Role Badge (Matching Image 1)
    this.renderNameTag(ctx);

    // Retro Speech Bubble (Matching Image 1)
    if (this.speechBubble && this.speechExpiresAt && Date.now() < this.speechExpiresAt) {
      this.renderSpeechBubble(ctx, this.speechBubble);
    }

    ctx.restore();
  }

  private renderNameTag(ctx: CanvasRenderingContext2D) {
    ctx.font = 'bold 10px "Plus Jakarta Sans", monospace, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const roleChar = this.role === 'captain' ? 'C' : 'D';
    const roleBg = this.role === 'captain' ? '#F59E0B' : '#3B82F6';
    const textW = ctx.measureText(this.displayName).width;

    const pillH = 16;
    const badgeR = 5;
    const pillW = textW + 22;
    const pillX = 16 - pillW / 2;
    const pillY = -14;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.roundRect(pillX + 1, pillY + 1, pillW, pillH, 8);
    ctx.fill();

    ctx.fillStyle = 'rgba(24, 24, 27, 0.88)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 8);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const circleCx = pillX + 8;
    const circleCy = pillY + pillH / 2;
    ctx.fillStyle = roleBg;
    ctx.beginPath();
    ctx.arc(circleCx, circleCy, badgeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 8px monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(roleChar, circleCx, circleCy + 0.5);

    ctx.font = 'bold 10px "Plus Jakarta Sans", monospace, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(this.displayName, pillX + 16, circleCy);
  }

  private renderSpeechBubble(ctx: CanvasRenderingContext2D, text: string) {
    ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textW = ctx.measureText(text).width;
    const bubbleW = Math.min(Math.max(textW + 16, 48), 200);
    const bubbleH = 22;
    const bx = 16 - bubbleW / 2;
    const by = -44;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(bx + 1.5, by + 1.5, bubbleW, bubbleH, 6);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(bx, by, bubbleW, bubbleH, 6);
    ctx.fill();

    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(13, by + bubbleH);
    ctx.lineTo(16, by + bubbleH + 6);
    ctx.lineTo(19, by + bubbleH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, by + bubbleH);
    ctx.lineTo(16, by + bubbleH + 6);
    ctx.lineTo(20, by + bubbleH);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(13, by + bubbleH - 1, 6, 2);

    ctx.fillStyle = '#18181B';
    ctx.fillText(text, 16, by + bubbleH / 2);
  }
}
