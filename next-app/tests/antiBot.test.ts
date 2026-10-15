import { describe, it, expect } from 'vitest';
import {
  isDisposableEmail,
  normalizeEmail,
  validateUsername,
  validateFormTiming,
} from '../src/lib/security/disposableEmails';
import {
  RateLimiter,
  RATE_LIMITS,
} from '../src/lib/rateLimit';

describe('Disposable Email Filter', () => {
  it('detects burner and temporary email domains', () => {
    expect(isDisposableEmail('bot@mailinator.com')).toBe(true);
    expect(isDisposableEmail('hacker@10minutemail.com')).toBe(true);
    expect(isDisposableEmail('spam@guerrillamail.com')).toBe(true);
    expect(isDisposableEmail('throwaway@trashmail.com')).toBe(true);
    expect(isDisposableEmail('temp@yopmail.com')).toBe(true);
    expect(isDisposableEmail('anon@sharklasers.com')).toBe(true);
  });

  it('permits legitimate email domains', () => {
    expect(isDisposableEmail('alice@gmail.com')).toBe(false);
    expect(isDisposableEmail('bob@outlook.com')).toBe(false);
    expect(isDisposableEmail('carol@yahoo.com')).toBe(false);
    expect(isDisposableEmail('dev@company.io')).toBe(false);
    expect(isDisposableEmail('user@proton.me')).toBe(false);
  });

  it('safely handles malformed email inputs', () => {
    expect(isDisposableEmail('')).toBe(false);
    expect(isDisposableEmail('invalid-string')).toBe(false);
    expect(isDisposableEmail('@missinguser.com')).toBe(false);
    expect(isDisposableEmail(null as unknown as string)).toBe(false);
  });
});

describe('Email Normalization', () => {
  it('strips plus-addressing sub-aliases to prevent duplicate bot farming', () => {
    expect(normalizeEmail('alice+bot1@gmail.com')).toBe('alice@gmail.com');
    expect(normalizeEmail('ALICE+test99@GMAIL.COM')).toBe('alice@gmail.com');
    expect(normalizeEmail('hacker+1+2+3@domain.org')).toBe('hacker@domain.org');
  });

  it('trims whitespace and converts domain to lowercase', () => {
    expect(normalizeEmail('  User@Domain.Com  ')).toBe('user@domain.com');
  });

  it('preserves clean emails untouched', () => {
    expect(normalizeEmail('standard_user@example.com')).toBe('standard_user@example.com');
  });
});

describe('Username Validation', () => {
  it('accepts valid alphanumeric usernames with underscores and hyphens', () => {
    expect(validateUsername('pixel_hero').valid).toBe(true);
    expect(validateUsername('neo-coder-99').valid).toBe(true);
    expect(validateUsername('AlexRivera').valid).toBe(true);
  });

  it('rejects usernames that are too short or too long', () => {
    expect(validateUsername('ab').valid).toBe(false);
    expect(validateUsername('').valid).toBe(false);
    expect(validateUsername('a'.repeat(25)).valid).toBe(false);
  });

  it('rejects usernames containing illegal or special characters', () => {
    expect(validateUsername('user name').valid).toBe(false);
    expect(validateUsername('user@domain').valid).toBe(false);
    expect(validateUsername('<script>').valid).toBe(false);
    expect(validateUsername('bot#1').valid).toBe(false);
  });
});

describe('Form Submission Timing Velocity', () => {
  it('allows submissions that took a realistic human duration', () => {
    const renderedAt = 1000;
    const submittedAt = 3500; // 2.5 seconds
    const result = validateFormTiming(renderedAt, submittedAt, 1200);
    expect(result.valid).toBe(true);
  });

  it('rejects sub-second automated bot submissions', () => {
    const renderedAt = 1000;
    const submittedAt = 1400; // only 400ms (bot script)
    const result = validateFormTiming(renderedAt, submittedAt, 1200);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('too fast');
  });

  it('rejects missing or corrupted timestamp inputs', () => {
    expect(validateFormTiming(null).valid).toBe(false);
    expect(validateFormTiming(undefined).valid).toBe(false);
    expect(validateFormTiming(NaN).valid).toBe(false);
  });
});

describe('Sign-up Rate Limiting Preset', () => {
  it('enforces maximum 5 sign-ups in 15 minutes window', () => {
    const limiter = new RateLimiter();
    const ip = '198.51.100.55';
    const config = RATE_LIMITS.AUTH_SIGNUP;

    const t0 = 10000;
    // 5 attempts allowed
    for (let i = 0; i < 5; i++) {
      const res = limiter.check(`ip:signup:${ip}`, config, t0 + i * 1000);
      expect(res.success).toBe(true);
    }

    // 6th attempt rejected
    const blocked = limiter.check(`ip:signup:${ip}`, config, t0 + 6000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });
});
