import { supabase } from '../supabase';
import { SpaceModel, SpaceMode, SpaceTierType, defaultHQ, WorldObjectModel } from '../models/space';
import { UserSession } from '../models/user';
import { InviteLinkService } from './invite';
import { mapLimitFor } from '../membership';
import { MAP_REGISTRY, MapThemeId } from '../../game/map/mapRegistry';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Only characters that are safe to interpolate into a PostgREST `.or()` filter string
const SAFE_LOOKUP_REGEX = /^[a-zA-Z0-9 _-]+$/;

/** Map theme every Zombie Survival space is locked to. */
export const ZOMBIE_MAP_THEME = 'zombie_city';
/** Category stamped on Zombie Survival spaces. */
export const ZOMBIE_SPACE_CATEGORY = 'survival';

function normalizeSpaceMode(value: unknown): SpaceMode {
  return value === 'zombie' ? 'zombie' : 'social';
}

type SpaceRow = Record<string, unknown>;

/**
 * Maps a `public.spaces` row (or a resolve_space_invite result) to a SpaceModel.
 * `isTemporary` overrides the row's own `is_temporary` flag when given.
 */
export function mapSpaceRow(row: SpaceRow, options: { isTemporary?: boolean } = {}): SpaceModel {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: (row.description as string | null | undefined) ?? null,
    category: (row.category as string) || 'Gaming',
    visibility: (row.visibility as string) || 'public',
    tier: (row.tier as SpaceTierType) || 'free',
    mapTheme: (row.map_theme as string) || 'village',
    mode: normalizeSpaceMode(row.mode ?? 'social'),
    joinCode: row.join_code as string | null | undefined,
    ownerId: row.owner_id as string | null | undefined,
    maxCapacity: (row.max_capacity as number) || 15,
    memberCount: (row.member_count as number) || 1,
    paletteIndex: (row.palette_index as number) || 0,
    isActive: (row.is_active as boolean | null | undefined) ?? true,
    isTemporary: options.isTemporary ?? Boolean(row.is_temporary),
    createdAt: row.created_at as string | null | undefined,
  };
}

// In-memory guest temp map tracker (mirrored to localStorage so it survives reloads)
let guestTemporaryMap: SpaceModel | null = null;

function hydrateGuestTemporaryMap(session: UserSession | null): SpaceModel | null {
  if (guestTemporaryMap || typeof window === 'undefined') return guestTemporaryMap;
  try {
    const stored = localStorage.getItem('teem_guest_temp_map');
    if (!stored) return null;
    const parsed = JSON.parse(stored) as SpaceModel;
    // Ignore maps left behind by a different guest on this device
    const belongsToSession =
      !parsed.ownerId || parsed.ownerId === 'guest' || parsed.ownerId === session?.id;
    if (parsed?.id && belongsToSession) {
      guestTemporaryMap = parsed;
    }
  } catch {}
  return guestTemporaryMap;
}

