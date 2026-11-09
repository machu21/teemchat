import { EmoteId, PlayerStatus, emoteDef, statusIcon } from '@/lib/world/emotes';

/** Emote / raised hand / status shown above an avatar. Shared by local and remote players. */
export interface PresenceOverlayState {
  emote?: EmoteId;
  emoteExpiresAt?: number;
  handRaised?: boolean;
  status?: PlayerStatus;
}

/** True when the viewer asked for reduced motion (OS setting or in-app toggle). */
export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.hasAttribute('data-reduced-motion')) return true;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function isEmoteActive(state: PresenceOverlayState, now: number = Date.now()): boolean {
  return Boolean(state.emote && state.emoteExpiresAt && now < state.emoteExpiresAt);
}

/** Vertical bounce (px) for the avatar while dancing; 0 otherwise or with reduced motion. */
export function danceOffset(state: PresenceOverlayState, now: number = Date.now()): number {
  if (state.emote !== 'dance' || !isEmoteActive(state, now) || prefersReducedMotion()) return 0;
  return Math.round(Math.abs(Math.sin(now / 120)) * 4);
}

/**
 * Draws in the avatar's local space (origin at the sprite's top-left, 32px wide).
 * `bubbleShown` lifts the emote above an active speech bubble.
 */
export function renderPresenceOverlay(
  ctx: CanvasRenderingContext2D,
  state: PresenceOverlayState,
  bubbleShown: boolean
): void {
  const now = Date.now();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (isEmoteActive(state, now)) {
    const def = emoteDef(state.emote!);
    const remaining = state.emoteExpiresAt! - now;
    const age = def.durationMs - remaining;
    // Small pop-in over the first 180ms (skipped with reduced motion).
    const pop = prefersReducedMotion() ? 1 : Math.min(1, 0.5 + age / 360);
    const size = Math.round(22 * pop);
    const y = bubbleShown ? -64 : -30;
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(def.emoji, 16, y);
  }

  if (state.handRaised) {
    // Neo-brutalist badge: yellow disc, 2px dark border, hard offset shadow.
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.arc(37, 5, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(35, 3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '11px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.fillText('✋', 35, 3.5);
  }

  const icon = statusIcon(state.status);
  if (icon) {
    ctx.font = '9px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.fillText(icon, -4, -6);
  }

  ctx.restore();
}
