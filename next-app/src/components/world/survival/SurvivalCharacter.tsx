'use client';

import React from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { ZombieHud } from '@/game/zombie/zombieMode';
import { MOODLE_INFO, type Moodle } from '@/game/zombie/survival/condition';
import type { ConsumableId } from '@/game/zombie/survival/types';
import { HealthSection } from './SurvivalHealth';
import type { SkillGroup } from '@/game/zombie/survival/skills';

const SKILL_GROUPS: SkillGroup[] = ['Combat', 'Survival', 'Crafting'];

/** Skill levels by group; skills there's no way to practise yet are dimmed. */
function SkillsSection({ skills }: { skills: ZombieHud['skills'] }) {
  return (
    <div className={styles.section}>
      <h3>Skills</h3>
      {SKILL_GROUPS.map((g) => (
        <div key={g}>
          <h4 className={styles.invGroup}>{g}</h4>
          {skills
            .filter((s) => s.group === g)
            .map((s) => (
              <div key={s.id} className={`${styles.skillRow} ${s.practisable ? '' : styles.skillIdle}`} title={`${s.effect} ${s.practice}`}>
                <span className={styles.skillName}>
                  <AppIcon name={s.icon} /> {s.label}
                  {s.book > 1 && <span className={styles.bookTag}>book ×{s.book}</span>}
                </span>
                <span className={styles.skillLvl}>Lv {s.level}</span>
                <span className={styles.meterTrack} role="progressbar" aria-label={`${s.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.progress * 100)}>
                  <span style={{ width: `${s.progress * 100}%`, backgroundColor: '#8b5cf6' }} />
                </span>
                <span />
                <span className={styles.levelHint}>{s.practisable ? `${s.effect} ${s.practice}` : s.practice}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
import styles from './survival.module.css';

// ============================================================
// SURVIVAL CHARACTER UI
// Moodle chips (inside the survival card), the character panel, the
// rest-spot prompt and the sleep overlay. Pure views over ZombieHud:
// every button calls back into WorldGame, which owns the state.
// ============================================================

const LEVEL_NAMES = ['', 'I', 'II', 'III', 'IV'];

/** Panic, stress, etc. reads "Tired II" with the chip colour ramping by severity. */
export function MoodleChips({ moodles }: { moodles: Moodle[] }) {
  if (moodles.length === 0) return null;
  return (
    <div className={styles.moodles} aria-label="Moodles">
      {moodles.map((m) => (
        <span key={m.id} className={styles.moodle} data-level={m.level}>
          <AppIcon name={MOODLE_INFO[m.id].icon} /> {MOODLE_INFO[m.id].label} {LEVEL_NAMES[m.level]}
        </span>
      ))}
    </div>
  );
}

function tempLabel(t: number): string {
  if (t < 35) return 'Hypothermic';
  if (t < 35.5) return 'Freezing';
  if (t < 36.2) return 'Chilly';
  if (t > 39.5) return 'Hyperthermic';
  if (t > 38.5) return 'Overheating';
  if (t > 37.8) return 'Warm';
  return 'Normal';
}

function weightLabel(kg: number): string {
  if (kg < 60) return 'Very underweight';
  if (kg < 75) return 'Underweight';
  if (kg > 105) return 'Obese';
  if (kg > 90) return 'Overweight';
  return 'Normal';
}

function Meter({ label, value, color, invert = false }: { label: string; value: number; color: string; invert?: boolean }) {
  // `invert`: high is bad (fatigue, stress…) so the bar warns as it fills
  const warn = invert ? value >= 75 : value < 25;
  return (
    <div className={styles.meterRow} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span className={styles.meterLabel}>{label}</span>
      <span className={`${styles.meterTrack} ${warn ? styles.meterWarn : ''}`}>
        <span style={{ width: `${value}%`, backgroundColor: color }} />
      </span>
      <span className={styles.meterValue}>{value}</span>
    </div>
  );
}

function LevelRow({ label, icon, level, progress, hint }: { label: string; icon: 'footprints' | 'dumbbell'; level: number; progress: number; hint: string }) {
  return (
    <div className={styles.levelRow}>
      <div className={styles.levelHead}>
        <span>
          <AppIcon name={icon} /> {label}
        </span>
        <strong>Lv {level}</strong>
      </div>
      <span className={styles.meterTrack} role="progressbar" aria-label={`${label} progress to next level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${progress * 100}%`, backgroundColor: '#8b5cf6' }} />
      </span>
      <span className={styles.levelHint}>{hint}</span>
    </div>
  );
}

export interface CharacterPanelProps {
  hud: ZombieHud;
  sleepKey: string;
  panelKey: string;
  onClose: () => void;
  onSleep: () => void;
  /** Bandage / disinfect / splint / painkillers from the bag. */
  onUseSupply: (id: ConsumableId) => void;
}

export function CharacterPanel({ hud, sleepKey, panelKey, onClose, onSleep, onUseSupply }: CharacterPanelProps) {
  const c = hud.character;
  const where = hud.restSpot ?? 'floor';
  const sleepLabel = hud.asleep ? 'Get up' : where === 'floor' ? 'Sleep on the floor' : `Sleep on the ${where}`;
  return (
    <section
      className={styles.panel}
      aria-label="Character"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header className={styles.panelHead}>
        <h2>
          <AppIcon name="user" /> Character
        </h2>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={`Close character panel (${panelKey})`}>
          <AppIcon name="close" />
        </button>
      </header>

      <div className={styles.section}>
        <div className={styles.whoLine}>
          <AppIcon name={hud.survivor.occupationIcon} /> {hud.survivor.name} · {hud.survivor.occupation}
        </div>
        {hud.survivor.traits.length > 0 && (
          <div className={styles.whoLine}>
            {hud.survivor.traits.map((t) => (
              <span key={t.label} className={styles.traitTag} style={{ backgroundColor: t.positive ? '#bbf7d0' : '#fecaca' }}>
                {t.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <HealthSection injuries={hud.injuries} onUseSupply={onUseSupply} />

      <div className={styles.section}>
        <h3>Body</h3>
        <Meter label="Health" value={hud.hp} color="#10b981" />
        <Meter label="Hunger" value={hud.hunger} color="#f59e0b" />
        <Meter label="Thirst" value={hud.hydration} color="#38bdf8" />
        <Meter label="Stamina" value={hud.stamina} color="#facc15" />
        <Meter label="Fatigue" value={c.fatigue} color="#6366f1" invert />
        <dl className={styles.facts}>
          <div>
            <dt><AppIcon name={c.bodyTemp < 36.2 ? 'thermometerSnowflake' : 'thermometerSun'} /> Temperature</dt>
            <dd>{c.bodyTemp.toFixed(1)} °C · {tempLabel(c.bodyTemp)}</dd>
          </div>
          {c.wet > 0 && (
            <div>
              <dt><AppIcon name="cloudRain" /> Wetness</dt>
              <dd>{c.wet}% · {c.wet >= 70 ? 'soaked' : c.wet >= 40 ? 'wet' : 'damp'}</dd>
            </div>
          )}
          <div>
            <dt><AppIcon name="weight" /> Weight</dt>
            <dd>{c.bodyWeight.toFixed(1)} kg · {weightLabel(c.bodyWeight)}</dd>
          </div>
          <div>
            <dt><AppIcon name="backpack" /> Carrying</dt>
            <dd>{c.carryKg.toFixed(1)} / {c.carryMaxKg} kg</dd>
          </div>
        </dl>
      </div>

      <div className={styles.section}>
        <h3>Mind</h3>
        <Meter label="Stress" value={c.stress} color="#f97316" invert />
        <Meter label="Panic" value={c.panic} color="#ef4444" invert />
        <Meter label="Boredom" value={c.boredom} color="#a1a1aa" invert />
        <Meter label="Unhappy" value={c.unhappiness} color="#64748b" invert />
      </div>

      <div className={styles.section}>
        <h3>Physique</h3>
        <LevelRow label="Fitness" icon="footprints" level={c.fitness.level} progress={c.fitness.progress} hint="Cheaper sprinting, faster stamina. Train by sprinting and fighting." />
        <LevelRow label="Strength" icon="dumbbell" level={c.strength.level} progress={c.strength.progress} hint="Carry more. Train with melee and heavy loads." />
      </div>

      <SkillsSection skills={hud.skills} />

      {hud.moodles.length > 0 && (
        <div className={styles.section}>
          <h3>How you feel</h3>
          <ul className={styles.moodleList}>
            {hud.moodles.map((m) => (
              <li key={m.id}>
                <span className={styles.moodle} data-level={m.level}>
                  <AppIcon name={MOODLE_INFO[m.id].icon} /> {MOODLE_INFO[m.id].label} {LEVEL_NAMES[m.level]}
                </span>
                <span className={styles.moodleHint}>{MOODLE_INFO[m.id].hint}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.panelFoot}>
        <button type="button" className={styles.actionBtn} onClick={onSleep} disabled={(!hud.asleep && !!c.sleepBlocked) || hud.dead}>
          <AppIcon name="bed" /> {sleepLabel} <kbd>{sleepKey}</kbd>
        </button>
        {!hud.asleep && c.sleepBlocked && <p className={styles.blocked}>{c.sleepBlocked}</p>}
      </div>
    </section>
  );
}

/** Night-time veil while asleep: the HUD stays visible above it. */
export function SleepOverlay({ hud, onWake }: { hud: ZombieHud; onWake: () => void }) {
  if (!hud.asleep) return null;
  const where = hud.asleep.spot === 'floor' ? 'on the floor' : `on the ${hud.asleep.spot}`;
  return (
    <div className={styles.sleepVeil}>
      <div className={styles.sleepCard} role="status" aria-live="polite" onPointerDown={(e) => e.stopPropagation()}>
        <span className={styles.sleepIcon} aria-hidden="true">
          <AppIcon name="moonStar" />
        </span>
        <strong>Sleeping {where}</strong>
        <span className={styles.sleepClock}>{hud.clock}</span>
        <div className={styles.meterRow} role="meter" aria-label="Fatigue" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hud.character.fatigue}>
          <span className={styles.meterLabel}>Fatigue</span>
          <span className={styles.meterTrack}>
            <span style={{ width: `${hud.character.fatigue}%`, backgroundColor: '#6366f1' }} />
          </span>
          <span className={styles.meterValue}>{hud.character.fatigue}</span>
        </div>
        {hud.sleepers && (
          <span className={styles.sleepHint}>
            {hud.sleepers.asleep} of {hud.sleepers.total} survivors asleep{hud.sleepers.asleep < hud.sleepers.total ? ': time only speeds up once everyone sleeps' : ''}
          </span>
        )}
        <span className={styles.sleepHint}>Any move key wakes you. So will zombies.</span>
        <button type="button" className={styles.actionBtn} onClick={onWake}>
          <AppIcon name="sun" /> Get up
        </button>
      </div>
    </div>
  );
}