export const SpaceService = {
  getGuestTemporaryMap(): SpaceModel | null {
    return guestTemporaryMap;
  },

  clearGuestMaps(): void {
    if (guestTemporaryMap) {
      const id = guestTemporaryMap.id;
      if (UUID_REGEX.test(id)) {
        supabase.from('spaces').delete().eq('id', id).then();
      }
      guestTemporaryMap = null;
    }
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('teem_guest_temp_map');
      }
    } catch {}
  },

  async getSpaces(session: UserSession | null): Promise<SpaceModel[]> {
    const isGuest = session?.isGuest ?? true;

    if (isGuest) {
      const guestMap = hydrateGuestTemporaryMap(session);
      return guestMap ? [guestMap] : [];
    }

    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
        .order('created_at', { ascending: true });

      // No placeholder HQ: an empty result shows the dashboard's empty state
      if (error || !data) {
        if (error) console.warn('Spaces fetch notice:', error.message);
        return [];
      }

      return data.map((item) => mapSpaceRow(item));
    } catch (e) {
      console.error('Error fetching spaces:', e);
      return [];
    }
  },

  async createSpace(
    params: {
      name: string;
      slug: string;
      description?: string;
      category?: string;
      visibility?: string;
      mapTheme?: string;
      mode?: SpaceMode;
    },
    session: UserSession | null
  ): Promise<SpaceModel> {
    const isGuest = session?.isGuest ?? true;
    const currentUserId = session?.id;
    const visibility = params.visibility === 'private' ? 'private' : 'public';
    // Private spaces get a random join code (set_space_join_code trigger) so the
    // guessable slug never works as an invite.
    const joinCode = visibility === 'private' ? null : params.slug;
    // Survival spaces always run on the zombie city map.
    const mode = normalizeSpaceMode(params.mode);
    const isSurvival = mode === 'zombie';
    const mapTheme = isSurvival ? ZOMBIE_MAP_THEME : params.mapTheme || 'village';
    const category = isSurvival ? ZOMBIE_SPACE_CATEGORY : params.category || 'Gaming';
    // Only send `mode` for survival spaces so social spaces still insert on databases
    // that have not run the 20261104_space_mode migration yet (the column defaults to 'social').
    const modeColumn: { mode?: SpaceMode } = isSurvival ? { mode } : {};

    if (isGuest) {
      if (hydrateGuestTemporaryMap(session)) {
        throw new Error(
          'Guests can only create 1 temporary map. Upgrade to a paid account to create unlimited spaces, or delete your current temporary map.'
        );
      }

      try {
        const payload = {
          name: params.name,
          slug: params.slug,
          description: params.description,
          category,
          visibility,
          tier: 'free',
          max_capacity: 50,
          owner_id: currentUserId && UUID_REGEX.test(currentUserId) ? currentUserId : null,
          member_count: 1,
          is_active: true,
          map_theme: mapTheme,
          ...modeColumn,
          join_code: joinCode,
        };
        const { data, error } = await supabase.from('spaces').insert(payload).select().single();
        if (!error && data) {
          const tempSpace: SpaceModel = mapSpaceRow(data, { isTemporary: true });
          guestTemporaryMap = tempSpace;
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('teem_guest_temp_map', JSON.stringify(tempSpace));
            }
          } catch {}
          return tempSpace;
        }
      } catch (e) {
        console.warn('Notice creating guest space in Supabase:', e);
      }

      const canonicalId = `room-${params.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
      const localSpace: SpaceModel = {
        id: canonicalId,
        name: params.name,
        slug: params.slug,
        description: params.description,
        category,
        visibility,
        tier: 'free',
        mapTheme,
        mode,
        joinCode: params.slug,
        maxCapacity: 50,
        ownerId: currentUserId || 'guest',
        memberCount: 1,
        paletteIndex: 0,
        isActive: true,
        isTemporary: true,
        createdAt: new Date().toISOString(),
      };
      guestTemporaryMap = localSpace;
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem('teem_guest_temp_map', JSON.stringify(localSpace));
        }
      } catch {}
      return localSpace;
    }

    // Map limit: Members (free for every registered account during the beta) own up to
    // MAP_LIMITS.member maps; guests and free accounts get one.
    if (currentUserId) {
      const mapLimit = mapLimitFor(session);
      const { data: existing } = await supabase
        .from('spaces')
        .select('id')
        .eq('owner_id', currentUserId);
      if (existing && existing.length >= mapLimit) {
        throw new Error(
          mapLimit > 1
            ? `You've reached the limit of ${mapLimit} maps. Delete a map to create a new one.`
            : session?.isGuest
              ? 'Guest sessions can only have 1 map. Create a free account to make more maps!'
              : 'Free accounts can have 1 map. Upgrade to Member to create more!'
        );
      }
    }

    const payload = {
      name: params.name,
      slug: params.slug,
      description: params.description,
      category,
      visibility,
      tier: 'free',
      map_theme: mapTheme,
      ...modeColumn,
      join_code: joinCode,
      owner_id: currentUserId,
      max_capacity: 50,
      member_count: 1,
      is_active: true,
    };

    const { data, error } = await supabase.from('spaces').insert(payload).select().single();
    if (error) {
      throw new Error(error.message);
    }

    return mapSpaceRow(data, { isTemporary: false });
  },

  async updateSpace(
    spaceId: string,
    updates: Partial<{
      name: string;
      description: string;
      mapTheme: string;
      category: string;
      visibility: 'public' | 'unlisted' | 'private';
      maxCapacity: number;
    }>
  ): Promise<boolean> {
    // Survival spaces are locked to the zombie city map: drop any theme change.
    if (updates.mapTheme !== undefined && (await SpaceService.isSurvivalSpace(spaceId))) {
      const { mapTheme: _ignoredTheme, ...rest } = updates;
      void _ignoredTheme;
      updates = rest;
    }

    // 1. If it's a guest temporary map
    if (guestTemporaryMap && guestTemporaryMap.id === spaceId) {
      guestTemporaryMap = {
        ...guestTemporaryMap,
        ...updates,
      };
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('teem_guest_temp_map', JSON.stringify(guestTemporaryMap));
        } catch {}
      }
    }

    // 2. Also update in localStorage if stored
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('teem_guest_temp_map');
        if (stored) {
          const parsed = JSON.parse(stored) as SpaceModel;
          if (parsed.id === spaceId) {
            Object.assign(parsed, updates);
            localStorage.setItem('teem_guest_temp_map', JSON.stringify(parsed));
          }
        }
      } catch {}
    }

    // 3. Supabase update if spaceId is UUID
    if (UUID_REGEX.test(spaceId)) {
      try {
        const dbUpdates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.mapTheme !== undefined) dbUpdates.map_theme = updates.mapTheme;
        if (updates.category !== undefined) dbUpdates.category = updates.category;
        if (updates.visibility !== undefined) dbUpdates.visibility = updates.visibility;
        if (updates.maxCapacity !== undefined) dbUpdates.max_capacity = updates.maxCapacity;

        const { error } = await supabase.from('spaces').update(dbUpdates).eq('id', spaceId);
        return !error;
      } catch (err) {
        console.warn('Failed to update space in Supabase:', err);
        return false;
      }
    }

    return true;
  },

  /** True when the space is a Zombie Survival space (checks the guest map, then the DB). */
  async isSurvivalSpace(spaceId: string): Promise<boolean> {
    if (guestTemporaryMap && guestTemporaryMap.id === spaceId) return guestTemporaryMap.mode === 'zombie';
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('teem_guest_temp_map');
        if (stored) {
          const parsed = JSON.parse(stored) as SpaceModel;
          if (parsed.id === spaceId) return parsed.mode === 'zombie';
        }
      } catch {}
    }
    if (!UUID_REGEX.test(spaceId)) return false;
    try {
      const { data, error } = await supabase.from('spaces').select('mode').eq('id', spaceId).maybeSingle();
      if (error || !data) return false;
      return (data as SpaceRow).mode === 'zombie';
    } catch {
      return false;
    }
  },

  isSpaceOwner(space: SpaceModel, session: UserSession | null): boolean {
    if (!session) return false;
    if (space.ownerId && space.ownerId === session.id) return true;
    // Local-only guest maps are stamped 'guest' when provisioning failed
    return Boolean(session.isGuest && space.isTemporary && space.ownerId === 'guest');
  },

  async deleteSpace(id: string, session?: UserSession | null): Promise<boolean> {
    if (guestTemporaryMap && guestTemporaryMap.id === id) {
      if (UUID_REGEX.test(id)) {
        await supabase.from('spaces').delete().eq('id', id);
      }
      guestTemporaryMap = null;
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('teem_guest_temp_map');
        }
      } catch {}
      return true;
    }

    let query = supabase.from('spaces').delete().eq('id', id);
    if (session?.id) query = query.eq('owner_id', session.id);
    // RLS filters out non-owned rows silently, so confirm a row was actually removed
    const { data, error } = await query.select('id');
    return !error && Array.isArray(data) && data.length > 0;
  },

  async getSpaceByCodeOrSlug(
    query: string,
    options?: { theme?: string; name?: string }
  ): Promise<SpaceModel | null> {
    const raw = query.trim();
    if (!raw) return null;

    // 1. Extract metadata if URL / query params were supplied
    const metadata = InviteLinkService.extractInviteMetadata(raw);
    const q = metadata.code || InviteLinkService.extractCode(raw) || raw;
    const requestedTheme = (options?.theme || metadata.theme || '').toLowerCase();
    const requestedName = options?.name || metadata.name || undefined;

    // 2. Check in-memory or stored guest temporary map
    let guestMap = guestTemporaryMap;
    if (!guestMap && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('teem_guest_temp_map');
        if (stored) {
          guestMap = JSON.parse(stored) as SpaceModel;
        }
      } catch {}
    }

    if (guestMap) {
      if (
        guestMap.slug.toLowerCase() === q.toLowerCase() ||
        guestMap.id === q ||
        guestMap.joinCode?.toLowerCase() === q.toLowerCase() ||
        guestMap.name.toLowerCase() === q.toLowerCase()
      ) {
        if (guestMap.id && guestMap.id.startsWith('guest-temp-')) {
          guestMap.id = `room-${guestMap.slug.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
        }
        // Older stored maps predate `mode`; survival maps never change theme.
        guestMap.mode = normalizeSpaceMode(guestMap.mode);
        if (requestedTheme && requestedTheme in MAP_REGISTRY && guestMap.mode !== 'zombie') {
          guestMap.mapTheme = requestedTheme;
        }
        if (requestedName) {
          guestMap.name = requestedName;
        }
        return guestMap;
      }
    }

    // 3. Default HQ check
    if (q.toLowerCase() === 'main-hq' || q === 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b') {
      return defaultHQ();
    }

    // 4. Known map theme direct lookup (e.g. "school", "office", "arcade", "nightclub", "cafe", "village")
    const themeKey = q.toLowerCase();
    if (themeKey in MAP_REGISTRY) {
      const cfg = MAP_REGISTRY[themeKey as MapThemeId];
      return {
        id: `public-map-${themeKey}`,
        name: cfg.name,
        slug: themeKey,
        description: cfg.tagline,
        category: cfg.category,
        visibility: 'public',
        tier: 'free',
        mapTheme: themeKey,
        mode: themeKey === ZOMBIE_MAP_THEME ? 'zombie' : 'social',
        joinCode: themeKey,
        ownerId: null,
        maxCapacity: 50,
        memberCount: 1,
        paletteIndex: 0,
        isActive: true,
        isTemporary: false,
        createdAt: null,
      };
    }

    // 5. Try resolve_space_invite RPC
    try {
      const { data: rpcRes } = await supabase.rpc('resolve_space_invite', { p_code: q });
      if (rpcRes) {
        const item = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
        if (item) {
          return mapSpaceRow(item, { isTemporary: false });
        }
      }
    } catch {}

    // 6. Direct lookup by slug, join_code, or space name.
    // Skipped for input with characters (commas, parens, wildcards) that would break or widen the filter.
    try {
      if (!SAFE_LOOKUP_REGEX.test(q)) throw new Error('unsafe lookup');
      const { data: bySlugOrCode } = await supabase
        .from('spaces')
        .select('*')
        .or(`slug.ilike.${q},join_code.ilike.${q},name.ilike.${q}`)
        .limit(1)
        .maybeSingle();

      if (bySlugOrCode) {
        return mapSpaceRow(bySlugOrCode, { isTemporary: false });
      }
    } catch {}

    // Invite codes are resolved by resolve_space_invite above; space_invites is not readable by non-members.

    // 8. Direct UUID lookup
    if (UUID_REGEX.test(q)) {
      try {
        const { data: byId } = await supabase.from('spaces').select('*').eq('id', q).maybeSingle();
        if (byId) {
          return mapSpaceRow(byId, { isTemporary: false });
        }
      } catch {}
    }

    // 9. Map theme detection from query metadata or invite string (e.g. ?theme=arcade or "school-hangout")
    const lowerQ = q.toLowerCase();
    const effectiveThemeKey =
      (requestedTheme && requestedTheme in MAP_REGISTRY ? requestedTheme : null) ||
      (Object.keys(MAP_REGISTRY) as MapThemeId[]).find((t) => lowerQ.includes(t)) ||
      'village';

    if (effectiveThemeKey in MAP_REGISTRY) {
      const cfg = MAP_REGISTRY[effectiveThemeKey as MapThemeId];
      return {
        id: `space-theme-${effectiveThemeKey}-${lowerQ.replace(/[^a-z0-9_-]/g, '')}`,
        name: requestedName || `${cfg.name} (${q})`,
        slug: q,
        description: `Shared Hangout on ${cfg.name}`,
        category: cfg.category,
        visibility: 'public',
        tier: 'free',
        mapTheme: effectiveThemeKey,
        mode: effectiveThemeKey === ZOMBIE_MAP_THEME ? 'zombie' : 'social',
        joinCode: q,
        ownerId: null,
        maxCapacity: 50,
        memberCount: 1,
        paletteIndex: 0,
        isActive: true,
        isTemporary: true,
        createdAt: new Date().toISOString(),
      };
    }

    return null;
  },

  async joinSpaceViaInvite(code: string): Promise<boolean> {
    try {
      const { data } = await supabase.rpc('join_space_via_invite', { p_code: code.trim() });
      return Boolean(data);
    } catch (e) {
      console.warn('Failed to join space via invite RPC:', e);
      return false;
    }
  },

  /** Current persisted map theme, or null for non-persisted spaces / lookup failures. */
  async fetchMapTheme(spaceId: string): Promise<string | null> {
    if (!UUID_REGEX.test(spaceId)) return null;
    const { data, error } = await supabase.from('spaces').select('map_theme').eq('id', spaceId).maybeSingle();
    if (error || !data) return null;
    return (data.map_theme as string) || null;
  },

  async fetchWorldObjects(spaceId: string): Promise<WorldObjectModel[]> {
    const { data, error } = await supabase.from('world_objects').select('*').eq('space_id', spaceId);
    if (error || !data) return [];
    return data.map((o) => ({
      id: o.id,
      spaceId: o.space_id,
      objectType: o.object_type,
      x: o.x,
      y: o.y,
      rotation: o.rotation || 0,
      properties: (o.properties as Record<string, unknown>) || {},
      placedBy: o.placed_by,
    }));
  },

  async saveWorldObject(obj: Omit<WorldObjectModel, 'id'> & { id?: string }): Promise<WorldObjectModel | null> {
    const payload: Record<string, unknown> = {
      space_id: obj.spaceId,
      object_type: obj.objectType,
      x: obj.x,
      y: obj.y,
      rotation: obj.rotation,
      properties: obj.properties,
      placed_by: obj.placedBy,
    };
    if (obj.id) payload.id = obj.id;

    const { data, error } = await supabase.from('world_objects').insert(payload).select().single();
    if (error || !data) return null;
    return {
      id: data.id,
      spaceId: data.space_id,
      objectType: data.object_type,
      x: data.x,
      y: data.y,
      rotation: data.rotation,
      properties: (data.properties as Record<string, unknown>) || {},
      placedBy: data.placed_by,
    };
  },

  async deleteWorldObject(objectId: string): Promise<boolean> {
    const { error } = await supabase.from('world_objects').delete().eq('id', objectId);
    return !error;
  },
};
