'use client';

import React, { useEffect, useId, useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoButton } from '@/components/neo/NeoButton';
import { useControlsStore } from '@/stores/controls';
import { CONTROL_ACTIONS, ControlAction, ControlSize, Handedness, SprintTouchMode, isBindable, keyLabel } from '@/lib/settings/controls';
import styles from './ControlsSettingsModal.module.css';
import { AppIcon } from '@/components/icons/AppIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'keyboard' | 'touch';

const GROUPS = ['Movement', 'Survival', 'Doors & windows', 'Social'] as const;

/** Segmented single-choice control (radio group semantics). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`${styles.segment} ${value === o.value ? styles.segmentOn : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ControlsSettingsModal({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('keyboard');
  const [capturing, setCapturing] = useState<{ action: ControlAction; slot: 0 | 1 } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bindings = useControlsStore((s) => s.bindings);
  const touch = useControlsStore((s) => s.touch);
  const hydrate = useControlsStore((s) => s.hydrate);
  const setBinding = useControlsStore((s) => s.setBinding);
  const resetBindings = useControlsStore((s) => s.resetBindings);
  const setTouch = useControlsStore((s) => s.setTouch);
  const resetLayout = useControlsStore((s) => s.resetLayout);
  const setEditingLayout = useControlsStore((s) => s.setEditingLayout);
  const tabsId = useId();

  useEffect(() => {
    if (isOpen) hydrate();
  }, [isOpen, hydrate]);

  // Key capture: runs in the capture phase so neither the game nor the modal (Esc) sees the key
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setCapturing(null);
        return;
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        setBinding(capturing.action, capturing.slot, null);
        setCapturing(null);
        return;
      }
      if (!isBindable(e.code)) {
        setNotice(`${keyLabel(e.code)} is reserved (zoom, weapon slots or system keys). Pick another key.`);
        return;
      }
      const before = useControlsStore.getState().bindings;
      const owner = CONTROL_ACTIONS.find((a) => a.id !== capturing.action && before[a.id].includes(e.code));
      setBinding(capturing.action, capturing.slot, e.code);
      setNotice(owner ? `${keyLabel(e.code)} moved from “${owner.label}” — that action took your old key.` : null);
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, setBinding]);

  const close = () => {
    setCapturing(null);
    setNotice(null);
    onClose();
  };

  const startLayoutEditor = () => {
    close();
    setEditingLayout(true);
  };

  const customCount = Object.keys(touch.positions.portrait).length + Object.keys(touch.positions.landscape).length;

  return (
    <NeoModal isOpen={isOpen} onClose={close} title="Controls" maxWidth="560px">
      <div className={styles.tabs} role="tablist" aria-label="Control type">
        {(
          [
            ['keyboard', 'Keyboard'],
            ['touch', 'Touch screen'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${tabsId}-${id}`}
            aria-selected={tab === id}
            aria-controls={`${tabsId}-${id}-panel`}
            className={`${styles.tab} ${tab === id ? styles.tabOn : ''}`}
            onClick={() => {
              setTab(id);
              setCapturing(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'keyboard' ? (
        <div role="tabpanel" id={`${tabsId}-keyboard-panel`} aria-labelledby={`${tabsId}-keyboard`} className={styles.panel}>
          <p className={styles.lead}>Click a key, then press the new one. Backspace clears it, Esc cancels.</p>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          {GROUPS.map((group) => (
            <section key={group} className={styles.group}>
              <h3 className={styles.groupTitle}>{group}</h3>
              {CONTROL_ACTIONS.filter((a) => a.group === group).map((a) => (
                <div key={a.id} className={styles.row}>
                  <div className={styles.rowLabel}>
                    <span>{a.label}</span>
                    {a.hint && <small>{a.hint}</small>}
                  </div>
                  <div className={styles.keys}>
                    {([0, 1] as const).map((slot) => {
                      const active = capturing?.action === a.id && capturing.slot === slot;
                      const code = bindings[a.id][slot];
                      return (
                        <button
                          key={slot}
                          type="button"
                          className={`${styles.key} ${active ? styles.keyCapturing : ''} ${!code ? styles.keyEmpty : ''}`}
                          onClick={() => {
                            setNotice(null);
                            setCapturing(active ? null : { action: a.id, slot });
                          }}
                          aria-label={`${a.label}, ${slot === 0 ? 'primary' : 'alternate'} key: ${code ? keyLabel(code) : 'none'}. Activate to change.`}
                        >
                          {active ? 'Press a key…' : code ? keyLabel(code) : '+'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
          <div className={styles.footer}>
            <NeoButton size="sm" variant="secondary" onClick={() => resetBindings()}>
              <AppIcon name="undo" /> Reset keys
            </NeoButton>
          </div>
        </div>
      ) : (
        <div role="tabpanel" id={`${tabsId}-touch-panel`} aria-labelledby={`${tabsId}-touch`} className={styles.panel}>
          <p className={styles.lead}>For phones and tablets. Saved on this device.</p>

          <div className={styles.setting}>
            <div className={styles.settingLabel}>
              <span>Hand</span>
              <small>Puts the joystick on the other side and mirrors the buttons.</small>
            </div>
            <Segmented<Handedness>
              label="Hand"
              value={touch.hand}
              onChange={(hand) => setTouch({ hand })}
              options={[
                { value: 'right', label: 'Right-handed' },
                { value: 'left', label: 'Left-handed' },
              ]}
            />
          </div>

          <div className={styles.setting}>
            <div className={styles.settingLabel}>
              <span>Button size</span>
            </div>
            <Segmented<ControlSize>
              label="Button size"
              value={touch.size}
              onChange={(size) => setTouch({ size })}
              options={[
                { value: 'sm', label: 'Small' },
                { value: 'md', label: 'Medium' },
                { value: 'lg', label: 'Large' },
              ]}
            />
          </div>

          <div className={styles.setting}>
            <label className={styles.settingLabel} htmlFor={`${tabsId}-opacity`}>
              <span>Opacity</span>
              <small>{Math.round(touch.opacity * 100)}%</small>
            </label>
            <input
              id={`${tabsId}-opacity`}
              className={styles.range}
              type="range"
              min={35}
              max={100}
              step={5}
              value={Math.round(touch.opacity * 100)}
              onChange={(e) => setTouch({ opacity: Number(e.target.value) / 100 })}
            />
          </div>

          <div className={styles.setting}>
            <div className={styles.settingLabel}>
              <span>Sprint button</span>
              <small>Survival mode</small>
            </div>
            <Segmented<SprintTouchMode>
              label="Sprint button"
              value={touch.sprintMode}
              onChange={(sprintMode) => setTouch({ sprintMode })}
              options={[
                { value: 'toggle', label: 'Tap to toggle' },
                { value: 'hold', label: 'Hold' },
              ]}
            />
          </div>

          <div className={styles.setting}>
            <div className={styles.settingLabel}>
              <span>Button positions</span>
              <small>
                Drag each control where you want it. Portrait and landscape are saved separately
                {customCount > 0 ? ` · ${customCount} moved` : ''}.
              </small>
            </div>
            <div className={styles.inline}>
              <NeoButton size="sm" variant="primary" onClick={startLayoutEditor}>
                <AppIcon name="hand" /> Arrange
              </NeoButton>
              <NeoButton size="sm" variant="secondary" onClick={() => resetLayout()} disabled={customCount === 0}>
                <AppIcon name="undo" /> Reset
              </NeoButton>
            </div>
          </div>
        </div>
      )}
    </NeoModal>
  );
}
