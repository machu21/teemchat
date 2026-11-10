import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import type { IconName } from '@/lib/icons';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TaskStatus = 'todo' | 'doing' | 'done';

export const TASK_COLUMNS: { id: TaskStatus; label: string; icon: IconName }[] = [
  { id: 'todo', label: 'To do', icon: 'notes' },
  { id: 'doing', label: 'Doing', icon: 'loader' },
  { id: 'done', label: 'Done', icon: 'checkCircle' },
];

export const TASK_TITLE_MAX = 140;

export interface BoardTask {
  id: string;
  boardId: string;
  spaceId: string;
  title: string;
  status: TaskStatus;
  position: number;
  assigneeId: string | null;
  createdBy: string | null;
}

interface TaskRow {
  id: string;
  world_object_id: string;
  space_id: string;
  title: string;
  status: string;
  position: number;
  assignee_id: string | null;
  created_by: string | null;
}

export function isTaskStatus(v: unknown): v is TaskStatus {
  return v === 'todo' || v === 'doing' || v === 'done';
}

function toTask(r: TaskRow): BoardTask {
  return {
    id: r.id,
    boardId: r.world_object_id,
    spaceId: r.space_id,
    title: r.title,
    status: isTaskStatus(r.status) ? r.status : 'todo',
    position: Number(r.position) || 0,
    assigneeId: r.assignee_id,
    createdBy: r.created_by,
  };
}

/** Sorts tasks for one column (by position, then id for stability). */
export function sortTasks(tasks: BoardTask[]): BoardTask[] {
  return [...tasks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** Position for a task appended to the end of a column. */
export function nextPosition(tasks: BoardTask[], status: TaskStatus): number {
  const inColumn = tasks.filter((t) => t.status === status);
  return inColumn.length === 0 ? 0 : Math.max(...inColumn.map((t) => t.position)) + 1;
}

/** Applies a realtime change to a local task list. */
export function applyTaskChange(
  tasks: BoardTask[],
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  row: Partial<TaskRow> | null
): BoardTask[] {
  if (!row?.id) return tasks;
  if (event === 'DELETE') return tasks.filter((t) => t.id !== row.id);
  const next = toTask(row as TaskRow);
  const exists = tasks.some((t) => t.id === next.id);
  return exists ? tasks.map((t) => (t.id === next.id ? next : t)) : [...tasks, next];
}

export class TaskBoardService {
  static async list(boardId: string): Promise<BoardTask[]> {
    if (!UUID_REGEX.test(boardId)) return [];
    const { data, error } = await supabase
      .from('board_tasks')
      .select('id, world_object_id, space_id, title, status, position, assignee_id, created_by')
      .eq('world_object_id', boardId)
      .order('position', { ascending: true })
      .limit(500);
    if (error || !data) return [];
    return (data as TaskRow[]).map(toTask);
  }

  static async add(params: {
    spaceId: string;
    boardId: string;
    title: string;
    status?: TaskStatus;
    position: number;
    createdBy: string;
  }): Promise<BoardTask | null> {
    const title = params.title.trim().slice(0, TASK_TITLE_MAX);
    if (!title) return null;
    const { data, error } = await supabase
      .from('board_tasks')
      .insert({
        space_id: params.spaceId,
        world_object_id: params.boardId,
        title,
        status: params.status ?? 'todo',
        position: params.position,
        created_by: params.createdBy,
      })
      .select('id, world_object_id, space_id, title, status, position, assignee_id, created_by')
      .single();
    if (error || !data) return null;
    return toTask(data as TaskRow);
  }

  static async update(
    taskId: string,
    patch: { title?: string; status?: TaskStatus; position?: number; assigneeId?: string | null }
  ): Promise<boolean> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) {
      const title = patch.title.trim().slice(0, TASK_TITLE_MAX);
      if (!title) return false;
      row.title = title;
    }
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.position !== undefined) row.position = patch.position;
    if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
    const { data, error } = await supabase.from('board_tasks').update(row).eq('id', taskId).select('id');
    return !error && Array.isArray(data) && data.length > 0;
  }

  static async remove(taskId: string): Promise<boolean> {
    const { error } = await supabase.from('board_tasks').delete().eq('id', taskId);
    return !error;
  }

  /** Live updates for one board. Call the returned function to unsubscribe. */
  static subscribe(
    boardId: string,
    onChange: (event: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<TaskRow> | null) => void
  ): () => void {
    if (!UUID_REGEX.test(boardId)) return () => {};
    const topic = `board_tasks:${boardId}`;
    cleanupExistingChannel(topic);
    const channel: RealtimeChannel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'board_tasks', filter: `world_object_id=eq.${boardId}` },
        (payload) => {
          const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          const row = (event === 'DELETE' ? payload.old : payload.new) as Partial<TaskRow> | null;
          onChange(event, row);
        }
      )
      .subscribe();
    return () => removeRealtimeChannel(channel);
  }
}
