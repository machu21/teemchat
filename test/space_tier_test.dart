import 'package:flutter_test/flutter_test.dart';
import 'package:virtual_world/core/models/space_model.dart';

void main() {
  group('SpaceTier Enum Tests', () {
    test('Correct parsing from string', () {
      expect(SpaceTier.fromString('free'), SpaceTier.free);
      expect(SpaceTier.fromString('pro'), SpaceTier.pro);
      expect(SpaceTier.fromString('studio'), SpaceTier.studio);
      expect(SpaceTier.fromString('unknown'), SpaceTier.free);
    });

    test('Capacities match business tiers', () {
      expect(SpaceTier.free.defaultCapacity, 15);
      expect(SpaceTier.pro.defaultCapacity, 75);
      expect(SpaceTier.studio.defaultCapacity, 250);
    });

    test('Perk privileges match specification', () {
      expect(SpaceTier.free.allowsCloudMapPersistence, false);
      expect(SpaceTier.pro.allowsCloudMapPersistence, true);
      expect(SpaceTier.studio.allowsCloudMapPersistence, true);

      expect(SpaceTier.free.allowsCustomUploads, false);
      expect(SpaceTier.pro.allowsCustomUploads, false);
      expect(SpaceTier.studio.allowsCustomUploads, true);
    });
  });

  group('SpaceModel Serialization & Features Tests', () {
    test('defaultHQ factory has valid defaults', () {
      final hq = SpaceModel.defaultHQ();
      expect(hq.name, 'Main Headquarters');
      expect(hq.tier, SpaceTier.free);
      expect(hq.maxCapacity, 15);
      expect(hq.canCustomizeMap, false);
    });

    test('Pro space can customize map and has higher capacity', () {
      const space = SpaceModel(
        id: 'space-pro-1',
        name: 'Design Studio',
        slug: 'design-studio',
        tier: SpaceTier.pro,
        maxCapacity: 75,
      );
      expect(space.isPaid, true);
      expect(space.isPro, true);
      expect(space.canCustomizeMap, true);
      expect(space.maxCapacity, 75);
    });

    test('JSON serialization roundtrip works accurately', () {
      const space = SpaceModel(
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Town Square Club',
        slug: 'town-square-club',
        description: 'Cozy study spot',
        category: 'School',
        visibility: 'private',
        tier: SpaceTier.pro,
        maxCapacity: 75,
        memberCount: 12,
      );

      final json = space.toJson();
      final restored = SpaceModel.fromJson(json);

      expect(restored.id, space.id);
      expect(restored.name, space.name);
      expect(restored.slug, space.slug);
      expect(restored.tier, SpaceTier.pro);
      expect(restored.maxCapacity, 75);
      expect(restored.memberCount, 12);
      expect(restored.canCustomizeMap, true);
    });
  });

  group('WorldObjectModel Serialization Tests', () {
    test('JSON serialization roundtrip for placed objects', () {
      const obj = WorldObjectModel(
        id: 'obj-42',
        spaceId: 'space-hq',
        objectType: 'campfire',
        x: 320.0,
        y: 440.0,
        rotation: 90,
        properties: {'radius': 160},
      );

      final json = obj.toJson();
      final restored = WorldObjectModel.fromJson(json);

      expect(restored.id, 'obj-42');
      expect(restored.spaceId, 'space-hq');
      expect(restored.objectType, 'campfire');
      expect(restored.x, 320.0);
      expect(restored.y, 440.0);
      expect(restored.rotation, 90);
      expect(restored.properties['radius'], 160);
    });
  });
}
