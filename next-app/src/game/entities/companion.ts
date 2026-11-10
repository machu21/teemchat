import type { CompanionModel } from '@/lib/models/chat';
import { normalizeSpecies } from '../../lib/companion/normalize';
import type { CompanionEmote, CompanionMood, CompanionSpecies } from '@/lib/companion/types';
import type { IconName } from '@/lib/icons';
import { drawIcon } from '@/game/art/drawIcon';

export type CompanionState = 'follow' | 'idle' | 'sleep' | 'guide';

/** Owner idle time before the companion dozes off. */
export const SLEEP_AFTER_SECONDS = 180;
const GUIDE_SPEED = 85; // px/s
const GUIDE_MAX_LEAD = 110; // px ahead of the owner before waiting
const GUIDE_ARRIVE_DIST = 36;

/** Emotes drawn as line icons; the rest are plain text glyphs. */
const EMOTE_ICON: Partial<Record<Exclude<CompanionEmote, 'none'>, IconName>> = {
  heart: 'heart',
  sparkle: 'sparkles',
  music: 'music',
};

const EMOTE_GLYPH: Partial<Record<Exclude<CompanionEmote, 'none'>, string>> = {
  question: '?',
  zzz: 'z',
  exclaim: '!',
  laugh: '^^',
};

const EMOTE_COLOR: Record<Exclude<CompanionEmote, 'none'>, string> = {
  heart: '#F43F5E',
  sparkle: '#E2F952',
  question: '#38BDF8',
  music: '#A78BFA',
  zzz: '#E2E8F0',
  exclaim: '#F59E0B',
  laugh: '#F59E0B',
};

interface SpeciesPalette {
  body: string;
  shade: string;
  accent: string;
  eye: string;
}

const PALETTES: Record<CompanionSpecies, SpeciesPalette> = {
  cat: { body: '#FB923C', shade: '#C2410C', accent: '#FFEDD5', eye: '#18181B' },
  robot: { body: '#38BDF8', shade: '#0369A1', accent: '#18181B', eye: '#E2F952' },
  dog: { body: '#D6A86A', shade: '#8B5E34', accent: '#FFF7ED', eye: '#18181B' },
  wisp: { body: '#A5F3FC', shade: '#22D3EE', accent: '#F0FDFF', eye: '#164E63' },
};

export interface CompanionEntityOptions {
  /** Passive companions belong to other players: no state machine, no tap. */
  passive?: boolean;
}

export class CompanionEntity {
  x: number;
  y: number;
  companion: CompanionModel;
  species: CompanionSpecies;
  mood: CompanionMood;
  state: CompanionState = 'follow';
  readonly passive: boolean;

  speech: string | null = null;
  emote: CompanionEmote = 'none';

  /** Fired once when the owner comes back after the companion fell asleep. */
  onWake?: () => void;
  /** Fired when the companion falls asleep. */
  onSleep?: () => void;

  private floatTimer = 0;
  private hopTimer = 0;
  private speechUntil = 0;
  private emoteUntil = 0;
  private clock = 0;
  private ownerStillFor = 0;
  private lastOwnerX: number | null = null;
  private lastOwnerY: number | null = null;
  private lookOffset = 0;
  private lookTimer = 0;
  private facing: 1 | -1 = 1;
  private guide: { x: number; y: number; name: string; onArrive?: () => void } | null = null;
  private trailPhase = 0;

  constructor(x: number, y: number, companion: CompanionModel, options: CompanionEntityOptions = {}) {
    this.x = x;
    this.y = y;
    this.companion = companion;
    this.species = normalizeSpecies(companion.species ?? companion.companionType);
    this.mood = companion.mood ?? 'happy';
    this.passive = Boolean(options.passive);
  }

  /** Update identity (name/species/mood) without resetting position or state. */
  setModel(companion: CompanionModel) {
    this.companion = companion;
    this.species = normalizeSpecies(companion.species ?? companion.companionType);
    if (companion.mood) this.mood = companion.mood;
  }

  /** Show a speech bubble for `ms` milliseconds. */
  say(text: string, ms = 4500) {
    this.speech = text.length > 64 ? `${text.slice(0, 61).trimEnd()}…` : text;
    this.speechUntil = this.clock + ms / 1000;
    if (this.state === 'sleep') this.state = 'idle';
  }

