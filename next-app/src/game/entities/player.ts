import { AvatarConfig } from '@/lib/models/avatar';
import { renderPixelAvatar, AvatarDirection } from '../render/avatar';
import { isPositionInWater } from '../map/zones';
import { PresenceOverlayState, danceOffset, renderPresenceOverlay } from '../render/presenceOverlay';
import { drawIcon } from '@/game/art/drawIcon';

export class PlayerEntity {
  x: number;
  y: number;
  displayName: string;
  avatarConfig: AvatarConfig;
  direction: AvatarDirection = 'down';
  isMoving: boolean = false;
  isSwimming: boolean = false;
  isSitting: boolean = false;
  role: 'captain' | 'developer' = 'captain'; // (C) or (D) badge like Image 1
  speechBubble?: string;
  speechExpiresAt?: number;
  /** Own emote, raised hand and status (mirrors what others see). */
  overlay: PresenceOverlayState = {};

  // Tap-to-move / Click-to-move target destination (for PC click & Phone touchscreen tap)
  targetDestination: { x: number; y: number } | null = null;
  isMicOn: boolean = false;
  isCameraOn: boolean = false;

  private animTimer: number = 0;
  private swimTimer: number = 0;
  private tapTargetPulse: number = 0;

  constructor(x: number, y: number, displayName: string, avatarConfig: AvatarConfig) {
    this.x = x;
    this.y = y;
    this.displayName = displayName;
    this.avatarConfig = avatarConfig;
  }

  setTargetDestination(x: number, y: number) {
    this.targetDestination = { x, y };
    this.tapTargetPulse = 0;
  }

  clearTargetDestination() {
    this.targetDestination = null;
  }

  mapTheme: string = 'village';

  update(dt: number) {
    if (this.isMoving) {
      // 8 steps per second gives an authentic GBA walk cycle
      this.animTimer += dt * 8;
    } else {
      this.animTimer = 0;
    }

    this.isSwimming = isPositionInWater(this.x + 16, this.y + 24, this.mapTheme);
    if (this.isSwimming) {
      this.swimTimer += dt * 4;
    }

    if (this.targetDestination) {
      this.tapTargetPulse += dt * 5;
    }
  }

  /** Visual lift (px) while jumping in Zombie Survival; 0 on the ground. */
  jumpHeight: number = 0;

