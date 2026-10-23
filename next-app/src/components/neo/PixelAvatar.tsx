import React, { useEffect, useRef } from 'react';
import { AvatarConfig } from '@/lib/models/avatar';
import { renderPixelAvatar, renderAvatarBust } from '@/game/render/avatar';

interface PixelAvatarProps {
  config: AvatarConfig;
  size?: number;
  className?: string;
  bustOnly?: boolean;
}

export const PixelAvatar: React.FC<PixelAvatarProps> = ({
  config,
  size = 48,
  className = '',
  bustOnly,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Default to bust view for compact tiles (<= 64px) for maximum readability, full body for large previews
  const shouldRenderBust = bustOnly ?? size <= 64;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size, size);

    if (shouldRenderBust) {
      renderAvatarBust(ctx, config, size);
    } else {
      renderPixelAvatar(ctx, config, size);
    }
  }, [config, size, shouldRenderBust]);

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
