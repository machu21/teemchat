import 'package:flutter/foundation.dart';
import 'tts_platform.dart';
import 'tts_service_stub.dart'
    if (dart.library.html) 'tts_service_web.dart'
    if (dart.library.io) 'tts_service_io.dart';

/// Central Text-to-Speech (TTS) manager for the AI Companion.
/// Supports Web Speech API in browser, with safe headless fallbacks for testing.
class TtsService {
  static final TtsPlatform _platform = TtsServicePlatformImpl();

  /// Whether audio is currently actively speaking.
  static final ValueNotifier<bool> isSpeaking = ValueNotifier<bool>(false);

  /// The raw text currently being spoken (used by UI to highlight active bubble).
  static final ValueNotifier<String?> currentSpeakingText =
      ValueNotifier<String?>(null);

  /// Whether new companion responses should be automatically read aloud.
  static final ValueNotifier<bool> autoSpeak = ValueNotifier<bool>(false);

  /// Pitch of voice (1.0 = normal, 1.25 = cute/robot companion).
  static final ValueNotifier<double> pitch = ValueNotifier<double>(1.2);

  /// Speed of voice (1.0 = normal, 1.05 = slightly punchy).
  static final ValueNotifier<double> rate = ValueNotifier<double>(1.05);

  /// Speaks the provided [rawText]. If the same text is already playing, toggles it off.
  static void speak(String rawText) {
    if (rawText.trim().isEmpty) return;

    // Toggle off if already speaking this exact text
    if (isSpeaking.value && currentSpeakingText.value == rawText) {
      stop();
      return;
    }

    stop();

    final cleanText = cleanTextForSpeech(rawText);
    if (cleanText.isEmpty) return;

    currentSpeakingText.value = rawText;
    isSpeaking.value = true;

    _platform.speak(
      text: cleanText,
      pitch: pitch.value,
      rate: rate.value,
      onStart: () {
        isSpeaking.value = true;
      },
      onDone: () {
        isSpeaking.value = false;
        currentSpeakingText.value = null;
      },
      onError: (err) {
        debugPrint('TtsService speech error: $err');
        isSpeaking.value = false;
        currentSpeakingText.value = null;
      },
    );
  }

  /// Cancels any ongoing speech.
  static void stop() {
    _platform.stop();
    isSpeaking.value = false;
    currentSpeakingText.value = null;
  }

  /// Cleans markdown, code fences, and math blocks so the voice speaks naturally
  /// rather than reading syntax symbols and braces.
  static String cleanTextForSpeech(String input) {
    var text = input;

    // Replace multiline code blocks with conversational summaries
    text = text.replaceAll(
      RegExp(r'```[\w]*\n[\s\S]*?```'),
      ' Code snippet provided in the chat. ',
    );

    // Replace math formula blocks
    text = text.replaceAll(
      RegExp(r'\$\$[\s\S]*?\$\$'),
      ' Mathematical formula shown in the chat. ',
    );

    // Strip inline backticks: `print(board)` -> print(board)
    text = text.replaceAllMapped(
      RegExp(r'`([^`]+)`'),
      (m) => m.group(1) ?? '',
    );

    // Strip bold & italics
    text = text.replaceAllMapped(
      RegExp(r'\*\*([^*]+)\*\*'),
      (m) => m.group(1) ?? '',
    );
    text = text.replaceAllMapped(
      RegExp(r'\*([^*]+)\*'),
      (m) => m.group(1) ?? '',
    );
    text = text.replaceAllMapped(
      RegExp(r'_([^_]+)_'),
      (m) => m.group(1) ?? '',
    );

    // Strip markdown headings
    text = text.replaceAll(RegExp(r'#+\s*'), '');

    // Strip bullet dashes and asterisks
    text = text.replaceAll(RegExp(r'^\s*[-*•]\s*', multiLine: true), '');

    // Strip emojis so synthesizers don't say "robot face emoji" or stutter
    text = text.replaceAll(
      RegExp(
        r'[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]',
        unicode: true,
      ),
      '',
    );

    // Collapse whitespace
    text = text.replaceAll(RegExp(r'\s+'), ' ').trim();

    return text;
  }
}
