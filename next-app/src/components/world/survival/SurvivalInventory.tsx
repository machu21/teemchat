'use client';

import React, { useState } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { InvAction, InventoryHud, ItemHud, LootHud, ZombieHud } from '@/game/zombie/zombieMode';
import { CATEGORY_GROUPS } from '@/game/zombie/survival/items';
import styles from './survival.module.css';
import { BuildPrompts } from './SurvivalCrafting';

// ============================================================
// SURVIVAL INVENTORY & LOOT
// The inventory (I) lists everything you carry, grouped by category,
// with weight against capacity. Searching a container (E) opens the loot
// window: its contents on one side, yours on the other. Items move with
// buttons, or by dragging between the columns on desktop. Every action
// calls back into WorldGame; in multiplayer the host confirms transfers.
// ============================================================

const FRESHNESS_TEXT: Record<NonNullable<ItemHud['freshness']>, string> = {
  fresh: 'Fresh.',
  stale: 'Stale: less filling and not very pleasant.',
  rotten: 'Rotten: eating it will make you ill.',
};

const ACTION_LABEL: Record<InvAction, string> = {
  use: 'Use',
  equip: 'Wear',
  unequip: 'Take off',
  wield: 'Hold',
  drop: 'Drop',
  split: 'Split',
  destroy: 'Destroy',
  put: 'Put in',
  take: 'Take',
  repair: 'Repair',
};

const DRAG_TYPE = 'application/x-teemchat-item';

function useConfirm() {
  const [armed, setArmed] = useState<string | null>(null);
  return { armed, arm: (k: string | null) => setArmed(k) };
}

function ItemRow({
  item,
  open,
  onToggle,
  onAction,
  draggable,
}: {
  item: ItemHud;
  open: boolean;
  onToggle: () => void;
  onAction: (a: InvAction) => void;
  draggable: boolean;
}) {
  const { armed, arm } = useConfirm();
  const quick: InvAction | undefined = item.actions.find((a) => a === 'take' || a === 'put');
  return (
    <li
      className={`${styles.invItem} ${item.pending ? styles.invPending : ''}`}
      draggable={draggable && !item.pending}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, item.key);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div className={styles.invRow}>
        <button type="button" className={styles.invMain} onClick={onToggle} aria-expanded={open}>
          <span className={styles.invIcon} aria-hidden="true">
            <AppIcon name={item.icon} />
          </span>
          <span className={styles.invName}>
            {item.name}
            {item.qty > 1 && <span className={styles.invQty}> ×{item.qty}</span>}
            {item.equipped && <span className={styles.invTag}>worn</span>}
            {item.wielded && <span className={styles.invTag}>in hand</span>}
          </span>
          {item.freshness && item.freshness !== 'fresh' && (
            <span className={`${styles.invTag} ${item.freshness === 'rotten' ? styles.invTagBad : ''}`}>{item.freshness}</span>
          )}
          {item.cond !== null && (
            <span className={styles.invCond} aria-label={`Condition ${Math.round(item.cond * 100)}%`}>
              <span style={{ width: `${Math.round(item.cond * 100)}%`, backgroundColor: item.cond < 0.25 ? '#ef4444' : item.cond < 0.5 ? '#f59e0b' : '#22c55e' }} />
            </span>
          )}
          <span className={styles.invWeight}>{item.weight.toFixed(item.weight < 1 ? 2 : 1)} kg</span>
        </button>
        {quick && (
          <button type="button" className={styles.invQuick} onClick={() => onAction(quick)} disabled={item.pending}>
            {item.pending ? '…' : ACTION_LABEL[quick]}
          </button>
        )}
      </div>
      {open && (
        <div className={styles.invDetail}>
          <p>{item.description}</p>
          {item.detail && <p className={styles.invStats}>{item.detail}</p>}
          {item.cond !== null && <p className={styles.invStats}>Condition {Math.round(item.cond * 100)}%</p>}
          {item.mag !== null && <p className={styles.invStats}>{item.mag} in the magazine</p>}
          {item.freshness && <p className={styles.invStats}>{FRESHNESS_TEXT[item.freshness]}</p>}
          <div className={styles.invActions}>
            {item.actions
              .filter((a) => a !== quick)
              .map((a) =>
                a === 'destroy' ? (
                  <button
                    key={a}
                    type="button"
                    className={`${styles.invActionBtn} ${styles.invDanger}`}
                    onClick={() => {
                      if (armed === item.key) {
                        arm(null);
                        onAction(a);
                      } else arm(item.key);
                    }}
                  >
                    {armed === item.key ? 'Really destroy?' : 'Destroy'}
                  </button>
                ) : (
                  <button key={a} type="button" className={styles.invActionBtn} onClick={() => onAction(a)}>
                    {ACTION_LABEL[a]}
                  </button>
                )
              )}
          </div>
        </div>
      )}
    </li>
  );
}

