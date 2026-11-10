'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompanionModel } from '@/lib/models/chat';
import { ScreenHelpSession } from '@/lib/services/screenHelp';
import { TtsService } from '@/lib/services/tts';
import { CompanionReminder, CompanionService } from '@/lib/services/companion';
import { detectPlatform } from '@/lib/utils/screenshot';
import { normalizeActions, normalizeEmote, normalizeMood } from '@/lib/companion/normalize';
import type { CompanionProfile, CompanionReply, WorldContext } from '@/lib/companion/types';

/** Shown while the real companion loads (and for guests, who don't get one). */
export const DEFAULT_COMPANION: CompanionModel = {
  id: 'companion-pixel-cat',
  userId: 'system',
  name: 'Pixel Cat',
  persona: 'Playful pixel buddy exploring the TeemChat virtual world with you.',
  companionType: 'cat',
  species: 'cat',
  avatarStyle: 'orange_tabby',
  learnedContext: {},
  isActive: true,
};

export function profileToModel(p: CompanionProfile): CompanionModel {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    persona: p.persona,
    companionType: p.species,
    species: p.species,
    avatarStyle: p.avatarStyle,
    learnedContext: {},
    isActive: true,
    mood: p.mood,
    bondXp: p.bondXp,
  };
}

export interface CompanionChatMessage {
  role: string;
  content: string;
  // In-memory thumbnail only; never persisted or sent as history
  screenshot?: string;
  /** Labels for actions the companion took (e.g. "Leading you to Crystal Bay") */
  chips?: string[];
  /** Trial used up: show the AI add-on payment buttons under this reply. */
  upgrade?: boolean;
}

interface UseCompanionChatOptions {
  /** Signed-in, non-guest user id. Without it the companion stays a local placeholder. */
  userId?: string | null;
  userName: string | undefined;
  /** Live world snapshot sent with each message. */
  getWorld?: () => WorldContext;
  /** Called with every AI reply; return labels for any actions it ran. */
  onReply?: (reply: CompanionReply) => string[] | void;
  /** Called when a reminder the companion set comes due. */
  onReminderDue?: (text: string) => void;
}

const MAX_TIMEOUT_MS = 2_147_000_000;

/**
 * AI companion conversation state + Companion Screen Help capture, shared by the
 * space chat box and the dashboard companion panel.
 */
