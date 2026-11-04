'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './GameCanvas.module.css';
import { WorldGame, DoorPrompt, FloorInfo } from '@/game/WorldGame';
import { SpaceModel } from '@/lib/models/space';
import { WorldSyncService } from '@/lib/services/worldSync';
import { UserSession } from '@/lib/models/user';
import { FurnitureType } from '@/game/entities/furniture';
import { CompanionModel } from '@/lib/models/chat';
import { getMapConfig } from '@/game/map/mapRegistry';
import { DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, SURVIVAL_ZOOM_LIMITS } from '@/game/camera';
import { ZombieHud } from '@/game/zombie/zombieMode';
import { WEAPONS } from '@/game/zombie/weapons';

import { AvatarConfig } from '@/lib/models/avatar';

interface GameCanvasProps {
  space: SpaceModel;
  session: UserSession;
  syncService: WorldSyncService | null;
  companion: CompanionModel | null;
  buildMode: boolean;
  selectedFurniture: FurnitureType | null;
  targetTeleport?: { x: number; y: number; name?: string; seq?: number } | null;
  initialTargetZone?: string | null;
  isMicOn?: boolean;
  isCamOn?: boolean;
  onCompanionTap?: () => void;
  onRemotePlayerTap?: (player: {
    userId: string;
    displayName: string;
    avatarConfig: AvatarConfig;
    x: number;
    y: number;
  }) => void;
  onProximityChanged?: (distances: Map<string, number>) => void;
  onZoneChanged?: (zoneName: string) => void;
  /** Zomboid-style vision cone + fog of war. */
  zombieMode?: boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  space,
  session,
  syncService,
  companion,
  buildMode,
  selectedFurniture,
  targetTeleport,
  initialTargetZone,
  isMicOn = false,
  isCamOn = false,
  onCompanionTap,
  onRemotePlayerTap,
  onProximityChanged,
  onZoneChanged,
  zombieMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<WorldGame | null>(null);

  // Persistent player position across re-renders / re-mounts
  const lastPlayerPosRef = useRef<{ x: number; y: number } | null>(null);

  // Virtual joystick state
  const [joystickActive, setJoystickActive] = useState(false);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Camera zoom level state
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const lastZoomRef = useRef<number>(DEFAULT_ZOOM);

  // Enter / Exit door prompt (state changes only on prompt change; position is written per frame via ref)
  const [doorPrompt, setDoorPrompt] = useState<DoorPrompt | null>(null);
  const doorPromptRef = useRef<HTMLDivElement | null>(null);
  const [floorInfo, setFloorInfo] = useState<FloorInfo | null>(null);
  const [zombieHud, setZombieHud] = useState<ZombieHud | null>(null);

  // 1. One-time Game Lifecycle Initialization (keyed ONLY by space.id and session.id)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Handle screen resizing & pixel art rendering
    const updateSize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    // Retrieve saved position or initial spawn coordinates from map config
    const mapConfig = getMapConfig(space.mapTheme);
    let spawnX = mapConfig.defaultSpawn.x + (Math.random() * 40 - 20);
    let spawnY = mapConfig.defaultSpawn.y + (Math.random() * 40 - 20);

