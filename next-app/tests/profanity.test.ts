import { describe, it, expect } from 'vitest';
import { containsProfanity, filterText } from '../src/lib/safety/profanity';

describe('profanity filter', () => {
  it('masks plain swear words and keeps the rest of the sentence', () => {
    expect(filterText('what the shit is this')).toBe('what the **** is this');
    expect(filterText('Fuck!')).toBe('*****');
  });

  it('catches leetspeak, inner punctuation and stretched letters', () => {
    for (const evasion of ['sh1t', 'a$$', 'f.u.c.k', 'fuuuuck', 'B1TCH', '@sshole']) {
      expect(containsProfanity(evasion), evasion).toBe(true);
    }
  });

  it('catches letters spaced across words', () => {
    expect(filterText('you f u c k')).toBe('you * * * *');
    expect(containsProfanity('s h i t happens')).toBe(true);
  });

  it('handles simple plural and verb endings', () => {
    expect(containsProfanity('asses')).toBe(true);
    expect(containsProfanity('bitches')).toBe(true);
    expect(containsProfanity('fucked')).toBe(true);
  });

  it('does not flag innocent words that contain bad substrings', () => {
    const clean = [
      'class',
      'assess',
      'Scunthorpe',
      'cocky',
      'cocker spaniel',
      'cumin',
      'spices',
      'hello',
      'assassin',
      'Dickens',
      'analysis',
      'I scored 100 points',
      'a b c',
    ];
    for (const text of clean) {
      expect(filterText(text), text).toBe(text);
    }
  });

  it('preserves whitespace and empty input', () => {
    expect(filterText('')).toBe('');
    expect(filterText('  hi   there ')).toBe('  hi   there ');
  });
});
