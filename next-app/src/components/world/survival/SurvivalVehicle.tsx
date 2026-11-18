'use client';

import React from 'react';
import { AppIcon } from '@/components/icons/AppIcon';
import type { VehicleHud } from '@/game/zombie/zombieMode';
import styles from './survival.module.css';

// ============================================================
// SURVIVAL VEHICLES
// DrivingBar: speed, fuel and engine while you're in a vehicle, with the
// horn and "Get out" for touch. VehiclePanel (Inspect): every part's
// condition and the repairs / part swaps you could do right now.
// ============================================================

const partColor = (v: number) => (v < 25 ? '#ef4444' : v < 55 ? '#f59e0b' : '#22c55e');

export function DrivingBar({
  vehicle,
  exitKey,
  hornKey,
  onExit,
  onHorn,
}: {
  vehicle: VehicleHud;
  exitKey: string;
  hornKey: string;
  onExit: () => void;
  onHorn: () => void;
}) {
  const fuelPct = Math.round((vehicle.fuel / Math.max(1, vehicle.tank)) * 100);
  return (
    <div className={styles.driveBar} role="group" aria-label={`In the ${vehicle.label}`} onPointerDown={(e) => e.stopPropagation()}>
      <span className={styles.driveName}>
        <AppIcon name={vehicle.icon} /> {vehicle.label}
      </span>
      {vehicle.driving && (
        <span className={styles.driveStat} aria-label={`${vehicle.speedKmh} kilometres per hour`}>
          <AppIcon name="gauge" /> {vehicle.speedKmh} km/h
        </span>
      )}
      <span className={styles.driveStat} title={`${vehicle.fuel} of ${vehicle.tank} litres`}>
        <AppIcon name="fuel" />
        <span className={styles.driveMeter} aria-label={`Fuel ${fuelPct}%`}>
          <span style={{ width: `${fuelPct}%`, backgroundColor: partColor(fuelPct) }} />
        </span>
      </span>
      <span className={`${styles.driveStat} ${vehicle.engineOn ? styles.driveOn : ''}`}>
        <AppIcon name="engine" /> {vehicle.engineOn ? 'Running' : 'Off'}
      </span>
      {vehicle.driving && (
        <button type="button" className={styles.actionBtn} onClick={onHorn}>
          <kbd>{hornKey}</kbd> Horn
        </button>
      )}
      <button type="button" className={styles.actionBtn} onClick={onExit}>
        <kbd>{exitKey}</kbd> Get out
      </button>
    </div>
  );
}

export function VehiclePanel({ vehicle, onAction, onClose }: { vehicle: VehicleHud; onAction: (id: string) => void; onClose: () => void }) {
  return (
    <section className={styles.invPanel} aria-label={`${vehicle.label}: inspect`} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header className={styles.panelHead}>
        <h2>
          <AppIcon name={vehicle.icon} /> {vehicle.label}
        </h2>
        <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
          <AppIcon name="close" />
        </button>
      </header>
      <div className={styles.invList}>
        <p className={styles.invStats}>
          <AppIcon name="key" /> {vehicle.key} · Seats {vehicle.seats} · Trunk {vehicle.trunkKg} kg
        </p>
        <p className={styles.invStats}>
          <AppIcon name="fuel" /> Fuel {vehicle.fuel} / {vehicle.tank} L
        </p>
        <ul className={styles.partList}>
          {vehicle.parts.map((p) => (
            <li key={p.label}>
              <span>{p.label}</span>
              <span className={styles.driveMeter} aria-label={`${p.label} ${p.value}%`}>
                <span style={{ width: `${p.value}%`, backgroundColor: partColor(p.value) }} />
              </span>
              <span className={styles.partValue}>{p.value}%</span>
            </li>
          ))}
        </ul>
        {vehicle.services.length > 0 && (
          <div className={styles.serviceGrid}>
            {vehicle.services.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${styles.actionBtn} ${s.ok ? '' : styles.actionBtnOff}`}
                aria-disabled={!s.ok}
                title={s.reason ?? undefined}
                onClick={() => onAction(s.id.slice(2))}
              >
                {s.label}
                {!s.ok && s.reason && <span className={styles.serviceWhy}>{s.reason}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
