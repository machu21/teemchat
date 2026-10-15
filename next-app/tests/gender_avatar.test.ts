import { describe, it, expect } from 'vitest';
import {
  normalizeAvatarConfig,
  defaultMaleAvatarConfig,
  defaultFemaleAvatarConfig,
} from '../src/lib/models/avatar';
import { createGuestSession } from '../src/lib/models/user';

describe('Gender and Avatar Specifications', () => {
  it('strictly provides male and female default avatar configurations', () => {
    expect(defaultMaleAvatarConfig.gender).toBe('male');
    expect(defaultMaleAvatarConfig.hairStyle).toBe('short');

    expect(defaultFemaleAvatarConfig.gender).toBe('female');
    expect(defaultFemaleAvatarConfig.hairStyle).toBe('long');
  });

  it('normalizes avatar config with male gender', () => {
    const maleConfig = normalizeAvatarConfig({
      gender: 'male',
      skinColor: '#FCD5B5',
      shirtColor: '#3B82F6',
      hairStyle: 'spiky',
      accessory: 'cap',
    });

    expect(maleConfig.gender).toBe('male');
    expect(maleConfig.hairStyle).toBe('spiky');
    expect(maleConfig.accessory).toBe('cap');
  });

  it('normalizes avatar config with female gender and feminine styles', () => {
    const femaleConfig = normalizeAvatarConfig({
      gender: 'female',
      shirtColor: '#EC4899',
      hairStyle: 'ponytail',
      accessory: 'ribbon',
    });

    expect(femaleConfig.gender).toBe('female');
    expect(femaleConfig.hairStyle).toBe('ponytail');
    expect(femaleConfig.accessory).toBe('ribbon');
  });

  it('falls back strictly to binary gender (male) when invalid or unexpected gender strings are provided', () => {
    const fallbackConfig = normalizeAvatarConfig({
      gender: 'other_custom_gender',
      hairStyle: 'short',
    });

    expect(fallbackConfig.gender).toBe('male');
  });

  it('creates guest session with male gender and distinct styling', () => {
    const maleGuest = createGuestSession('Hero Boy', 'male');
    expect(maleGuest.gender).toBe('male');
    expect(maleGuest.displayName).toBe('Hero Boy');
    expect(maleGuest.avatarConfig.gender).toBe('male');
    expect(maleGuest.isGuest).toBe(true);
  });

  it('creates guest session with female gender and distinct styling', () => {
    const femaleGuest = createGuestSession('Pixel Girl', 'female');
    expect(femaleGuest.gender).toBe('female');
    expect(femaleGuest.displayName).toBe('Pixel Girl');
    expect(femaleGuest.avatarConfig.gender).toBe('female');
    expect(femaleGuest.avatarConfig.hairStyle).toBe('long');
    expect(femaleGuest.isGuest).toBe(true);
  });
});
