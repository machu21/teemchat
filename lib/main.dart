import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'core/constants/app_colors.dart';
import 'core/constants/supabase_config.dart';
import 'features/auth/auth_screen.dart';
import 'features/auth/auth_service.dart';
import 'features/dashboard/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (SupabaseConfig.isConfigured) {
    try {
      await Supabase.initialize(
        url: SupabaseConfig.supabaseUrl,
        anonKey: SupabaseConfig.supabaseAnonKey,
      );
      AuthService.isInitialized = true;
      AuthService.initSessionListener();
    } catch (e) {
      debugPrint("Supabase init error (falling back to guest mode): $e");
    }
  }

  runApp(const VirtualWorldApp());
}

class VirtualWorldApp extends StatelessWidget {
  static final ValueNotifier<bool> isDarkModeNotifier = ValueNotifier<bool>(false);

  const VirtualWorldApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: isDarkModeNotifier,
      builder: (context, isDark, _) {
        return MaterialApp(
          title: 'TeemChat - 2D Virtual World',
          debugShowCheckedModeBanner: false,
          themeMode: isDark ? ThemeMode.dark : ThemeMode.light,
          theme: ThemeData(
            brightness: Brightness.light,
            scaffoldBackgroundColor: AppColors.creamBg,
            colorScheme: const ColorScheme.light(
              primary: AppColors.teemPurple,
              secondary: AppColors.amberButton,
              surface: AppColors.creamCard,
              background: AppColors.creamBg,
            ),
            textTheme: GoogleFonts.plusJakartaSansTextTheme(ThemeData.light().textTheme),
            useMaterial3: true,
          ),
          darkTheme: ThemeData(
            brightness: Brightness.dark,
            scaffoldBackgroundColor: AppColors.darkBg,
            colorScheme: const ColorScheme.dark(
              primary: AppColors.neonLime,
              secondary: AppColors.darkHeroMagenta,
              surface: AppColors.darkCard,
              background: AppColors.darkBg,
            ),
            textTheme: GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme),
            useMaterial3: true,
          ),
          home: const AuthGate(),
        );
      },
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<UserSession?>(
      valueListenable: AuthService.sessionNotifier,
      builder: (context, session, _) {
        if (session != null) {
          return const DashboardScreen();
        }
        return const AuthScreen();
      },
    );
  }
}
