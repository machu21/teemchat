'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './GameCanvas.module.css';
import { WorldGame } from '@/game/WorldGame';
import { SpaceModel } from '@/lib/models/space';
import { WorldSyncService } from '@/lib/services/worldSync';
import { UserSession } from '@/lib/models/user';
import { FurnitureType } from '@/game/entities/furniture';
import { CompanionModel } from '@/lib/models/chat';
import { getMapConfig } from '@/game/map/mapRegistry';

interface GameCanvasProps {
  space: SpaceModel;
  session: UserSession;
  syncService: WorldSyncService | null;
  companion: CompanionModel | null;
  buildMode: boolean;
  selectedFurniture: FurnitureType | null;
  targetTeleport?: { x: number; y: number; name?: string; seq?: number } | null;
  initialTargetZone?: string | null;
  onCompanionTap?: () => void;
  onProximityChanged?: (distances: Map<string, number>) => void;
  onZoneChanged?: (zoneName: string) => void;
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
  onCompanionTap,
  onProximityChanged,
  onZoneChanged,
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
    if (onProximityChanged) {
      game.onProximityChanged = onProximityChanged;
    }
    if (onZoneChanged) {
      game.onZoneChanged = onZoneChanged;
    }

    if (companion) {
      game.setCompanion(companion);
    }
    game.buildModeEnabled = buildMode;
    game.selectedFurniture = selectedFurniture;

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
      game.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.id, session.id]); // ONLY re-initialize if the space or user changes!

  // 2. Dynamic prop synchronizers without restarting the game engine
  useEffect(() => {
    if (gameRef.current && onCompanionTap) {
      gameRef.current.onCompanionTap = onCompanionTap;
    }
  }, [onCompanionTap]);

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
    if (gameRef.current) {
      gameRef.current.player.displayName = session.displayName;
      gameRef.current.player.avatarConfig = session.avatarConfig;
    }
  }, [session.displayName, session.avatarConfig]);

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
    if (gameRef.current?.companion && onCompanionTap) {
      onCompanionTap();
    } else if (gameRef.current) {
      gameRef.current.player.speechBubble = '👋 Hello!';
      gameRef.current.player.speechExpiresAt = Date.now() + 4000;
    }
  };

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas
        ref={canvasRef}
        className={styles.gameCanvas}
      />

      {/* Retro Game Boy On-Screen Controls (visibility managed responsively by CSS) */}
      <div
        className={`${styles.joystickZone} ${joystickActive ? styles.active : ''}`}
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

      {/* Retro Action Button ('A') on the right side */}
      <div className={styles.actionBtnZone}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleActionButton}
          aria-label="Action Button"
        >
          A
        </button>
      </div>
    </div>
  );
};
