'use client';

import React, { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import styles from './GameCanvas.module.css';
import { WorldGame, DoorPrompt, FloorInfo } from '@/game/WorldGame';
import { SpaceModel } from '@/lib/models/space';
import { WorldSyncService } from '@/lib/services/worldSync';
import { UserSession } from '@/lib/models/user';
import { FurnitureType } from '@/game/entities/furniture';
import { CompanionModel } from '@/lib/models/chat';
import type { CompanionEmote, CompanionMood } from '@/lib/companion/types';
import { getMapConfig } from '@/game/map/mapRegistry';
import { DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, SURVIVAL_ZOOM_LIMITS } from '@/game/camera';
import { ZombieHud } from '@/game/zombie/zombieMode';
import type { SpecialZombieType, StatusEffectKind } from '@/game/zombie/survival/types';

const EFFECT_LABELS: Record<StatusEffectKind, string> = {
  stimulant: '⚡ Wired',
  poison: '☣ Poisoned',
  slow: '🐌 Slowed',
  knockdown: '💫 Down',
  blinded: '🌫 Gassed',
  regen: '💚 Healing',
};

const SPECIAL_WARNINGS: Record<SpecialZombieType, string> = {
  charger: '🐂 Charger — sidestep the charge',
  bloater: '🤢 Bloater — keep your distance',
  dreadnought: '🛡 Dreadnought — it calls the horde',
};
import { WEAPONS } from '@/game/zombie/weapons';
import { useControlsStore } from '@/stores/controls';
import { ControlPos, SIZE_SCALE, TouchControl, clampPos, primaryLabel } from '@/lib/settings/controls';

/** Half-size (px, at size "md") per control, so custom positions stay on screen after a resize. */
const CONTROL_HALF: Record<TouchControl, { w: number; h: number }> = {
  joystick: { w: 64, h: 64 },
  fire: { w: 28, h: 28 },
  jump: { w: 24, h: 24 },
  sprint: { w: 24, h: 24 },
  weapons: { w: 96, h: 40 },
  zoom: { w: 22, h: 56 },
  action: { w: 32, h: 32 },
};

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
  /** Make the companion say something / emote. A new `seq` replays the cue. */
  companionCue?: { text: string; emote?: CompanionEmote; mood?: CompanionMood; seq: number } | null;
  /** Make the companion lead the player to a spot. A new `seq` starts a new guide. */
  companionGuide?: { x: number; y: number; name: string; seq: number } | null;
  onCompanionArrive?: (placeName: string) => void;
  onCompanionWake?: () => void;
  onCompanionSleep?: () => void;
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
  companionCue,
  companionGuide,
  onCompanionArrive,
  onCompanionWake,
  onCompanionSleep,
  zombieMode = false,
}) => {
  // Latest companion callbacks, read by the engine without re-initializing it
  const companionEventsRef = useRef({ onCompanionArrive, onCompanionWake, onCompanionSleep });
  useEffect(() => {
    companionEventsRef.current = { onCompanionArrive, onCompanionWake, onCompanionSleep };
  }, [onCompanionArrive, onCompanionWake, onCompanionSleep]);
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

  // Controls settings (key bindings + touch layout), saved per device
  const bindings = useControlsStore((s) => s.bindings);
  const touch = useControlsStore((s) => s.touch);
  const editingLayout = useControlsStore((s) => s.editingLayout);
  const hydrateControls = useControlsStore((s) => s.hydrate);
  const setControlPosition = useControlsStore((s) => s.setPosition);
  const resetControlLayout = useControlsStore((s) => s.resetLayout);
  const setEditingLayout = useControlsStore((s) => s.setEditingLayout);
  const editingRef = useRef(false);
  useEffect(() => {
    editingRef.current = editingLayout;
  }, [editingLayout]);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const orientation = area.w > area.h ? 'landscape' : 'portrait';
  const [drag, setDrag] = useState<{ id: TouchControl; pos: ControlPos } | null>(null);
  const dragRef = useRef<{
    id: TouchControl;
    pointerId: number;
    offX: number;
    offY: number;
    w: number;
    h: number;
    root: DOMRect;
    pos: ControlPos | null;
  } | null>(null);
  const [sprintHeld, setSprintHeld] = useState(false);

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
    game.onCompanionWake = () => companionEventsRef.current.onCompanionWake?.();
    game.onCompanionSleep = () => companionEventsRef.current.onCompanionSleep?.();

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
    game.setKeyBindings(useControlsStore.getState().bindings);

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
    if (gameRef.current && companionCue) {
      gameRef.current.companionSay(companionCue.text, companionCue.emote, companionCue.mood);
    }
  }, [companionCue]);

  useEffect(() => {
    if (gameRef.current && companionGuide) {
      const { x, y, name } = companionGuide;
      gameRef.current.companionGuideTo(x, y, name, () => companionEventsRef.current.onCompanionArrive?.(name));
    }
  }, [companionGuide]);

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

  // Saved controls load after mount (storage isn't available during SSR → no hydration mismatch)
  useEffect(() => {
    hydrateControls();
  }, [hydrateControls]);

  useEffect(() => {
    gameRef.current?.setKeyBindings(bindings);
  }, [bindings]);

  // Game-area size drives orientation-specific layouts and on-screen clamping
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Measure now and on window resize / rotation too: ResizeObserver alone only reports
    // during rendering, which is paused for background tabs and some WebViews
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setArea((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      ro?.disconnect();
    };
  }, []);

  // Esc leaves the layout editor
  useEffect(() => {
    if (!editingLayout) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingLayout(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingLayout, setEditingLayout]);

  /** Inline position for a control with a custom spot (else the responsive CSS default applies). */
  const ctlStyle = (id: TouchControl): CSSProperties | undefined => {
    const p = drag?.id === id ? drag.pos : touch.positions[orientation][id];
    if (!p) return undefined;
    const s = SIZE_SCALE[touch.size];
    const hw = Math.round(CONTROL_HALF[id].w * s);
    const hh = Math.round(CONTROL_HALF[id].h * s);
    // The layer is mirrored for left-handed play, so mirror the stored (screen) x back
    const x = touch.hand === 'left' ? 1 - p.x : p.x;
    return {
      left: `clamp(${hw}px, ${(x * 100).toFixed(2)}%, calc(100% - ${hw}px))`,
      top: `clamp(${hh}px, ${(p.y * 100).toFixed(2)}%, calc(100% - ${hh}px))`,
      right: 'auto',
      bottom: 'auto',
      translate: '-50% -50%',
    };
  };

  // Layout editor: drag any control (capture phase, so the control itself never fires)
  const onLayerPointerDown = (e: React.PointerEvent) => {
    if (!editingRef.current || !containerRef.current) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ctl]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const r = el.getBoundingClientRect();
    dragRef.current = {
      id: el.dataset.ctl as TouchControl,
      pointerId: e.pointerId,
      offX: e.clientX - (r.left + r.width / 2),
      offY: e.clientY - (r.top + r.height / 2),
      w: r.width,
      h: r.height,
      root: containerRef.current.getBoundingClientRect(),
      pos: null,
    };
    el.setPointerCapture?.(e.pointerId);
  };
  const onLayerPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = clampPos(
      { x: (e.clientX - d.offX - d.root.left) / d.root.width, y: (e.clientY - d.offY - d.root.top) / d.root.height },
      { w: d.root.width, h: d.root.height },
      { w: d.w, h: d.h }
    );
    d.pos = pos;
    setDrag({ id: d.id, pos });
  };
  const onLayerPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (d.pos) setControlPosition(orientation, d.id, d.pos);
    dragRef.current = null;
    setDrag(null);
  };
  const onLayerClick = (e: React.MouseEvent) => {
    if (editingRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const layerProps = {
    className: `${styles.touchLayer} ${touch.hand === 'left' ? styles.touchMirror : ''} ${editingLayout ? styles.touchEditing : ''}`,
    style: { '--ts': SIZE_SCALE[touch.size], '--to': touch.opacity } as CSSProperties,
    onPointerDownCapture: onLayerPointerDown,
    onPointerMoveCapture: onLayerPointerMove,
    onPointerUpCapture: onLayerPointerUp,
    onPointerCancelCapture: onLayerPointerUp,
    onClickCapture: onLayerClick,
  };

  const setSprintHold = (down: boolean) => {
    if (touch.sprintMode !== 'hold') return;
    setSprintHeld(down);
    gameRef.current?.zombieSprintHold(down);
  };

  // Multi-touch aware virtual joystick handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchIdRef.current !== null || editingRef.current) return;

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
            <div className={styles.vitals}>
              {(
                [
                  ['🍗', 'Hunger', zombieHud.hunger, '#f59e0b'],
                  ['💧', 'Thirst', zombieHud.hydration, '#38bdf8'],
                  ['⚡', 'Stamina', zombieHud.stamina, zombieHud.exhausted ? '#a1a1aa' : '#facc15'],
                ] as const
              ).map(([icon, label, value, color]) => (
                <div key={label} className={styles.vitalRow} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
                  <span className={styles.vitalIcon} aria-hidden="true">{icon}</span>
                  <span className={`${styles.vitalTrack} ${value < 15 ? styles.vitalLow : ''}`}>
                    <span style={{ width: `${value}%`, backgroundColor: color }} />
                  </span>
                </div>
              ))}
            </div>
            <div className={styles.zombieStats}>
              <span>☠ {zombieHud.kills}</span>
              <span>🧟 {zombieHud.alive}</span>
              <span title="Threat rises the longer you survive">🔥 Lv {zombieHud.threat}</span>
              {zombieHud.chasing > 0 && (
                <span className={styles.zombieChasing}>⚠ {zombieHud.chasing} chasing</span>
              )}
            </div>
            {(zombieHud.effects.length > 0 || zombieHud.safe || zombieHud.exhausted) && (
              <div className={styles.effectChips}>
                {zombieHud.safe && <span className={styles.effectGood}>🛏 Safe</span>}
                {zombieHud.exhausted && <span className={styles.effectBad}>😮‍💨 Exhausted</span>}
                {zombieHud.effects.map((k) => (
                  <span key={k} className={k === 'stimulant' || k === 'regen' ? styles.effectGood : styles.effectBad}>
                    {EFFECT_LABELS[k]}
                  </span>
                ))}
              </div>
            )}
            <div className={styles.zombieHint}>
              <kbd>{primaryLabel(bindings, 'fire')}</kbd> fire · <kbd>{primaryLabel(bindings, 'reload')}</kbd> reload ·{' '}
              <kbd>{primaryLabel(bindings, 'nextWeapon')}</kbd>/<kbd>1-6</kbd> weapon · <kbd>{primaryLabel(bindings, 'sprint')}</kbd> sprint ·{' '}
              <kbd>{primaryLabel(bindings, 'useSupply')}</kbd> eat/drink · <kbd>{primaryLabel(bindings, 'jump')}</kbd> jump
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
                  <kbd>{primaryLabel(bindings, 'interact')}</kbd> {zombieHud.entrance.state === 'open' ? 'Close' : 'Open'}
                </button>
              )}
              {zombieHud.entrance.kind === 'door' &&
                (zombieHud.entrance.state === 'closed' || zombieHud.entrance.state === 'locked') && (
                  <button type="button" className={styles.entranceBtn} onClick={() => gameRef.current?.zombieDoorAction('lockToggle')}>
                    <kbd>{primaryLabel(bindings, 'lock')}</kbd> {zombieHud.entrance.state === 'locked' ? 'Unlock' : 'Lock'}
                  </button>
                )}
              {zombieHud.entrance.state !== 'open' &&
                zombieHud.entrance.planks < 4 && (
                  <button type="button" className={styles.entranceBtn} onClick={() => gameRef.current?.zombieDoorAction('addPlank')}>
                    <kbd>{primaryLabel(bindings, 'barricade')}</kbd> Board up
                  </button>
                )}
              {zombieHud.entrance.progress > 0 && (
                <span className={styles.entranceProgress} aria-hidden="true">
                  <span style={{ width: `${zombieHud.entrance.progress * 100}%` }} />
                </span>
              )}
            </div>
          )}
          <div {...layerProps}>
          <div
            className={styles.weaponBar}
            role="group"
            aria-label="Weapons"
            data-ctl="weapons"
            style={ctlStyle('weapons')}
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
                  title={`Reload (${primaryLabel(bindings, 'reload')})`}
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
            {zombieHud.supplies.length > 0 && (
              <div className={styles.supplyBar} role="group" aria-label="Supplies">
                {zombieHud.supplies.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={styles.supplyBtn}
                    onClick={() => gameRef.current?.zombieUseSupply(s.id)}
                    aria-label={`Use ${s.name} (${s.qty} left)`}
                    title={`Use ${s.name}`}
                  >
                    <span aria-hidden="true">{s.icon}</span>
                    {s.qty > 1 && <span className={styles.supplyQty}>{s.qty}</span>}
                  </button>
                ))}
                <span className={styles.bagFill} aria-label={`Bag ${Math.round(zombieHud.bagFill * 100)}% full`}>
                  🎒 {Math.round(zombieHud.bagFill * 100)}%
                </span>
              </div>
            )}
          </div>
          {zombieHud.specials.length > 0 && (
            <div className={styles.specialWarn} role="alert">
              {zombieHud.specials.map((k) => SPECIAL_WARNINGS[k]).join(' · ')}
            </div>
          )}
          {zombieHud.toast && (
            <div className={styles.zombieToast} role="status">
              {zombieHud.toast}
            </div>
          )}
          <button
            type="button"
            data-ctl="sprint"
            style={ctlStyle('sprint')}
            className={`${styles.zombieSprintBtn} ${(touch.sprintMode === 'hold' ? sprintHeld : zombieHud.sprintLatched) ? styles.zombieSprintOn : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSprintHold(true);
            }}
            onPointerUp={() => setSprintHold(false)}
            onPointerLeave={() => setSprintHold(false)}
            onPointerCancel={() => setSprintHold(false)}
            onClick={() => {
              if (touch.sprintMode === 'toggle') gameRef.current?.zombieToggleSprint();
            }}
            aria-label={touch.sprintMode === 'hold' ? 'Sprint (hold)' : 'Sprint'}
            aria-pressed={touch.sprintMode === 'hold' ? sprintHeld : zombieHud.sprintLatched}
            title={`Sprint (hold ${primaryLabel(bindings, 'sprint')})`}
          >
            🏃
          </button>
          <button
            type="button"
            data-ctl="fire"
            style={ctlStyle('fire')}
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
            title={
              zombieHud.weapon.mag === null
                ? `Attack (${primaryLabel(bindings, 'fire')})`
                : `Fire (hold ${primaryLabel(bindings, 'fire')})`
            }
          >
            {zombieHud.weapon.icon}
          </button>
          <button
            type="button"
            data-ctl="jump"
            style={ctlStyle('jump')}
            className={styles.zombieJumpBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => gameRef.current?.jump()}
            aria-label="Jump"
            title={`Jump over fences and cars (${primaryLabel(bindings, 'jump')})`}
          >
            ⤴
          </button>
          </div>
        </>
      )}

      <div {...layerProps}>
      {/* Zoom Controls HUD */}
      <div
        data-ctl="zoom"
        style={ctlStyle('zoom')}
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
        data-ctl="joystick"
        style={ctlStyle('joystick')}
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
        <div className={styles.actionBtnZone} data-ctl="action" style={ctlStyle('action')} onPointerDown={(e) => e.stopPropagation()}>
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

      {editingLayout && (
        <div className={styles.layoutEditBar} role="dialog" aria-label="Arrange on-screen controls">
          <span className={styles.layoutEditText}>
            ✋ Drag the controls where you want them <small>({orientation} layout)</small>
          </span>
          <div className={styles.layoutEditActions}>
            <button type="button" className={styles.layoutEditBtn} onClick={resetControlLayout}>
              Reset
            </button>
            <button
              type="button"
              className={`${styles.layoutEditBtn} ${styles.layoutEditDone}`}
              onClick={() => setEditingLayout(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
