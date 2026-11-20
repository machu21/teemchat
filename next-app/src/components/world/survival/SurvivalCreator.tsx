'use client';

import React, { useMemo, useState } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import type { AvatarConfig, BottomStyle, ExtendedHairStyle, FacialHair, TopStyle } from '@/lib/models/avatar';
import { switchAvatarGender } from '@/lib/models/avatar';
import {
  NAME_MAX,
  OCCUPATIONS,
  OCCUPATION_ORDER,
  TRAITS,
  TRAIT_ORDER,
  buildErrors,
  canAddTrait,
  parseBuild,
  pointsLeft,
  type SurvivorBuild,
  type TraitId,
} from '@/game/zombie/survival/survivor';
import { SKILLS, type SkillId } from '@/game/zombie/survival/skills';
import styles from './survival.module.css';

// ============================================================
// SURVIVOR CREATION
// Name, look (gender presentation, skin, hair, clothes), occupation and
// traits on a point budget. Shown when you enter a survival space and
// again after every death. The last build is remembered on this device.
// ============================================================

const STORAGE_KEY = 'teemchat.survivor.v1';

const SKIN = ['#ffe2cc', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'];
const HAIR_COLORS = ['#2b2530', '#5b4636', '#a0522d', '#d4a017', '#e5e5e5', '#b91c1c'];
const CLOTH_COLORS = ['#4a86d8', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#374151', '#e5e7eb', '#0f766e'];
const PANTS_COLORS = ['#1f2937', '#374151', '#3b4a6b', '#4a3b2e', '#6b7280', '#14532d'];
const HAIR_STYLES: ExtendedHairStyle[] = ['short', 'buzz', 'spiky', 'side_part', 'curly', 'afro', 'long', 'ponytail', 'bob', 'bun', 'wavy', 'mohawk', 'bald'];
const TOPS: TopStyle[] = ['tshirt', 'hoodie', 'jacket', 'sweater', 'polo', 'shirt_tie', 'blouse'];
const BOTTOMS: BottomStyle[] = ['pants', 'shorts', 'skirt'];
const BEARDS: FacialHair[] = ['none', 'stubble', 'beard', 'mustache', 'goatee'];

const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

interface Saved {
  build: SurvivorBuild;
  look: AvatarConfig;
}

function loadSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { build?: unknown; look?: unknown };
    const build = parseBuild(parsed.build);
    if (!build || !parsed.look || typeof parsed.look !== 'object') return null;
    return { build, look: parsed.look as AvatarConfig };
  } catch {
    return null;
  }
}

