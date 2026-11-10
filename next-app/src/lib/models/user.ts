import {
  AvatarConfig,
  Gender,
  defaultMaleAvatarConfig,
  defaultFemaleAvatarConfig,
} from './avatar';

export interface UserSession {
  id: string;
  displayName: string;
  username: string;
  email: string;
  status: string;
  avatarConfig: AvatarConfig;
  gender: Gender;
  isGuest: boolean;
  tier: 'free' | 'paid';
  isPaid: boolean;
  hasAiCompanion: boolean;
  countryCode?: string;
}

export function createGuestSession(
  name?: string,
  gender: Gender = 'male',
  preferredUsername?: string,
  countryCode?: string
): UserSession {
  const randomId = Math.floor(Math.random() * 9000) + 1000;
  const cleanUsername = preferredUsername && preferredUsername.trim()
    ? preferredUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    : `guest_${randomId}`;
  
  const guestTag = cleanUsername.replace(/^guest_/i, '').toUpperCase();
  const guestName = name && name.trim()
    ? name.trim()
    : (guestTag ? `Explorer #${guestTag}` : `Guest #${randomId}`);
  
  const maleColors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4'];
  const femaleColors = ['#EC4899', '#8B5CF6', '#F43F5E', '#10B981', '#06B6D4', '#F59E0B'];
  
  const colors = gender === 'female' ? femaleColors : maleColors;
  const color = colors[randomId % colors.length];

  const baseConfig = gender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig;

  return {
    id: `guest_${Date.now()}_${randomId}`,
    displayName: guestName,
    username: cleanUsername,
    email: `${cleanUsername}@virtualworld.local`,
    status: 'available',
    gender,
    avatarConfig: {
      ...baseConfig,
      gender,
      shirtColor: color,
    },
    isGuest: true,
    tier: 'free',
    isPaid: false,
    hasAiCompanion: false,
    countryCode: countryCode || 'XX',
  };
}
