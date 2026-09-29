class SupabaseConfig {
  /// Supabase Project URL (can be overridden at build time via --dart-define=SUPABASE_URL=...)
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://pirpqkbdayorovfzczpq.supabase.co',
  );

  /// Supabase Publishable / Anon Key (can be overridden via --dart-define=SUPABASE_ANON_KEY=...)
  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'sb_publishable_KykCg3hBNO0j6o3EuNCyaQ_DowctW6v',
  );

  /// Check if a valid Supabase project has been configured
  static bool get isConfigured {
    return supabaseUrl.isNotEmpty &&
        !supabaseUrl.contains('xyzcompany.supabase.co') &&
        supabaseAnonKey.isNotEmpty &&
        !supabaseAnonKey.startsWith('eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  }
}
