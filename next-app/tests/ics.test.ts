import { describe, it, expect } from 'vitest';
import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  meetingJoinUrl,
  outlookCalendarUrl,
  startsIn,
  toIcsUtc,
} from '../src/lib/calendar/ics';

const event = {
  id: 'abc-123',
  title: 'Standup; sprint 4, day 2',
  description: 'Line one\nLine two',
  startsAt: new Date(Date.UTC(2026, 10, 12, 15, 30, 0)),
  durationMin: 45,
  url: 'https://teemchat.app/space/hq?meeting=abc-123',
  location: 'Boardroom · HQ (TeemChat)',
};

describe('calendar invites', () => {
  it('formats UTC timestamps', () => {
    expect(toIcsUtc(event.startsAt)).toBe('20261112T153000Z');
  });

  it('escapes text values', () => {
    expect(escapeIcsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });

  it('folds long lines at 75 octets without splitting characters', () => {
    const line = `DESCRIPTION:${'é'.repeat(60)}`;
    const folded = foldIcsLine(line);
    const enc = new TextEncoder();
    for (const part of folded.split('\r\n')) {
      expect(enc.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
  });

  it('builds a valid VEVENT with start, end, alarm and CRLF endings', () => {
    const ics = buildIcs(event, new Date(Date.UTC(2026, 10, 1)));
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('UID:abc-123@teemchat');
    expect(ics).toContain('DTSTART:20261112T153000Z');
    expect(ics).toContain('DTEND:20261112T161500Z');
    expect(ics).toContain('SUMMARY:Standup\\; sprint 4\\, day 2');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('creates Google and Outlook deep links', () => {
    const g = new URL(googleCalendarUrl(event));
    expect(g.hostname).toBe('calendar.google.com');
    expect(g.searchParams.get('dates')).toBe('20261112T153000Z/20261112T161500Z');
    expect(g.searchParams.get('details')).toContain(event.url);

    const o = new URL(outlookCalendarUrl(event));
    expect(o.hostname).toBe('outlook.live.com');
    expect(o.searchParams.get('startdt')).toBe('2026-11-12T15:30:00.000Z');
    expect(o.searchParams.get('subject')).toBe(event.title);
  });

  it('builds join links and relative start labels', () => {
    expect(meetingJoinUrl('https://x.app/', 'my space', 'id1')).toBe('https://x.app/space/my%20space?meeting=id1');
    const now = new Date(Date.UTC(2026, 10, 12, 15, 0));
    expect(startsIn(event.startsAt, 45, now)).toBe('in 30 min');
    expect(startsIn(event.startsAt, 45, new Date(Date.UTC(2026, 10, 12, 15, 40)))).toBe('now');
    expect(startsIn(event.startsAt, 45, new Date(Date.UTC(2026, 10, 12, 16, 20)))).toBe('ended');
    expect(startsIn(event.startsAt, 45, new Date(Date.UTC(2026, 10, 12, 10, 0)))).toBe('in 6 h');
  });
});
