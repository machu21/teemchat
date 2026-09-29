import 'package:flame/components.dart' show Vector2;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:virtual_world/core/models/avatar_model.dart';
import 'package:virtual_world/core/widgets/pixel_avatar_widget.dart';
import 'package:virtual_world/features/world/game/components/tile_map.dart';
import 'package:virtual_world/main.dart';

void main() {
  group('AvatarConfig Tests', () {
    test('Default config has standard values', () {
      const config = AvatarConfig();
      expect(config.hairStyle, 'short');
      expect(config.accessory, 'none');
      expect(config.skinColor, const Color(0xFFFCD5B5));
      expect(config.shirtColor, const Color(0xFF7C3AED));
      expect(config.hairColor, const Color(0xFF37271E));
    });

    test('Available lists contain all options', () {
      expect(AvatarConfig.availableHairStyles, containsAll(['short', 'long', 'buzz', 'spiky']));
      expect(AvatarConfig.availableAccessories, containsAll(['none', 'glasses', 'headband', 'headphones', 'cap']));
    });

    test('copyWith updates fields correctly', () {
      const config = AvatarConfig();
      final updated = config.copyWith(
        accessory: 'cap',
        hairStyle: 'spiky',
        shirtColor: const Color(0xFFEF4444),
      );
      expect(updated.accessory, 'cap');
      expect(updated.hairStyle, 'spiky');
      expect(updated.shirtColor, const Color(0xFFEF4444));
      expect(updated.skinColor, config.skinColor);
    });

    test('JSON serialization roundtrip works', () {
      const original = AvatarConfig(
        accessory: 'cap',
        hairStyle: 'long',
        skinColor: Color(0xFFFFDFC4),
        shirtColor: Color(0xFF10B981),
        hairColor: Color(0xFF1F2937),
      );
      final json = original.toJson();
      final restored = AvatarConfig.fromJson(json);

      expect(restored, equals(original));
      expect(restored.accessory, 'cap');
      expect(restored.hairStyle, 'long');
      expect(restored.skinColor.value, original.skinColor.value);
      expect(restored.shirtColor.value, original.shirtColor.value);
    });

    test('Equality and hashCode verify value equivalence', () {
      const config1 = AvatarConfig(accessory: 'headphones', hairStyle: 'buzz');
      const config2 = AvatarConfig(accessory: 'headphones', hairStyle: 'buzz');
      const config3 = AvatarConfig(accessory: 'cap', hairStyle: 'buzz');

      expect(config1, equals(config2));
      expect(config1.hashCode, equals(config2.hashCode));
      expect(config1, isNot(equals(config3)));
    });
  });

  group('PixelAvatarWidget Tests', () {
    testWidgets('Renders properly with cap and custom colors', (WidgetTester tester) async {
      const config = AvatarConfig(
        accessory: 'cap',
        hairStyle: 'spiky',
        shirtColor: Color(0xFF8B5CF6),
      );

      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: PixelAvatarWidget(config: config, size: 96),
            ),
          ),
        ),
      );

      expect(find.byType(PixelAvatarWidget), findsOneWidget);
    });
  });

  group('WorldMapComponent Zone Name Tests', () {
    test('Maps coordinates to accurate adventure zones', () {
      expect(WorldMapComponent.getZoneName(Vector2(300, 200)), 'Verdant Village');
      expect(WorldMapComponent.getZoneName(Vector2(800, 200)), 'Whispering Woods');
      expect(WorldMapComponent.getZoneName(Vector2(1450, 400)), 'Crystal Bay');
      expect(WorldMapComponent.getZoneName(Vector2(300, 700)), 'Craggy Ridge');
      expect(WorldMapComponent.getZoneName(Vector2(900, 600)), 'Adventure Camp');
      expect(WorldMapComponent.getZoneName(Vector2(900, 850)), 'River Crossing');
    });
  });

  group('Application Smoke Test', () {
    testWidgets('VirtualWorldApp builds and mounts AuthGate', (WidgetTester tester) async {
      await tester.pumpWidget(const VirtualWorldApp());
      expect(find.byType(VirtualWorldApp), findsOneWidget);
      expect(find.byType(MaterialApp), findsOneWidget);
    });
  });
}
