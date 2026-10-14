import { AvatarConfig, defaultAvatarConfig, normalizeAvatarConfig } from './avatar';

export interface UserSession {
  id: string;
  displayName: string;
  username: string;
  email: string;
  status: string;
  avatarConfig: AvatarConfig;
  isGuest: boolean;
  tier: 'free' | 'paid';
  isPaid: boolean;
  hasAiCompanion: boolean;
}

export function createGuestSession(name?: string): UserSession {
  const randomId = Math.floor(Math.random() * 9000) + 1000;
  const guestName = name && name.trim() ? name.trim() : `Guest #${randomId}`;
  const guestColors = [
    '#EF4444',
    '#F59E0B',
    '#10B981',
    '#06B6D4',
    '#8B5CF6',
    '#EC4899',
    '#3B82F6',
  ];
  const color = guestColors[randomId % guestColors.length];

  return {
    id: `guest_${Date.now()}_${randomId}`,
    displayName: guestName,
    username: `guest_${randomId}`,
    email: `guest_${randomId}@virtualworld.local`,
    status: 'available',
    avatarConfig: {
      ...defaultAvatarConfig,
      shirtColor: color,
    },
    isGuest: true,
    tier: 'free',
    isPaid: false,
    hasAiCompanion: false,
  };
}
