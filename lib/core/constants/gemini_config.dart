class GeminiConfig {
  /// Gemini API Key from environment or default from .env
  static const String apiKey = String.fromEnvironment(
    'GEMINI_API_KEY',
    defaultValue: '',
  );

  /// Gemini model for companion intelligence
  static const String model = 'gemini-3.8-flash';

  /// Returns true if an API key is available
  static bool get isConfigured => apiKey.isNotEmpty && !apiKey.startsWith('YOUR_');
}
