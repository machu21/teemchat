import 'package:flutter/foundation.dart';
import '../../features/auth/auth_service.dart';
import '../models/space_model.dart';

class SpaceService {
  static SpaceModel? _guestTemporaryMap;

  static SpaceModel? get guestTemporaryMap => _guestTemporaryMap;
  static bool get hasGuestTemporaryMap => _guestTemporaryMap != null;
  static String? get guestMapName => _guestTemporaryMap?.name;

  /// Deletes and clears out any guest temporary map upon quitting or session cleanup
  static void clearGuestMaps() {
    if (_guestTemporaryMap != null) {
      final id = _guestTemporaryMap!.id;
      final client = AuthService.client;
      if (client != null && _uuidRegex.hasMatch(id)) {
        client.from('spaces').delete().eq('id', id).ignore();
      }
      _guestTemporaryMap = null;
    }
  }

  static Future<List<SpaceModel>> getSpaces() async {
    final client = AuthService.client;
    final currentSession = AuthService.currentSession;
    final isGuest = currentSession?.isGuest ?? true;

    if (client == null) {
      if (isGuest) {
        // Guests start with 0 virtual spaces; they can create 1 temporary map
        if (_guestTemporaryMap != null) {
          return [_guestTemporaryMap!];
        }
        return [];
      }
      return [SpaceModel.defaultHQ()];
    }

    try {
      final response = await client
          .from('spaces')
          .select()
          .order('created_at', ascending: true);

      final List<dynamic> data = response as List<dynamic>;
      List<SpaceModel> list = [];
      if (data.isNotEmpty) {
        list = data.map((item) => SpaceModel.fromJson(item as Map<String, dynamic>)).toList();
      }

      if (isGuest) {
        // Guests only see their single temporary map (if created), no default HQ
        if (_guestTemporaryMap != null) {
          return [_guestTemporaryMap!];
        }
        return [];
      }

      if (list.isEmpty) {
        return [SpaceModel.defaultHQ()];
      }

      return list;
    } catch (e) {
      debugPrint('Error fetching spaces from Supabase: $e');
      if (isGuest) {
        if (_guestTemporaryMap != null) {
          return [_guestTemporaryMap!];
        }
        return [];
      }
      return [SpaceModel.defaultHQ()];
    }
  }

  static Future<SpaceModel?> createSpace({
    required String name,
    required String slug,
    String? description,
    String category = 'Gaming',
    String visibility = 'public',
    SpaceTier tier = SpaceTier.free,
    String mapTheme = 'village',
  }) async {
    final client = AuthService.client;
    final currentSession = AuthService.currentSession;
    final currentUserId = currentSession?.id;
    final isGuest = currentSession?.isGuest ?? true;
    final isPaid = currentSession?.isPaid ?? false;

    debugPrint(">>> [SpaceService] createSpace() requested: name='$name', slug='$slug', theme='$mapTheme', category='$category', isGuest=$isGuest, ownerId='$currentUserId'");

    // 1. Guest validation: guest can only make 1 map and it's temporary
    if (isGuest) {
      if (_guestTemporaryMap != null) {
        throw Exception("Guests can only create 1 temporary map. Upgrade to a paid account to create unlimited spaces, or delete your current temporary map.");
      }

      // If provisioned with a Supabase account, persist in Supabase so other users can join it
      if (client != null && currentUserId != null && _uuidRegex.hasMatch(currentUserId)) {
        try {
          final payload = {
            'name': name,
            'slug': slug,
            'description': description,
            'category': category,
            'visibility': 'public',
            'tier': 'free',
            'max_capacity': 50,
            'owner_id': currentUserId,
            'member_count': 1,
            'is_active': true,
            'map_theme': mapTheme,
            'join_code': slug,
          };
          final res = await client.from('spaces').insert(payload).select().single();
          final tempSpace = SpaceModel.fromJson(res).copyWith(isTemporary: true);
          _guestTemporaryMap = tempSpace;

          debugPrint(">>> [SpaceService] Guest temporary map created in Supabase: id=${tempSpace.id}, name='${tempSpace.name}', slug='${tempSpace.slug}', theme='${tempSpace.mapTheme}', ownerId='$currentUserId'");

          // Record membership and invite code
          try {
            await client.from('space_members').upsert({
              'space_id': tempSpace.id,
              'user_id': currentUserId,
              'role': 'owner',
            });
            await client.from('space_invites').insert({
              'space_id': tempSpace.id,
              'code': slug,
              'created_by': currentUserId,
            });
          } catch (err) {
            debugPrint(">>> [SpaceService] Membership/Invite creation note: $err");
          }

          return tempSpace;
        } catch (e) {
          debugPrint(">>> [SpaceService] Error creating guest space in Supabase: $e");
        }
      }

      final tempSpace = SpaceModel(
        id: 'guest-temp-${DateTime.now().millisecondsSinceEpoch}',
        name: name,
        slug: slug,
        description: description,
        category: category,
        visibility: 'unlisted',
        tier: SpaceTier.free,
        mapTheme: mapTheme,
        maxCapacity: 50,
        ownerId: currentUserId ?? 'guest',
        memberCount: 1,
        isTemporary: true,
      );
      _guestTemporaryMap = tempSpace;
      debugPrint(">>> [SpaceService] Guest temporary map created locally: id=${tempSpace.id}, name='${tempSpace.name}', slug='${tempSpace.slug}', theme='${tempSpace.mapTheme}', ownerId='${tempSpace.ownerId}'");
      return tempSpace;
    }

    // 2. Free account validation: Only paid accounts can make multiple maps
    if (!isPaid && client != null && currentUserId != null) {
      try {
        final existing = await client
            .from('spaces')
            .select('id')
            .eq('owner_id', currentUserId);
        final count = (existing as List<dynamic>).length;
        if (count >= 1) {
          throw Exception("Only paid accounts can make multiple maps. Upgrade to a Paid Account to create unlimited spaces!");
        }
      } catch (e) {
        if (e.toString().contains("Only paid accounts")) rethrow;
        debugPrint("Error checking owned space count: $e");
      }
    }

    final newSpace = SpaceModel(
      id: '',
      name: name,
      slug: slug,
      description: description,
      category: category,
      visibility: visibility,
      tier: SpaceTier.free,
      mapTheme: mapTheme,
      maxCapacity: 50,
      ownerId: currentUserId,
      memberCount: 1,
      isTemporary: false,
    );

    if (client == null || currentUserId == null) {
      final localSpace = newSpace.copyWith(id: 'local-${DateTime.now().millisecondsSinceEpoch}');
      debugPrint(">>> [SpaceService] Map created locally: id=${localSpace.id}, name='${localSpace.name}', slug='${localSpace.slug}', theme='${localSpace.mapTheme}', ownerId='$currentUserId'");
      return localSpace;
    }

    try {
      final payload = newSpace.toJson()
        ..remove('id')
        ..remove('is_temporary');
      payload['join_code'] = newSpace.slug;
      final res = await client.from('spaces').insert(payload).select().single();
      final createdSpace = SpaceModel.fromJson(res);
      debugPrint(">>> [SpaceService] Map created in Supabase: id=${createdSpace.id}, name='${createdSpace.name}', slug='${createdSpace.slug}', theme='${createdSpace.mapTheme}', ownerId='$currentUserId'");
      return createdSpace;
    } catch (e) {
      debugPrint('Error creating space in Supabase: $e');
      final localSpace = newSpace.copyWith(id: 'local-${DateTime.now().millisecondsSinceEpoch}');
      debugPrint(">>> [SpaceService] Map created locally (fallback): id=${localSpace.id}, name='${localSpace.name}', slug='${localSpace.slug}', theme='${localSpace.mapTheme}', ownerId='$currentUserId'");
      return localSpace;
    }
  }

