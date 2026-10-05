import 'package:dart_jsonwebtoken/dart_jsonwebtoken.dart';

class LiveKitConfig {
  static const String liveKitUrl = String.fromEnvironment(
    'LIVEKIT_URL',
    defaultValue: '',
  );

  static const String liveKitApiKey = String.fromEnvironment(
    'LIVEKIT_API_KEY',
    defaultValue: '',
  );

  static const String liveKitApiSecret = String.fromEnvironment(
    'LIVEKIT_API_SECRET',
    defaultValue: '',
  );

  static bool get isConfigured =>
      liveKitUrl.isNotEmpty && liveKitApiKey.isNotEmpty && liveKitApiSecret.isNotEmpty;

  /// Generates a valid HMAC-SHA256 JWT access token for LiveKit Room connection.
  static String generateAccessToken({
    required String roomName,
    required String participantIdentity,
    required String participantName,
    String? apiKey,
    String? apiSecret,
    Duration validFor = const Duration(hours: 24),
  }) {
    final effectiveApiKey = (apiKey != null && apiKey.isNotEmpty) ? apiKey : liveKitApiKey;
    final effectiveApiSecret = (apiSecret != null && apiSecret.isNotEmpty) ? apiSecret : liveKitApiSecret;
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
      issuer: effectiveApiKey,
      subject: participantIdentity,
    );

    return jwt.sign(
      SecretKey(effectiveApiSecret),
      algorithm: JWTAlgorithm.HS256,
      expiresIn: validFor,
    );
  }
}
