export type Gender = 'male' | 'female';

export type ExtendedHairStyle =
  | 'short'
  | 'long'
  | 'buzz'
  | 'spiky'
  | 'ponytail'
  | 'bob'
  | 'side_part'
  | 'curly'
  | 'afro'
  | 'bun'
  | 'pigtails'
  | 'mohawk'
  | 'bald'
  | 'wavy';

export type ExtendedAccessory =
  | 'none'
  | 'glasses'
  | 'sunglasses'
  | 'headband'
  | 'headphones'
  | 'cap'
  | 'beanie'
  | 'earrings'
  | 'ribbon'
  | 'bow';

export type TopStyle = 'tshirt' | 'hoodie' | 'shirt_tie' | 'sweater' | 'jacket' | 'blouse' | 'polo';
export type BottomStyle = 'pants' | 'shorts' | 'skirt';
export type FacialHair = 'none' | 'stubble' | 'beard' | 'mustache' | 'goatee';

export interface AvatarConfig {
  gender?: Gender;
  skinColor: string;
  shirtColor: string;
  hairColor: string;
  hairStyle: ExtendedHairStyle;
  accessory: ExtendedAccessory;
  topStyle?: TopStyle;
  bottomStyle?: BottomStyle;
  bottomColor?: string;
  shoesColor?: string;
  facialHair?: FacialHair;
}

export const defaultMaleAvatarConfig: AvatarConfig = {
  gender: 'male',
  skinColor: '#ffe2cc',
  shirtColor: '#4a86d8',
  hairColor: '#2b2530',
  hairStyle: 'short',
  accessory: 'none',
  topStyle: 'tshirt',
  bottomStyle: 'pants',
  bottomColor: '#2c3655',
  shoesColor: '#2b2b33',
  facialHair: 'none',
};

export const defaultFemaleAvatarConfig: AvatarConfig = {
  gender: 'female',
  skinColor: '#ffe2cc',
  shirtColor: '#e47aa8',
  hairColor: '#5f3c28',
  hairStyle: 'long',
  accessory: 'none',
  topStyle: 'blouse',
  bottomStyle: 'skirt',
  bottomColor: '#3f5f8c',
  shoesColor: '#2b2b33',
  facialHair: 'none',
};

export const defaultAvatarConfig: AvatarConfig = defaultMaleAvatarConfig;

export const availableGenders = ['male', 'female'] as const;

export const availableHairStyles: readonly ExtendedHairStyle[] = [
  'short',
  'long',
  'buzz',
  'spiky',
  'ponytail',
  'bob',
  'side_part',
  'curly',
  'afro',
  'bun',
  'pigtails',
  'mohawk',
  'bald',
  'wavy',
] as const;

export const availableAccessories: readonly ExtendedAccessory[] = [
  'none',
  'glasses',
  'sunglasses',
  'headband',
  'headphones',
  'cap',
  'beanie',
  'earrings',
  'ribbon',
  'bow',
] as const;

export const availableTopStyles: readonly TopStyle[] = [
  'tshirt',
  'hoodie',
  'shirt_tie',
  'sweater',
  'jacket',
  'blouse',
  'polo',
] as const;

export const availableBottomStyles: readonly BottomStyle[] = [
  'pants',
  'shorts',
  'skirt',
] as const;

export const availableFacialHair: readonly FacialHair[] = [
  'none',
  'stubble',
  'beard',
  'mustache',
  'goatee',
] as const;

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
      ? (r.hairStyle as ExtendedHairStyle)
      : baseDefault.hairStyle,
    accessory: (availableAccessories as readonly string[]).includes(String(r.accessory))
      ? (r.accessory as ExtendedAccessory)
      : 'none',
    topStyle: (availableTopStyles as readonly string[]).includes(String(r.topStyle))
      ? (r.topStyle as TopStyle)
      : baseDefault.topStyle,
    bottomStyle: (availableBottomStyles as readonly string[]).includes(String(r.bottomStyle))
      ? (r.bottomStyle as BottomStyle)
      : baseDefault.bottomStyle,
    bottomColor: typeof r.bottomColor === 'string' && r.bottomColor ? r.bottomColor : baseDefault.bottomColor,
    shoesColor: typeof r.shoesColor === 'string' && r.shoesColor ? r.shoesColor : baseDefault.shoesColor,
    facialHair: (availableFacialHair as readonly string[]).includes(String(r.facialHair))
      ? (r.facialHair as FacialHair)
      : baseDefault.facialHair,
  };
}
