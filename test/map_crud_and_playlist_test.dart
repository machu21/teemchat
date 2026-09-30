import 'package:flutter_test/flutter_test.dart';
import 'package:virtual_world/core/models/playlist_model.dart';
import 'package:virtual_world/core/models/space_model.dart';
import 'package:virtual_world/core/services/playlist_service.dart';
import 'package:virtual_world/core/services/space_service.dart';

import 'package:virtual_world/features/auth/auth_service.dart';

void main() {
  group('Map CRUD & Map Theme Tests', () {
    test('SpaceModel contains mapTheme with default village', () {
      final space = SpaceModel.defaultHQ();
      expect(space.mapTheme, equals('village'));
    });

    test('SpaceModel custom map themes serialize and deserialize properly', () {
      const customSpace = SpaceModel(
        id: 'space-test-1',
        name: 'Crystal Bay Oasis',
        slug: 'crystal-bay-oasis',
        description: 'Tropical relaxation island',
        category: 'Friends',
        visibility: 'public',
        tier: SpaceTier.pro,
        mapTheme: 'beach',
        maxCapacity: 75,
        memberCount: 5,
        ownerId: 'creator-123',
      );

      final json = customSpace.toJson();
      expect(json['map_theme'], equals('beach'));

      final restored = SpaceModel.fromJson(json);
      expect(restored.mapTheme, equals('beach'));
      expect(restored.name, equals('Crystal Bay Oasis'));
      expect(restored.ownerId, equals('creator-123'));
    });

    test('SpaceModel supports multiple distinct map themes', () {
      const themes = ['village', 'beach', 'forest', 'lounge'];
      for (final theme in themes) {
        final space = SpaceModel(
          id: 'test-$theme',
          name: '$theme Space',
          slug: '$theme-space',
          mapTheme: theme,
        );
        expect(space.mapTheme, equals(theme));
        expect(space.toJson()['map_theme'], equals(theme));
      }
    });

    test('SpaceModel copyWith allows updating name, description, and mapTheme', () {
      final space = SpaceModel.defaultHQ();
      final updated = space.copyWith(
        name: 'Whispering Woods Camp',
        description: 'Night campfire stories in deep woods',
        mapTheme: 'forest',
      );

      expect(updated.name, equals('Whispering Woods Camp'));
      expect(updated.description, equals('Night campfire stories in deep woods'));
      expect(updated.mapTheme, equals('forest'));
      expect(updated.id, equals(space.id));
    });
  });

  group('Sound Tripping Playlist & Track Tests', () {
    test('PlaylistTrack default presets generate valid ambient tracks', () {
      final presets = PlaylistTrack.defaultPresets('space-abc');
      expect(presets.length, greaterThanOrEqualTo(3));
      expect(presets.first.title, contains('Campfire Pixel Glow'));
      expect(presets.first.isDefaultPreset, isTrue);
      expect(presets.first.audioUrl, isNotEmpty);
    });

    test('PlaylistTrack JSON serialization roundtrip for uploaded MP3', () {
      final track = PlaylistTrack(
        id: 'track-999',
        spaceId: 'space-xyz',
        title: 'Retro Synthwave Beats',
        artist: 'Pixel DJ',
        audioUrl: 'blob:http://localhost/test-audio-uuid',
        durationSeconds: 240,
        createdBy: 'user-456',
        createdAt: DateTime(2026, 9, 30, 18, 0),
      );

      final json = track.toJson();
      expect(json['title'], equals('Retro Synthwave Beats'));
      expect(json['artist'], equals('Pixel DJ'));
      expect(json['audio_url'], equals('blob:http://localhost/test-audio-uuid'));
      expect(json['duration_seconds'], equals(240));

      final restored = PlaylistTrack.fromJson(json);
      expect(restored.id, equals('track-999'));
      expect(restored.title, equals('Retro Synthwave Beats'));
      expect(restored.isDefaultPreset, isFalse);
    });

    test('PlaylistService controls playback, navigation and volume', () async {
      await PlaylistService.loadPlaylist('test-space-id');
      expect(PlaylistService.playlist.value, isNotEmpty);

      final firstTrack = PlaylistService.playlist.value.first;
      PlaylistService.playTrack(firstTrack);

      expect(PlaylistService.isPlaying.value, isTrue);
      expect(PlaylistService.currentTrack.value?.id, equals(firstTrack.id));

      // Test next track
      PlaylistService.nextTrack();
      expect(PlaylistService.currentTrack.value?.id, equals(PlaylistService.playlist.value[1].id));

      // Test previous track
      PlaylistService.previousTrack();
      expect(PlaylistService.currentTrack.value?.id, equals(firstTrack.id));

      // Test volume change
      PlaylistService.volume.value = 0.85;
      expect(PlaylistService.volume.value, equals(0.85));

      // Test stop
      PlaylistService.stop();
      expect(PlaylistService.isPlaying.value, isFalse);
    });

    test('PlaylistService deleteTrack removes track and adjusts playback', () async {
      await PlaylistService.loadPlaylist('test-space-del');
      final initialCount = PlaylistService.playlist.value.length;

      const customTrack = PlaylistTrack(
        id: 'custom-to-delete',
        spaceId: 'test-space-del',
        title: 'Track To Delete',
        artist: 'Tester',
        audioUrl: 'https://example.com/audio.mp3',
      );

      PlaylistService.playlist.value = [...PlaylistService.playlist.value, customTrack];
      expect(PlaylistService.playlist.value.length, equals(initialCount + 1));

      PlaylistService.playTrack(customTrack);
      expect(PlaylistService.currentTrack.value?.id, equals('custom-to-delete'));

      await PlaylistService.deleteTrack(customTrack);
      expect(PlaylistService.playlist.value.any((t) => t.id == 'custom-to-delete'), isFalse);
      expect(PlaylistService.playlist.value.length, equals(initialCount));
    });
  });

  group('Invite & Join Code Resolution Tests', () {
    test('getSpaceByCodeOrSlug resolves defaultHQ slug without network', () async {
      final space = await SpaceService.getSpaceByCodeOrSlug('main-hq');
      expect(space, isNotNull);
      expect(space?.slug, equals('main-hq'));
      expect(space?.name, contains('Headquarters'));
    });

    test('getSpaceByCodeOrSlug returns null on empty string', () async {
      final space = await SpaceService.getSpaceByCodeOrSlug('');
      expect(space, isNull);
    });
  });

  group('Guest Temporary Maps & Account Entitlement Tests', () {
    setUp(() {
      SpaceService.clearGuestMaps();
      AuthService.sessionNotifier.value = null;
    });

    tearDown(() {
      SpaceService.clearGuestMaps();
      AuthService.sessionNotifier.value = null;
    });

    test('Guest starts with 0 virtual spaces before creating any', () async {
      AuthService.sessionNotifier.value = UserSession(
        id: 'guest-100',
        displayName: 'Guest New',
        username: 'guest_new',
        email: 'new@guest.local',
        isGuest: true,
      );

      final spaces = await SpaceService.getSpaces();
      expect(spaces.length, equals(0));
    });

    test('Guest can create exactly 1 temporary map, marked isTemporary', () async {
      AuthService.sessionNotifier.value = UserSession(
        id: 'guest-101',
        displayName: 'Guest Alex',
        username: 'guest_alex',
        email: 'alex@guest.local',
        isGuest: true,
      );

      final space = await SpaceService.createSpace(
        name: 'Alex Temporary Lounge',
        slug: 'alex-temporary-lounge',
        mapTheme: 'lounge',
      );

      expect(space, isNotNull);
      expect(space!.isTemporary, isTrue);
      expect(space.name, equals('Alex Temporary Lounge'));
      expect(space.mapTheme, equals('lounge'));
      expect(space.maxCapacity, equals(50));

      // Only the temporary map appears (no defaultHQ)
      final spaces = await SpaceService.getSpaces();
      expect(spaces.length, equals(1));
      expect(spaces.first.id, equals(space.id));
      expect(spaces.first.isTemporary, isTrue);
    });

    test('Guest cannot create more than 1 map', () async {
      AuthService.sessionNotifier.value = UserSession(
        id: 'guest-102',
        displayName: 'Guest Sam',
        username: 'guest_sam',
        email: 'sam@guest.local',
        isGuest: true,
      );

      // First map succeeds
      final map1 = await SpaceService.createSpace(
        name: 'Map 1',
        slug: 'map-1',
      );
      expect(map1, isNotNull);

      // Second map attempt throws exception
      expect(
        () => SpaceService.createSpace(
          name: 'Map 2',
          slug: 'map-2',
        ),
        throwsA(isA<Exception>().having(
          (e) => e.toString(),
          'message',
          contains('Guests can only create 1 temporary map'),
        )),
      );
    });

    test('clearGuestMaps() deletes the guest temporary map', () async {
      AuthService.sessionNotifier.value = UserSession(
        id: 'guest-103',
        displayName: 'Guest Casey',
        username: 'guest_casey',
        email: 'casey@guest.local',
        isGuest: true,
      );

      await SpaceService.createSpace(
        name: 'Casey Playground',
        slug: 'casey-playground',
      );

      var spaces = await SpaceService.getSpaces();
      expect(spaces.length, equals(1));

      // Clear guest maps
      SpaceService.clearGuestMaps();

      spaces = await SpaceService.getSpaces();
      expect(spaces.length, equals(0));
      expect(spaces.any((s) => s.isTemporary), isFalse);
    });

    test('AuthService.signOut() clears guest temporary maps upon quitting', () async {
      AuthService.sessionNotifier.value = UserSession(
        id: 'guest-104',
        displayName: 'Guest Jordan',
        username: 'guest_jordan',
        email: 'jordan@guest.local',
        isGuest: true,
      );

      await SpaceService.createSpace(
        name: 'Jordan Fort',
        slug: 'jordan-fort',
      );

      expect((await SpaceService.getSpaces()).length, equals(1));

      await AuthService.signOut();

      // After sign out, guest map is deleted and spaces is empty
      expect((await SpaceService.getSpaces()).length, equals(0));
    });

    test('Guest temporary map can be deleted via deleteSpace', () async {
      AuthService.sessionNotifier.value = UserSession(
        id: 'guest-105',
        displayName: 'Guest Taylor',
        username: 'guest_taylor',
        email: 'taylor@guest.local',
        isGuest: true,
      );

      final temp = await SpaceService.createSpace(
        name: 'Taylor Deck',
        slug: 'taylor-deck',
      );

      expect((await SpaceService.getSpaces()).length, equals(1));

      await SpaceService.deleteSpace(temp!.id);

      expect((await SpaceService.getSpaces()).length, equals(0));

      // After deleting their single map, they can create a new one
      final newTemp = await SpaceService.createSpace(
        name: 'Taylor New Deck',
        slug: 'taylor-new-deck',
      );
      expect(newTemp, isNotNull);
      expect(newTemp!.name, equals('Taylor New Deck'));
    });

    test('Paid user can create spaces without guest restrictions', () async {
      AuthService.sessionNotifier.value = UserSession(
        id: 'paid-user-1',
        displayName: 'Paid Explorer',
        username: 'paid_explorer',
        email: 'paid@example.com',
        isGuest: false,
        isPaid: true,
        tier: 'paid',
      );

      // Offline mock fallback produces non-temporary space with 50 capacity
      final space1 = await SpaceService.createSpace(
        name: 'Paid Realm 1',
        slug: 'paid-realm-1',
      );
      expect(space1, isNotNull);
      expect(space1!.isTemporary, isFalse);
      expect(space1.maxCapacity, equals(50));
    });
  });
}

