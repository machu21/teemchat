// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'package:flutter/foundation.dart';
import 'audio_player_adapter.dart';

AudioPlayerAdapter createAudioPlayerAdapter() => AudioPlayerWeb();

class AudioPlayerWeb implements AudioPlayerAdapter {
  html.AudioElement? _audio;
  VoidCallback? _onEndedCallback;
  bool _isPlaying = false;

  @override
  void play(String url) {
    stop();
    try {
      _audio = html.AudioElement(url)
        ..autoplay = true;

      _audio!.onEnded.listen((_) {
        _isPlaying = false;
        _onEndedCallback?.call();
      });

      _audio!.onError.listen((e) {
        debugPrint("[AudioWeb] Playback error: $e");
        _isPlaying = false;
      });

      _audio!.play().then((_) {
        _isPlaying = true;
      }).catchError((err) {
        debugPrint("[AudioWeb] Autoplay or play error: $err");
        _isPlaying = false;
      });
    } catch (e) {
      debugPrint("[AudioWeb] Exception initializing audio: $e");
      _isPlaying = false;
    }
  }

  @override
  void pause() {
    try {
      _audio?.pause();
      _isPlaying = false;
    } catch (e) {
      debugPrint("[AudioWeb] pause error: $e");
    }
  }

  @override
  void resume() {
    try {
      _audio?.play();
      _isPlaying = true;
    } catch (e) {
      debugPrint("[AudioWeb] resume error: $e");
    }
  }

  @override
  void stop() {
    try {
      _audio?.pause();
      _audio?.src = '';
      _audio = null;
      _isPlaying = false;
    } catch (e) {
      debugPrint("[AudioWeb] stop error: $e");
    }
  }

  @override
  void setVolume(double volume) {
    try {
      _audio?.volume = volume.clamp(0.0, 1.0);
    } catch (e) {
      debugPrint("[AudioWeb] setVolume error: $e");
    }
  }

  @override
  void onEnded(VoidCallback callback) {
    _onEndedCallback = callback;
  }

  @override
  bool get isPlaying => _isPlaying;
}
