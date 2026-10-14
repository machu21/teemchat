'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './GameCanvas.module.css';
import { WorldGame } from '@/game/WorldGame';
import { SpaceModel } from '@/lib/models/space';
import { WorldSyncService } from '@/lib/services/worldSync';
import { UserSession } from '@/lib/models/user';
import { FurnitureType } from '@/game/entities/furniture';
import { CompanionModel } from '@/lib/models/chat';

interface GameCanvasProps {
  space: SpaceModel;
  session: UserSession;
  syncService: WorldSyncService;
  companion: CompanionModel | null;
  buildMode: boolean;
  selectedFurniture: FurnitureType | null;
  onCompanionTap?: () => void;
  onProximityChanged?: (distances: Map<string, number>) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  space,
  session,
  syncService,
  companion,
  buildMode,
  selectedFurniture,
  onCompanionTap,
  onProximityChanged,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<WorldGame | null>(null);

  // Virtual joystick state
  const [joystickActive, setJoystickActive] = useState(false);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Handle screen resizing
    const updateSize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    // Initial spawn jitter
    const jitterX = 420 + (Math.random() * 40 - 20);
    const jitterY = 300 + (Math.random() * 40 - 20);

    const game = new WorldGame({
      canvas,
      initialX: jitterX,
      initialY: jitterY,
      displayName: session.displayName,
      avatarConfig: session.avatarConfig,
      space,
      syncService,
    });

    game.onCompanionTap = onCompanionTap;
    game.onProximityChanged = onProximityChanged;
    if (companion) {
      game.setCompanion(companion);
    }
    game.loadCloudObjects();
    game.start();

    gameRef.current = game;

    return () => {
      window.removeEventListener('resize', updateSize);
      game.dispose();
      gameRef.current = null;
    };
  }, [space, session, syncService, companion, onCompanionTap, onProximityChanged]);

  // Sync companion updates
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setCompanion(companion);
    }
  }, [companion]);

  // Sync build mode updates
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.buildModeEnabled = buildMode;
      gameRef.current.selectedFurniture = selectedFurniture;
    }
  }, [buildMode, selectedFurniture]);

  // Touch joystick handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setJoystickActive(true);
    setStickPos({ x: 0, y: 0 });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dist = Math.hypot(dx, dy);
    const maxRadius = 40;

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const cx = Math.cos(angle) * clampedDist;
    const cy = Math.sin(angle) * clampedDist;

    setStickPos({ x: cx, y: cy });

    if (gameRef.current) {
      gameRef.current.setJoystickInput(cx / maxRadius, cy / maxRadius);
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
    setJoystickActive(false);
    setStickPos({ x: 0, y: 0 });
    if (gameRef.current) {
      gameRef.current.setJoystickInput(0, 0);
    }
  };

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas ref={canvasRef} className={styles.gameCanvas} />

      {/* On-Screen Mobile Virtual Joystick */}
      <div
        className={styles.joystickZone}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className={styles.joystickBase}>
          <div
            className={styles.joystickThumb}
            style={{
              transform: `translate(${stickPos.x}px, ${stickPos.y}px)`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
