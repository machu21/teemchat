'use client';

import React, { useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import { NOTE_COLORS, NOTE_MAX_CHARS, StickyNoteProps } from '@/lib/world/interactables';
import styles from './Boards.module.css';
import { AppIcon } from '@/components/icons/AppIcon';

interface StickyNoteEditorProps {
  isOpen: boolean;
  /** 'compose' before placing, 'view' for an existing note. */
  mode: 'compose' | 'view';
  initial?: StickyNoteProps;
  /** Hosts can edit and delete existing notes. */
  canEdit: boolean;
  safeText: (text: string) => string;
  onClose: () => void;
  /** Compose: place with these props. View: save edits. */
  onSave: (props: StickyNoteProps) => Promise<boolean> | boolean;
  onDelete?: () => Promise<boolean> | boolean;
}

export function StickyNoteEditor({
  isOpen,
  mode,
  initial,
  canEdit,
  safeText,
  onClose,
  onSave,
  onDelete,
}: StickyNoteEditorProps) {
  const [editing, setEditing] = useState(mode === 'compose');
  const [text, setText] = useState(initial?.text ?? '');
  const [color, setColor] = useState<string>(initial?.color ?? NOTE_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!text.trim()) {
      setError('Write something first.');
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSave({ text: text.trim().slice(0, NOTE_MAX_CHARS), color });
    setBusy(false);
    if (ok) onClose();
    else setError('Could not save the note. Only hosts can edit notes.');
  };

  const remove = async () => {
    if (!onDelete) return;
    setBusy(true);
    const ok = await onDelete();
    setBusy(false);
    if (ok) onClose();
    else setError('Could not delete the note.');
  };

  return (
    <NeoModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'compose' ? 'New sticky note' : 'Sticky note'}
      maxWidth="420px"
    >
      {editing ? (
        <div className={styles.stack}>
          <label className={styles.label} htmlFor="sticky-note-text">
            Note
          </label>
          <textarea
            id="sticky-note-text"
            className={styles.textarea}
            maxLength={NOTE_MAX_CHARS}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Team standup at 10:00 in the Boardroom"
          />
          <p className={styles.muted}>
            {text.length}/{NOTE_MAX_CHARS}
          </p>
          <div className={styles.row} role="radiogroup" aria-label="Note colour">
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Colour ${c}`}
                className={`${styles.swatch} ${color === c ? styles.swatchOn : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.row}>
            <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={save}>
              {mode === 'compose' ? <><AppIcon name="pin" /> Place on the map</> : <><AppIcon name="save" /> Save</>}
            </button>
            {mode === 'view' && (
              <button type="button" className={styles.btn} disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
          {mode === 'compose' && <p className={styles.muted}>Then click where the note should go.</p>}
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.notePreview} style={{ background: color }}>
            {safeText(text) || 'Empty note'}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          {canEdit && (
            <div className={styles.row}>
              <button type="button" className={styles.btn} onClick={() => setEditing(true)}>
                <AppIcon name="edit" /> Edit
              </button>
              {onDelete && (
                <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={busy} onClick={remove}>
                  <AppIcon name="trash" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </NeoModal>
  );
}
