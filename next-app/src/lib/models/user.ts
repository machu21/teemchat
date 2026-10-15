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
}

export function createGuestSession(name?: string, gender: Gender = 'male'): UserSession {
  const randomId = Math.floor(Math.random() * 9000) + 1000;
  const guestName = name && name.trim() ? name.trim() : `Guest #${randomId}`;
  
  const maleColors = ['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#06B6D4'];
  const femaleColors = ['#EC4899', '#8B5CF6', '#F43F5E', '#10B981', '#06B6D4', '#F59E0B'];
  
  const colors = gender === 'female' ? femaleColors : maleColors;
  const color = colors[randomId % colors.length];

  const baseConfig = gender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig;

  return {
    id: `guest_${Date.now()}_${randomId}`,
    displayName: guestName,
    username: `guest_${randomId}`,
    email: `guest_${randomId}@virtualworld.local`,
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
  };
}
