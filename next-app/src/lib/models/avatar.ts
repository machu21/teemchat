export interface AvatarConfig {
  skinColor: string;
  shirtColor: string;
  hairColor: string;
  hairStyle: 'short' | 'long' | 'buzz' | 'spiky';
  accessory: 'none' | 'glasses' | 'headband' | 'headphones' | 'cap';
}

export const defaultAvatarConfig: AvatarConfig = {
  skinColor: '#FCD5B5',
  shirtColor: '#7C3AED',
  hairColor: '#37271E',
  hairStyle: 'short',
  accessory: 'none',
};

export const availableHairStyles = ['short', 'long', 'buzz', 'spiky'] as const;
export const availableAccessories = ['none', 'glasses', 'headband', 'headphones', 'cap'] as const;

export function normalizeAvatarConfig(raw: unknown): AvatarConfig {
  if (!raw || typeof raw !== 'object') return { ...defaultAvatarConfig };
  const r = raw as Record<string, unknown>;
  return {
    skinColor: typeof r.skinColor === 'string' ? r.skinColor : defaultAvatarConfig.skinColor,
    shirtColor: typeof r.shirtColor === 'string' ? r.shirtColor : defaultAvatarConfig.shirtColor,
    hairColor: typeof r.hairColor === 'string' ? r.hairColor : defaultAvatarConfig.hairColor,
    hairStyle: (availableHairStyles as readonly string[]).includes(String(r.hairStyle))
      ? (r.hairStyle as AvatarConfig['hairStyle'])
      : 'short',
    accessory: (availableAccessories as readonly string[]).includes(String(r.accessory))
      ? (r.accessory as AvatarConfig['accessory'])
      : 'none',
  };
}
