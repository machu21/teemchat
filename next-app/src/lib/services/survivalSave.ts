import { supabase } from '../supabase';
import {
  PLAYER_SAVE_VERSION,
  WORLD_SAVE_VERSION,
  pickWorldSave,
  slotFor,
  validatePlayerSave,
  type PlayerSave,
  type SlotRow,
  type WorldSave,
} from '@/game/zombie/persistence';
import { NORMAL_RULES, sanitizeRules, type WorldRules } from '@/game/zombie/survival/balance';

// ============================================================
// SURVIVAL SAVES (Supabase tables, see migration 20261119_survival_persistence)
// World: two alternating slots per space; load takes the newest valid one.
// Player: one row per user per space (permadeath deletes it).
// Rules: one row per space, admins only (RLS).
// Every call fails soft: a missing table, no network or an RLS refusal
// leaves the game running without persistence and reports why.
// ============================================================

export interface SaveStore {
  worldSlots(spaceId: string): Promise<SlotRow[]>;
  writeWorld(spaceId: string, slot: 0 | 1, seq: number, state: WorldSave): Promise<void>;
  readPlayer(spaceId: string): Promise<unknown | null>;
  writePlayer(spaceId: string, state: PlayerSave): Promise<void>;
  deletePlayer(spaceId: string): Promise<void>;
  readRules(spaceId: string): Promise<unknown | null>;
  writeRules(spaceId: string, rules: WorldRules): Promise<void>;
}

/** The real store (RLS decides who may do what). */
export class SupabaseSaveStore implements SaveStore {
  async worldSlots(spaceId: string): Promise<SlotRow[]> {
    const { data, error } = await supabase.from('survival_world_saves').select('slot, seq, state').eq('space_id', spaceId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ slot: r.slot as number, seq: Number(r.seq), state: r.state }));
  }

  async writeWorld(spaceId: string, slot: 0 | 1, seq: number, state: WorldSave): Promise<void> {
    const { error } = await supabase
      .from('survival_world_saves')
      .upsert({ space_id: spaceId, slot, seq, version: WORLD_SAVE_VERSION, state, saved_at: new Date().toISOString() }, { onConflict: 'space_id,slot' });
    if (error) throw new Error(error.message);
  }

  async readPlayer(spaceId: string): Promise<unknown | null> {
    const { data, error } = await supabase.from('survival_player_saves').select('state').eq('space_id', spaceId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.state ?? null;
  }

  async writePlayer(spaceId: string, state: PlayerSave): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new Error('Not signed in');
    const { error } = await supabase
      .from('survival_player_saves')
      .upsert({ space_id: spaceId, user_id: userId, version: PLAYER_SAVE_VERSION, state, saved_at: new Date().toISOString() }, { onConflict: 'space_id,user_id' });
    if (error) throw new Error(error.message);
  }

  async deletePlayer(spaceId: string): Promise<void> {
    const { error } = await supabase.from('survival_player_saves').delete().eq('space_id', spaceId);
    if (error) throw new Error(error.message);
  }

  async readRules(spaceId: string): Promise<unknown | null> {
    const { data, error } = await supabase.from('survival_rules').select('rules').eq('space_id', spaceId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.rules ?? null;
  }

  async writeRules(spaceId: string, rules: WorldRules): Promise<void> {
    const { error } = await supabase
      .from('survival_rules')
      .upsert({ space_id: spaceId, rules, updated_at: new Date().toISOString() }, { onConflict: 'space_id' });
    if (error) throw new Error(error.message);
  }
}

export type SaveStatus = { ok: true; at: number } | { ok: false; error: string; at: number };

/**
 * One space's saves. Keeps the next world seq, serialises writes (a save
 * never overlaps the previous one) and remembers the last outcome for the HUD.
 */
export class SurvivalSaveService {
  private nextSeq = 0;
  private writing: Promise<void> = Promise.resolve();
  lastWorld: SaveStatus | null = null;
  /** The world was read successfully (only then may the host overwrite a slot). */
  worldReady = false;
  lastPlayer: SaveStatus | null = null;

  constructor(
    readonly spaceId: string,
    private readonly store: SaveStore = new SupabaseSaveStore()
  ) {}

  /** The newest valid world save (or null), and where the next save goes. */
  async loadWorld(): Promise<WorldSave | null> {
    try {
      const r = pickWorldSave(await this.store.worldSlots(this.spaceId));
      this.nextSeq = r.nextSeq;
      this.worldReady = true;
      return r.save;
    } catch (e) {
      this.lastWorld = { ok: false, error: describe(e), at: Date.now() };
      return null;
    }
  }

  /** Writes to the older slot (never the one we'd fall back to). */
  saveWorld(state: WorldSave): Promise<boolean> {
    const seq = this.nextSeq++;
    return this.queue(async () => {
      try {
        await this.store.writeWorld(this.spaceId, slotFor(seq), seq, state);
        this.lastWorld = { ok: true, at: Date.now() };
        return true;
      } catch (e) {
        this.lastWorld = { ok: false, error: describe(e), at: Date.now() };
        return false;
      }
    });
  }

  async loadPlayer(): Promise<PlayerSave | null> {
    try {
      return validatePlayerSave(await this.store.readPlayer(this.spaceId));
    } catch (e) {
      this.lastPlayer = { ok: false, error: describe(e), at: Date.now() };
      return null;
    }
  }

  savePlayer(state: PlayerSave): Promise<boolean> {
    return this.queue(async () => {
      try {
        await this.store.writePlayer(this.spaceId, state);
        this.lastPlayer = { ok: true, at: Date.now() };
        return true;
      } catch (e) {
        this.lastPlayer = { ok: false, error: describe(e), at: Date.now() };
        return false;
      }
    });
  }

  /** Permadeath: the survivor is gone. */
  deletePlayer(): Promise<boolean> {
    return this.queue(async () => {
      try {
        await this.store.deletePlayer(this.spaceId);
        return true;
      } catch {
        return false;
      }
    });
  }

  async loadRules(): Promise<WorldRules> {
    try {
      const raw = await this.store.readRules(this.spaceId);
      return raw ? sanitizeRules(raw) : { ...NORMAL_RULES };
    } catch {
      return { ...NORMAL_RULES };
    }
  }

  /** Admins only (RLS refuses everyone else): returns why it failed, or null. */
  async saveRules(rules: WorldRules): Promise<string | null> {
    try {
      await this.store.writeRules(this.spaceId, sanitizeRules(rules));
      return null;
    } catch (e) {
      return describe(e);
    }
  }

  private queue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writing.then(task, task);
    this.writing = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function describe(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/relation .* does not exist|Could not find the table/i.test(m)) return 'Saving is not set up on the server yet';
  if (/row-level security|permission denied/i.test(m)) return 'Not allowed to save here';
  return m.slice(0, 120);
}