  render(ctx: CanvasRenderingContext2D) {
    // 1. Draw Tap Target Destination marker if active
    if (this.targetDestination) {
      ctx.save();
      const pulse = 1 + Math.sin(this.tapTargetPulse) * 0.25;
      const tx = this.targetDestination.x;
      const ty = this.targetDestination.y;

      ctx.strokeStyle = '#38BDF8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 2;

      // Retro pulsing target diamond
      ctx.beginPath();
      ctx.moveTo(tx, ty - 8 * pulse);
      ctx.lineTo(tx + 8 * pulse, ty);
      ctx.lineTo(tx, ty + 8 * pulse);
      ctx.lineTo(tx - 8 * pulse, ty);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Center dot
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(tx - 1.5, ty - 1.5, 3, 3);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(Math.floor(this.x), Math.floor(this.y));

    // 2. Ground Shadow or Swimming Water Ripples
    if (this.isSwimming) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      const rippleSize = 18 + Math.sin(this.swimTimer) * 3;
      ctx.ellipse(16, 26, rippleSize, rippleSize * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wave edge
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(16, 32, 11, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Render Pixel Chibi Avatar with Walk Cycle & Direction (lifted while jumping; shadow stays)
    const walkFrame = this.isMoving && this.jumpHeight === 0 ? Math.floor(this.animTimer) % 4 : 0;
    ctx.save();
    ctx.translate(0, -Math.round(this.jumpHeight) - danceOffset(this.overlay));
    renderPixelAvatar(
      ctx,
      this.avatarConfig,
      36,
      this.direction,
      walkFrame,
      this.isSitting
    );
    ctx.restore();

    // Swimming mask (cut off lower legs in water)
    if (this.isSwimming) {
      ctx.fillStyle = 'rgba(37, 99, 235, 0.65)';
      ctx.fillRect(6, 26, 20, 8);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(8, 26, 4, 1);
      ctx.fillRect(18, 27, 4, 1);
    }

    // 4. Retro Pill Name Tag with Circular Role Badge (Matching Image 1)
    this.renderNameTag(ctx);

    // 5. Retro Speech Bubble with Downward Pointer Tail (Matching Image 1)
    const bubbleShown = Boolean(this.speechBubble && this.speechExpiresAt && Date.now() < this.speechExpiresAt);
    if (bubbleShown) {
      this.renderSpeechBubble(ctx, this.speechBubble!);
    }
    renderPresenceOverlay(ctx, this.overlay, bubbleShown);

    ctx.restore();
  }

  private renderNameTag(ctx: CanvasRenderingContext2D) {
    ctx.font = 'bold 10px "Plus Jakarta Sans", monospace, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const roleChar = this.role === 'captain' ? 'C' : 'D';
    const roleBg = this.role === 'captain' ? '#F59E0B' : '#3B82F6';
    const textW = ctx.measureText(this.displayName).width;

    // Extra width for mic and camera indicators if active
    let extraW = 0;
    if (this.isMicOn) extraW += 14;
    if (this.isCameraOn) extraW += 14;

    const pillH = 16;
    const badgeR = 5;
    const pillW = textW + 22 + extraW;
    const pillX = 16 - pillW / 2;
    const pillY = -14;

    // Pill background shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.roundRect(pillX + 1, pillY + 1, pillW, pillH, 8);
    ctx.fill();

    // Pill background: slightly greenish glow if mic is live
    ctx.fillStyle = this.isMicOn ? 'rgba(16, 36, 24, 0.92)' : 'rgba(24, 24, 27, 0.88)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 8);
    ctx.fill();

    // Border: highlighted green if mic on, blue if cam on
    ctx.strokeStyle = this.isMicOn
      ? 'rgba(34, 197, 94, 0.8)'
      : this.isCameraOn
      ? 'rgba(56, 189, 248, 0.8)'
      : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = this.isMicOn || this.isCameraOn ? 1.5 : 1;
    ctx.stroke();

    // Circular role badge (C or D)
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

    // Display Name
    ctx.font = 'bold 10px "Plus Jakarta Sans", monospace, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(this.displayName, pillX + 16, circleCy);

    // Live status badges (Mic & Cam icons)
    let iconOffset = pillX + 18 + textW;
    if (this.isMicOn) {
      drawIcon(ctx, 'mic', iconOffset + 5, circleCy, 10, { color: '#FFFFFF', strokeWidth: 2.4 });
      iconOffset += 14;
    }
    if (this.isCameraOn) {
      drawIcon(ctx, 'camera', iconOffset + 5, circleCy, 10, { color: '#FFFFFF', strokeWidth: 2.4 });
    }
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

    // Soft drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.roundRect(bx + 1.5, by + 1.5, bubbleW, bubbleH, 6);
    ctx.fill();

    // White bubble body
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(bx, by, bubbleW, bubbleH, 6);
    ctx.fill();

    // 2px solid dark border
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bubble pointer tail pointing down to avatar head
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(13, by + bubbleH);
    ctx.lineTo(16, by + bubbleH + 6);
    ctx.lineTo(19, by + bubbleH);
    ctx.closePath();
    ctx.fill();

    // Tail outline
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, by + bubbleH);
    ctx.lineTo(16, by + bubbleH + 6);
    ctx.lineTo(20, by + bubbleH);
    ctx.stroke();

    // Cover seam
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(13, by + bubbleH - 1, 6, 2);

    // Text content
    ctx.fillStyle = '#18181B';
    ctx.fillText(text, 16, by + bubbleH / 2);
  }
}
