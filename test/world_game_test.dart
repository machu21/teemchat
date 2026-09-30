import 'package:flame/game.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:virtual_world/core/models/avatar_model.dart';
import 'package:virtual_world/core/models/space_model.dart';
import 'package:virtual_world/features/world/game/world_game.dart';

void main() {
  testWidgets('WorldGame loads properly and dismisses loadingBuilder in GameWidget', (tester) async {
    final game = WorldGame(
      displayName: 'Test User',
      status: 'online',
      avatarConfig: const AvatarConfig(),
      space: SpaceModel.defaultHQ(),
    );

    int loadingBuilderCalls = 0;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: GameWidget(
            game: game,
            loadingBuilder: (context) {
              loadingBuilderCalls++;
              return const Text('LOADING_INDICATOR');
            },
          ),
        ),
      ),
    );

    expect(find.text('LOADING_INDICATOR'), findsOneWidget);
    expect(loadingBuilderCalls, greaterThanOrEqualTo(1));

    // Pump frames to let Flame onLoad finish
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(game.isLoaded, isTrue);
    expect(game.isMounted, isTrue);
    expect(find.text('LOADING_INDICATOR'), findsNothing);
  });
}
