import React from 'react';
import { ICONS, type IconName } from '@/lib/icons';

export interface AppIconProps extends Omit<React.SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** px (default 1em, so the icon follows the surrounding font size). */
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  /** Accessible label. Omit for decorative icons next to visible text. */
  label?: string;
}

/**
 * The app's icon. Use this instead of emoji (see CLAUDE.md → "No emoji").
 * Server-safe (no hooks), so it also works in OG images and route handlers.
 */
export function AppIcon({ name, size = '1em', color = 'currentColor', strokeWidth = 2, label, style, ...rest }: AppIconProps) {
  const node = ICONS[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: '-0.125em', flexShrink: 0, ...style }}
      {...rest}
    >
      {node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

export default AppIcon;
