'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CompanionModel } from '@/lib/models/chat';
import { ScreenHelpSession } from '@/lib/services/screenHelp';
import { TtsService } from '@/lib/services/tts';
import { detectPlatform } from '@/lib/utils/screenshot';

export const DEFAULT_COMPANION: CompanionModel = {
  id: 'companion-pixel-cat',
  userId: 'system',
  name: 'Pixel Cat',
  persona: 'Playful pixel buddy exploring the TeemChat virtual world with you.',
  companionType: 'cat',
  avatarStyle: 'orange_tabby',
  learnedContext: {},
  isActive: true,
};

export interface CompanionChatMessage {
  role: string;
  content: string;
  // In-memory thumbnail only; never persisted or sent as history
  screenshot?: string;
}

interface UseCompanionChatOptions {
  companion: CompanionModel | null;
  userName: string | undefined;
  currentZone?: string;
}

/**
 * AI companion conversation state + Companion Screen Help capture, shared by the
 * space chat box and the dashboard companion panel.
 */
export function useCompanionChat({ companion, userName, currentZone }: UseCompanionChatOptions) {
  const [messages, setMessages] = useState<CompanionChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

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
    const recentHistory = messages.map(({ role, content }) => ({ role, content }));

    try {
      const { data: { session: authSession } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
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
            : {
                companion,
                userName,
                currentZone,
                userMessage: text,
                recentHistory,
              }
        ),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason =
          res.status === 401 || res.status === 403
            ? 'Sign in with an account to chat with your companion.'
            : data.message || data.error || 'Companion is unavailable right now. Try again shortly.';
        setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${reason}` }]);
        return;
      }

      const reply = data.response || "I'm right with you!";
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);

      if (TtsService.autoSpeak) {
        TtsService.speak(reply);
      }
    } catch (err) {
      console.error('Error in AI companion chat:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Could not reach your companion. Check your connection.' },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  return {
    messages,
    isThinking,
    sendMessage,
    screenHelp: {
      supported: screenHelpSupported,
      active: screenHelpActive,
      starting: screenHelpStarting,
      start: startScreenHelp,
      stop: stopScreenHelp,
    },
  };
}
