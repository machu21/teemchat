import 'package:flutter/foundation.dart';
import 'audio_player_adapter.dart';

AudioPlayerAdapter createAudioPlayerAdapter() => AudioPlayerStub();

class AudioPlayerStub implements AudioPlayerAdapter {
  bool _isPlaying = false;
  VoidCallback? _onEnded;

  @override
  void play(String url) {
    _isPlaying = true;
    debugPrint("[AudioStub] Playing: $url");
  }

  @override
  void pause() {
    _isPlaying = false;
  }

  @override
  void resume() {
    _isPlaying = true;
  }

  @override
  void stop() {
    _isPlaying = false;
  }

  @override
  void setVolume(double volume) {}

  @override
  void onEnded(VoidCallback callback) {
    _onEnded = callback;
  }

  void triggerEnded() {
    _onEnded?.call();
  }

  @override
  bool get isPlaying => _isPlaying;
}
