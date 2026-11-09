'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './CompanionPanel.module.css';
import { useSessionStore } from '@/stores/session';
import { useSocialStore } from '@/stores/social';
import { useCompanionChat, DEFAULT_COMPANION } from '@/lib/hooks/useCompanionChat';
import { useChatAutoScroll } from '@/lib/hooks/useChatAutoScroll';
import { ScreenHelpBar } from '@/components/companion/ScreenHelpBar';
import { CompanionPortrait } from '@/components/companion/CompanionPortrait';
import { NeoButton } from '@/components/neo/NeoButton';
import { BotIcon, CloseIcon } from '@/components/icons/DockIcons';
import { runCompanionActions } from '@/lib/companion/actions';
import { BOND_LEVELS, bondProgress, getBondLevel } from '@/lib/companion/bond';
import { COMPANION_SPECIES } from '@/lib/companion/types';
import { AiUpgradePrompt } from '@/components/billing/AiUpgradePrompt';
import type {
  CompanionReply,
  CompanionSpecies,
  CompanionTraits,
} from '@/lib/companion/types';

interface CompanionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
}

type Tab = 'chat' | 'bond';

const SPECIES_LABEL: Record<CompanionSpecies, string> = {
  cat: 'Cat',
  robot: 'Robot',
  dog: 'Pup',
  wisp: 'Wisp',
};

const TRAIT_LABELS: Array<{ key: keyof CompanionTraits; low: string; high: string }> = [
  { key: 'playful', low: 'Serious', high: 'Playful' },
  { key: 'curious', low: 'Chill', high: 'Curious' },
  { key: 'sassy', low: 'Sweet', high: 'Sassy' },
  { key: 'calm', low: 'Hyper', high: 'Calm' },
];

/**
 * Pop-up AI companion for the dashboard (outside of a space): chat plus your
 * bond + customization. Memory works automatically in the background and is
 * never shown in the UI.
 */
