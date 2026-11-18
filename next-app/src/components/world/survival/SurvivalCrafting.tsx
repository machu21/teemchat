'use client';

import React, { useState } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { BuildHud, RecipeHud } from '@/game/zombie/zombieMode';
import { RECIPE_CATEGORIES, type RecipeCategory, type RecipeId } from '@/game/zombie/survival/crafting';
import styles from './survival.module.css';
import { SearchBox } from './SurvivalInventory';

// ============================================================
// SURVIVAL CRAFTING & BUILDING
// The crafting screen (K) lists every recipe by category: what it needs
// (materials, tools, skill, workbench), what you're missing, and how long
// it takes. Structures go into placement: a ghost on the tile you face,
// E or "Build here" to put it up. Bottom prompts show placement, progress,
// a nearby structure (Dismantle) and whose safehouse you're in.
// ============================================================

export interface CraftingPanelProps {
  recipes: RecipeHud[];
  build: BuildHud;
  craftKey: string;
  onCraft: (id: RecipeId) => void;
  onClaim: () => void;
  onRelease: () => void;
  onClose: () => void;
}

export function CraftingPanel({ recipes, build, craftKey, onCraft, onClaim, onRelease, onClose }: CraftingPanelProps) {
  const [tab, setTab] = useState<RecipeCategory>('Carpentry');
  const [query, setQuery] = useState('');
  const [canMake, setCanMake] = useState(false);
  // Searching or "can make now" looks across every category
  const q = query.trim().toLowerCase();
  const list = recipes.filter((r) => (q || canMake ? true : r.category === tab) && (!canMake || r.ok) && (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)));
  const readyCount = recipes.filter((r) => r.ok).length;
  const sh = build.safehouse;
  return (
    <section className={styles.invPanel} aria-label="Crafting" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className={styles.panelHead}>
        <h2>
          <AppIcon name="hammer" /> Crafting
        </h2>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={`Close crafting (${craftKey})`}>
          <AppIcon name="close" />
        </button>
      </header>
      <div className={styles.craftTabs} role="tablist" aria-label="Recipe categories">
        {RECIPE_CATEGORIES.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={tab === c && !q && !canMake} className={tab === c && !q && !canMake ? styles.toggleOn : undefined} onClick={() => {
            setTab(c);
            setQuery('');
            setCanMake(false);
          }}>
            {c}
          </button>
        ))}
      </div>
      <div className={styles.craftFilters}>
        <SearchBox value={query} onChange={setQuery} label="Find a recipe" />
        <button type="button" className={canMake ? styles.toggleOn : undefined} aria-pressed={canMake} onClick={() => setCanMake((v) => !v)}>
          Can make now ({readyCount})
        </button>
      </div>
      <div className={styles.invList}>
        {list.length === 0 && <p className={styles.invStats}>{canMake ? 'Nothing you can make right now.' : 'No recipes match.'}</p>}
        <ul>
          {list.map((r) => (
            <li key={r.id} className={`${styles.recipe} ${r.known ? '' : styles.skillIdle}`}>
              <div className={styles.recipeHead}>
                <span className={styles.invIcon} aria-hidden="true">
                  <AppIcon name={r.icon} />
                </span>
                <strong>{r.name}</strong>
                {r.structure && <span className={styles.invTag}>build</span>}
                <span className={styles.recipeTime}>{r.seconds}s</span>
              </div>
              <p className={styles.recipeDesc}>{r.description}</p>
              <p className={styles.recipeNeeds}>
                {r.inputs.map((i) => (
                  <span key={i.name} className={i.have >= i.qty ? styles.needOk : styles.needMissing}>
                    {i.name} {i.have}/{i.qty}
                  </span>
                ))}
                {r.tools.map((t) => (
                  <span key={t} className={styles.needTool}>
                    <AppIcon name="wrench" /> {t}
                  </span>
                ))}
                {r.skill && <span className={styles.needTool}>{r.skill}</span>}
                {r.workbench && <span className={styles.needTool}>Workbench</span>}
              </p>
              {!r.ok && <p className={styles.blocked}>{r.missing[0]}</p>}
              <button type="button" className={styles.actionBtn} disabled={!r.ok} onClick={() => onCraft(r.id)}>
                {r.structure ? 'Place' : 'Make'}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.panelFoot}>
        {sh ? (
          sh.owner === 'you' ? (
            <button type="button" className={styles.invActionBtn} onClick={onRelease}>
              <AppIcon name="house" /> Give up {sh.name} as your safehouse
            </button>
          ) : sh.owner ? (
            <p className={styles.injuryNote}>
              <AppIcon name="house" /> {sh.name} is {sh.owner}&apos;s safehouse.
            </p>
          ) : (
            <>
              <button type="button" className={styles.invActionBtn} onClick={onClaim} disabled={!!sh.problem}>
                <AppIcon name="house" /> Claim {sh.name} as your safehouse
              </button>
              {sh.problem && <p className={styles.blocked}>{sh.problem}</p>}
              <p className={styles.levelHint}>No zombies spawn inside your safehouse, and only you can build there.{build.mine ? ' Claiming here gives up your current one.' : ''}</p>
            </>
          )
        ) : (
          <p className={styles.levelHint}>Go inside a building to claim it as your safehouse.</p>
        )}
      </div>
    </section>
  );
}

