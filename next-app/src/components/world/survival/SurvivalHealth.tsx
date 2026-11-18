'use client';

import React from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { BodyHud, PartStatus } from '@/game/zombie/zombieMode';
import type { BodyPart } from '@/game/zombie/survival/body';
import type { ConsumableId } from '@/game/zombie/survival/types';
import styles from './survival.module.css';

// ============================================================
// SURVIVAL HEALTH PANEL
// Body diagram (front view: your left is on the right), wound list,
// pain, visible sickness, and treatment buttons that use the item
// from your bag. Pure view over BodyHud.
// ============================================================

type Shape = { kind: 'circle'; cx: number; cy: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number };

const SHAPES: Record<BodyPart, Shape> = {
  head: { kind: 'circle', cx: 30, cy: 11, r: 9 },
  neck: { kind: 'rect', x: 26, y: 20, w: 8, h: 6, rx: 2 },
  torso: { kind: 'rect', x: 18, y: 27, w: 24, h: 34, rx: 4 },
  rightArm: { kind: 'rect', x: 8, y: 28, w: 8, h: 27, rx: 3 },
  leftArm: { kind: 'rect', x: 44, y: 28, w: 8, h: 27, rx: 3 },
  rightHand: { kind: 'rect', x: 8, y: 57, w: 8, h: 8, rx: 3 },
  leftHand: { kind: 'rect', x: 44, y: 57, w: 8, h: 8, rx: 3 },
  rightLeg: { kind: 'rect', x: 19, y: 63, w: 10, h: 38, rx: 3 },
  leftLeg: { kind: 'rect', x: 31, y: 63, w: 10, h: 38, rx: 3 },
  rightFoot: { kind: 'rect', x: 17, y: 103, w: 12, h: 7, rx: 2 },
  leftFoot: { kind: 'rect', x: 31, y: 103, w: 12, h: 7, rx: 2 },
};

const PART_LABEL: Record<BodyPart, string> = {
  head: 'Head',
  neck: 'Neck',
  torso: 'Torso',
  leftArm: 'Left arm',
  rightArm: 'Right arm',
  leftHand: 'Left hand',
  rightHand: 'Right hand',
  leftLeg: 'Left leg',
  rightLeg: 'Right leg',
  leftFoot: 'Left foot',
  rightFoot: 'Right foot',
};

const STATUS_FILL: Record<PartStatus, string> = {
  bandaged: '#e5e7eb',
  splinted: '#c4b5fd',
  scratched: '#fde68a',
  wounded: '#fb923c',
  broken: '#a855f7',
  bleeding: '#ef4444',
};

const STATUS_TEXT: Record<PartStatus, string> = {
  bandaged: 'bandaged',
  splinted: 'splinted',
  scratched: 'scratched',
  wounded: 'open wound',
  broken: 'broken',
  bleeding: 'bleeding',
};

const SICK_TEXT: Record<Exclude<BodyHud['sick'], 'none'>, string> = {
  queasy: 'Queasy',
  feverish: 'Feverish',
  terminal: 'Dying',
};

function BodyDiagram({ parts }: { parts: BodyHud['parts'] }) {
  const injured = (Object.entries(parts) as [BodyPart, PartStatus][]).map(([p, s]) => `${PART_LABEL[p]}: ${STATUS_TEXT[s]}`);
  return (
    <svg
      className={styles.bodyDiagram}
      viewBox="0 0 60 112"
      role="img"
      aria-label={injured.length ? `Injuries: ${injured.join(', ')}` : 'No injuries'}
    >
      {(Object.keys(SHAPES) as BodyPart[]).map((p) => {
        const s = SHAPES[p];
        const status = parts[p];
        const fill = status ? STATUS_FILL[status] : 'var(--card-inner, #f3f4f6)';
        const title = `${PART_LABEL[p]}${status ? `: ${STATUS_TEXT[status]}` : ''}`;
        return s.kind === 'circle' ? (
          <circle key={p} cx={s.cx} cy={s.cy} r={s.r} fill={fill} className={status === 'bleeding' ? styles.partBleeding : undefined}>
            <title>{title}</title>
          </circle>
        ) : (
          <rect key={p} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} fill={fill} className={status === 'bleeding' ? styles.partBleeding : undefined}>
            <title>{title}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export interface HealthSectionProps {
  injuries: BodyHud;
  onUseSupply: (id: ConsumableId) => void;
}

const TREATMENTS: { id: ConsumableId; label: string; icon: 'bandage' | 'flask' | 'bone' | 'pharmacy'; can: keyof BodyHud }[] = [
  { id: 'bandage', label: 'Bandage', icon: 'bandage', can: 'canBandage' },
  { id: 'disinfectant', label: 'Disinfect', icon: 'flask', can: 'canDisinfect' },
  { id: 'splint', label: 'Splint', icon: 'bone', can: 'canSplint' },
  { id: 'painkillers', label: 'Painkillers', icon: 'pharmacy', can: 'canPainkill' },
];

export function HealthSection({ injuries, onUseSupply }: HealthSectionProps) {
  const hurt = injuries.wounds.length > 0 || injuries.fractures.length > 0;
  return (
    <div className={styles.section}>
      <h3>Health</h3>
      <div className={styles.healthRow}>
        <BodyDiagram parts={injuries.parts} />
        <div className={styles.injuryList}>
          {!hurt && <p className={styles.injuryNone}>No injuries</p>}
          <ul>
            {injuries.wounds.map((w) => (
              <li key={w.id} className={w.bleeding ? styles.injuryBleeding : undefined}>
                <AppIcon name={w.bleeding ? 'droplets' : 'bandage'} /> <strong>{w.part}</strong> {w.label}
              </li>
            ))}
            {injuries.fractures.map((f) => (
              <li key={f.part}>
                <AppIcon name="bone" /> <strong>{f.part}</strong> Fracture · {f.splinted ? 'splinted' : 'not splinted'}
              </li>
            ))}
          </ul>
          <div className={styles.meterRow} role="meter" aria-label="Pain" aria-valuemin={0} aria-valuemax={100} aria-valuenow={injuries.pain}>
            <span className={styles.meterLabel}>Pain</span>
            <span className={`${styles.meterTrack} ${injuries.pain >= 60 ? styles.meterWarn : ''}`}>
              <span style={{ width: `${injuries.pain}%`, backgroundColor: '#e11d48' }} />
            </span>
            <span className={styles.meterValue}>{injuries.pain}</span>
          </div>
          {injuries.painkillers && <p className={styles.injuryNote}>Painkillers are working</p>}
          {injuries.sick !== 'none' && (
            <p className={styles.injurySick}>
              <AppIcon name="thermometer" /> {SICK_TEXT[injuries.sick]}
            </p>
          )}
        </div>
      </div>
      <div className={styles.treatments} role="group" aria-label="Treatments">
        {TREATMENTS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.treatBtn}
            disabled={!injuries[t.can]}
            onClick={() => onUseSupply(t.id)}
            title={injuries[t.can] ? `Use ${t.label}` : `${t.label}: none in your bag, or nothing to treat`}
          >
            <AppIcon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Wear left on the equipped melee weapon. */
export function DurabilityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className={styles.durability} role="meter" aria-label="Weapon condition" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} title={`Condition ${pct}%`}>
      <span style={{ width: `${pct}%`, backgroundColor: value < 0.25 ? '#ef4444' : value < 0.5 ? '#f59e0b' : '#22c55e' }} />
    </span>
  );
}
