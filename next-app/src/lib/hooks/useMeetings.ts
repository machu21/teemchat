'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldGame } from '@/game/WorldGame';
import type { WorldSyncService } from '@/lib/services/worldSync';
import type { ChatMessageModel } from '@/lib/models/chat';
import { Meeting, MeetingService } from '@/lib/services/meetings';
import { MeetingNote, MeetingNotesService, NOTES_MAX_LINES, NotesChatLine } from '@/lib/services/meetingNotes';
import { RoomDefinition, roomById } from '@/lib/world/rooms';
import type { IconName } from '@/lib/icons';

const BANNER_LEAD_MS = 5 * 60_000;

type Toast = (icon: IconName, message: string, color: string) => void;

interface Options {
  spaceId: string | null | undefined;
  mapTheme: string | null | undefined;
  /** ?meeting= from the invite link */
  linkedMeetingId: string | null;
  gameRef: React.RefObject<WorldGame | null>;
  syncService: WorldSyncService | null;
  /** Busy / Focus hide the "starting soon" banner. */
  doNotDisturb: boolean;
  /** Announce note taking to the room (badge for everyone). */
  setTakingNotes: (on: boolean) => void;
  teleport: (x: number, y: number, name: string) => void;
  onToast: Toast;
}

interface NotesSession {
  roomId: string;
  roomName: string;
  meetingId: string | null;
  title: string;
  agenda: string;
  startedAt: number;
  chat: NotesChatLine[];
  attendees: Set<string>;
}