export function useCompanionChat({ userId, userName, getWorld, onReply, onReminderDue }: UseCompanionChatOptions) {
  const [profile, setProfile] = useState<CompanionProfile | null>(null);
  const [messages, setMessages] = useState<CompanionChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [reminders, setReminders] = useState<CompanionReminder[]>([]);

  // Latest callbacks without re-running effects
  const callbacksRef = useRef({ getWorld, onReply, onReminderDue });
  useEffect(() => {
    callbacksRef.current = { getWorld, onReply, onReminderDue };
  }, [getWorld, onReply, onReminderDue]);

  // Load the owner's real companion + recent history
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const p = await CompanionService.getMine(userId);
      if (cancelled || !p) return;
      setProfile(p);
      const [history, open] = await Promise.all([
        CompanionService.loadHistory(p.id, 30),
        CompanionService.listOpenReminders(p.id),
      ]);
      if (cancelled) return;
      setMessages((prev) => (prev.length ? prev : history));
      setReminders(open);
    })().catch((err) => console.warn('Companion init warning:', err));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Fire the next due reminder
  useEffect(() => {
    if (!reminders.length) return;
    const next = reminders[0];
    const wait = Math.min(Math.max(0, new Date(next.dueAt).getTime() - Date.now()), MAX_TIMEOUT_MS);
    const timer = setTimeout(() => {
      callbacksRef.current.onReminderDue?.(next.text);
      setReminders((prev) => prev.filter((r) => r.id !== next.id));
      void CompanionService.completeReminder(next.id);
    }, wait);
    return () => clearTimeout(timer);
  }, [reminders]);

  const companion = useMemo<CompanionModel | null>(
    () => (userId ? (profile ? profileToModel(profile) : null) : null),
    [userId, profile]
  );

  const addReminder = useCallback(
    async (text: string, minutes: number) => {
      if (!profile) return null;
      const r = await CompanionService.addReminder(profile, text, minutes);
      if (r) setReminders((prev) => [...prev, r].sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
      return r;
    },
    [profile]
  );

  const updateProfile = useCallback(
    async (patch: Parameters<typeof CompanionService.update>[1]) => {
      if (!profile) return null;
      const updated = await CompanionService.update(profile.id, patch);
      if (updated) setProfile(updated);
      return updated;
    },
    [profile]
  );

  /** Add a local-only line to the chat (e.g. a reminder notice). Not persisted. */
  const addLocalMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages((prev) => [...prev, { role, content }]);
  }, []);

  const clearHistory = useCallback(async () => {
    if (!profile) return;
    if (await CompanionService.clearHistory(profile.id)) setMessages([]);
  }, [profile]);

  // Companion Screen Help (private, local-only screen capture)
  const screenHelpRef = useRef<ScreenHelpSession | null>(null);
  const [screenHelpSupported, setScreenHelpSupported] = useState(false);
  const [screenHelpActive, setScreenHelpActive] = useState(false);
  const [screenHelpStarting, setScreenHelpStarting] = useState(false);

  useEffect(() => {
    // Detected after mount to avoid a hydration mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScreenHelpSupported(ScreenHelpSession.isSupported());
    return () => {
      screenHelpRef.current?.stop();
      screenHelpRef.current = null;
    };
  }, []);

  const stopScreenHelp = useCallback(() => {
    screenHelpRef.current?.stop();
    setScreenHelpActive(false);
  }, []);

  const startScreenHelp = useCallback(async () => {
    if (!screenHelpRef.current) screenHelpRef.current = new ScreenHelpSession();
    setScreenHelpStarting(true);
    try {
      await screenHelpRef.current.start(() => setScreenHelpActive(false));
      setScreenHelpActive(true);
    } catch (err) {
      // User cancelled the picker or permission was denied
      console.warn('Screen help capture not started:', err);
      setScreenHelpActive(false);
    } finally {
      setScreenHelpStarting(false);
    }
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isThinking) return;

    setIsThinking(true);
    const screenshot =
      screenHelpActive && screenHelpRef.current
        ? await screenHelpRef.current.captureFrame().catch(() => null)
        : null;
    setMessages((prev) => [...prev, { role: 'user', content: text, ...(screenshot ? { screenshot } : {}) }]);
    // Text-only history: screenshots never leave the message they were attached to
    const recentHistory = messages.slice(-8).map(({ role, content }) => ({ role, content }));

    try {
      const { data: { session: authSession } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      const now = new Date();
      const world: WorldContext = {
        localTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
        localDay: now.getDay(),
        ...(callbacksRef.current.getWorld?.() ?? {}),
      };
      const res = await fetch(screenshot ? '/api/companion/screen-help' : '/api/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession?.access_token || ''}`,
        },
        body: JSON.stringify(
          screenshot
            ? {
                companionName: companion?.name,
                userName,
                userMessage: text,
                recentHistory,
                screenshot,
                platform: detectPlatform(navigator.userAgent),
              }
            : { userName, userMessage: text, recentHistory, world }
        ),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason =
          res.status === 401 || res.status === 403
            ? 'Sign in with an account to chat with your companion.'
            : data.message || data.error || 'Companion is unavailable right now. Try again shortly.';
        setMessages((prev) => [...prev, { role: 'assistant', content: `${reason}` }]);
        return;
      }

      const reply: CompanionReply = {
        text: data.response || "I'm right with you!",
        mood: normalizeMood(data.mood, profile?.mood ?? 'happy'),
        emote: normalizeEmote(data.emote),
        actions: normalizeActions(data.actions),
      };
      if (profile) {
        setProfile({
          ...profile,
          mood: reply.mood,
          bondXp: typeof data.bondXp === 'number' ? data.bondXp : profile.bondXp,
          lastSeenOwnerAt: new Date().toISOString(),
        });
      }

      const chips = callbacksRef.current.onReply?.(reply) || undefined;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply.text,
          ...(chips && chips.length ? { chips } : {}),
          ...(data.upgradeRequired ? { upgrade: true } : {}),
        },
      ]);

      if (TtsService.autoSpeak) {
        TtsService.speak(reply.text);
      }
    } catch (err) {
      console.error('Error in AI companion chat:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Could not reach your companion. Check your connection.' },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return {
    companion,
    profile,
    messages,
    isThinking,
    sendMessage,
    addReminder,
    updateProfile,
    clearHistory,
    addLocalMessage,
    reminders,
    screenHelp: {
      supported: screenHelpSupported,
      active: screenHelpActive,
      starting: screenHelpStarting,
      start: startScreenHelp,
      stop: stopScreenHelp,
    },
  };
}
