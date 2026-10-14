import { CompanionModel } from '@/lib/models/chat';

export class CompanionEntity {
  x: number;
  y: number;
  companion: CompanionModel;
  private floatTimer: number = 0;

  constructor(x: number, y: number, companion: CompanionModel) {
    this.x = x;
    this.y = y;
    this.companion = companion;
  }

  update(dt: number, targetX: number, targetY: number) {
    this.floatTimer += dt * 3;

    // Follow player smoothly at offset (-24, -16)
    const desiredX = targetX - 24;
    const desiredY = targetY - 16;

    this.x += (desiredX - this.x) * Math.min(1, dt * 4);
    this.y += (desiredY - this.y) * Math.min(1, dt * 4);
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const hoverY = Math.sin(this.floatTimer) * 4;
    ctx.translate(this.x, this.y + hoverY);

    // Floating shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(12, 28 - hoverY, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Robot companion body (24x24)
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(4, 4, 16, 14);

    // Screen face
    ctx.fillStyle = '#18181B';
    ctx.fillRect(6, 6, 12, 10);

    // Glowing eyes
    ctx.fillStyle = '#E2F952';
    ctx.fillRect(8, 9, 2, 2);
    ctx.fillRect(14, 9, 2, 2);

    // Antenna
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(11, 1, 2, 3);
    ctx.fillRect(10, 0, 4, 1);

    // Name tag
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(this.companion.name, 12, -4);

    ctx.restore();
  }

  isPointInside(screenX: number, screenY: number, cameraX: number, cameraY: number, zoom: number): boolean {
    const worldX = screenX / zoom + cameraX;
    const worldY = screenY / zoom + cameraY;
    return (
      worldX >= this.x &&
      worldX <= this.x + 24 &&
      worldY >= this.y &&
      worldY <= this.y + 24
    );
  }
}
