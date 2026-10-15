export type Gender = 'male' | 'female';

export interface AvatarConfig {
  gender?: Gender;
  skinColor: string;
  shirtColor: string;
  hairColor: string;
  hairStyle: 'short' | 'long' | 'buzz' | 'spiky' | 'ponytail' | 'bob';
  accessory: 'none' | 'glasses' | 'headband' | 'headphones' | 'cap' | 'ribbon';
}

export const defaultMaleAvatarConfig: AvatarConfig = {
  gender: 'male',
  skinColor: '#FCD5B5',
  shirtColor: '#3B82F6',
  hairColor: '#37271E',
  hairStyle: 'short',
  accessory: 'none',
};

export const defaultFemaleAvatarConfig: AvatarConfig = {
  gender: 'female',
  skinColor: '#FCD5B5',
  shirtColor: '#EC4899',
  hairColor: '#4A2810',
  hairStyle: 'long',
  accessory: 'none',
};

export const defaultAvatarConfig: AvatarConfig = defaultMaleAvatarConfig;

export const availableGenders = ['male', 'female'] as const;
export const availableHairStyles = ['short', 'long', 'buzz', 'spiky', 'ponytail', 'bob'] as const;
export const availableAccessories = ['none', 'glasses', 'headband', 'headphones', 'cap', 'ribbon'] as const;

export function normalizeAvatarConfig(raw: unknown, fallbackGender: Gender = 'male'): AvatarConfig {
  if (!raw || typeof raw !== 'object') {
    return fallbackGender === 'female' ? { ...defaultFemaleAvatarConfig } : { ...defaultMaleAvatarConfig };
  }
  const r = raw as Record<string, unknown>;
  const rawGender = String(r.gender || '').toLowerCase();
  const gender: Gender = rawGender === 'female' ? 'female' : (rawGender === 'male' ? 'male' : fallbackGender);
  const baseDefault = gender === 'female' ? defaultFemaleAvatarConfig : defaultMaleAvatarConfig;

  return {
    gender,
    skinColor: typeof r.skinColor === 'string' && r.skinColor ? r.skinColor : baseDefault.skinColor,
    shirtColor: typeof r.shirtColor === 'string' && r.shirtColor ? r.shirtColor : baseDefault.shirtColor,
    hairColor: typeof r.hairColor === 'string' && r.hairColor ? r.hairColor : baseDefault.hairColor,
    hairStyle: (availableHairStyles as readonly string[]).includes(String(r.hairStyle))
      ? (r.hairStyle as AvatarConfig['hairStyle'])
      : baseDefault.hairStyle,
    accessory: (availableAccessories as readonly string[]).includes(String(r.accessory))
      ? (r.accessory as AvatarConfig['accessory'])
      : 'none',
  };
}
