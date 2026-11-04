'use client';

import React, { useEffect, useRef } from 'react';
import { CompanionEntity } from '@/game/entities/companion';
import type { CompanionMood, CompanionSpecies } from '@/lib/companion/types';

interface CompanionPortraitProps {
  species: CompanionSpecies;
  mood?: CompanionMood;
  /** CSS pixel size of the square portrait */
  size?: number;
}

/** Crisp pixel-art portrait of the companion, drawn with the same sprite code as the canvas pet. */
export function CompanionPortrait({ species, mood = 'happy', size = 36 }: CompanionPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const scale = (size * dpr) / 26;
    ctx.scale(scale, scale);
    ctx.translate(1, 1);
    const entity = new CompanionEntity(0, 0, {
      id: 'portrait',
      userId: 'portrait',
      name: '',
      persona: '',
      companionType: species,
      species,
      avatarStyle: 'default',
      learnedContext: {},
      isActive: true,
      mood,
    });
    entity.renderPortrait(ctx);
  }, [species, mood, size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
