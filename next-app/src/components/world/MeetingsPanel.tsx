'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { Meeting, MeetingService } from '@/lib/services/meetings';
import { MeetingNote, MeetingNotesService } from '@/lib/services/meetingNotes';
import { buildIcs, googleCalendarUrl, meetingJoinUrl, outlookCalendarUrl, startsIn } from '@/lib/calendar/ics';
import { roomById, roomsForMap } from '@/lib/world/rooms';
import styles from './Boards.module.css';
import { AppIcon } from '@/components/icons/AppIcon';

interface MeetingsPanelProps {
  spaceId: string;
  spaceCode: string;
  spaceName: string;
  mapTheme: string | null | undefined;
  userId: string;
  /** Hosts schedule; everyone can see and join. */
  canSchedule: boolean;
  safeText: (text: string) => string;
  onJoin: (meeting: Meeting) => void;
  onOpenNote: (note: MeetingNote) => void;
  onClose: () => void;
}

type Tab = 'upcoming' | 'schedule' | 'notes';

/** Local datetime-input value for a Date. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function nextHalfHour(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

export function MeetingsPanel({
  spaceId,
  spaceCode,
  spaceName,
  mapTheme,
  userId,
  canSchedule,
  safeText,
  onJoin,
  onOpenNote,
  onClose,
}: MeetingsPanelProps) {
  const [tab, setTab] = useState<Tab>('upcoming');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(() => toLocalInput(nextHalfHour()));
  const [duration, setDuration] = useState(30);
  const [roomId, setRoomId] = useState<string>('');
  const [agenda, setAgenda] = useState('');
  const [saving, setSaving] = useState(false);

  const rooms = roomsForMap(mapTheme);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const refresh = useCallback(async () => {
    const [m, n] = await Promise.all([MeetingService.listUpcoming(spaceId), MeetingNotesService.list(spaceId)]);
    setMeetings(m);
    setNotes(n);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([MeetingService.listUpcoming(spaceId), MeetingNotesService.list(spaceId)])
      .then(([m, n]) => {
        if (cancelled) return;
        setMeetings(m);
        setNotes(n);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const eventOf = (m: Meeting) => {
    const room = m.roomId ? roomById(mapTheme, m.roomId) : null;
    return {
      id: m.id,
      title: m.title,
      description: m.agenda,
      startsAt: m.startsAt,
      durationMin: m.durationMin,
      url: meetingJoinUrl(origin, spaceCode, m.id),
      location: room ? `${room.name} · ${spaceName} (TeemChat)` : `${spaceName} (TeemChat)`,
    };
  };

  const downloadIcs = (m: Meeting) => {
    const blob = new Blob([buildIcs(eventOf(m))], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${m.title.replace(/[^\w-]+/g, '-').slice(0, 40) || 'meeting'}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyLink = async (m: Meeting) => {
    try {
      await navigator.clipboard.writeText(eventOf(m).url);
      setMessage('Invite link copied.');
    } catch {
      setMessage(eventOf(m).url);
    }
  };

  const schedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await MeetingService.create(spaceId, userId, {
      title,
      agenda,
      startsAt: new Date(when),
      durationMin: duration,
      roomId: roomId || null,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setTitle('');
    setAgenda('');
    setMessage('Meeting scheduled. Share the invite from the Upcoming tab.');
    setTab('upcoming');
    refresh().catch(() => {});
  };

  const remove = async (m: Meeting) => {
    if (await MeetingService.remove(m.id)) refresh().catch(() => {});
    else setError('Could not cancel the meeting.');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'upcoming', label: 'Upcoming' },
    ...(canSchedule ? [{ id: 'schedule' as Tab, label: 'Schedule' }] : []),
    { id: 'notes', label: 'Notes' },
  ];

  return (
    <NeoModal isOpen onClose={onClose} title="Meetings" maxWidth="560px">
      <div className={styles.stack}>
        <div className={styles.tabs} role="tablist" aria-label="Meetings">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabOn : ''}`}
              onClick={() => {
                setTab(t.id);
                setError(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {message && (
          <p className={styles.muted} role="status">
            {message}
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {tab === 'upcoming' && (
          <div className={styles.list}>
            {loading && <p className={styles.muted}>Loading…</p>}
            {!loading && meetings.length === 0 && (
              <p className={styles.muted}>
                No meetings scheduled.{canSchedule ? ' Use the Schedule tab to plan one.' : ''}
              </p>
            )}
            {meetings.map((m) => {
              const room = m.roomId ? roomById(mapTheme, m.roomId) : null;
              const ev = eventOf(m);
              const status = startsIn(m.startsAt, m.durationMin);
              return (
                <article key={m.id} className={styles.item}>
                  <div className={styles.itemTitle}>{safeText(m.title)}</div>
                  <div className={styles.muted}>
                    {m.startsAt.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    {m.durationMin} min · {room ? <><AppIcon name={room.icon} /> {room.name}</> : 'Anywhere'} · {status}
                  </div>
                  {m.agenda && <div className={styles.muted}>{safeText(m.agenda)}</div>}
                  <div className={styles.row}>
                    <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => onJoin(m)}>
                      <AppIcon name="door" /> {status === 'now' ? 'Join now' : 'Go to room'}
                    </button>
                    <a className={styles.btn} href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">
                      Google
                    </a>
                    <a className={styles.btn} href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">
                      Outlook
                    </a>
                    <button type="button" className={styles.btn} onClick={() => downloadIcs(m)}>
                      .ics
                    </button>
                    <button type="button" className={styles.btn} onClick={() => copyLink(m)}>
                      <AppIcon name="link" /> Copy invite
                    </button>
                    {(canSchedule || m.createdBy === userId) && (
                      <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => remove(m)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {tab === 'schedule' && canSchedule && (
          <form className={styles.stack} onSubmit={schedule}>
            <label className={styles.label} htmlFor="meeting-title">
              Title
            </label>
            <input
              id="meeting-title"
              className={styles.input}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly standup"
              required
            />
            <div className={styles.grid2}>
              <div className={styles.stack}>
                <label className={styles.label} htmlFor="meeting-when">
                  Starts
                </label>
                <input
                  id="meeting-when"
                  type="datetime-local"
                  className={styles.input}
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  required
                />
              </div>
              <div className={styles.stack}>
                <label className={styles.label} htmlFor="meeting-duration">
                  Duration
                </label>
                <select
                  id="meeting-duration"
                  className={styles.select}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  {[15, 30, 45, 60, 90, 120].map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className={styles.label} htmlFor="meeting-room">
              Room
            </label>
            <select id="meeting-room" className={styles.select} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Anywhere in the space</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  <AppIcon name={r.icon} /> {r.name}
                </option>
              ))}
            </select>
            <label className={styles.label} htmlFor="meeting-agenda">
              Agenda (optional)
            </label>
            <textarea
              id="meeting-agenda"
              className={styles.textarea}
              maxLength={2000}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="1. Updates  2. Blockers  3. Next steps"
            />
            <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={saving || !title.trim()}>
              {saving ? 'Scheduling…' : <><AppIcon name="calendar" /> Schedule meeting</>}
            </button>
          </form>
        )}

        {tab === 'notes' && (
          <div className={styles.list}>
            {!loading && notes.length === 0 && (
              <p className={styles.muted}>No meeting notes yet. Press <AppIcon name="notes" /> Take notes inside a room to start.</p>
            )}
            {notes.map((n) => (
              <button key={n.id} type="button" className={styles.item} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => onOpenNote(n)}>
                <span className={styles.itemTitle}>{safeText(n.title)}</span>
                <span className={styles.muted}>
                  {n.createdAt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ·{' '}
                  {n.actionItems.length} action item{n.actionItems.length === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </NeoModal>
  );
}