export function CompanionPanel({ isOpen, onClose, onUpgrade }: CompanionPanelProps) {
  const { session } = useSessionStore();
  const openDrawer = useSocialStore((s) => s.openDrawer);
  const [input, setInput] = useState('');
  const [tab, setTab] = useState<Tab>('chat');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isGuest = !session || session.isGuest;

  const addLocalRef = useRef<((role: 'user' | 'assistant', content: string) => void) | null>(null);
  const addReminderRef = useRef<((text: string, minutes: number) => unknown) | null>(null);

  const onReply = useCallback(
    (reply: CompanionReply) =>
      runCompanionActions(reply.actions, {
        open_dms: () => {
          openDrawer('dms');
          onClose();
        },
        open_friends: () => {
          openDrawer('friends');
          onClose();
        },
        set_reminder: (text, minutes) => void addReminderRef.current?.(text, minutes),
      })
        .filter((r) => r.ran && r.label)
        .map((r) => r.label as string),
    [openDrawer, onClose]
  );

  const onReminderDue = useCallback((text: string) => {
    addLocalRef.current?.('assistant', `⏰ Reminder: ${text}`);
  }, []);

  const getWorld = useCallback(() => ({ zone: 'TeemChat Dashboard', activity: 'dashboard' }), []);

  const chat = useCompanionChat({
    userId: isGuest ? null : session?.id,
    userName: session?.displayName,
    getWorld,
    onReply,
    onReminderDue,
  });
  const { messages, isThinking, sendMessage, screenHelp, profile, updateProfile, clearHistory, addLocalMessage, addReminder } = chat;
  const { stop: stopScreenHelp } = screenHelp;

  useEffect(() => {
    addLocalRef.current = addLocalMessage;
    addReminderRef.current = addReminder;
  }, [addLocalMessage, addReminder]);

  const companionName = profile?.name || DEFAULT_COMPANION.name;
  const species: CompanionSpecies = profile?.species ?? 'cat';

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

  // Open at the newest message; follow new ones only while the user is at the bottom
  useChatAutoScroll(scrollRef, isOpen && !isGuest && tab === 'chat' ? 'chat' : null, [messages, isThinking]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessage(text);
  };

  const bond = getBondLevel(profile?.bondXp ?? 0);

  return (
    <section className={styles.panel} role="dialog" aria-label={`${companionName} AI companion`}>
      <header className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">
          {isGuest ? <BotIcon size={20} /> : <CompanionPortrait species={species} mood={profile?.mood} size={28} />}
        </span>
        <div className={styles.titleBlock}>
          <span className={styles.title}>{companionName}</span>
          <span className={styles.subtitle}>
            {isGuest ? 'Your AI companion' : `Lv ${bond.level} ${bond.title} · feeling ${profile?.mood ?? 'happy'}`}
          </span>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close companion">
          <CloseIcon size={16} strokeWidth={2.5} />
        </button>
      </header>

      {isGuest ? (
        <div className={styles.locked}>
          <span className={styles.lockedIcon} aria-hidden="true">
            <CompanionPortrait species="cat" mood="sleepy" size={56} />
          </span>
          <p className={styles.lockedTitle}>Your companion egg is waiting</p>
          <p className={styles.lockedText}>
            Create a free account to hatch a companion that follows you around, guides you through TeemChat, and
            remembers what matters to you.
          </p>
          {onUpgrade && (
            <NeoButton variant="accent" size="sm" onClick={onUpgrade}>
              Create Account
            </NeoButton>
          )}
        </div>
      ) : (
        <>
          <nav className={styles.tabs} role="tablist" aria-label="Companion sections">
            {(['chat', 'bond'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'chat' ? 'Chat' : 'Bond'}
              </button>
            ))}
          </nav>

          {tab === 'chat' && (
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
                    Say hi to {companionName}! Ask about TeemChat, tell it about your day, or share your screen for
                    step-by-step tech help.
                  </div>
                ) : (
                  messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleAi}`}
                    >
                      <strong>{m.role === 'user' ? 'You' : companionName}:</strong> {m.content}
                      {m.screenshot && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.screenshot} alt="Screenshot sent to companion" className={styles.screenshotThumb} />
                      )}
                      {m.chips?.map((chip) => (
                        <span key={chip} className={styles.chip}>
                          {chip}
                        </span>
                      ))}
                      {m.upgrade && <AiUpgradePrompt />}
                    </div>
                  ))
                )}
                {isThinking && <div className={styles.thinking}>{companionName} is thinking...</div>}
              </div>

              <form className={styles.inputRow} onSubmit={handleSubmit}>
                <input
                  className={styles.input}
                  aria-label="Message to companion"
                  placeholder={`Talk to ${companionName}...`}
                  value={input}
                  maxLength={2000}
                  onChange={(e) => setInput(e.target.value)}
                />
                <NeoButton type="submit" variant="primary" size="sm" disabled={!input.trim() || isThinking}>
                  Send
                </NeoButton>
              </form>
            </>
          )}

          {tab === 'bond' && profile && (
            <BondTab
              key={profile.id}
              name={profile.name}
              species={profile.species}
              traits={profile.traits}
              bondXp={profile.bondXp}
              nickname={profile.nicknameForOwner}
              onSave={(patch) => updateProfile(patch)}
              onClearHistory={clearHistory}
            />
          )}

          {tab !== 'chat' && !profile && <div className={styles.empty}>Waking your companion up…</div>}
        </>
      )}
    </section>
  );
}

interface BondTabProps {
  name: string;
  species: CompanionSpecies;
  traits: CompanionTraits;
  bondXp: number;
  nickname: string | null;
  onSave: (patch: {
    name?: string;
    species?: CompanionSpecies;
    traits?: CompanionTraits;
    nicknameForOwner?: string | null;
  }) => Promise<unknown>;
  onClearHistory: () => Promise<void>;
}

function BondTab({ name, species, traits, bondXp, nickname, onSave, onClearHistory }: BondTabProps) {
  const [draftName, setDraftName] = useState(name);
  const [draftSpecies, setDraftSpecies] = useState<CompanionSpecies>(species);
  const [draftTraits, setDraftTraits] = useState<CompanionTraits>(traits);
  const [draftNick, setDraftNick] = useState(nickname ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  const level = getBondLevel(bondXp);
  const progress = bondProgress(bondXp);

  const save = async () => {
    setSaving(true);
    await onSave({
      name: draftName,
      species: draftSpecies,
      traits: draftTraits,
      ...(level.level >= 3 ? { nicknameForOwner: draftNick || null } : {}),
    });
    setSaving(false);
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className={styles.scrollArea}>
      <div className={styles.bondCard}>
        <CompanionPortrait species={draftSpecies} mood="happy" size={56} />
        <div className={styles.bondInfo}>
          <span className={styles.bondLevel}>
            Level {level.level} · {level.title}
          </span>
          <div
            className={styles.bondBar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Bond progress"
          >
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className={styles.bondHint}>
            {level.nextXp === null ? 'Max bond reached' : `${level.nextXp - bondXp} more chats to the next level`}
          </span>
        </div>
      </div>

      <ul className={styles.unlockList}>
        {BOND_LEVELS.map((l) => (
          <li key={l.level} className={l.level <= level.level ? styles.unlocked : styles.lockedRow}>
            <strong>Lv {l.level}</strong> {l.unlock}
          </li>
        ))}
      </ul>

      <h3 className={styles.sectionTitle}>Customize</h3>
      <label className={styles.fieldLabel} htmlFor="companion-name">
        Name
      </label>
      <input
        id="companion-name"
        className={styles.input}
        value={draftName}
        maxLength={24}
        onChange={(e) => setDraftName(e.target.value)}
      />

      <span className={styles.fieldLabel}>Form</span>
      <div className={styles.speciesGrid} role="radiogroup" aria-label="Companion form">
        {COMPANION_SPECIES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={draftSpecies === s}
            className={`${styles.speciesBtn} ${draftSpecies === s ? styles.speciesBtnActive : ''}`}
            onClick={() => setDraftSpecies(s)}
          >
            <CompanionPortrait species={s} size={32} />
            <span>{SPECIES_LABEL[s]}</span>
          </button>
        ))}
      </div>

      <span className={styles.fieldLabel}>Personality</span>
      {TRAIT_LABELS.map(({ key, low, high }) => (
        <div key={key} className={styles.traitRow}>
          <span>{low}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(draftTraits[key] * 100)}
            aria-label={`${low} to ${high}`}
            onChange={(e) => setDraftTraits({ ...draftTraits, [key]: Number(e.target.value) / 100 })}
          />
          <span>{high}</span>
        </div>
      ))}

      <label className={styles.fieldLabel} htmlFor="companion-nick">
        What should it call you? {level.level < 3 && <em>(unlocks at Lv 3)</em>}
      </label>
      <input
        id="companion-nick"
        className={styles.input}
        value={draftNick}
        maxLength={24}
        disabled={level.level < 3}
        placeholder={level.level < 3 ? 'Keep chatting to unlock' : 'e.g. Captain'}
        onChange={(e) => setDraftNick(e.target.value)}
      />

      <div className={styles.bondActions}>
        <NeoButton variant="primary" size="sm" onClick={save} disabled={saving || !draftName.trim()}>
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
        </NeoButton>
        {confirmClear ? (
          <NeoButton
            variant="secondary"
            size="sm"
            onClick={async () => {
              await onClearHistory();
              setConfirmClear(false);
            }}
          >
            Yes, clear chat history
          </NeoButton>
        ) : (
          <NeoButton variant="secondary" size="sm" onClick={() => setConfirmClear(true)}>
            Clear chat history
          </NeoButton>
        )}
      </div>
    </div>
  );
}
