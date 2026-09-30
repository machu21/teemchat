import 'package:flutter/foundation.dart';

/// Abstract contract for platform-specific Text-to-Speech synthesis.
abstract class TtsPlatform {
  /// Speaks the given [text] with the given [pitch] and [rate].
  void speak({
    required String text,
    required double pitch,
    required double rate,
    required VoidCallback onStart,
    required VoidCallback onDone,
    required void Function(String error) onError,
  });

  /// Immediately cancels / stops any ongoing speech.
  void stop();
}
