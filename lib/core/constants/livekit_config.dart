import 'package:dart_jsonwebtoken/dart_jsonwebtoken.dart';

class LiveKitConfig {
  static const String liveKitUrl = String.fromEnvironment(
    'LIVEKIT_URL',
    defaultValue: 'wss://teemchat-chenfw1y.livekit.cloud',
  );

  static const String liveKitApiKey = String.fromEnvironment(
    'LIVEKIT_API_KEY',
    defaultValue: 'APICpKKK7Wc4UhH',
  );

  static const String liveKitApiSecret = String.fromEnvironment(
    'LIVEKIT_API_SECRET',
    defaultValue: 'ixQQYBZbCiAuofCMnkedKs3BhD8EVy1lkyZhrkWgZc7',
  );

  static bool get isConfigured =>
      liveKitUrl.isNotEmpty && liveKitApiKey.isNotEmpty && liveKitApiSecret.isNotEmpty;

  /// Generates a valid HMAC-SHA256 JWT access token for LiveKit Room connection.
  static String generateAccessToken({
    required String roomName,
    required String participantIdentity,
    required String participantName,
    Duration validFor = const Duration(hours: 24),
  }) {
    final jwt = JWT(
      {
        'video': {
          'room': roomName,
          'roomJoin': true,
          'canPublish': true,
          'canSubscribe': true,
          'canPublishData': true,
        },
        'name': participantName,
      },
      issuer: liveKitApiKey,
      subject: participantIdentity,
    );

    return jwt.sign(
      SecretKey(liveKitApiSecret),
      algorithm: JWTAlgorithm.HS256,
      expiresIn: validFor,
    );
  }
}
