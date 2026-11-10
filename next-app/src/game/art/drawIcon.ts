import { ICONS, type IconName } from '@/lib/icons';

// ============================================================
// CANVAS ICONS
// Draws the app's line icons (lib/icons) on a 2D canvas so signs, speech
// bubbles, plaques and HUD markers match the React UI — no emoji glyphs.
// ============================================================

type Attrs = Record<string, string | number>;

const num = (v: string | number | undefined, d = 0) => (v === undefined ? d : typeof v === 'number' ? v : parseFloat(v));

/** Path2D cache per icon (Path2D is unavailable outside browsers, so build lazily). */
const cache = new Map<IconName, { shapes: { path: Path2D; closed: boolean }[] }>();

function shapesFor(name: IconName) {
  const hit = cache.get(name);
  if (hit) return hit;
  const shapes: { path: Path2D; closed: boolean }[] = [];
  for (const [tag, raw] of ICONS[name]) {
    const a = raw as Attrs;
    const p = new Path2D();
    switch (tag) {
      case 'path':
        shapes.push({ path: new Path2D(String(a.d)), closed: false });
        continue;
      case 'circle':
        p.arc(num(a.cx), num(a.cy), num(a.r), 0, Math.PI * 2);
        break;
      case 'ellipse':
        p.ellipse(num(a.cx), num(a.cy), num(a.rx), num(a.ry), 0, 0, Math.PI * 2);
        break;
      case 'rect': {
        const r = num(a.rx);
        if (r > 0 && typeof p.roundRect === 'function') p.roundRect(num(a.x), num(a.y), num(a.width), num(a.height), r);
        else p.rect(num(a.x), num(a.y), num(a.width), num(a.height));
        break;
      }
      case 'line':
        p.moveTo(num(a.x1), num(a.y1));
        p.lineTo(num(a.x2), num(a.y2));
        break;
      case 'polyline':
      case 'polygon': {
        const pts = String(a.points).trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) (i === 0 ? p.moveTo : p.lineTo).call(p, pts[i], pts[i + 1]);
        if (tag === 'polygon') p.closePath();
        break;
      }
      default:
        continue;
    }
    shapes.push({ path: p, closed: tag !== 'line' && tag !== 'polyline' });
  }
  const entry = { shapes };
  cache.set(name, entry);
  return entry;
}

export interface DrawIconOptions {
  color?: string;
  /** Stroke width in icon units (24-unit box). */
  strokeWidth?: number;
  /** Optional filled disc behind the icon. */
  background?: string;
  /** Padding inside the background disc (fraction of size). */
  pad?: number;
}

/** Draws icon `name` centred on (cx, cy), `size` px square. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, size: number, opts: DrawIconOptions = {}) {
  if (typeof Path2D === 'undefined') return; // tests / SSR
  const { color = '#FFFFFF', strokeWidth = 2, background, pad = 0.22 } = opts;
  ctx.save();
  if (background) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const inner = background ? size * (1 - pad * 2) : size;
  const s = inner / 24;
  ctx.translate(cx - inner / 2, cy - inner / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const sh of shapesFor(name).shapes) ctx.stroke(sh.path);
  ctx.restore();
}

/**
 * Draws a label with a leading icon (replaces "🏆 TEXT" signs). Returns the
 * x where the text starts so callers can keep their own layout.
 */
export function drawIconLabel(
  ctx: CanvasRenderingContext2D,
  name: IconName,
  text: string,
  x: number,
  y: number,
  iconSize: number,
  color: string
): number {
  drawIcon(ctx, name, x + iconSize / 2, y, iconSize, { color });
  const tx = x + iconSize + Math.max(2, iconSize * 0.3);
  ctx.fillText(text, tx, y);
  return tx;
}