export interface BuildPromptsProps {
  build: BuildHud;
  interactKey: string;
  onConfirm: () => void;
  onCancel: () => void;
  onDismantle: () => void;
}

/** Chips for the bottom prompt stack: placing, progress, a nearby structure, safehouse status. */
export function BuildPrompts({ build, interactKey, onConfirm, onCancel, onDismantle }: BuildPromptsProps) {
  const chips: React.ReactNode[] = [];
  if (build.progress) {
    chips.push(
      <div key="progress" className={styles.promptChip} role="status" aria-label={`${build.progress.label}: ${Math.round(build.progress.value * 100)}%`}>
        <span className={styles.restLabel}>
          <AppIcon name="hammer" /> {build.progress.label}
        </span>
        <span className={styles.meterTrack} style={{ width: 90 }}>
          <span style={{ width: `${build.progress.value * 100}%`, backgroundColor: '#f59e0b' }} />
        </span>
      </div>
    );
  }
  if (build.placing) {
    chips.push(
      <div key="placing" className={styles.promptChip} role="group" aria-label="Placing">
        <span className={styles.restLabel}>
          <AppIcon name={build.placing.icon} /> {build.placing.label}
        </span>
        <button type="button" className={styles.actionBtn} onClick={onConfirm} disabled={!build.placing.valid}>
          <kbd>{interactKey}</kbd> Build here
        </button>
        <button type="button" className={styles.invActionBtn} onClick={onCancel}>
          Cancel
        </button>
        {build.placing.reason && <span className={styles.blocked}>{build.placing.reason}</span>}
      </div>
    );
  } else if (build.near) {
    chips.push(
      <div key="near" className={styles.promptChip} role="group" aria-label={build.near.label}>
        <span className={styles.restLabel}>
          <AppIcon name={build.near.icon} /> {build.near.label}
          {build.near.hp !== null && ` · ${Math.round(build.near.hp * 100)}%`}
        </span>
        <button type="button" className={styles.invActionBtn} onClick={onDismantle} title={build.near.problem ?? undefined} disabled={!!build.near.problem}>
          Dismantle
        </button>
      </div>
    );
  }
  if (build.safehouse?.owner) {
    chips.push(
      <div key="safehouse" className={styles.promptChip} role="status">
        <span className={styles.restLabel}>
          <AppIcon name="house" /> {build.safehouse.owner === 'you' ? 'Your safehouse' : `${build.safehouse.owner}'s safehouse`}
        </span>
      </div>
    );
  }
  return <>{chips}</>;
}
