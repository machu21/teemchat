import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, removeRealtimeChannel, cleanupExistingChannel } from '../supabase';
import { Stroke, mergeStrokes, parseBoardData, sanitizeStroke } from '../whiteboard/model';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BoardSnapshot {
  strokes: Stroke[];
  version: number;
}

export interface BoardLiveHandlers {
  /** Live points of a stroke someone is drawing right now. */
  onPoints: (strokeId: string, userId: string, meta: Pick<Stroke, 'color' | 'size' | 'tool'>, points: [number, number][]) => void;
  onStrokeEnd: (stroke: Stroke) => void;
  onUndo: (strokeId: string, userId: string) => void;
  onClear: (userId: string) => void;
}

export interface BoardLive {
  sendPoints: (strokeId: string, meta: Pick<Stroke, 'color' | 'size' | 'tool'>, points: [number, number][]) => void;
  sendStrokeEnd: (stroke: Stroke) => void;
  sendUndo: (strokeId: string) => void;
  sendClear: () => void;
  dispose: () => void;
}

export class WhiteboardService {
  /** Loads the board for a placed whiteboard, creating an empty one on first open. */
  static async load(spaceId: string, boardId: string): Promise<BoardSnapshot | null> {
    if (!UUID_REGEX.test(spaceId) || !UUID_REGEX.test(boardId)) return null;
    const read = async () =>
      supabase
        .from('whiteboard_sessions')
        .select('board_data, version')
        .eq('world_object_id', boardId)
        .maybeSingle();

    let { data } = await read();
    if (!data) {
      const { error } = await supabase
        .from('whiteboard_sessions')
        .insert({ space_id: spaceId, world_object_id: boardId, board_data: { elements: [] } });
      // 23505: someone else created it at the same moment; read theirs.
      if (error && error.code !== '23505') return null;
      ({ data } = await read());
    }
    if (!data) return null;
    return { strokes: parseBoardData(data.board_data), version: Number(data.version) || 1 };
  }

  /**
   * Saves with optimistic locking on `version`. On a conflict it reloads, merges
   * (keeping local removals) and retries once. Returns the stored snapshot, or null.
   */
  static async save(
    spaceId: string,
    boardId: string,
    userId: string,
    snapshot: BoardSnapshot,
    removedIds: Set<string> = new Set()
  ): Promise<BoardSnapshot | null> {
    let current = snapshot;
    for (let attempt = 0; attempt < 2; attempt++) {
      const nextVersion = current.version + 1;
      const { data, error } = await supabase
        .from('whiteboard_sessions')
        .update({
          board_data: { elements: current.strokes },
          version: nextVersion,
          last_edited_by: UUID_REGEX.test(userId) ? userId : null,
          updated_at: new Date().toISOString(),
        })
        .eq('world_object_id', boardId)
        .eq('version', current.version)
        .select('version');
      if (error) return null;
      if (data && data.length > 0) return { strokes: current.strokes, version: nextVersion };

      // Version moved on: merge with the server copy and try again.
      const server = await this.load(spaceId, boardId);
      if (!server) return null;
      current = { strokes: mergeStrokes(server.strokes, current.strokes, removedIds), version: server.version };
    }
    return null;
  }

  /** Live drawing channel for one board. Always call dispose() when the board closes. */
  static connect(spaceId: string, boardId: string, userId: string, handlers: BoardLiveHandlers): BoardLive {
    const topic = `space:${spaceId}:board:${boardId}`;
    cleanupExistingChannel(topic);
    const channel: RealtimeChannel = supabase.channel(topic, { config: { broadcast: { self: false, ack: false } } });
    let ready = false;

    const payloadOf = (envelope: { [key: string]: unknown }) =>
      ((envelope.payload ?? envelope) as Record<string, unknown>) || {};

    channel
      .on('broadcast', { event: 'points' }, (env) => {
        const d = payloadOf(env);
        const stroke = sanitizeStroke({
          id: d.stroke_id,
          userId: d.user_id,
          color: d.color,
          size: d.size,
          tool: d.tool,
          points: d.points,
        });
        if (!stroke || stroke.userId === userId) return;
        handlers.onPoints(stroke.id, stroke.userId, { color: stroke.color, size: stroke.size, tool: stroke.tool }, stroke.points);
      })
      .on('broadcast', { event: 'stroke_end' }, (env) => {
        const stroke = sanitizeStroke(payloadOf(env).stroke);
        if (stroke && stroke.userId !== userId) handlers.onStrokeEnd(stroke);
      })
      .on('broadcast', { event: 'undo' }, (env) => {
        const d = payloadOf(env);
        if (typeof d.stroke_id === 'string' && typeof d.user_id === 'string' && d.user_id !== userId) {
          handlers.onUndo(d.stroke_id, d.user_id);
        }
      })
      .on('broadcast', { event: 'clear' }, (env) => {
        const d = payloadOf(env);
        if (typeof d.user_id === 'string' && d.user_id !== userId) handlers.onClear(d.user_id);
      })
      .subscribe((status) => {
        ready = status === 'SUBSCRIBED';
      });

    const send = (event: string, payload: Record<string, unknown>) => {
      if (!ready) return;
      channel.send({ type: 'broadcast', event, payload }).catch(() => {});
    };

    return {
      sendPoints: (strokeId, meta, points) =>
        send('points', { stroke_id: strokeId, user_id: userId, ...meta, points }),
      sendStrokeEnd: (stroke) => send('stroke_end', { stroke }),
      sendUndo: (strokeId) => send('undo', { stroke_id: strokeId, user_id: userId }),
      sendClear: () => send('clear', { user_id: userId }),
      dispose: () => {
        ready = false;
        removeRealtimeChannel(channel);
      },
    };
  }
}
