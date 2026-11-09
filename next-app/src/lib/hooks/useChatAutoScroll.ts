'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Distance (px) from the bottom within which the user counts as "at the bottom". */
const STICK_THRESHOLD_PX = 80;

/**
 * Keeps a chat scroll container pinned to its newest message.
 *
 * - `openKey` is non-null while the list is visible. Whenever it becomes
 *   non-null or changes (panel opened, tab/channel switched) the list jumps to
 *   the bottom instantly, even if the messages loaded while it was hidden.
 * - When `content` changes (new messages, "thinking" indicator) it follows the
 *   bottom only if the user was already near it, so reading history isn't
 *   interrupted.
 */
export function useChatAutoScroll(
  ref: RefObject<HTMLElement | null>,
  openKey: string | null,
  content: readonly unknown[]
) {
  const stickRef = useRef(true);
  const lastKeyRef = useRef<string | null>(null);
  const prevContentRef = useRef<readonly unknown[]>([]);

  // Runs after every commit but only touches layout when something relevant changed.
  useLayoutEffect(() => {
    const el = ref.current;
    if (openKey === null || !el) {
      lastKeyRef.current = null;
      return;
    }
    const opened = lastKeyRef.current !== openKey;
    const prev = prevContentRef.current;
    const changed = content.length !== prev.length || content.some((c, i) => c !== prev[i]);
    lastKeyRef.current = openKey;
    prevContentRef.current = content;

    if (opened) stickRef.current = true;
    if ((opened || changed) && stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  });

  // Track whether the user is near the bottom (they may scroll up to read history).
  useEffect(() => {
    const el = ref.current;
    if (openKey === null || !el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, openKey]);
}
