import 'package:flutter/foundation.dart';
import 'tts_platform.dart';

/// Stub implementation when neither html nor io is matched.
class TtsServicePlatformImpl implements TtsPlatform {
  @override
  void speak({
    required String text,
    required double pitch,
    required double rate,
    required VoidCallback onStart,
    required VoidCallback onDone,
    required void Function(String error) onError,
  }) {
    onDone();
  }

  @override
  void stop() {}
}
