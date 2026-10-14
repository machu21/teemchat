import React, { useEffect, useRef } from 'react';
import { AvatarConfig } from '@/lib/models/avatar';
import { renderPixelAvatar } from '@/game/render/avatar';

interface PixelAvatarProps {
  config: AvatarConfig;
  size?: number;
  className?: string;
}

export const PixelAvatar: React.FC<PixelAvatarProps> = ({
  config,
  size = 48,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderPixelAvatar(ctx, config, size);
  }, [config, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{
        imageRendering: 'pixelated',
        width: `${size}px`,
        height: `${size}px`,
      }}
    />
  );
};
