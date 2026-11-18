'use client';

import React, { useEffect, useRef } from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { MapHud, ZombieHud } from '@/game/zombie/zombieMode';
import type { MapThemeConfig } from '@/game/map/mapRegistry';
import { MAP_TILE } from '@/game/map/mapImage';
import { CONTROL_ACTIONS, primaryLabel, type KeyBindings } from '@/lib/settings/controls';
import { PAD_LABELS } from '@/lib/input/gamepad';
import type { SurvivalSettings } from '@/lib/settings/survivalSettings';
import styles from './survival.module.css';
import { WorldTab } from './SurvivalWorld';
import type { WorldRules } from '@/game/zombie/survival/balance';
import type { SaveStatus } from '@/lib/services/survivalSave';

// ============================================================
// SURVIVAL MENU (M)
// Map: the city drawn small (ground and buildings) with you, other
// survivors, vehicles, what you've built, your safehouse, fuel pumps,
// fountains and the helicopter. Log: recent notifications. Settings:
// sound and feedback. Controls: every survival key and gamepad button.
// ============================================================

export type MenuTab = 'map' | 'log' | 'world' | 'settings' | 'controls';
const TABS: { id: MenuTab; label: string; icon: 'map' | 'bell' | 'globe' | 'settings' | 'keyboard' }[] = [
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'log', label: 'Log', icon: 'bell' },
  { id: 'world', label: 'World', icon: 'globe' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'controls', label: 'Controls', icon: 'keyboard' },
];

export interface SurvivalMenuProps {
  tab: MenuTab;
  hud: ZombieHud;
  zones: MapThemeConfig['zones'];
  mapImage: () => HTMLCanvasElement | null;
  settings: SurvivalSettings;
  bindings: KeyBindings;
  menuKey: string;
  onTab: (t: MenuTab) => void;
  onSettings: (s: SurvivalSettings) => void;
  onClose: () => void;
  saves: { world: SaveStatus | null; player: SaveStatus | null };
  onSaveRules: (r: WorldRules) => Promise<string | null>;
  onSaveNow: () => void;
}

export function SurvivalMenu({ tab, hud, zones, mapImage, settings, bindings, menuKey, onTab, onSettings, onClose, saves, onSaveRules, onSaveNow }: SurvivalMenuProps) {
  return (
    <section className={`${styles.invPanel} ${styles.menuPanel}`} aria-label="Survival menu" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className={styles.panelHead}>
        <h2>
          <AppIcon name="map" /> Survival
        </h2>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={`Close (${menuKey})`}>
          <AppIcon name="close" />
        </button>
      </header>
      <div className={styles.craftTabs} role="tablist" aria-label="Menu">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? styles.toggleOn : undefined} onClick={() => onTab(t.id)}>
            <AppIcon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>
      <div className={styles.invList}>
        {tab === 'map' && hud.map && <MapView map={hud.map} zones={zones} image={mapImage} />}
        {tab === 'log' && <NoticeList log={hud.log ?? []} />}
        {tab === 'world' && <WorldTab rules={hud.rules} saves={saves} onSaveRules={onSaveRules} onSaveNow={onSaveNow} />}
        {tab === 'settings' && <SettingsView settings={settings} onChange={onSettings} />}
        {tab === 'controls' && <ControlsView bindings={bindings} />}
      </div>
    </section>
  );
}

