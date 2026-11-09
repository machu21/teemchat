/**
 * Calendar invites without OAuth: an RFC 5545 .ics file plus "add to Google /
 * Outlook" deep links. Pure functions (unit tested).
 */

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  durationMin: number;
  /** Where to join (the TeemChat invite link). */
  url: string;
  location?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 20261112T153000Z */
export function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escapes TEXT values (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Folds a content line to 75 octets (continuation lines start with a space). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function endOf(event: CalendarEvent): Date {
  return new Date(event.startsAt.getTime() + event.durationMin * 60_000);
}

function describe(event: CalendarEvent): string {
  const body = event.description?.trim();
  return body ? `${body}\n\nJoin in TeemChat: ${event.url}` : `Join in TeemChat: ${event.url}`;
}

export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TeemChat//Meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@teemchat`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(event.startsAt)}`,
    `DTEND:${toIcsUtc(endOf(event))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(describe(event))}`,
    `LOCATION:${escapeIcsText(event.location || 'TeemChat')}`,
    `URL:${event.url}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(event.title)}`,
    'TRIGGER:-PT10M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsUtc(event.startsAt)}/${toIcsUtc(endOf(event))}`,
    details: describe(event),
    location: event.location || 'TeemChat',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.startsAt.toISOString(),
    enddt: endOf(event).toISOString(),
    body: describe(event),
    location: event.location || 'TeemChat',
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function meetingJoinUrl(origin: string, spaceCode: string, meetingId: string): string {
  return `${origin.replace(/\/$/, '')}/space/${encodeURIComponent(spaceCode)}?meeting=${encodeURIComponent(meetingId)}`;
}

/** "in 5 min", "in 2 h", "now", "ended" — for banners and lists. */
export function startsIn(startsAt: Date, durationMin: number, now: Date = new Date()): string {
  const diff = startsAt.getTime() - now.getTime();
  const end = startsAt.getTime() + durationMin * 60_000;
  if (now.getTime() >= end) return 'ended';
  if (diff <= 0) return 'now';
  const min = Math.ceil(diff / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h} h`;
  return `in ${Math.round(h / 24)} d`;
}
