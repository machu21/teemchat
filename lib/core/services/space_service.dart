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
    _guestTemporaryMap = null;
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

    // 1. Guest validation: guest can only make 1 map and it's temporary (never saved to database)
    if (isGuest) {
      if (_guestTemporaryMap != null) {
        throw Exception("Guests can only create 1 temporary map. Upgrade to a paid account to create unlimited spaces, or delete your current temporary map.");
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
      return newSpace.copyWith(id: 'local-${DateTime.now().millisecondsSinceEpoch}');
    }

    try {
      final payload = newSpace.toJson()..remove('id');
      final res = await client.from('spaces').insert(payload).select().single();
      return SpaceModel.fromJson(res);
    } catch (e) {
      debugPrint('Error creating space in Supabase: $e');
      return newSpace.copyWith(id: 'local-${DateTime.now().millisecondsSinceEpoch}');
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
      _guestTemporaryMap = null;
      return true;
    }

    final client = AuthService.client;
    if (client == null || AuthService.currentSession?.isGuest == true) {
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

  static Future<SpaceModel?> getSpaceByCodeOrSlug(String codeOrSlug) async {
    final client = AuthService.client;
    final query = codeOrSlug.trim();
    if (query.isEmpty) return null;

    if (_guestTemporaryMap != null) {
      if (_guestTemporaryMap!.slug == query ||
          _guestTemporaryMap!.id == query ||
          _guestTemporaryMap!.joinCode == query) {
        return _guestTemporaryMap;
      }
    }

    if (client == null) {
      if (query == 'main-hq' || query == 'b6941fa2-8305-4e00-833c-ca3cd5f08c9b') {
        return SpaceModel.defaultHQ();
      }
      return null;
    }

    try {
      // 1. Try slug
      var res = await client.from('spaces').select().eq('slug', query).maybeSingle();
      if (res != null) return SpaceModel.fromJson(res);

      // 2. Try ID (if UUID format or 32+ chars)
      if (query.length >= 32) {
        res = await client.from('spaces').select().eq('id', query).maybeSingle();
        if (res != null) return SpaceModel.fromJson(res);
      }

      // 3. Try join_code
      res = await client.from('spaces').select().eq('join_code', query).maybeSingle();
      if (res != null) return SpaceModel.fromJson(res);

      return null;
    } catch (e) {
      debugPrint('Error looking up space: $e');
      return null;
    }
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
