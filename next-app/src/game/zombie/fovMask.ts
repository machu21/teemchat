import { TileGrid } from './grid';
import { FovResult, VIS_PERIPHERAL, VIS_VISIBLE } from './fov';

// ============================================================
// ZOMBIE MODE — FOG-OF-WAR MASK RENDERER (Canvas 2D)
// Writes one pixel per tile into a tiny offscreen canvas, then
// upscales it over the world with smoothing ON. Bilinear filtering
// gives soft Zomboid-style falloff at shadow edges for the cost of
// a single drawImage per frame (no per-tile fillRect calls).
// ============================================================

const DARK_RGB = [8, 10, 18] as const;
/** Alpha (0–255) per visibility state. */
const ALPHA_UNSEEN = 235;
const ALPHA_REMEMBERED = 175; // seen before, not now: show layout, hide zombies
const ALPHA_PERIPHERAL = 120;
const ALPHA_VISIBLE = 0;

export class FovMaskRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  /** Tiles the player has ever seen (drives the "remembered" dim layer). */
  private explored: Uint8Array;

  constructor(private grid: TileGrid) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = grid.cols;
    this.canvas.height = grid.rows;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(grid.cols, grid.rows);
    this.explored = new Uint8Array(grid.cols * grid.rows);
    const d = this.image.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = DARK_RGB[0];
      d[i + 1] = DARK_RGB[1];
      d[i + 2] = DARK_RGB[2];
    }
  }

  /** Call once per FOV recompute (not necessarily every frame). */
  update(fov: FovResult): void {
    const d = this.image.data;
    const vis = fov.vis;
    for (let i = 0; i < vis.length; i++) {
      const v = vis[i];
      if (v !== 0) this.explored[i] = 1;
      d[i * 4 + 3] =
        v === VIS_VISIBLE
          ? ALPHA_VISIBLE
          : v === VIS_PERIPHERAL
            ? ALPHA_PERIPHERAL
            : this.explored[i]
              ? ALPHA_REMEMBERED
              : ALPHA_UNSEEN;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  /**
   * Draws the mask in world space. Call after entities and before HUD,
   * with the camera transform already applied to `target`.
   */
  render(target: CanvasRenderingContext2D): void {
    const ts = this.grid.tileSize;
    target.save();
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'high';
    // Each mask pixel maps to one tile; bilinear sampling is centred on tile centres.
    target.drawImage(this.canvas, 0, 0, this.grid.cols * ts, this.grid.rows * ts);
    target.restore();
  }

  resetExplored(): void {
    this.explored.fill(0);
  }

  dispose(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
