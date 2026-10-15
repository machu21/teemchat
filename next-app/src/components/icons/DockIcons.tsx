import React from 'react';

export interface DockIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

/**
 * Microphone Icon (Active / Unmuted)
 */
export const MicIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
    <line x1="8" x2="16" y1="22" y2="22" />
  </svg>
);

/**
 * Microphone Muted Icon
 */
export const MicOffIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <line x1="2" x2="22" y1="2" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" x2="12" y1="19" y2="22" />
    <line x1="8" x2="16" y1="22" y2="22" />
  </svg>
);

/**
 * Video Camera Icon (Active)
 */
export const VideoIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="m16 8 5-3v14l-5-3" />
    <rect width="13" height="12" x="3" y="6" rx="2" />
  </svg>
);

/**
 * Video Camera Off Icon
 */
export const VideoOffIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <line x1="2" x2="22" y1="2" y2="22" />
    <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5-3v8.5" />
    <path d="M16 16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.34" />
  </svg>
);

/**
 * Photo / Web Camera Icon
 */
export const CameraIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

/**
 * Screen Share Icon
 */
export const ScreenShareIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <path d="M12 17v4" />
    <path d="M8 21h8" />
    <path d="m9 10 3-3 3 3" />
    <path d="M12 7v6" />
  </svg>
);

/**
 * Chat Bubble Icon
 */
export const ChatBubbleIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    <circle cx="8" cy="11.5" r="1" fill={color} stroke="none" />
    <circle cx="12" cy="11.5" r="1" fill={color} stroke="none" />
    <circle cx="16" cy="11.5" r="1" fill={color} stroke="none" />
  </svg>
);

/**
 * Hammer / Build Mode Icon
 */
export const HammerIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9" />
    <path d="M17.64 4.36 19.8 6.52a2 2 0 0 1 0 2.83l-1.42 1.41-5.66-5.65 1.42-1.42a2 2 0 0 1 2.83 0z" />
    <path d="m6 15 3 3" />
  </svg>
);

/**
 * Music Note / Sound Tripping Icon
 */
export const MusicIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

/**
 * Rocket / Fast Travel Icon
 */
export const RocketIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    <circle cx="15.5" cy="8.5" r="1" fill={color} stroke="none" />
  </svg>
);

/**
 * Robot / AI Companion Icon
 */
export const BotIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M12 4v4" />
    <circle cx="12" cy="3" r="1" fill={color} stroke="none" />
    <line x1="9" x2="9.01" y1="13" y2="13" strokeWidth={strokeWidth + 1} />
    <line x1="15" x2="15.01" y1="13" y2="13" strokeWidth={strokeWidth + 1} />
    <path d="M9 16h6" />
    <path d="M2 13h2" />
    <path d="M20 13h2" />
  </svg>
);

/**
 * Phone Hang Up / Call End Icon
 */
export const PhoneOffIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);

/**
 * Maximize Icon
 */
export const MaximizeIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M15 3h6v6" />
    <path d="m21 3-7 7" />
    <path d="M9 21H3v-6" />
    <path d="m3 21 7-7" />
  </svg>
);

/**
 * Minimize Icon
 */
export const MinimizeIcon: React.FC<DockIconProps> = ({
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path d="M4 14h6v6" />
    <path d="m10 14-7 7" />
    <path d="M20 10h-6V4" />
    <path d="m14 10 7-7" />
  </svg>
);
