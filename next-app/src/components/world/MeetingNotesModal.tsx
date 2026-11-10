'use client';

import React, { useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { MeetingNote, noteToText } from '@/lib/services/meetingNotes';
import { TaskBoardService } from '@/lib/services/taskBoard';
import styles from './Boards.module.css';
import { AppIcon } from '@/components/icons/AppIcon';

interface MeetingNotesModalProps {
  note: MeetingNote;
  userId: string;
  /** Task boards placed in the space (read when the modal opens). */
  getTaskBoards: () => { id: string; label: string }[];
  canSendToBoard: boolean;
  safeText: (text: string) => string;
  onClose: () => void;
}

export function MeetingNotesModal({ note, userId, getTaskBoards, canSendToBoard, safeText, onClose }: MeetingNotesModalProps) {
  const [taskBoards] = useState(getTaskBoards);
  const [boardId, setBoardId] = useState(() => taskBoards[0]?.id ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(noteToText(note));
      setStatus('Copied to clipboard.');
    } catch {
      setStatus('Could not copy. Select the text instead.');
    }
  };

  const sendToBoard = async () => {
    if (!boardId || note.actionItems.length === 0) return;
    setBusy(true);
    const existing = await TaskBoardService.list(boardId);
    let position = existing.filter((t) => t.status === 'todo').reduce((m, t) => Math.max(m, t.position + 1), 0);
    let added = 0;
    for (const item of note.actionItems) {
      const title = item.owner ? `${item.text} (${item.owner})` : item.text;
      const created = await TaskBoardService.add({
        spaceId: note.spaceId,
        boardId,
        title,
        position: position++,
        createdBy: userId,
      });
      if (created) added++;
    }
    setBusy(false);
    setStatus(
      added === note.actionItems.length
        ? `Added ${added} task${added === 1 ? '' : 's'} to the board.`
        : `Added ${added} of ${note.actionItems.length}. Only hosts can edit task boards.`
    );
  };

  return (
    <NeoModal isOpen onClose={onClose} title={`${safeText(note.title)}`} maxWidth="600px">
      <div className={styles.stack}>
        <p className={styles.muted}>
          {note.createdAt.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {note.attendees.length > 0 && ` · ${note.attendees.map(safeText).join(', ')}`}
        </p>

        <section className={styles.section}>
          <span className={styles.label}>Summary</span>
          <p style={{ margin: 0, lineHeight: 1.5 }}>{safeText(note.summary)}</p>
        </section>

        {note.decisions.length > 0 && (
          <section className={styles.section}>
            <span className={styles.label}>Decisions</span>
            <ul className={styles.bullets}>
              {note.decisions.map((d, i) => (
                <li key={i}>{safeText(d)}</li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.section}>
          <span className={styles.label}>Action items</span>
          {note.actionItems.length === 0 ? (
            <p className={styles.muted}>No action items.</p>
          ) : (
            <ul className={styles.bullets}>
              {note.actionItems.map((a, i) => (
                <li key={i}>
                  {safeText(a.text)}
                  {a.owner && <strong> · {safeText(a.owner)}</strong>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className={styles.muted}>Written by AI from the agenda and room chat. Double-check before sharing.</p>

        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={copy}>
            <AppIcon name="clipboard" /> Copy as text
          </button>
          {canSendToBoard && note.actionItems.length > 0 && taskBoards.length > 0 && (
            <>
              <select
                className={styles.select}
                style={{ width: 'auto' }}
                aria-label="Task board"
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
              >
                {taskBoards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={sendToBoard}>
                {busy ? 'Adding…' : <><AppIcon name="plus" /> Send to task board</>}
              </button>
            </>
          )}
        </div>
        {status && (
          <p className={styles.muted} role="status">
            {status}
          </p>
        )}
      </div>
    </NeoModal>
  );
}
