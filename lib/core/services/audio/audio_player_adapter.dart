import 'package:flutter/foundation.dart';
import 'audio_player_stub.dart' if (dart.library.html) 'audio_player_web.dart';

abstract class AudioPlayerAdapter {
  factory AudioPlayerAdapter() => createAudioPlayerAdapter();

  void play(String url);
  void pause();
  void resume();
  void stop();
  void setVolume(double volume);
  void onEnded(VoidCallback callback);
  bool get isPlaying;
}