function save(s: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode / blocked storage: the creator still works, it just won't remember
  }
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value?: string; onPick: (c: string) => void }) {
  return (
    <div className={styles.creatorRow}>
      <span className={styles.creatorLabel}>{label}</span>
      <div className={styles.swatches} role="radiogroup" aria-label={label}>
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            className={`${styles.swatch} ${value === c ? styles.swatchOn : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}

function Choice<T extends string>({ label, options, value, onPick }: { label: string; options: T[]; value?: T; onPick: (v: T) => void }) {
  return (
    <label className={styles.creatorRow}>
      <span className={styles.creatorLabel}>{label}</span>
      <select className={styles.creatorSelect} value={value} onChange={(e) => onPick(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {pretty(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

function skillLine(skills: Partial<Record<SkillId | 'fitness' | 'strength', number>>): string {
  return (Object.entries(skills) as [SkillId | 'fitness' | 'strength', number][])
    .map(([k, v]) => `${k === 'fitness' ? 'Fitness' : k === 'strength' ? 'Strength' : SKILLS[k].label} +${v}`)
    .join(' · ');
}

export interface SurvivorCreatorProps {
  /** Your current look and name, used when nothing is saved yet. */
  initialLook: AvatarConfig;
  defaultName: string;
  /** After a death: a different heading. */
  again: boolean;
  /** Starts the survivor; returns problems (empty = started). */
  onStart: (build: SurvivorBuild, look: AvatarConfig) => string[];
}

export function SurvivorCreator({ initialLook, defaultName, again, onStart }: SurvivorCreatorProps) {
  const saved = useMemo(() => (typeof window === 'undefined' ? null : loadSaved()), []);
  const [build, setBuild] = useState<SurvivorBuild>(
    () => saved?.build ?? { name: defaultName.slice(0, NAME_MAX) || 'Survivor', occupation: 'unemployed', traits: [] }
  );
  const [look, setLook] = useState<AvatarConfig>(() => saved?.look ?? initialLook);
  const [problems, setProblems] = useState<string[]>([]);
  const points = pointsLeft(build);
  const errors = buildErrors(build);
  const setL = (patch: Partial<AvatarConfig>) => setLook((l) => ({ ...l, ...patch }));
  const toggleTrait = (t: TraitId) =>
    setBuild((b) => (b.traits.includes(t) ? { ...b, traits: b.traits.filter((x) => x !== t) } : canAddTrait(b, t) ? { ...b, traits: [...b.traits, t] } : b));

  const start = () => {
    const errs = onStart(build, look);
    setProblems(errs);
    if (!errs.length) save({ build, look });
  };

  const positive = TRAIT_ORDER.filter((t) => TRAITS[t].cost > 0);
  const negative = TRAIT_ORDER.filter((t) => TRAITS[t].cost <= 0);

  return (
    <div className={styles.creatorVeil} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <section className={styles.creator} role="dialog" aria-modal="true" aria-label="Create your survivor">
        <header className={styles.creatorHead}>
          <h2>
            <AppIcon name="user" /> {again ? 'A new survivor' : 'Create your survivor'}
          </h2>
          <p>{again ? 'Your last survivor is gone. Their things are still on the body.' : 'Pick who you were before the outbreak.'}</p>
        </header>

        <div className={styles.creatorBody}>
          <div className={styles.creatorSection}>
            <h3>Who</h3>
            <div className={styles.creatorWho}>
              <div className={styles.creatorPreview} aria-hidden="true">
                <PixelAvatar config={look} size={96} bustOnly={false} />
              </div>
              <div className={styles.creatorFields}>
                <label className={styles.creatorRow}>
                  <span className={styles.creatorLabel}>Name</span>
                  <input
                    className={styles.creatorInput}
                    value={build.name}
                    maxLength={NAME_MAX}
                    onChange={(e) => setBuild((b) => ({ ...b, name: e.target.value }))}
                    autoComplete="off"
                  />
                </label>
                <div className={styles.creatorRow}>
                  <span className={styles.creatorLabel}>Presents as</span>
                  <div className={styles.creatorToggle} role="radiogroup" aria-label="Gender presentation">
                    {(['male', 'female'] as const).map((g) => (
                      <button key={g} type="button" role="radio" aria-checked={look.gender === g} className={look.gender === g ? styles.toggleOn : undefined} onClick={() => setLook((l) => switchAvatarGender(l, g))}>
                        {g === 'male' ? 'Masculine' : 'Feminine'}
                      </button>
                    ))}
                  </div>
                </div>
                <Swatches label="Skin" colors={SKIN} value={look.skinColor} onPick={(c) => setL({ skinColor: c })} />
                <Choice label="Hair" options={HAIR_STYLES} value={look.hairStyle} onPick={(v) => setL({ hairStyle: v })} />
                <Swatches label="Hair colour" colors={HAIR_COLORS} value={look.hairColor} onPick={(c) => setL({ hairColor: c })} />
                {look.gender !== 'female' && <Choice label="Facial hair" options={BEARDS} value={look.facialHair ?? 'none'} onPick={(v) => setL({ facialHair: v })} />}
                <Choice label="Top" options={TOPS} value={look.topStyle ?? 'tshirt'} onPick={(v) => setL({ topStyle: v })} />
                <Swatches label="Top colour" colors={CLOTH_COLORS} value={look.shirtColor} onPick={(c) => setL({ shirtColor: c })} />
                <Choice label="Bottoms" options={BOTTOMS} value={look.bottomStyle ?? 'pants'} onPick={(v) => setL({ bottomStyle: v })} />
                <Swatches label="Bottoms colour" colors={PANTS_COLORS} value={look.bottomColor} onPick={(c) => setL({ bottomColor: c })} />
              </div>
            </div>
          </div>

          <div className={styles.creatorSection}>
            <h3>Occupation</h3>
            <div className={styles.occGrid} role="radiogroup" aria-label="Occupation">
              {OCCUPATION_ORDER.map((id) => {
                const o = OCCUPATIONS[id];
                const on = build.occupation === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`${styles.occCard} ${on ? styles.occOn : ''}`}
                    onClick={() => setBuild((b) => ({ ...b, occupation: id }))}
                  >
                    <span className={styles.occHead}>
                      <AppIcon name={o.icon} /> {o.label}
                      <span className={styles.occPoints}>{o.points > 0 ? `+${o.points}` : o.points}</span>
                    </span>
                    <span className={styles.occDesc}>{o.description}</span>
                    {Object.keys(o.skills).length > 0 && <span className={styles.occSkills}>{skillLine(o.skills)}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.creatorSection}>
            <h3>Traits</h3>
            <div className={styles.traitCols}>
              {[
                { title: 'Good (cost points)', list: positive },
                { title: 'Bad (give points)', list: negative },
              ].map((col) => (
                <div key={col.title}>
                  <h4 className={styles.invGroup}>{col.title}</h4>
                  <ul className={styles.traitList}>
                    {col.list.map((t) => {
                      const on = build.traits.includes(t);
                      const allowed = on || canAddTrait(build, t);
                      return (
                        <li key={t}>
                          <button
                            type="button"
                            aria-pressed={on}
                            disabled={!allowed}
                            className={`${styles.traitBtn} ${on ? (TRAITS[t].cost > 0 ? styles.traitGood : styles.traitBad) : ''}`}
                            onClick={() => toggleTrait(t)}
                            title={TRAITS[t].description}
                          >
                            <span className={styles.traitName}>{TRAITS[t].label}</span>
                            <span className={styles.traitCost}>{TRAITS[t].cost > 0 ? `−${TRAITS[t].cost}` : `+${-TRAITS[t].cost}`}</span>
                            <span className={styles.traitDesc}>{TRAITS[t].description}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className={styles.creatorFoot}>
          <span className={`${styles.points} ${points < 0 ? styles.pointsBad : ''}`} aria-live="polite">
            {points} point{points === 1 ? '' : 's'} left
          </span>
          {(problems.length ? problems : errors).slice(0, 2).map((p) => (
            <span key={p} className={styles.blocked}>
              {p}
            </span>
          ))}
          <button type="button" className={styles.actionBtn} onClick={start} disabled={errors.length > 0}>
            <AppIcon name="play" /> Start surviving
          </button>
        </footer>
      </section>
    </div>
  );
}
