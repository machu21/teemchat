import { describe, it, expect } from 'vitest';
import { generateIpTag, formatGuestHandles } from '../src/lib/security/guestIdentity';
import { createGuestSession } from '../src/lib/models/user';

describe('Guest Identity & IP Tagging System', () => {
  it('generates consistent tags for the same IP', () => {
    const ip = '198.51.100.24';
    const tag1 = generateIpTag(ip);
    const tag2 = generateIpTag(ip);
    expect(tag1).toBe(tag2);
    expect(tag1).toMatch(/^[0-9A-F]{4}$/);
  });

  it('normalizes localhost and IPv6 loopback to consistent baseline tag', () => {
    const tagLocalIPv4 = generateIpTag('127.0.0.1');
    const tagLocalIPv6 = generateIpTag('::1');
    const tagLocalhost = generateIpTag('localhost');
    expect(tagLocalIPv4).toBe(tagLocalIPv6);
    expect(tagLocalIPv4).toBe(tagLocalhost);
  });

  it('generates distinct tags for distinct external IPs', () => {
    const tagA = generateIpTag('198.51.100.24');
    const tagB = generateIpTag('203.0.113.88');
    expect(tagA).not.toBe(tagB);
  });

  it('disambiguates multiple sessions on the same IP via instance seed', () => {
    const ip = '127.0.0.1';
    const session1 = generateIpTag(ip, 'TAB_1');
    const session2 = generateIpTag(ip, 'TAB_2');
    expect(session1).not.toBe(session2);
  });

  it('formats handles according to conventions', () => {
    const handles = formatGuestHandles('7B4D');
    expect(handles.username).toBe('guest_7b4d');
    expect(handles.displayName).toBe('Explorer #7B4D');
  });

  it('creates guest session with preferred username', () => {
    const session = createGuestSession('', 'male', 'guest_7b4d');
    expect(session.username).toBe('guest_7b4d');
    expect(session.displayName).toBe('Explorer #7B4D');
    expect(session.email).toBe('guest_7b4d@virtualworld.local');
    expect(session.isGuest).toBe(true);
  });

  it('creates guest session with custom display name and preferred username', () => {
    const session = createGuestSession('Pixel Hero', 'female', 'guest_7b4d');
    expect(session.username).toBe('guest_7b4d');
    expect(session.displayName).toBe('Pixel Hero');
    expect(session.gender).toBe('female');
  });
});
