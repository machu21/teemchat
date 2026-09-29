import 'package:flutter/foundation.dart';
import '../../features/auth/auth_service.dart';
import '../models/space_model.dart';

class SpaceService {
  static Future<List<SpaceModel>> getSpaces() async {
    final client = AuthService.client;
    final currentSession = AuthService.currentSession;
    final isGuest = currentSession?.isGuest ?? true;

    if (client == null) {
      if (isGuest) {
        return [SpaceModel.guestSandbox(guestId: currentSession?.id), SpaceModel.defaultHQ()];
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
        return [
          SpaceModel.guestSandbox(guestId: currentSession?.id),
          ...list,
        ];
      }

      if (list.isEmpty) {
        return [SpaceModel.defaultHQ()];
      }

      return list;
    } catch (e) {
      debugPrint('Error fetching spaces from Supabase: $e');
      if (isGuest) {
        return [SpaceModel.guestSandbox(guestId: currentSession?.id), SpaceModel.defaultHQ()];
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
  }) async {
    final client = AuthService.client;
    final currentUserId = AuthService.currentSession?.id;

    final newSpace = SpaceModel(
      id: '',
      name: name,
      slug: slug,
      description: description,
      category: category,
      visibility: visibility,
      tier: tier,
      maxCapacity: tier.defaultCapacity,
      ownerId: currentUserId,
      memberCount: 1,
    );

    if (client == null || currentUserId == null || AuthService.currentSession?.isGuest == true) {
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
