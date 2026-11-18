'use client';

import React from 'react';
import { FriendModel } from '@/lib/models/social';
import { statusColor, statusLabel } from '@/lib/world/emotes';

interface StatusDotProps {
  status: FriendModel['status'] | undefined;
  /** Positioning / size class from the parent's CSS module. */
  className: string;
}

/** Avatar corner dot colored by a friend's live status; nothing when they are offline. */
export function StatusDot({ status, className }: StatusDotProps) {
  const color = statusColor(status);
  if (!color) return null;
  const label = statusLabel(status);
  return <span className={className} style={{ backgroundColor: color }} title={label} aria-label={label} role="img" />;
}