    if (initialTargetZone) {
      const zTarget = initialTargetZone.toLowerCase();
      const matchedZone = mapConfig.zones.find(
        (z) =>
          z.id.toLowerCase() === zTarget ||
          z.name.toLowerCase().includes(zTarget) ||
          z.tag.toLowerCase().includes(zTarget)
      );
      if (matchedZone) {
        spawnX = matchedZone.x;
        spawnY = matchedZone.y;
      }
    } else if (lastPlayerPosRef.current) {
      spawnX = lastPlayerPosRef.current.x;
      spawnY = lastPlayerPosRef.current.y;
    } else {
      try {
        const stored = sessionStorage.getItem(`tc_pos_${space.id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
            spawnX = parsed.x;
            spawnY = parsed.y;
          }
        }
      } catch {
        // Fallback to initial spawn
      }
    }

    const game = new WorldGame({
      canvas,
      initialX: spawnX,
      initialY: spawnY,
      displayName: session.displayName,
      avatarConfig: session.avatarConfig,
      space,
      syncService: syncService || undefined,
    });

    if (onCompanionTap) {
      game.onCompanionTap = onCompanionTap;
    }
    if (onRemotePlayerTap) {
      game.onRemotePlayerTap = onRemotePlayerTap;
    }
    if (onProximityChanged) {
      game.onProximityChanged = onProximityChanged;
    }
    if (onZoneChanged) {
      game.onZoneChanged = onZoneChanged;
    }

    game.onDoorPromptChanged = (prompt) => setDoorPrompt(prompt);
    game.onFloorChanged = (info) => setFloorInfo(info);
    game.onZombieHud = (hud) => setZombieHud(hud);
    game.onDoorPromptMove = (sx, sy) => {
      const el = doorPromptRef.current;
      if (el) el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    };

    game.onZoomChanged = (newZoom) => {
      lastZoomRef.current = newZoom;
      setZoom(newZoom);
    };

    if (lastZoomRef.current !== DEFAULT_ZOOM) {
      game.setZoom(lastZoomRef.current);
    }

    if (companion) {
      game.setCompanion(companion);
    }
    game.buildModeEnabled = buildMode;
    game.selectedFurniture = selectedFurniture;
    game.setZombieMode(zombieMode);

    game.loadCloudObjects();
    game.start();

    gameRef.current = game;

    return () => {
      window.removeEventListener('resize', updateSize);
      // Persist explored coordinates before disposing
      if (gameRef.current) {
        const currentPos = gameRef.current.getPlayerPosition();
        lastPlayerPosRef.current = currentPos;
        try {
          sessionStorage.setItem(`tc_pos_${space.id}`, JSON.stringify(currentPos));
        } catch {
          // ignore storage errors
        }
      }
      game.onDoorPromptChanged = undefined;
      game.onDoorPromptMove = undefined;
      game.onFloorChanged = undefined;
      game.onZombieHud = undefined;
      game.dispose();
      gameRef.current = null;
      setDoorPrompt(null);
      setFloorInfo(null);
      setZombieHud(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id, space.mapTheme, session.id]); // Re-initialize if the space, map theme, or user changes!

  // 2. Dynamic prop synchronizers without restarting the game engine
  useEffect(() => {
    if (gameRef.current && onCompanionTap) {
      gameRef.current.onCompanionTap = onCompanionTap;
    }
  }, [onCompanionTap]);

  useEffect(() => {
    if (gameRef.current && onRemotePlayerTap) {
      gameRef.current.onRemotePlayerTap = onRemotePlayerTap;
    }
  }, [onRemotePlayerTap]);

  useEffect(() => {
    if (gameRef.current && onProximityChanged) {
      gameRef.current.onProximityChanged = onProximityChanged;
    }
  }, [onProximityChanged]);

  useEffect(() => {
    if (gameRef.current && onZoneChanged) {
      gameRef.current.onZoneChanged = onZoneChanged;
    }
  }, [onZoneChanged]);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setSyncService(syncService);
    }
  }, [syncService]);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setCompanion(companion);
    }
  }, [companion]);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.buildModeEnabled = buildMode;
      gameRef.current.selectedFurniture = selectedFurniture;
    }
  }, [buildMode, selectedFurniture]);

  useEffect(() => {
    gameRef.current?.setZombieMode(zombieMode);
  }, [zombieMode]);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.player.displayName = session.displayName;
      gameRef.current.player.avatarConfig = session.avatarConfig;
    }
  }, [session.displayName, session.avatarConfig]);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.player.isMicOn = isMicOn;
      gameRef.current.player.isCameraOn = isCamOn;
    }
  }, [isMicOn, isCamOn]);

  useEffect(() => {
    if (gameRef.current && targetTeleport) {
      gameRef.current.teleportTo(targetTeleport.x, targetTeleport.y, targetTeleport.name);
      lastPlayerPosRef.current = { x: targetTeleport.x, y: targetTeleport.y };
      try {
        sessionStorage.setItem(`tc_pos_${space.id}`, JSON.stringify({ x: targetTeleport.x, y: targetTeleport.y }));
      } catch {}
    }
  }, [targetTeleport, space.id]);

  // Periodic position persistence (every 3 seconds) so refreshing browser keeps position
  useEffect(() => {
    const timer = setInterval(() => {
      if (gameRef.current) {
        const pos = gameRef.current.getPlayerPosition();
        lastPlayerPosRef.current = pos;
        try {
          sessionStorage.setItem(`tc_pos_${space.id}`, JSON.stringify(pos));
        } catch {
          // ignore
        }
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [space.id]);

  // Multi-touch aware virtual joystick handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchIdRef.current !== null) return;

    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setJoystickActive(true);
    setStickPos({ x: 0, y: 0 });

    if (navigator.vibrate) {
      navigator.vibrate(8);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchIdRef.current === null || !touchStartRef.current) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;
        const dist = Math.hypot(dx, dy);
        const maxRadius = 38;

        const clampedDist = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);
        const cx = Math.cos(angle) * clampedDist;
        const cy = Math.sin(angle) * clampedDist;

        setStickPos({ x: cx, y: cy });

        if (gameRef.current) {
          gameRef.current.setJoystickInput(cx / maxRadius, cy / maxRadius);
        }
        break;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchIdRef.current === null) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        touchStartRef.current = null;
        setJoystickActive(false);
        setStickPos({ x: 0, y: 0 });
        if (gameRef.current) {
          gameRef.current.setJoystickInput(0, 0);
        }
        break;
      }
    }
  }, []);

  // Quick Action Button (Game Boy 'A' button) on touchscreen
  const handleActionButton = () => {
    if (navigator.vibrate) navigator.vibrate(12);
    if (gameRef.current?.zombieDoorAction('toggle')) {
      return;
    }
    if (gameRef.current?.activateDoor()) {
      return;
    }
    if (gameRef.current?.companion && onCompanionTap) {
      onCompanionTap();
    } else if (gameRef.current) {
      gameRef.current.player.speechBubble = '👋 Hello!';
      gameRef.current.player.speechExpiresAt = Date.now() + 4000;
    }
  };

  const handleZoomIn = () => {
    if (gameRef.current) {
      gameRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (gameRef.current) {
      gameRef.current.zoomOut();
    }
  };

  const handleResetZoom = () => {
    if (gameRef.current) {
      gameRef.current.resetZoom();
    }
  };

  const zoomPercent = Math.round((zoom / DEFAULT_ZOOM) * 100);
  // Survival locks zoom to 100–200 % (see Camera.setZoomLimits)
  const zoomMin = zombieMode ? SURVIVAL_ZOOM_LIMITS.min : MIN_ZOOM;
  const zoomMax = zombieMode ? SURVIVAL_ZOOM_LIMITS.max : MAX_ZOOM;

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas
        ref={canvasRef}
        className={styles.gameCanvas}
      />

      {/* World-space Enter / Exit prompt, anchored to the nearest door */}
      <div ref={doorPromptRef} className={styles.doorPromptAnchor} aria-live="polite">
        {doorPrompt && (
          <button
            key={`${doorPrompt.buildingId}-${doorPrompt.action}`}
            type="button"
            className={`${styles.doorPrompt} ${
              doorPrompt.action === 'exit' ? styles.doorPromptBelow : styles.doorPromptAbove
            }`}
            style={{ '--door-color': doorPrompt.color } as React.CSSProperties}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => gameRef.current?.activateDoor()}
          >
            <kbd className={styles.doorPromptKey}>E</kbd>
            <span className={styles.doorPromptLabel}>
              {doorPrompt.action === 'enter' ? 'Enter' : 'Exit'} {doorPrompt.name}
            </span>
            {doorPrompt.occupants > 0 && (
              <span className={styles.doorPromptCount} aria-label={`${doorPrompt.occupants} inside`}>
                👥 {doorPrompt.occupants}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Floor selector (multi-storey buildings only) */}
      {floorInfo && (
        <nav
          className={styles.floorSelector}
          aria-label={`${floorInfo.buildingName} floors`}
          style={{ '--door-color': floorInfo.color } as React.CSSProperties}
        >
          {floorInfo.floors.map((fl) => {
            const isCurrent = fl.levelId === floorInfo.currentLevelId;
            return (
              <button
                key={fl.levelId ?? 'ground'}
                type="button"
                className={`${styles.floorBtn} ${isCurrent ? styles.floorBtnActive : ''}`}
                aria-current={isCurrent ? 'location' : undefined}
                aria-label={`${fl.label}${isCurrent ? ' (you are here)' : ''}${
                  fl.occupants > 0 ? `, ${fl.occupants} here` : ''
                }`}
                title={isCurrent ? 'You are here' : `Walk to the stairs for ${fl.label}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => gameRef.current?.goToFloor(fl.levelId)}
              >
                <span className={styles.floorLabel}>{fl.label}</span>
                {fl.occupants > 0 && <span className={styles.floorCount}>{fl.occupants}</span>}
              </button>
            );
          })}
        </nav>
      )}

      {/* Zombie Mode HUD */}
      {zombieMode && zombieHud && (
        <>
          <div className={styles.zombieHud} role="status" aria-live="polite">
            <div className={styles.zombieHudTitle}>🧟 Survival</div>
            <div
              className={styles.zombieHpTrack}
              role="meter"
              aria-label="Health"
              aria-valuemin={0}
              aria-valuemax={zombieHud.maxHp}
              aria-valuenow={zombieHud.hp}
            >
              <div
                className={`${styles.zombieHpFill} ${zombieHud.hp < 35 ? styles.zombieHpLow : ''}`}
                style={{ width: `${(zombieHud.hp / zombieHud.maxHp) * 100}%` }}
              />
              <span className={styles.zombieHpText}>{zombieHud.hp} HP</span>
            </div>
            <div className={styles.zombieStats}>
              <span>☠ {zombieHud.kills}</span>
              <span>🧟 {zombieHud.alive}</span>
              {zombieHud.chasing > 0 && (
                <span className={styles.zombieChasing}>⚠ {zombieHud.chasing} chasing</span>
              )}
            </div>
            <div className={styles.zombieHint}>
              <kbd>F</kbd> fire · <kbd>R</kbd> reload · <kbd>Q</kbd>/<kbd>1-6</kbd> weapon · <kbd>Space</kbd> jump
            </div>
            {zombieHud.dead && <div className={styles.zombieDead}>You were bitten…</div>}
          </div>
          {zombieHud.entrance && (
            <div
              className={styles.entranceChip}
              role="group"
              aria-label="Door and window actions"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <span className={styles.entranceLabel}>
                {zombieHud.entrance.kind === 'door' ? '🚪' : '🪟'}{' '}
                {zombieHud.entrance.state === 'barricaded'
                  ? `Boarded ${zombieHud.entrance.planks}/4`
                  : zombieHud.entrance.state}
              </span>
              {(zombieHud.entrance.state === 'open' || zombieHud.entrance.state === 'closed') && (
                <button type="button" className={styles.entranceBtn} onClick={() => gameRef.current?.zombieDoorAction('toggle')}>
                  <kbd>E</kbd> {zombieHud.entrance.state === 'open' ? 'Close' : 'Open'}
                </button>
              )}
              {zombieHud.entrance.kind === 'door' &&
                (zombieHud.entrance.state === 'closed' || zombieHud.entrance.state === 'locked') && (
                  <button type="button" className={styles.entranceBtn} onClick={() => gameRef.current?.zombieDoorAction('lockToggle')}>
                    <kbd>L</kbd> {zombieHud.entrance.state === 'locked' ? 'Unlock' : 'Lock'}
                  </button>
                )}
              {zombieHud.entrance.state !== 'open' &&
                zombieHud.entrance.planks < 4 && (
                  <button type="button" className={styles.entranceBtn} onClick={() => gameRef.current?.zombieDoorAction('addPlank')}>
                    <kbd>B</kbd> Board up
                  </button>
                )}
              {zombieHud.entrance.progress > 0 && (
                <span className={styles.entranceProgress} aria-hidden="true">
                  <span style={{ width: `${zombieHud.entrance.progress * 100}%` }} />
                </span>
              )}
            </div>
          )}
          <div
            className={styles.weaponBar}
            role="group"
            aria-label="Weapons"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className={styles.weaponCurrent}>
              <span className={styles.weaponIcon} aria-hidden="true">{zombieHud.weapon.icon}</span>
              <span className={styles.weaponName}>{zombieHud.weapon.name}</span>
              {zombieHud.weapon.mag !== null && (
                <span className={styles.weaponAmmo} aria-label="Ammo">
                  <strong>{zombieHud.weapon.mag}</strong>/{zombieHud.weapon.magSize} · {zombieHud.weapon.reserve}
                </span>
              )}
              {zombieHud.weapon.mag !== null && (
                <button
                  type="button"
                  className={styles.weaponReload}
                  onClick={() => gameRef.current?.zombieReload()}
                  aria-label="Reload"
                  title="Reload (R)"
                >
                  R
                </button>
              )}
            </div>
            {zombieHud.weapon.reloading > 0 && (
              <span className={styles.weaponReloadBar} aria-hidden="true">
                <span style={{ width: `${zombieHud.weapon.reloading * 100}%` }} />
              </span>
            )}
            {zombieHud.owned.length > 1 && (
              <div className={styles.weaponSlots}>
                {zombieHud.owned.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`${styles.weaponSlot} ${w === zombieHud.weapon.id ? styles.weaponSlotActive : ''}`}
                    onClick={() => gameRef.current?.zombieSelectWeapon(w)}
                    aria-label={`Equip ${WEAPONS[w].name}`}
                    aria-pressed={w === zombieHud.weapon.id}
                    title={`${WEAPONS[w].name} (${WEAPONS[w].slot})`}
                  >
                    {WEAPONS[w].icon}
                  </button>
                ))}
              </div>
            )}
          </div>
          {zombieHud.toast && (
            <div className={styles.zombieToast} role="status">
              {zombieHud.toast}
            </div>
          )}
          <button
            type="button"
            className={styles.zombieAttackBtn}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              gameRef.current?.zombieTrigger(true);
            }}
            onPointerUp={() => gameRef.current?.zombieTrigger(false)}
            onPointerLeave={() => gameRef.current?.zombieTrigger(false)}
            onPointerCancel={() => gameRef.current?.zombieTrigger(false)}
            aria-label={zombieHud.weapon.mag === null ? 'Attack' : 'Fire'}
            title={zombieHud.weapon.mag === null ? 'Attack (F)' : 'Fire (hold F)'}
          >
            {zombieHud.weapon.icon}
          </button>
          <button
            type="button"
            className={styles.zombieJumpBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => gameRef.current?.jump()}
            aria-label="Jump"
            title="Jump over fences and cars (Space)"
          >
            ⤴
          </button>
        </>
      )}

      {/* Zoom Controls HUD */}
      <div
        className={styles.zoomControls}
        role="group"
        aria-label="Camera Zoom Controls"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.zoomBtn}
          onClick={handleZoomIn}
          disabled={zoom >= zoomMax}
          title="Zoom In (+ or Scroll Up)"
          aria-label="Zoom In"
        >
          +
        </button>
        <button
          type="button"
          className={styles.zoomLevelBtn}
          onClick={handleResetZoom}
          title="Reset Zoom to 100% (Ctrl+0)"
          aria-label={`Current zoom ${zoomPercent}%, click to reset`}
        >
          {zoomPercent}%
        </button>
        <button
          type="button"
          className={styles.zoomBtn}
          onClick={handleZoomOut}
          disabled={zoom <= zoomMin}
          title="Zoom Out (- or Scroll Down)"
          aria-label="Zoom Out"
        >
          −
        </button>
      </div>

      {/* Retro Game Boy On-Screen Controls (visibility managed responsively by CSS) */}
      <div
        className={`${styles.joystickZone} ${joystickActive ? styles.active : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        aria-label="Virtual Joystick"
      >
        <div className={styles.joystickBase}>
          {/* D-Pad Directional Arrows */}
          <div className={`${styles.dpadArrow} ${styles.arrowUp}`}>▲</div>
          <div className={`${styles.dpadArrow} ${styles.arrowDown}`}>▼</div>
          <div className={`${styles.dpadArrow} ${styles.arrowLeft}`}>◀</div>
          <div className={`${styles.dpadArrow} ${styles.arrowRight}`}>▶</div>

          {/* Joystick Thumb Button */}
          <div
            className={styles.joystickThumb}
            style={{
              transform: `translate(${stickPos.x}px, ${stickPos.y}px)`,
            }}
          >
            <div className={styles.thumbCenterDot} />
          </div>
        </div>
      </div>

      {/* Retro Action Button ('A') on the right side (social/non-zombie mode) */}
      {!zombieMode && (
        <div className={styles.actionBtnZone} onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleActionButton}
            aria-label={
              doorPrompt
                ? `${doorPrompt.action === 'enter' ? 'Enter' : 'Exit'} ${doorPrompt.name}`
                : 'Action Button'
            }
          >
            {doorPrompt ? '🚪' : 'A'}
          </button>
        </div>
      )}
    </div>
  );
};