  react(emote: CompanionEmote | undefined, mood?: CompanionMood) {
    if (mood) this.mood = mood;
    if (emote && emote !== 'none') {
      this.emote = emote;
      this.emoteUntil = this.clock + 2.5;
    }
    if (mood === 'excited' || emote === 'heart' || emote === 'exclaim') this.hopTimer = 0.9;
  }

  /** Lead the owner to a world position. */
  guideTo(x: number, y: number, name: string, onArrive?: () => void) {
    this.guide = { x, y, name, onArrive };
    this.state = 'guide';
    this.ownerStillFor = 0;
  }

  cancelGuide() {
    this.guide = null;
    if (this.state === 'guide') this.state = 'follow';
  }

  get guideTarget() {
    return this.guide ? { x: this.guide.x, y: this.guide.y, name: this.guide.name } : null;
  }

  update(dt: number, targetX: number, targetY: number) {
    this.clock += dt;
    this.floatTimer += dt * 3;
    this.trailPhase = (this.trailPhase + dt * 24) % 12;
    if (this.hopTimer > 0) this.hopTimer = Math.max(0, this.hopTimer - dt);
    if (this.speech && this.clock > this.speechUntil) this.speech = null;
    if (this.emote !== 'none' && this.clock > this.emoteUntil && this.state !== 'sleep') this.emote = 'none';

    // Owner movement tracking
    const ownerDx = this.lastOwnerX === null ? 0 : targetX - this.lastOwnerX;
    const ownerMoved =
      this.lastOwnerX !== null &&
      this.lastOwnerY !== null &&
      Math.hypot(targetX - this.lastOwnerX, targetY - this.lastOwnerY) > 0.5;
    this.lastOwnerX = targetX;
    this.lastOwnerY = targetY;

    if (this.passive) {
      this.ease(targetX + 28, targetY + 6, dt);
      return;
    }

    if (ownerMoved) {
      this.ownerStillFor = 0;
      if (this.state === 'sleep') {
        this.state = 'follow';
        this.emote = 'none';
        this.onWake?.();
      } else if (this.state === 'idle') {
        this.state = 'follow';
      }
    } else {
      this.ownerStillFor += dt;
    }

    switch (this.state) {
      case 'guide':
        this.updateGuide(dt, targetX, targetY);
        return;
      case 'follow':
        if (this.ownerStillFor > 1.5) this.state = 'idle';
        this.ease(targetX + 28, targetY + 6, dt);
        if (Math.abs(ownerDx) > 0.2) this.facing = ownerDx > 0 ? -1 : 1;
        break;
      case 'idle':
        // Little look-around drift so it never freezes like a sticker
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
          this.lookTimer = 2 + Math.random() * 3;
          this.lookOffset = (Math.random() - 0.5) * 14;
        }
        this.ease(targetX + 28 + this.lookOffset, targetY + 6, dt * 0.5);
        if (this.ownerStillFor > SLEEP_AFTER_SECONDS && !this.speech) {
          this.state = 'sleep';
          this.emote = 'zzz';
          this.mood = 'sleepy';
          this.onSleep?.();
        }
        break;
      case 'sleep':
        this.ease(targetX + 26, targetY + 12, dt * 0.5);
        break;
    }
  }

  private updateGuide(dt: number, ownerX: number, ownerY: number) {
    const g = this.guide;
    if (!g) {
      this.state = 'follow';
      return;
    }
    const toTarget = Math.hypot(g.x - this.x, g.y - this.y);
    const ownerToTarget = Math.hypot(g.x - ownerX, g.y - ownerY);
    if (ownerToTarget < GUIDE_ARRIVE_DIST * 2.5 || toTarget < GUIDE_ARRIVE_DIST) {
      const done = g.onArrive;
      this.guide = null;
      this.state = 'follow';
      this.react('sparkle', 'proud');
      done?.();
      return;
    }

    const lead = Math.hypot(this.x - ownerX, this.y - ownerY);
    if (lead < GUIDE_MAX_LEAD) {
      const step = Math.min(toTarget, GUIDE_SPEED * dt);
      this.x += ((g.x - this.x) / toTarget) * step;
      this.y += ((g.y - this.y) / toTarget) * step;
      this.facing = g.x > this.x ? -1 : 1;
    } else if (!this.speech && Math.floor(this.clock) % 6 === 0) {
      this.say('This way!', 1800);
    }
  }

  private ease(x: number, y: number, dt: number) {
    const k = Math.min(1, dt * 4);
    this.x += (x - this.x) * k;
    this.y += (y - this.y) * k;
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.guide) this.renderTrail(ctx);

    ctx.save();
    const sleeping = this.state === 'sleep';
    const bob = sleeping ? Math.sin(this.floatTimer * 0.4) * 1 : Math.sin(this.floatTimer) * (this.species === 'wisp' ? 5 : 3);
    const hop = this.hopTimer > 0 ? -Math.abs(Math.sin(this.hopTimer * Math.PI * 2.2)) * 7 : 0;
    const floats = this.species === 'robot' || this.species === 'wisp';
    const hoverY = floats ? bob : Math.max(0, bob) * 0.4;
    ctx.translate(Math.round(this.x), Math.round(this.y + hoverY + hop));

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(12, 26 - hoverY - hop, floats ? 7 : 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sprite (flip horizontally to face travel direction)
    ctx.save();
    if (this.facing === -1) {
      ctx.translate(24, 0);
      ctx.scale(-1, 1);
    }
    this.renderBody(ctx, sleeping);
    ctx.restore();

    this.renderNameTag(ctx);
    if (this.emote !== 'none') this.renderEmote(ctx);
    if (this.speech) this.renderSpeech(ctx, this.speech);

    ctx.restore();
  }

  /** Draw just the 24x24 sprite at the origin (used for UI portraits). */
  renderPortrait(ctx: CanvasRenderingContext2D) {
    this.renderBody(ctx, false);
  }

  private renderBody(ctx: CanvasRenderingContext2D, sleeping: boolean) {
    const p = PALETTES[this.species];
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };

    switch (this.species) {
      case 'cat':
        px(5, 2, 3, 4, p.body); // ears
        px(16, 2, 3, 4, p.body);
        px(6, 3, 1, 2, p.accent);
        px(17, 3, 1, 2, p.accent);
        px(4, 5, 16, 11, p.body); // head
        px(6, 15, 12, 7, p.body); // body
        px(8, 16, 8, 5, p.accent); // belly
        px(18, 16, 4, 2, p.shade); // tail
        px(20, 13, 2, 4, p.shade);
        px(10, 12, 4, 2, p.accent); // muzzle
        px(11, 12, 2, 1, '#F472B6'); // nose
        break;
      case 'robot':
        px(11, 0, 2, 3, '#F59E0B'); // antenna
        px(10, 0, 4, 1, this.emote !== 'none' ? '#E2F952' : '#F59E0B');
        px(4, 3, 16, 14, p.body); // head
        px(6, 5, 12, 10, p.accent); // screen
        px(7, 18, 10, 4, p.shade); // thruster body
        px(9, 22, 6, 1, '#F59E0B');
        break;
      case 'dog':
        px(3, 4, 4, 7, p.shade); // floppy ears
        px(17, 4, 4, 7, p.shade);
        px(5, 3, 14, 12, p.body); // head
        px(6, 15, 12, 7, p.body); // body
        px(9, 16, 6, 5, p.accent);
        px(18, 13, 3, 2, p.body); // tail
        px(9, 11, 6, 3, p.accent); // muzzle
        px(11, 11, 2, 1, '#18181B'); // nose
        break;
      case 'wisp': {
        const glow = 0.25 + Math.sin(this.floatTimer * 1.3) * 0.1;
        ctx.fillStyle = `rgba(165, 243, 252, ${glow})`;
        ctx.beginPath();
        ctx.arc(12, 11, 12, 0, Math.PI * 2);
        ctx.fill();
        px(6, 4, 12, 12, p.body); // core
        px(5, 6, 14, 8, p.body);
        px(8, 16, 8, 3, p.shade); // wispy tail
        px(10, 19, 4, 2, p.shade);
        px(11, 21, 2, 2, p.shade);
        px(8, 6, 3, 2, p.accent); // highlight
        break;
      }
    }

    this.renderFace(ctx, p, sleeping);
  }

  private renderFace(ctx: CanvasRenderingContext2D, p: SpeciesPalette, sleeping: boolean) {
    const eyeY = this.species === 'robot' ? 8 : this.species === 'wisp' ? 9 : 9;
    const lx = 8;
    const rx = 14;
    ctx.fillStyle = p.eye;
    const blink = !sleeping && Math.floor(this.clock * 10) % 42 === 0;

    if (sleeping || blink || this.mood === 'sleepy') {
      ctx.fillRect(lx, eyeY + 1, 2, 1);
      ctx.fillRect(rx, eyeY + 1, 2, 1);
    } else if (this.mood === 'happy' || this.mood === 'proud' || this.mood === 'excited') {
      // ^ ^ eyes
      ctx.fillRect(lx, eyeY + 1, 1, 1);
      ctx.fillRect(lx + 1, eyeY, 1, 1);
      ctx.fillRect(lx + 2, eyeY + 1, 1, 1);
      ctx.fillRect(rx - 1, eyeY + 1, 1, 1);
      ctx.fillRect(rx, eyeY, 1, 1);
      ctx.fillRect(rx + 1, eyeY + 1, 1, 1);
    } else if (this.mood === 'worried' || this.mood === 'sulky') {
      ctx.fillRect(lx, eyeY, 2, 2);
      ctx.fillRect(rx, eyeY, 2, 2);
      ctx.fillRect(lx - 1, eyeY - 2, 3, 1);
      ctx.fillRect(rx, eyeY - 2, 3, 1);
    } else {
      // curious / calm: round eyes with a glint
      ctx.fillRect(lx, eyeY, 2, 2);
      ctx.fillRect(rx, eyeY, 2, 2);
      if (this.species !== 'robot') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(lx, eyeY, 1, 1);
        ctx.fillRect(rx, eyeY, 1, 1);
      }
    }
  }

  private renderNameTag(ctx: CanvasRenderingContext2D) {
    ctx.font = 'bold 8px "Plus Jakarta Sans", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const name = this.companion.name;
    const badgeW = ctx.measureText(name).width + 10;
    const badgeH = 12;
    const badgeX = 12 - badgeW / 2;
    const badgeY = -15;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#E2F952';
    ctx.fillText(name, 12, badgeY + 8.5);
  }

  private renderEmote(ctx: CanvasRenderingContext2D) {
    const emote = this.emote as Exclude<CompanionEmote, 'none'>;
    const rise = this.emote === 'zzz' ? (this.clock * 6) % 8 : 0;
    const icon = EMOTE_ICON[emote];
    if (icon) {
      drawIcon(ctx, icon, 26, -2 - rise, 11, { color: EMOTE_COLOR[emote], background: '#18181B', pad: 0.16, strokeWidth: 2.6 });
      return;
    }
    ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#18181B';
    const glyph = this.emote === 'zzz' ? 'z z' : (EMOTE_GLYPH[emote] ?? '');
    ctx.strokeText(glyph, 26, -2 - rise);
    ctx.fillStyle = EMOTE_COLOR[emote];
    ctx.fillText(glyph, 26, -2 - rise);
  }

  private renderSpeech(ctx: CanvasRenderingContext2D, text: string) {
    ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.min(Math.max(ctx.measureText(text).width + 12, 40), 220);
    const h = 18;
    const bx = 12 - w / 2;
    const by = -38;

    // Neo-brutalist bubble: hard offset shadow, 2px border
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.roundRect(bx + 2, by + 2, w, h, 5);
    ctx.fill();
    ctx.fillStyle = '#FFFBEB';
    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFFBEB';
    ctx.beginPath();
    ctx.moveTo(9, by + h - 1);
    ctx.lineTo(12, by + h + 5);
    ctx.lineTo(15, by + h - 1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(9, by + h);
    ctx.lineTo(12, by + h + 5);
    ctx.lineTo(15, by + h);
    ctx.stroke();

    ctx.fillStyle = '#18181B';
    ctx.fillText(text, 12, by + h / 2 + 0.5, 210);
  }

  private renderTrail(ctx: CanvasRenderingContext2D) {
    const g = this.guide;
    if (!g) return;
    const dx = g.x - this.x;
    const dy = g.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const ux = dx / dist;
    const uy = dy / dist;
    const maxDots = Math.min(Math.floor(dist / 12), 14);
    ctx.save();
    for (let i = 1; i <= maxDots; i++) {
      const d = i * 12 + this.trailPhase;
      const alpha = 0.85 - i / (maxDots + 4);
      ctx.fillStyle = `rgba(226, 249, 82, ${Math.max(0.15, alpha)})`;
      ctx.fillRect(Math.round(this.x + 12 + ux * d) - 1.5, Math.round(this.y + 22 + uy * d) - 1.5, 3, 3);
    }
    ctx.restore();
  }

  isPointInside(screenX: number, screenY: number, cameraX: number, cameraY: number, zoom: number): boolean {
    if (this.passive) return false;
    const worldX = screenX / zoom + cameraX;
    const worldY = screenY / zoom + cameraY;
    return worldX >= this.x - 4 && worldX <= this.x + 28 && worldY >= this.y - 16 && worldY <= this.y + 28;
  }
}