/** Meetings calendar banner + invite links + AI meeting notes capture for the space page. */
export function useMeetings({
  spaceId,
  mapTheme,
  linkedMeetingId,
  gameRef,
  syncService,
  doNotDisturb,
  setTakingNotes,
  teleport,
  onToast,
}: Options) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [openNote, setOpenNote] = useState<MeetingNote | null>(null);
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  const [takingNotes, setTakingNotesState] = useState<{ roomName: string; lines: number } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const notesRef = useRef<NotesSession | null>(null);
  const linkedHandledRef = useRef(false);
  const toastRef = useRef(onToast);

  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);

  // ── Upcoming meetings (banner), refreshed every 30s ──
  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    const load = () => {
      MeetingService.listUpcoming(spaceId)
        .then((list) => {
          if (!cancelled) {
            setUpcoming(list);
            setNow(Date.now());
          }
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [spaceId]);

  const roomCenter = useCallback(
    (roomId: string | null): { x: number; y: number; name: string } | null => {
      const room = roomId ? roomById(mapTheme, roomId) : null;
      if (!room) return null;
      return { x: room.rect.x + room.rect.w / 2 - 16, y: room.rect.y + room.rect.h / 2 - 20, name: room.name };
    },
    [mapTheme]
  );

  const join = useCallback(
    (meeting: Meeting) => {
      const target = roomCenter(meeting.roomId);
      if (target) {
        teleport(target.x, target.y, target.name);
        toastRef.current('calendar', `Heading to ${target.name} for "${meeting.title}"`, '#3B82F6');
      } else {
        toastRef.current('calendar', `"${meeting.title}" is in this space. Find your team!`, '#3B82F6');
      }
      setPanelOpen(false);
      setDismissed((prev) => new Set(prev).add(meeting.id));
    },
    [roomCenter, teleport]
  );

  // ── Invite link: ?meeting=<id> teleports once the space has loaded ──
  useEffect(() => {
    if (!linkedMeetingId || !spaceId || linkedHandledRef.current) return;
    linkedHandledRef.current = true;
    MeetingService.get(linkedMeetingId)
      .then((m) => {
        if (!m || m.spaceId !== spaceId) {
          toastRef.current('warning', 'That meeting link is no longer valid.', '#EF4444');
          return;
        }
        // Give the canvas a moment to spawn before teleporting.
        setTimeout(() => join(m), 800);
      })
      .catch(() => {});
  }, [linkedMeetingId, spaceId, join]);

  const banner =
    doNotDisturb
      ? null
      : upcoming.find(
          (m) =>
            !dismissed.has(m.id) &&
            m.startsAt.getTime() - now <= BANNER_LEAD_MS &&
            m.startsAt.getTime() + m.durationMin * 60_000 > now
        ) ?? null;

  const dismissBanner = useCallback((id: string) => setDismissed((prev) => new Set(prev).add(id)), []);

  // ── Meeting notes capture ──
  /** Called by the page for every room chat message while notes may be on. */
  const recordChat = useCallback(
    (msg: ChatMessageModel, isOwn: boolean = false) => {
      const s = notesRef.current;
      if (!s) return;
      const game = gameRef.current;
      if (!game) return;
      // Only chat said inside the notes room: mine while I'm there, others' while they are.
      const inRoom = isOwn ? game.myRoomId() === s.roomId : game.roomOf(msg.senderId) === s.roomId;
      if (!inRoom) return;
      s.chat.push({ name: msg.senderName || 'Someone', text: msg.content, at: new Date(msg.createdAt).toISOString() });
      if (s.chat.length > NOTES_MAX_LINES) s.chat.splice(0, s.chat.length - NOTES_MAX_LINES);
      s.attendees.add(msg.senderName || 'Someone');
      setTakingNotesState({ roomName: s.roomName, lines: s.chat.length });
    },
    [gameRef]
  );

  // Track who was in the room while notes are on.
  useEffect(() => {
    if (!takingNotes) return;
    const id = setInterval(() => {
      const s = notesRef.current;
      const game = gameRef.current;
      if (!s || !game || !syncService) return;
      const occupants = new Set(game.occupantsOf(s.roomId));
      for (const p of syncService.getRemotePlayers().values()) {
        if (occupants.has(p.userId)) s.attendees.add(p.displayName);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [takingNotes, gameRef, syncService]);

  const startNotes = useCallback(
    (room: RoomDefinition, myName: string) => {
      const linked = upcoming.find(
        (m) => m.roomId === room.id && m.startsAt.getTime() - Date.now() <= 15 * 60_000 &&
          m.startsAt.getTime() + m.durationMin * 60_000 > Date.now()
      );
      notesRef.current = {
        roomId: room.id,
        roomName: room.name,
        meetingId: linked?.id ?? null,
        title: linked?.title ?? `${room.name} meeting`,
        agenda: linked?.agenda ?? '',
        startedAt: Date.now(),
        chat: [],
        attendees: new Set([myName]),
      };
      setTakingNotesState({ roomName: room.name, lines: 0 });
      setTakingNotes(true);
      toastRef.current('notes', `Taking notes in ${room.name}. Everyone in the room can see this.`, '#3B82F6');
    },
    [upcoming, setTakingNotes]
  );

  const cancelNotes = useCallback(() => {
    notesRef.current = null;
    setTakingNotesState(null);
    setTakingNotes(false);
  }, [setTakingNotes]);

  const endNotes = useCallback(
    async (agendaOverride?: string) => {
      const s = notesRef.current;
      if (!s || !spaceId) return;
      setSummarizing(true);
      const res = await MeetingNotesService.summarize({
        spaceId,
        roomId: s.roomId,
        meetingId: s.meetingId,
        title: s.title,
        agenda: agendaOverride ?? s.agenda,
        attendees: [...s.attendees],
        chat: s.chat,
      });
      setSummarizing(false);
      if (res.error || !res.note) {
        toastRef.current('warning', res.error || 'Could not create notes.', '#EF4444');
        return;
      }
      notesRef.current = null;
      setTakingNotesState(null);
      setTakingNotes(false);
      setOpenNote(res.note);
    },
    [spaceId, setTakingNotes]
  );

  // Leaving the room keeps the session going, but stop announcing on unmount.
  useEffect(() => {
    return () => {
      if (notesRef.current) setTakingNotes(false);
    };
  }, [setTakingNotes]);

  return {
    panelOpen,
    setPanelOpen,
    openNote,
    setOpenNote,
    banner,
    /** The banner meeting has already started (as of the last refresh). */
    bannerStarted: banner ? banner.startsAt.getTime() <= now : false,
    dismissBanner,
    join,
    recordChat,
    takingNotes,
    summarizing,
    startNotes,
    endNotes,
    cancelNotes,
  };
}
