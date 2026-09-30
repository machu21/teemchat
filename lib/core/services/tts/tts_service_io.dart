import 'dart:async';
import 'package:flutter/foundation.dart';
import 'tts_platform.dart';

/// Desktop / VM / Test implementation of [TtsPlatform].
/// Provides safe simulated playback during unit/widget tests and headless runs.
class TtsServicePlatformImpl implements TtsPlatform {
  Timer? _timer;

  @override
  void speak({
    required String text,
    required double pitch,
    required double rate,
    required VoidCallback onStart,
    required VoidCallback onDone,
    required void Function(String error) onError,
  }) {
    onStart();
    _timer?.cancel();
    // Simulate short completion in headless/test runs
    _timer = Timer(const Duration(milliseconds: 350), () {
      onDone();
    });
  }

  @override
  void stop() {
    _timer?.cancel();
  }
}