  static Future<SpaceModel?> updateSpace({
    required String id,
    required String name,
    String? description,
    String category = 'Gaming',
    String mapTheme = 'village',
  }) async {
    // If it's a guest temporary map
    if (_guestTemporaryMap != null && _guestTemporaryMap!.id == id) {
      _guestTemporaryMap = _guestTemporaryMap!.copyWith(
        name: name,
        description: description,
        category: category,
        mapTheme: mapTheme,
      );
      return _guestTemporaryMap;
    }

    final client = AuthService.client;
    if (client == null || AuthService.currentSession?.isGuest == true) {
      return null;
    }

    try {
      final res = await client
          .from('spaces')
          .update({
            'name': name,
            'description': description,
            'category': category,
            'map_theme': mapTheme,
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', id)
          .select()
          .single();

      return SpaceModel.fromJson(res);
    } catch (e) {
      debugPrint('Error updating space in Supabase: $e');
      return null;
    }
  }

  static Future<bool> deleteSpace(String id) async {
    if (_guestTemporaryMap != null && _guestTemporaryMap!.id == id) {
      final client = AuthService.client;
      if (client != null && _uuidRegex.hasMatch(id)) {
        try {
          await client.from('spaces').delete().eq('id', id);
        } catch (_) {}
      }
      _guestTemporaryMap = null;
      return true;
    }

    final client = AuthService.client;
    if (client == null) {
      return true;
    }

    try {
      await client.from('spaces').delete().eq('id', id);
      return true;
    } catch (e) {
      debugPrint('Error deleting space from Supabase: $e');
      return false;
    }
  }

  static final RegExp _uuidRegex = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  );

  static Future<SpaceModel?> getSpaceByCodeOrSlug(String codeOrSlug) async {
    final client = AuthService.client;
    final query = codeOrSlug.trim();
    if (query.isEmpty) return null;

    if (_guestTemporaryMap != null) {
      if (_guestTemporaryMap!.slug.toLowerCase() == query.toLowerCase() ||
          _guestTemporaryMap!.id == query ||
          (_guestTemporaryMap!.joinCode != null &&
              _guestTemporaryMap!.joinCode!.toLowerCase() == query.toLowerCase())) {
        return _guestTemporaryMap;
      }
    }

    // Default HQ check
    if (query.toLowerCase() == 'main-hq' ||
        query == 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b') {
      return SpaceModel.defaultHQ();
    }

    if (client == null) {
      return null;
    }

    // 0. Primary: Call secure database resolver function (resolves slug, join_code, space_invites, or uuid)
    try {
      final rpcRes = await client.rpc('resolve_space_invite', params: {'p_code': query});
      if (rpcRes != null) {
        if (rpcRes is List && rpcRes.isNotEmpty) {
          final first = rpcRes.first;
          if (first is Map<String, dynamic>) {
            return SpaceModel.fromJson(first);
          } else if (first is Map) {
            return SpaceModel.fromJson(Map<String, dynamic>.from(first));
          }
        } else if (rpcRes is Map<String, dynamic>) {
          return SpaceModel.fromJson(rpcRes);
        } else if (rpcRes is Map) {
          return SpaceModel.fromJson(Map<String, dynamic>.from(rpcRes));
        }
      }
    } catch (e) {
      debugPrint('>>> [SpaceService] resolve_space_invite RPC error: $e');
    }

    // 1. Try slug (exact and lowercase)
    try {
      final res = await client
          .from('spaces')
          .select()
          .ilike('slug', query)
          .maybeSingle();
      if (res != null) return SpaceModel.fromJson(res);
    } catch (e) {
      debugPrint('>>> [SpaceService] Slug lookup error: $e');
    }

    // 2. Try ID if valid UUID format
    if (_uuidRegex.hasMatch(query)) {
      try {
        final res = await client.from('spaces').select().eq('id', query).maybeSingle();
        if (res != null) return SpaceModel.fromJson(res);
      } catch (e) {
        debugPrint('>>> [SpaceService] ID lookup error: $e');
      }
    }

    // 3. Try join_code
    try {
      final res = await client
          .from('spaces')
          .select()
          .ilike('join_code', query)
          .maybeSingle();
      if (res != null) return SpaceModel.fromJson(res);
    } catch (e) {
      debugPrint('>>> [SpaceService] Join code lookup error: $e');
    }

    // 4. Try space_invites table
    try {
      final inviteRes = await client
          .from('space_invites')
          .select('space_id, expires_at')
          .eq('code', query)
          .maybeSingle();
      if (inviteRes != null) {
        final spaceId = inviteRes['space_id'] as String?;
        final expiresAtStr = inviteRes['expires_at'] as String?;
        final expiresAt = expiresAtStr != null ? DateTime.tryParse(expiresAtStr) : null;
        if (expiresAt == null || expiresAt.isAfter(DateTime.now())) {
          if (spaceId != null) {
            final spaceRes = await client.from('spaces').select().eq('id', spaceId).maybeSingle();
            if (spaceRes != null) return SpaceModel.fromJson(spaceRes);
          }
        }
      }
    } catch (e) {
      debugPrint('>>> [SpaceService] Invite table lookup error: $e');
    }

    return null;
  }

  /// Joins a space using an invite code, join code, or slug via the secure RPC
  static Future<bool> joinSpaceViaInvite(String code) async {
    final client = AuthService.client;
    final query = code.trim();
    if (client == null || query.isEmpty) return false;

    try {
      final res = await client.rpc('join_space_via_invite', params: {'p_code': query});
      if (res != null) {
        debugPrint('>>> [SpaceService] Successfully joined space via invite: $res');
        return true;
      }
    } catch (e) {
      debugPrint('>>> [SpaceService] join_space_via_invite RPC error: $e');
    }
    return false;
  }

  static Future<List<WorldObjectModel>> fetchWorldObjects(String spaceId) async {
    final client = AuthService.client;
    if (client == null) return [];

    try {
      final response = await client
          .from('world_objects')
          .select()
          .eq('space_id', spaceId);

      final List<dynamic> data = response as List<dynamic>;
      return data.map((item) => WorldObjectModel.fromJson(item as Map<String, dynamic>)).toList();
    } catch (e) {
      debugPrint('Error loading world objects: $e');
      return [];
    }
  }

  static Future<WorldObjectModel?> saveWorldObject(WorldObjectModel obj) async {
    final client = AuthService.client;
    if (client == null || AuthService.currentSession?.isGuest == true) return obj;

    try {
      final payload = obj.toJson();
      if (obj.id.isEmpty) {
        payload.remove('id');
      }
      final res = await client.from('world_objects').insert(payload).select().single();
      return WorldObjectModel.fromJson(res);
    } catch (e) {
      debugPrint('Error saving world object: $e');
      return obj;
    }
  }

  static Future<bool> deleteWorldObject(String objectId) async {
    final client = AuthService.client;
    if (client == null || objectId.isEmpty) return true;

    try {
      await client.from('world_objects').delete().eq('id', objectId);
      return true;
    } catch (e) {
      debugPrint('Error deleting world object: $e');
      return false;
    }
  }

  static Future<bool> clearWorldObjects(String spaceId) async {
    final client = AuthService.client;
    if (client == null || spaceId.isEmpty) return true;

    try {
      await client.from('world_objects').delete().eq('space_id', spaceId);
      return true;
    } catch (e) {
      debugPrint('Error clearing world objects: $e');
      return false;
    }
  }
}