function MapView({ map, zones, image }: { map: MapHud; zones: MapThemeConfig['zones']; image: () => HTMLCanvasElement | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const base = image();
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !base) return;
    const W = canvas.width;
    const H = canvas.height;
    // Zoomed on you: about 120 × 80 tiles around the player, clamped to the map
    const viewW = Math.min(base.width, 120);
    const viewH = Math.min(base.height, Math.round((viewW * H) / W));
    const cx = Math.max(0, Math.min(base.width - viewW, map.player.x / MAP_TILE - viewW / 2));
    const cy = Math.max(0, Math.min(base.height - viewH, map.player.y / MAP_TILE - viewH / 2));
    const s = W / viewW;
    const toX = (x: number) => (x / MAP_TILE - cx) * s;
    const toY = (y: number) => (y / MAP_TILE - cy) * s;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, cx, cy, viewW, viewH, 0, 0, W, H);
    // District names
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    for (const z of zones) {
      const x = toX(z.x);
      const y = toY(z.y);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(z.name, x, y);
      ctx.fillStyle = '#F5F5F4';
      ctx.fillText(z.name, x, y);
    }
    if (map.safehouse) {
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 2;
      ctx.strokeRect(toX(map.safehouse.x), toY(map.safehouse.y), (map.safehouse.w / MAP_TILE) * s, (map.safehouse.h / MAP_TILE) * s);
    }
    const dot = (x: number, y: number, r: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(x), toY(y), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const v of map.vehicles) dot(v.x, v.y, v.mine ? 4 : 2, v.mine ? '#FACC15' : '#CBD5E1');
    for (const b of map.built) dot(b.x, b.y, 2.5, b.kind === 'farm_plot' ? '#A3E635' : b.kind === 'generator' ? '#F97316' : '#A16207');
    for (const p of map.points) dot(p.x, p.y, 3.5, p.kind === 'pump' ? '#EF4444' : '#38BDF8');
    for (const o of map.others) dot(o.x, o.y, 4, '#60A5FA');
    if (map.helicopter) dot(map.helicopter.x, map.helicopter.y, 6, '#F43F5E');
    // You: an arrow pointing where you face
    const px = toX(map.player.x);
    const py = toY(map.player.y);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(map.player.a);
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [map, zones, image]);
  return (
    <div>
      <canvas ref={ref} width={600} height={400} className={styles.mapCanvas} aria-label="City map around you" />
      <ul className={styles.mapLegend}>
        <li><i style={{ background: '#FDE047' }} /> You</li>
        <li><i style={{ background: '#60A5FA' }} /> Survivors</li>
        <li><i style={{ background: '#CBD5E1' }} /> Vehicles</li>
        <li><i style={{ background: '#EF4444' }} /> Fuel pumps</li>
        <li><i style={{ background: '#38BDF8' }} /> Fountain</li>
        <li><i style={{ background: '#A3E635' }} /> Your builds</li>
        <li><i style={{ background: '#22C55E' }} /> Safehouse</li>
      </ul>
    </div>
  );
}

function NoticeList({ log }: { log: NonNullable<ZombieHud['log']> }) {
  if (!log.length) return <p className={styles.invStats}>Nothing yet.</p>;
  return (
    <ul className={styles.noticeList}>
      {log.map((n) => (
        <li key={n.id}>
          <span className={styles.invIcon} aria-hidden="true">
            <AppIcon name={n.icon ?? 'bell'} />
          </span>
          <span>{n.text}</span>
          <span className={styles.noticeAgo}>{n.ago}</span>
        </li>
      ))}
    </ul>
  );
}

function SettingsView({ settings, onChange }: { settings: SurvivalSettings; onChange: (s: SurvivalSettings) => void }) {
  const toggle = (k: 'sfx' | 'ambience' | 'shake' | 'numbers' | 'perf', label: string, hint: string) => (
    <label className={styles.settingRow}>
      <input type="checkbox" checked={settings[k]} onChange={(e) => onChange({ ...settings, [k]: e.target.checked })} />
      <span>
        <strong>{label}</strong>
        <span className={styles.serviceWhy}>{hint}</span>
      </span>
    </label>
  );
  return (
    <div className={styles.settingsList}>
      <label className={styles.settingRow}>
        <AppIcon name={settings.volume > 0 ? 'volume' : 'volumeOff'} />
        <span>
          <strong>Volume {Math.round(settings.volume * 100)}%</strong>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => onChange({ ...settings, volume: Number(e.target.value) / 100 })}
            aria-label="Volume"
          />
        </span>
      </label>
      {toggle('sfx', 'Sound effects', 'Gunfire, zombies, doors, engines, pickups')}
      {toggle('ambience', 'Ambience', 'Rain, wind, your heartbeat, engines and generators nearby')}
      {toggle('shake', 'Screen shake', 'On hits, crashes and explosions (turn off if it bothers you)')}
      {toggle('numbers', 'Floating numbers', 'Damage and pickups over heads')}
      {toggle('perf', 'Performance stats', 'Frame rate, frame time, network traffic and zombie count')}
    </div>
  );
}

function ControlsView({ bindings }: { bindings: KeyBindings }) {
  const groups = ['Movement', 'Survival', 'Doors & windows'] as const;
  return (
    <div>
      <p className={styles.invStats}>Rebind keys with the Controls button in the space toolbar. Gamepads use the standard layout.</p>
      {groups.map((g) => (
        <div key={g}>
          <h3 className={styles.controlsGroup}>{g}</h3>
          <ul className={styles.controlsList}>
            {CONTROL_ACTIONS.filter((a) => a.group === g).map((a) => (
              <li key={a.id}>
                <span>{a.label}</span>
                <kbd>{primaryLabel(bindings, a.id)}</kbd>
                <span className={styles.padLabel}>{PAD_LABELS[a.id] ?? ''}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
