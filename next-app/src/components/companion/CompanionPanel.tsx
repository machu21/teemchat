'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './CompanionPanel.module.css';
import { useSessionStore } from '@/stores/session';
import { useCompanionChat, DEFAULT_COMPANION } from '@/lib/hooks/useCompanionChat';
import { ScreenHelpBar } from '@/components/companion/ScreenHelpBar';
import { NeoButton } from '@/components/neo/NeoButton';
import { BotIcon, CloseIcon } from '@/components/icons/DockIcons';

interface CompanionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
}

/**
 * Pop-up AI companion chat for the dashboard (outside of a space).
 * Includes Companion Screen Help on supported desktop browsers.
 */
export function CompanionPanel({ isOpen, onClose, onUpgrade }: CompanionPanelProps) {
  const { session } = useSessionStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const companion = DEFAULT_COMPANION;

  const { messages, isThinking, sendMessage, screenHelp } = useCompanionChat({
    companion,
    userName: session?.displayName,
    currentZone: 'TeemChat Dashboard',
  });
  const { stop: stopScreenHelp } = screenHelp;

  // The live indicator is hidden with the panel, so stop sharing with it
  useEffect(() => {
    if (!isOpen) stopScreenHelp();
  }, [isOpen, stopScreenHelp]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  if (!isOpen) return null;

  const isGuest = !session || session.isGuest;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessage(text);
  };

  return (
    <section className={styles.panel} role="dialog" aria-label={`${companion.name} AI companion`}>
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          <BotIcon size={20} />
        </span>
        <div className={styles.titleBlock}>
          <span className={styles.title}>{companion.name}</span>
          <span className={styles.subtitle}>Your AI companion</span>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close companion">
          <CloseIcon size={16} strokeWidth={2.5} />
        </button>
      </header>

      {isGuest ? (
        <div className={styles.locked}>
          <span className={styles.lockedIcon} aria-hidden="true">
            <BotIcon size={36} />
          </span>
          <p className={styles.lockedTitle}>Companions are for registered explorers</p>
          <p className={styles.lockedText}>
            Create a free account to chat with {companion.name}, get help from screen sharing, and keep
            your companion&apos;s memories.
          </p>
          {onUpgrade && (
            <NeoButton variant="accent" size="sm" onClick={onUpgrade}>
              Create Account
            </NeoButton>
          )}
        </div>
      ) : (
        <>
          {screenHelp.supported && (
            <div className={styles.screenHelpSlot}>
              <ScreenHelpBar
                active={screenHelp.active}
                starting={screenHelp.starting}
                onStart={screenHelp.start}
                onStop={screenHelp.stop}
              />
            </div>
          )}

          <div ref={scrollRef} className={styles.messages}>
            {messages.length === 0 ? (
              <div className={styles.empty}>
                Say hello to {companion.name}! Ask anything, or share your screen for step-by-step tech help.
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAi}`}
                >
                  <strong>{m.role === 'user' ? 'You' : companion.name}:</strong> {m.content}
                  {m.screenshot && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.screenshot} alt="Screenshot sent to companion" className={styles.screenshotThumb} />
                  )}
                </div>
              ))
            )}
            {isThinking && <div className={styles.thinking}>{companion.name} is thinking...</div>}
          </div>

          <form className={styles.inputRow} onSubmit={handleSubmit}>
            <input
              className={styles.input}
              aria-label="Message to companion"
              placeholder="Ask your companion..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <NeoButton type="submit" variant="primary" size="sm" disabled={!input.trim() || isThinking}>
              Send
            </NeoButton>
          </form>
        </>
      )}
    </section>
  );
}
