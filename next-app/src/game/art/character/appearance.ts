// Appearance generator, palettes and converter for 24x34 Chibi pixel art.
import type {
  Accessory,
  Appearance,
  BottomStyle,
  FacialHair,
  HairStyle,
  TopStyle,
} from '../api';
import type { AvatarConfig } from '@/lib/models/avatar';

export const HAIR_STYLES: readonly HairStyle[] = [
  'short', 'buzz', 'spiky', 'side_part', 'curly', 'afro', 'bob', 'long', 'ponytail', 'bun', 'pigtails', 'mohawk', 'bald', 'wavy',
] as const;

export const TOP_STYLES: readonly TopStyle[] = [
  'tshirt', 'hoodie', 'shirt_tie', 'sweater', 'jacket', 'blouse', 'polo',
] as const;

export const ACCESSORIES: readonly Accessory[] = [
  'none', 'glasses', 'sunglasses', 'headphones', 'cap', 'beanie', 'earrings', 'bow',
] as const;

export const FACIAL_HAIR: readonly FacialHair[] = [
  'none', 'stubble', 'beard', 'mustache', 'goatee',
] as const;

export const BOTTOM_STYLES: readonly BottomStyle[] = [
  'pants', 'shorts', 'skirt',
] as const;

export const SKINS = [
  '#ffe2cc', '#f6cfb0', '#eab894', '#d69f78', '#bd8560', '#9a6444', '#7a4a31', '#5a3623',
] as const;

export const HAIR_NATURAL = [
  '#2b2530', // black
  '#3f2c22', // dark brown
  '#5f3c28', // brown
  '#87593a', // light brown
  '#b0703c', // auburn
  '#8e3b2b', // chestnut
  '#d6ae68', // blonde
  '#ebdcb0', // platinum
  '#8f929b', // grey
  '#d9dbe0', // white
] as const;

export const HAIR_FUN = [
  '#e47aa8', '#5b8fe0', '#8f6ad8', '#3fb3a0', '#e0584e', '#7cc45a', '#f0a24a',
] as const;

export const EYES = [
  '#2b2236', '#4a2f22', '#5a3b22', '#2f5f9e', '#3c7a52',
] as const;

export const TOP_COLORS = [
  '#e2604f', '#4a86d8', '#4bab72', '#efb54a', '#8d66cf', '#36b0b0', '#e47aa8', '#3d4352', '#f1efe9',
  '#8a96a3', '#2f4c7d', '#c9713f', '#76913f', '#e3d3b2', '#f29b72', '#5bc0de', '#b04a5a', '#f2d16b',
] as const;

export const BOTTOMS = [
  '#3f5f8c', '#2e3e5e', '#2c2c35', '#b49c72', '#6d7480', '#6e4c38', '#5f6845', '#2c3655', '#7f9cc4',
] as const;

export const SHOES = [
  '#2b2b33', '#6b4630', '#ececec', '#d04848', '#3f63a8', '#b88752', '#7d8592',
] as const;

export const ACC_COLORS: Record<Accessory, readonly string[]> = {
  none: ['#2b2b33'],
  glasses: ['#2b2b33', '#5a3a28', '#3f63a8', '#b03a3a', '#8a8f99'],
  sunglasses: ['#22232b'],
  headphones: ['#2b2b33', '#f1efe9', '#e2604f', '#4a86d8', '#efb54a', '#36b0b0'],
  cap: ['#e2604f', '#4a86d8', '#2b2b33', '#4bab72', '#efb54a', '#f1efe9', '#2f4c7d'],
  beanie: ['#e2604f', '#efb54a', '#4bab72', '#8d66cf', '#3d4352', '#36b0b0'],
  earrings: ['#f2c14e', '#d9dde3'],
  bow: ['#e2604f', '#e47aa8', '#efb54a', '#4a86d8', '#8d66cf'],
};

/** Deterministic PRNG mulberry32 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Stable cache key for character sprites.
 */
export function appearanceKey(a: Appearance): string {
  return [
    a.skin,
    a.hair,
    a.hairStyle,
    a.eyes,
    a.top,
    a.topAccent,
    a.topStyle,
    a.bottom,
    a.shoes,
    a.accessory,
    a.accessoryColor,
    a.lanyard ?? '-',
    a.look,
    a.facialHair ?? '-',
    a.bottomStyle ?? '-',
  ].join('|');
}

/**
 * Maps legacy and extended TeemChat AvatarConfig to Habblaud Appearance.
 */
export function configToAppearance(config: AvatarConfig): Appearance {
  const isFemale = config.gender === 'female';
  const look: 'f' | 'm' = isFemale ? 'f' : 'm';

  // Hair style mapping
  let hairStyle: HairStyle = 'short';
  if (config.hairStyle) {
    if ((HAIR_STYLES as readonly string[]).includes(config.hairStyle)) {
      hairStyle = config.hairStyle as HairStyle;
    } else if (config.hairStyle === 'long') {
      hairStyle = 'long';
    } else if (config.hairStyle === 'ponytail') {
      hairStyle = 'ponytail';
    }
  } else {
    hairStyle = isFemale ? 'long' : 'short';
  }

  // Accessory mapping
  let accessory: Accessory = 'none';
  if (config.accessory) {
    if ((ACCESSORIES as readonly string[]).includes(config.accessory)) {
      accessory = config.accessory as Accessory;
    } else if (config.accessory === 'ribbon') {
      accessory = 'bow';
    } else if (config.accessory === 'headband') {
      accessory = 'headphones';
    }
  }

  // Top style mapping
  const topStyle: TopStyle = config.topStyle && (TOP_STYLES as readonly string[]).includes(config.topStyle)
    ? (config.topStyle as TopStyle)
    : (isFemale ? 'blouse' : 'tshirt');

  // Bottom style mapping
  const bottomStyle: BottomStyle = config.bottomStyle && (BOTTOM_STYLES as readonly string[]).includes(config.bottomStyle)
    ? (config.bottomStyle as BottomStyle)
    : (isFemale ? 'skirt' : 'pants');

  const top = config.shirtColor || (isFemale ? '#EC4899' : '#3B82F6');
  const bottom = config.bottomColor || (isFemale ? '#3B4252' : '#2E3440');
  const shoes = config.shoesColor || '#2B2B33';
  const accessoryColor = ACC_COLORS[accessory]?.[0] || '#2B2B33';

  return {
    skin: config.skinColor || '#f6cfb0',
    hair: config.hairColor || '#3f2c22',
    hairStyle,
    eyes: '#2b2236',
    top,
    topAccent: '#f4f4f0',
    topStyle,
    bottom,
    shoes,
    accessory,
    accessoryColor,
    lanyard: null,
    look,
    facialHair: config.facialHair || 'none',
    bottomStyle,
  };
}
