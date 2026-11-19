import { describe, expect, it } from 'vitest';
import {
  defaultFemaleAvatarConfig,
  defaultMaleAvatarConfig,
  switchAvatarGender,
} from '@/lib/models/avatar';

describe('switchAvatarGender', () => {
  it('moves male defaults to female defaults so the preview changes', () => {
    const next = switchAvatarGender({ ...defaultMaleAvatarConfig, shirtColor: '#f59e0b' }, 'female');
    expect(next.gender).toBe('female');
    expect(next.hairStyle).toBe('long');
    expect(next.topStyle).toBe('blouse');
    expect(next.bottomStyle).toBe('skirt');
    // Customized fields are kept.
    expect(next.shirtColor).toBe('#f59e0b');
  });

  it('keeps customized styles and drops male-only items', () => {
    const next = switchAvatarGender(
      { ...defaultMaleAvatarConfig, hairStyle: 'curly', topStyle: 'polo', facialHair: 'beard' },
      'female'
    );
    expect(next.hairStyle).toBe('curly');
    expect(next.topStyle).toBe('blouse');
    expect(next.facialHair).toBe('none');
  });

  it('switches back to male defaults', () => {
    const next = switchAvatarGender(defaultFemaleAvatarConfig, 'male');
    expect(next).toMatchObject({ gender: 'male', hairStyle: 'short', topStyle: 'tshirt', bottomStyle: 'pants' });
  });

  it('is a no-op for the same gender', () => {
    expect(switchAvatarGender(defaultMaleAvatarConfig, 'male')).toBe(defaultMaleAvatarConfig);
  });
});

describe('cssColorToHex', () => {
  it('converts computed rgb colours for the native bars', async () => {
    const { cssColorToHex } = await import('@/components/native/NativeThemeBars');
    expect(cssColorToHex('rgb(24, 13, 38)')).toBe('#180d26');
    expect(cssColorToHex('rgba(246, 244, 238, 1)')).toBe('#f6f4ee');
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColorToHex('#ABCDEF')).toBe('#abcdef');
  });
});