function ItemList({
  items,
  onAction,
  dropKind,
  onDropKey,
  draggable,
  empty,
}: {
  items: ItemHud[];
  onAction: (key: string, a: InvAction) => void;
  /** Accept items dragged from the other column. */
  dropKind?: 'take' | 'put';
  onDropKey?: (key: string) => void;
  draggable: boolean;
  empty: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const groups = CATEGORY_GROUPS.map((g) => ({ label: g.label, items: items.filter((i) => g.categories.includes(i.category)) })).filter((g) => g.items.length);
  return (
    <div
      className={`${styles.invList} ${over ? styles.invDropOver : ''}`}
      onDragOver={(e) => {
        if (!dropKind || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const key = e.dataTransfer.getData(DRAG_TYPE);
        if (!key || !onDropKey) return;
        // Only accept from the other side
        const fromContainer = key.startsWith('c:');
        if ((dropKind === 'take') === fromContainer) {
          e.preventDefault();
          onDropKey(key);
        }
      }}
    >
      {!items.length && <p className={styles.invEmpty}>{empty}</p>}
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h4 className={styles.invGroup}>{g.label}</h4>
          <ul>
            {g.items.map((it) => (
              <ItemRow
                key={it.key}
                item={it}
                open={open === it.key}
                onToggle={() => setOpen(open === it.key ? null : it.key)}
                onAction={(a) => onAction(it.key, a)}
                draggable={draggable}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function WeightBar({ weight, capacity }: { weight: number; capacity: number }) {
  const over = weight > capacity;
  return (
    <div className={styles.invWeightBar} role="meter" aria-label="Carried weight" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={weight}>
      <span className={styles.meterTrack}>
        <span style={{ width: `${Math.min(100, (weight / Math.max(1, capacity)) * 100)}%`, backgroundColor: over ? '#ef4444' : weight / capacity > 0.75 ? '#f59e0b' : '#22c55e' }} />
      </span>
      <span className={over ? styles.invOver : undefined}>
        {weight.toFixed(1)} / {capacity} kg
      </span>
    </div>
  );
}

export interface InventoryPanelProps {
  inventory: InventoryHud;
  invKey: string;
  onAction: (key: string, a: InvAction) => void;
  onClose: () => void;
}

export function InventoryPanel({ inventory, invKey, onAction, onClose }: InventoryPanelProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const items = q ? inventory.items.filter((i) => i.name.toLowerCase().includes(q) || i.category.includes(q)) : inventory.items;
  return (
    <section className={styles.invPanel} aria-label="Inventory" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className={styles.panelHead}>
        <h2>
          <AppIcon name="backpack" /> Inventory
        </h2>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={`Close inventory (${invKey})`}>
          <AppIcon name="close" />
        </button>
      </header>
      <WeightBar weight={inventory.weight} capacity={inventory.capacity} />
      {inventory.items.length > 6 && <SearchBox value={query} onChange={setQuery} label="Find an item" />}
      <ItemList items={items} onAction={onAction} draggable={false} empty={q ? 'Nothing matches.' : "You're carrying nothing."} />
    </section>
  );
}

/** A small search field for long lists (typing in it never moves you: the game ignores keys in inputs). */
export function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className={styles.searchBox}>
      <AppIcon name="search" />
      <input type="search" value={value} placeholder={label} aria-label={label} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export interface LootPanelProps {
  loot: LootHud;
  inventory: InventoryHud;
  onTake: (index: number) => void;
  onTakeAll: () => void;
  onAction: (key: string, a: InvAction) => void;
  onClose: () => void;
}

export function LootPanel({ loot, inventory, onTake, onTakeAll, onAction, onClose }: LootPanelProps) {
  const take = (key: string) => {
    const i = Number(key.slice(2));
    if (Number.isInteger(i)) onTake(i);
  };
  const icon =
    loot.kind === 'fridge' ? 'fridge' : loot.kind === 'locker' ? 'locker' : loot.kind === 'corpse' ? 'skull' : loot.kind === 'ground' ? 'package' : loot.kind === 'trunk' ? 'car' : 'shelfBox';
  return (
    <section className={styles.lootPanel} aria-label={`Searching: ${loot.label}`} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className={styles.panelHead}>
        <h2>
          <AppIcon name={icon} /> {loot.label}
        </h2>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
          <AppIcon name="close" />
        </button>
      </header>
      <div className={styles.lootCols}>
        <div className={styles.lootCol}>
          <div className={styles.lootColHead}>
            <span>
              In the {loot.label.toLowerCase()}
              {loot.capacity !== null && (
                <span className={styles.lootCap}>
                  {' '}
                  · {loot.weight.toFixed(1)} / {loot.capacity} kg
                </span>
              )}
            </span>
            <button type="button" className={styles.invActionBtn} onClick={onTakeAll} disabled={!loot.items.length}>
              Take all
            </button>
          </div>
          <ItemList
            items={loot.items}
            onAction={(key, a) => (a === 'take' ? take(key) : undefined)}
            dropKind="put"
            onDropKey={(key) => onAction(key, 'put')}
            draggable
            empty="Nothing here."
          />
        </div>
        <div className={styles.lootCol}>
          <div className={styles.lootColHead}>
            <span>You</span>
          </div>
          <WeightBar weight={inventory.weight} capacity={inventory.capacity} />
          <ItemList items={inventory.items} onAction={onAction} dropKind="take" onDropKey={take} draggable empty="You're carrying nothing." />
        </div>
      </div>
    </section>
  );
}

/** Bottom-centre prompts: search a container, sleep in a bed. Stack above the door chip when it shows. */
export function SurvivalPrompts({
  hud,
  searchKey,
  sleepKey,
  useKey,
  onSearch,
  onSleep,
  onBuildConfirm,
  onBuildCancel,
  onDismantle,
  onWorldAction,
}: {
  hud: ZombieHud;
  searchKey: string;
  sleepKey: string;
  /** The "use object" key (taps, generators, fires…). */
  useKey: string;
  onSearch: () => void;
  onSleep: () => void;
  /** Placing / building / dismantling. */
  onBuildConfirm: () => void;
  onBuildCancel: () => void;
  onDismantle: () => void;
  /** Generator, rain collector, campfire, tap, toilet, pump (action id from the HUD). */
  onWorldAction: (id: string) => void;
}) {
  const b = hud.build;
  const placing = !!b.placing;
  const showSearch = !placing && !!hud.container && !hud.container.open && !hud.dead && !hud.asleep;
  const showRest = !placing && !!hud.restSpot && !hud.asleep && !hud.dead;
  const showBuild = !hud.dead && !hud.asleep && !!(b.progress || b.placing || b.near || b.safehouse?.owner);
  const w = !placing && !hud.dead && !hud.asleep ? hud.worldAction : null;
  if (!showSearch && !showRest && !showBuild && !w) return null;
  // The use key does the first thing you can do here (E too, when there's nothing to search)
  const keyAction = w ? (w.actions.find((a) => a.ok)?.id ?? null) : null;
  return (
    <div className={`${styles.promptStack} ${hud.entrance && !hud.asleep ? styles.promptStackRaised : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      {showRest && (
        <div className={styles.promptChip} role="group" aria-label="Rest">
          <span className={styles.restLabel}>
            <AppIcon name={hud.restSpot === 'bed' ? 'bed' : 'sofa'} /> {hud.restSpot === 'bed' ? 'Bed' : 'Sofa'}
          </span>
          <button type="button" className={styles.actionBtn} onClick={onSleep} title={hud.character.sleepBlocked ?? undefined}>
            <kbd>{sleepKey}</kbd> Sleep
          </button>
        </div>
      )}
      {showSearch && hud.container && (
        <div className={styles.promptChip} role="group" aria-label="Search">
          <span className={styles.restLabel}>
            <AppIcon name={hud.container.kind === 'fridge' ? 'fridge' : hud.container.kind === 'corpse' ? 'skull' : hud.container.kind === 'ground' ? 'package' : hud.container.kind === 'trunk' ? 'car' : 'shelfBox'} /> {hud.container.label}
          </span>
          <button type="button" className={styles.actionBtn} onClick={onSearch}>
            <kbd>{searchKey}</kbd> Search
          </button>
        </div>
      )}
      {w && (
        <div className={`${styles.promptChip} ${styles.worldChip}`} role="group" aria-label={w.label}>
          <span className={styles.worldInfo}>
            <span className={styles.restLabel}>
              <AppIcon name={w.icon} /> {w.label}
            </span>
            <span className={styles.worldStatus}>{w.status}</span>
          </span>
          {w.actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${styles.actionBtn} ${a.ok ? '' : styles.actionBtnOff}`}
              aria-disabled={!a.ok}
              title={a.reason ?? undefined}
              onClick={() => onWorldAction(a.id)}
            >
              {keyAction === a.id && <kbd>{useKey}</kbd>} {a.label}
            </button>
          ))}
        </div>
      )}
      {showBuild && <BuildPrompts build={b} interactKey={searchKey} onConfirm={onBuildConfirm} onCancel={onBuildCancel} onDismantle={onDismantle} />}
    </div>
  );
}
