'use client';

import React, { useEffect, useState } from 'react';
import { NeoModal } from '@/components/neo/NeoModal';
import {
  BoardTask,
  TASK_COLUMNS,
  TASK_TITLE_MAX,
  TaskBoardService,
  TaskStatus,
  applyTaskChange,
  nextPosition,
  sortTasks,
} from '@/lib/services/taskBoard';
import styles from './Boards.module.css';
import { AppIcon } from '@/components/icons/AppIcon';

export interface PlayerOption {
  userId: string;
  name: string;
}

interface TaskBoardModalProps {
  spaceId: string;
  boardId: string;
  userId: string;
  /** Hosts add, edit, move, assign and delete. Everyone else reads. */
  canEdit: boolean;
  players: PlayerOption[];
  safeText: (text: string) => string;
  onClose: () => void;
}

const ORDER: TaskStatus[] = ['todo', 'doing', 'done'];

export function TaskBoardModal({ spaceId, boardId, userId, canEdit, players, safeText, onClose }: TaskBoardModalProps) {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    TaskBoardService.list(boardId)
      .then((list) => {
        if (!cancelled) {
          setTasks(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    const unsubscribe = TaskBoardService.subscribe(boardId, (event, row) => {
      setTasks((prev) => applyTaskChange(prev, event, row));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [boardId]);

  const fail = (msg: string) => setError(msg);

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setError(null);
    const created = await TaskBoardService.add({
      spaceId,
      boardId,
      title,
      position: nextPosition(tasks, 'todo'),
      createdBy: userId,
    });
    if (!created) return fail('Could not add the task. Only hosts can edit this board.');
    setDraft('');
    setTasks((prev) => applyTaskChange(prev, 'INSERT', {
      id: created.id,
      world_object_id: created.boardId,
      space_id: created.spaceId,
      title: created.title,
      status: created.status,
      position: created.position,
      assignee_id: created.assigneeId,
      created_by: created.createdBy,
    }));
  };

  const patch = async (task: BoardTask, change: Partial<Pick<BoardTask, 'title' | 'status' | 'position' | 'assigneeId'>>) => {
    setError(null);
    const before = tasks;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...change } : t)));
    const ok = await TaskBoardService.update(task.id, change);
    if (!ok) {
      setTasks(before);
      fail('Could not update the task.');
    }
  };

  const move = (task: BoardTask, dir: -1 | 1) => {
    const idx = ORDER.indexOf(task.status) + dir;
    if (idx < 0 || idx >= ORDER.length) return;
    const status = ORDER[idx];
    patch(task, { status, position: nextPosition(tasks, status) });
  };

  const remove = async (task: BoardTask) => {
    setError(null);
    const before = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (!(await TaskBoardService.remove(task.id))) {
      setTasks(before);
      fail('Could not delete the task.');
    }
  };

  const nameOf = (id: string | null) => (id ? players.find((p) => p.userId === id)?.name || 'Someone' : null);

  return (
    <NeoModal isOpen onClose={onClose} title="Task board" maxWidth="880px">
      <div className={styles.stack}>
        {canEdit && (
          <form
            className={styles.row}
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              className={styles.input}
              style={{ flex: 1, minWidth: 180 }}
              maxLength={TASK_TITLE_MAX}
              placeholder="Add a task…"
              aria-label="New task title"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={!draft.trim()}>
              + Add
            </button>
          </form>
        )}
        {!canEdit && <p className={styles.muted}>Only hosts can change this board. You can follow along live.</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className={styles.muted}>Loading tasks…</p>
        ) : (
          <div className={styles.columns}>
            {TASK_COLUMNS.map((col) => {
              const items = sortTasks(tasks.filter((t) => t.status === col.id));
              return (
                <section key={col.id} className={styles.column} aria-label={col.label}>
                  <div className={styles.columnTitle}>
                    <AppIcon name={col.icon} /> {col.label} · {items.length}
                  </div>
                  {items.map((t) => (
                    <article key={t.id} className={styles.card}>
                      {editingId === t.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            patch(t, { title: editText });
                            setEditingId(null);
                          }}
                        >
                          <input
                            className={styles.input}
                            maxLength={TASK_TITLE_MAX}
                            value={editText}
                            aria-label="Edit task title"
                            autoFocus
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={() => setEditingId(null)}
                          />
                        </form>
                      ) : (
                        <span className={styles.cardTitle}>{safeText(t.title)}</span>
                      )}
                      {t.assigneeId && <span className={styles.cardMeta}><AppIcon name="user" /> {safeText(nameOf(t.assigneeId) || '')}</span>}
                      {canEdit && (
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            disabled={t.status === 'todo'}
                            onClick={() => move(t, -1)}
                            aria-label="Move left"
                          >
                            <AppIcon name="chevronLeft" />
                          </button>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            disabled={t.status === 'done'}
                            onClick={() => move(t, 1)}
                            aria-label="Move right"
                          >
                            <AppIcon name="play" />
                          </button>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => {
                              setEditingId(t.id);
                              setEditText(t.title);
                            }}
                            aria-label="Edit title"
                          >
                            <AppIcon name="edit" />
                          </button>
                          <select
                            className={styles.select}
                            style={{ width: 'auto', minHeight: 30, padding: '2px 6px', fontSize: '0.75rem' }}
                            aria-label="Assign to"
                            value={t.assigneeId ?? ''}
                            onChange={(e) => patch(t, { assigneeId: e.target.value || null })}
                          >
                            <option value="">Unassigned</option>
                            {players.map((p) => (
                              <option key={p.userId} value={p.userId}>
                                {safeText(p.name)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.danger}`}
                            onClick={() => remove(t)}
                            aria-label="Delete task"
                          >
                            <AppIcon name="trash" />
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {items.length === 0 && <p className={styles.muted}>Nothing here yet.</p>}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </NeoModal>
  );
}
