import { supabase } from '../supabase';
import { SpaceModel, defaultHQ, WorldObjectModel } from '../models/space';
import { UserSession } from '../models/user';

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
        tier: item.tier || 'free',
        mapTheme: item.map_theme || 'village',
        joinCode: item.join_code,
        ownerId: item.owner_id,
        maxCapacity: item.max_capacity || 15,
        memberCount: item.member_count || 1,
        paletteIndex: item.palette_index || 0,
        isActive: item.is_active ?? true,
        isTemporary: item.is_temporary ?? false,
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

      if (currentUserId && UUID_REGEX.test(currentUserId)) {
        try {
          const payload = {
            name: params.name,
            slug: params.slug,
            description: params.description,
            category: params.category || 'Gaming',
            visibility: 'public',
            tier: 'free',
            max_capacity: 50,
            owner_id: currentUserId,
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
              tier: data.tier,
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
            return tempSpace;
          }
        } catch (e) {
          console.warn('Error creating guest space in Supabase:', e);
        }
      }

      const localSpace: SpaceModel = {
        id: `guest-temp-${Date.now()}`,
        name: params.name,
        slug: params.slug,
        description: params.description,
        category: params.category || 'Gaming',
        visibility: 'unlisted',
        tier: 'free',
        mapTheme: params.mapTheme || 'village',
        maxCapacity: 50,
        ownerId: currentUserId || 'guest',
        memberCount: 1,
        paletteIndex: 0,
        isActive: true,
        isTemporary: true,
        createdAt: new Date().toISOString(),
      };
      guestTemporaryMap = localSpace;
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
      tier: data.tier,
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
    const q = query.trim();
    if (!q) return null;

    if (guestTemporaryMap) {
      if (
        guestTemporaryMap.slug.toLowerCase() === q.toLowerCase() ||
        guestTemporaryMap.id === q ||
        guestTemporaryMap.joinCode?.toLowerCase() === q.toLowerCase()
      ) {
        return guestTemporaryMap;
      }
    }

    if (q.toLowerCase() === 'main-hq' || q === 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b') {
      return defaultHQ();
    }

    // Try resolve_space_invite RPC
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
            tier: item.tier || 'free',
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
    } catch (_) {}

    // Direct slug lookup
    const { data: bySlug } = await supabase.from('spaces').select('*').ilike('slug', q).maybeSingle();
    if (bySlug) {
      return {
        id: bySlug.id,
        name: bySlug.name,
        slug: bySlug.slug,
        description: bySlug.description,
        category: bySlug.category || 'Gaming',
        visibility: bySlug.visibility || 'public',
        tier: bySlug.tier || 'free',
        mapTheme: bySlug.map_theme || 'village',
        joinCode: bySlug.join_code,
        ownerId: bySlug.owner_id,
        maxCapacity: bySlug.max_capacity || 15,
        memberCount: bySlug.member_count || 1,
        paletteIndex: bySlug.palette_index || 0,
        isActive: bySlug.is_active ?? true,
        isTemporary: false,
        createdAt: bySlug.created_at,
      };
    }

    // Direct UUID lookup
    if (UUID_REGEX.test(q)) {
      const { data: byId } = await supabase.from('spaces').select('*').eq('id', q).maybeSingle();
      if (byId) {
        return {
          id: byId.id,
          name: byId.name,
          slug: byId.slug,
          description: byId.description,
          category: byId.category || 'Gaming',
          visibility: byId.visibility || 'public',
          tier: byId.tier || 'free',
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
      properties: o.properties || {},
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
      properties: data.properties,
      placedBy: data.placed_by,
    };
  },

  async deleteWorldObject(objectId: string): Promise<boolean> {
    const { error } = await supabase.from('world_objects').delete().eq('id', objectId);
    return !error;
  },
};
