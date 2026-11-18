'use client';

import React, { useState } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import { PRESETS, PRESET_INFO, RULE_RANGES, type PresetId, type WorldRules } from '@/game/zombie/survival/balance';
import type { SaveStatus } from '@/lib/services/survivalSave';
import type { PerfStats } from '@/game/WorldGame';
import styles from './survival.module.css';

// ============================================================
// SURVIVAL WORLD (menu tab): the space's difficulty (preset or custom,
// saved for the whole space; only its owner / admins may change it, the
// database refuses everyone else) and how saving is going.
// Also the small performance overlay.
// ============================================================

const PRESET_ORDER: PresetId[] = ['beginner', 'normal', 'survival', 'hardcore', 'custom'];

function statusLine(label: string, s: SaveStatus | null): string {
  if (!s) return `${label}: not saved yet`;
  const at = new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return s.ok ? `${label}: saved at ${at}` : `${label}: ${s.error} (${at})`;
}

export function WorldTab({
  rules,
  saves,
  onSaveRules,
  onSaveNow,
}: {
  rules: WorldRules;
  saves: { world: SaveStatus | null; player: SaveStatus | null };
  onSaveRules: (r: WorldRules) => Promise<string | null>;
  onSaveNow: () => void;
}) {
  const [draft, setDraft] = useState<WorldRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shown = draft ?? rules;
  const edit = (r: WorldRules) => {
    setDraft(r);
    setMessage(null);
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const err = await onSaveRules(draft);
    setBusy(false);
    if (err) setMessage(err === 'Not allowed to save here' ? 'Only the space owner or an admin can change the rules.' : err);
    else {
      setDraft(null);
      setMessage('Saved. Everyone in the space now plays by these rules.');
    }
  };
  return (
    <div className={styles.settingsList}>
      <h3 className={styles.controlsGroup}>Difficulty</h3>
      <div className={styles.presetRow} role="radiogroup" aria-label="Difficulty preset">
        {PRESET_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={shown.preset === p}
            className={shown.preset === p ? styles.presetOn : undefined}
            title={PRESET_INFO[p].description}
            onClick={() => edit(p === 'custom' ? { ...shown, preset: 'custom' } : { ...PRESETS[p] })}
          >
            {PRESET_INFO[p].label}
          </button>
        ))}
      </div>
      <p className={styles.invStats}>{PRESET_INFO[shown.preset].description}</p>
      {shown.preset === 'custom' && (
        <div className={styles.ruleSliders}>
          {(Object.keys(RULE_RANGES) as (keyof typeof RULE_RANGES)[]).map((k) => {
            const r = RULE_RANGES[k];
            return (
              <label key={k} className={styles.ruleRow}>
                <span>
                  {r.label} <strong>×{shown[k].toFixed(2).replace(/\.?0+$/, '')}</strong>
                </span>
                <input type="range" min={r.min} max={r.max} step={r.step} value={shown[k]} onChange={(e) => edit({ ...shown, [k]: Number(e.target.value) })} />
              </label>
            );
          })}
          <label className={styles.ruleRow}>
            <span>
              Power fails on day <strong>{shown.powerOffDays[0]}–{shown.powerOffDays[1]}</strong>
            </span>
            <input type="range" min={1} max={30} value={shown.powerOffDays[0]} onChange={(e) => edit({ ...shown, powerOffDays: [Number(e.target.value), Math.max(Number(e.target.value), shown.powerOffDays[1])] })} />
          </label>
          <label className={styles.ruleRow}>
            <span>
              Water fails on day <strong>{shown.waterOffDays[0]}–{shown.waterOffDays[1]}</strong>
            </span>
            <input type="range" min={1} max={30} value={shown.waterOffDays[0]} onChange={(e) => edit({ ...shown, waterOffDays: [Number(e.target.value), Math.max(Number(e.target.value), shown.waterOffDays[1])] })} />
          </label>
          <label className={styles.ruleRow}>
            <span>Weather</span>
            <select value={shown.weather} onChange={(e) => edit({ ...shown, weather: e.target.value as WorldRules['weather'] })}>
              <option value="calm">Calm</option>
              <option value="normal">Normal</option>
              <option value="stormy">Stormy</option>
            </select>
          </label>
        </div>
      )}
      {draft && (
        <div className={styles.craftFilters}>
          <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => void save()}>
            <AppIcon name="save" /> {busy ? 'Saving…' : 'Apply to this space'}
          </button>
          <button type="button" className={styles.actionBtn} disabled={busy} onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      )}
      {message && <p className={styles.invStats}>{message}</p>}

      <h3 className={styles.controlsGroup}>Saving</h3>
      <p className={styles.invStats}>
        The world saves every minute (from whoever is hosting) and your survivor every 30 seconds, and both when you leave. Death is permanent: a
        new survivor starts fresh.
      </p>
      <p className={styles.invStats}>{statusLine('World', saves.world)}</p>
      <p className={styles.invStats}>{statusLine('Your survivor', saves.player)}</p>
      <button type="button" className={styles.actionBtn} onClick={onSaveNow}>
        <AppIcon name="save" /> Save now
      </button>
    </div>
  );
}

export function PerfOverlay({ stats }: { stats: PerfStats }) {
  return (
    <div className={styles.perfOverlay} aria-label="Performance">
      <span>{stats.fps} fps</span>
      <span>
        update {stats.updateMs} ms · draw {stats.renderMs} ms
      </span>
      <span>
        {stats.role} · {stats.zombies} zombies · {stats.vehicles} cars · {stats.structures} builds
      </span>
      {stats.role === 'host' && (
        <span>
          {(stats.bytesPerSecond / 1024).toFixed(1)} KB/s out · {stats.droppedRequests} dropped
        </span>
      )}
    </div>
  );
}
