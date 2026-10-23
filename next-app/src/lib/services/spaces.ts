import { supabase } from '../supabase';
import { SpaceModel, SpaceTierType, defaultHQ, WorldObjectModel } from '../models/space';
import { UserSession } from '../models/user';
import { InviteLinkService } from './invite';
import { MAP_REGISTRY, MapThemeId } from '@/game/map/mapRegistry';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// In-memory guest temp map tracker
let guestTemporaryMap: SpaceModel | null = null;

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
      return guestTemporaryMap ? [guestTemporaryMap] : [];
    }

    try {
      const { data, error } = await supabase
        .from('spaces')
        .select('*')
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) {
        return [defaultHQ()];
      }

      return data.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        category: item.category || 'Gaming',
        visibility: item.visibility || 'public',
        tier: (item.tier as SpaceTierType) || 'free',
        mapTheme: item.map_theme || 'village',
        joinCode: item.join_code,
        ownerId: item.owner_id,
        maxCapacity: item.max_capacity || 15,
        memberCount: item.member_count || 1,
        paletteIndex: item.palette_index || 0,
        isActive: item.is_active ?? true,
        isTemporary: Boolean((item as Record<string, unknown>).is_temporary),
        createdAt: item.created_at,
      }));
    } catch (e) {
      console.error('Error fetching spaces:', e);
      return [defaultHQ()];
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
    },
    session: UserSession | null
  ): Promise<SpaceModel> {
    const isGuest = session?.isGuest ?? true;
    const isPaid = session?.isPaid ?? false;
    const currentUserId = session?.id;

    if (isGuest) {
      if (guestTemporaryMap) {
        throw new Error(
          'Guests can only create 1 temporary map. Upgrade to a paid account to create unlimited spaces, or delete your current temporary map.'
        );
      }

      try {
        const payload = {
          name: params.name,
          slug: params.slug,
          description: params.description,
          category: params.category || 'Gaming',
          visibility: 'public',
          tier: 'free',
          max_capacity: 50,
          owner_id: currentUserId && UUID_REGEX.test(currentUserId) ? currentUserId : null,
          member_count: 1,
          is_active: true,
          map_theme: params.mapTheme || 'village',
          join_code: params.slug,
        };
        const { data, error } = await supabase.from('spaces').insert(payload).select().single();
        if (!error && data) {
          const tempSpace: SpaceModel = {
            id: data.id,
            name: data.name,
            slug: data.slug,
            description: data.description,
            category: data.category,
            visibility: data.visibility,
            tier: data.tier as SpaceTierType,
            mapTheme: data.map_theme,
            joinCode: data.join_code,
            ownerId: data.owner_id,
            maxCapacity: data.max_capacity,
            memberCount: data.member_count,
            paletteIndex: data.palette_index || 0,
            isActive: data.is_active,
            isTemporary: true,
            createdAt: data.created_at,
          };
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
        category: params.category || 'Gaming',
        visibility: 'public',
        tier: 'free',
        mapTheme: params.mapTheme || 'village',
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

    // Free account validation: Only 1 map allowed
    if (!isPaid && currentUserId) {
      const { data: existing } = await supabase
        .from('spaces')
        .select('id')
        .eq('owner_id', currentUserId);
      if (existing && existing.length >= 1) {
        throw new Error(
          'Only paid accounts can make multiple maps. Upgrade to a Paid Account to create unlimited spaces!'
        );
      }
    }

    const payload = {
      name: params.name,
      slug: params.slug,
      description: params.description,
      category: params.category || 'Gaming',
      visibility: params.visibility || 'public',
      tier: 'free',
      map_theme: params.mapTheme || 'village',
      join_code: params.slug,
      owner_id: currentUserId,
      max_capacity: 50,
      member_count: 1,
      is_active: true,
    };

    const { data, error } = await supabase.from('spaces').insert(payload).select().single();
    if (error) {
      throw new Error(error.message);
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      category: data.category,
      visibility: data.visibility,
      tier: data.tier as SpaceTierType,
      mapTheme: data.map_theme,
      joinCode: data.join_code,
      ownerId: data.owner_id,
      maxCapacity: data.max_capacity,
      memberCount: data.member_count,
      paletteIndex: data.palette_index || 0,
      isActive: data.is_active,
      isTemporary: false,
      createdAt: data.created_at,
    };
  },

  async updateSpace(
    id: string,
    updates: {
      name: string;
      description?: string;
      category?: string;
      mapTheme?: string;
    }
  ): Promise<void> {
    if (guestTemporaryMap && guestTemporaryMap.id === id) {
      guestTemporaryMap = {
        ...guestTemporaryMap,
        ...updates,
      };
      return;
    }

    await supabase
      .from('spaces')
      .update({
        name: updates.name,
        description: updates.description,
        category: updates.category,
        map_theme: updates.mapTheme,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  },

  async deleteSpace(id: string): Promise<boolean> {
    if (guestTemporaryMap && guestTemporaryMap.id === id) {
      if (UUID_REGEX.test(id)) {
        await supabase.from('spaces').delete().eq('id', id);
      }
      guestTemporaryMap = null;
      return true;
    }

    const { error } = await supabase.from('spaces').delete().eq('id', id);
    return !error;
  },

  async getSpaceByCodeOrSlug(query: string): Promise<SpaceModel | null> {
    const raw = query.trim();
    if (!raw) return null;

    // 1. Extract code if user passed a URL, deep link, or formatted code
    const q = InviteLinkService.extractCode(raw) || raw;

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
          return {
            id: item.id,
            name: item.name,
            slug: item.slug,
            description: item.description,
            category: item.category || 'Gaming',
            visibility: item.visibility || 'public',
            tier: (item.tier as SpaceTierType) || 'free',
            mapTheme: item.map_theme || 'village',
            joinCode: item.join_code,
            ownerId: item.owner_id,
            maxCapacity: item.max_capacity || 15,
            memberCount: item.member_count || 1,
            paletteIndex: item.palette_index || 0,
            isActive: item.is_active ?? true,
            isTemporary: false,
            createdAt: item.created_at,
          };
        }
      }
    } catch {}

    // 6. Direct lookup by slug, join_code, or space name
    try {
      const { data: bySlugOrCode } = await supabase
        .from('spaces')
        .select('*')
        .or(`slug.ilike.${q},join_code.ilike.${q},name.ilike.${q}`)
        .maybeSingle();

      if (bySlugOrCode) {
        return {
          id: bySlugOrCode.id,
          name: bySlugOrCode.name,
          slug: bySlugOrCode.slug,
          description: bySlugOrCode.description,
          category: bySlugOrCode.category || 'Gaming',
          visibility: bySlugOrCode.visibility || 'public',
          tier: (bySlugOrCode.tier as SpaceTierType) || 'free',
          mapTheme: bySlugOrCode.map_theme || 'village',
          joinCode: bySlugOrCode.join_code,
          ownerId: bySlugOrCode.owner_id,
          maxCapacity: bySlugOrCode.max_capacity || 15,
          memberCount: bySlugOrCode.member_count || 1,
          paletteIndex: bySlugOrCode.palette_index || 0,
          isActive: bySlugOrCode.is_active ?? true,
          isTemporary: false,
          createdAt: bySlugOrCode.created_at,
        };
      }
    } catch {}

    // 7. Invite codes lookup in space_invites table
    try {
      const { data: invRow } = await supabase
        .from('space_invites')
        .select('space_id')
        .ilike('code', q)
        .maybeSingle();

      if (invRow?.space_id) {
        const { data: byInvSpace } = await supabase
          .from('spaces')
          .select('*')
          .eq('id', invRow.space_id)
          .maybeSingle();

        if (byInvSpace) {
          return {
            id: byInvSpace.id,
            name: byInvSpace.name,
            slug: byInvSpace.slug,
            description: byInvSpace.description,
            category: byInvSpace.category || 'Gaming',
            visibility: byInvSpace.visibility || 'public',
            tier: (byInvSpace.tier as SpaceTierType) || 'free',
            mapTheme: byInvSpace.map_theme || 'village',
            joinCode: byInvSpace.join_code,
            ownerId: byInvSpace.owner_id,
            maxCapacity: byInvSpace.max_capacity || 15,
            memberCount: byInvSpace.member_count || 1,
            paletteIndex: byInvSpace.palette_index || 0,
            isActive: byInvSpace.is_active ?? true,
            isTemporary: false,
            createdAt: byInvSpace.created_at,
          };
        }
      }
    } catch {}

    // 8. Direct UUID lookup
    if (UUID_REGEX.test(q)) {
      try {
        const { data: byId } = await supabase.from('spaces').select('*').eq('id', q).maybeSingle();
        if (byId) {
          return {
            id: byId.id,
            name: byId.name,
            slug: byId.slug,
            description: byId.description,
            category: byId.category || 'Gaming',
            visibility: byId.visibility || 'public',
            tier: (byId.tier as SpaceTierType) || 'free',
            mapTheme: byId.map_theme || 'village',
            joinCode: byId.join_code,
            ownerId: byId.owner_id,
            maxCapacity: byId.max_capacity || 15,
            memberCount: byId.member_count || 1,
            paletteIndex: byId.palette_index || 0,
            isActive: byId.is_active ?? true,
            isTemporary: false,
            createdAt: byId.created_at,
          };
        }
      } catch {}
    }

    // 9. Dynamic map theme detection from invite string (e.g. "school-hangout" -> school map, "nightclub-party" -> nightclub map)
    const lowerQ = q.toLowerCase();
    const matchedThemeKey = (Object.keys(MAP_REGISTRY) as MapThemeId[]).find((t) => lowerQ.includes(t));
    if (matchedThemeKey) {
      const cfg = MAP_REGISTRY[matchedThemeKey];
      return {
        id: `space-theme-${matchedThemeKey}-${lowerQ.replace(/[^a-z0-9]/g, '')}`,
        name: `${cfg.name} (${q})`,
        slug: q,
        description: `Shared Hangout on ${cfg.name}`,
        category: cfg.category,
        visibility: 'public',
        tier: 'free',
        mapTheme: matchedThemeKey,
        joinCode: q,
        ownerId: null,
        maxCapacity: 50,
        memberCount: 1,
        paletteIndex: 0,
        isActive: true,
        isTemporary: false,
        createdAt: null,
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
