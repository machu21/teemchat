// ignore_for_file: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'package:flutter/foundation.dart';
import 'tts_platform.dart';

/// Web Speech API implementation of [TtsPlatform].
/// Native browser speech synthesis built directly into Chrome, Edge, Safari, Firefox.
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
    try {
      final synth = html.window.speechSynthesis;
      if (synth == null) {
        onError("SpeechSynthesis not supported in this browser window");
        onDone();
        return;
      }

      // Stop any prior utterance
      synth.cancel();

      final utterance = html.SpeechSynthesisUtterance(text);
      utterance.pitch = pitch.clamp(0.5, 2.0);
      utterance.rate = rate.clamp(0.5, 2.0);

      // Prefer English voice if available
      try {
        final voices = synth.getVoices();
        for (final v in voices) {
          final lang = v.lang?.toLowerCase() ?? '';
          if (lang.startsWith('en')) {
            utterance.voice = v;
            break;
          }
        }
      } catch (_) {}

      utterance.onStart.listen((_) => onStart());
      utterance.onEnd.listen((_) => onDone());
      utterance.onError.listen((e) {
        debugPrint("Speech synthesis utterance error: $e");
        onDone();
      });

      synth.speak(utterance);
    } catch (e) {
      debugPrint("TtsServiceWeb speak error: $e");
      onError(e.toString());
      onDone();
    }
  }

  @override
  void stop() {
    try {
      html.window.speechSynthesis?.cancel();
    } catch (_) {}
  }
}
