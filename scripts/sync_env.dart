// ignore_for_file: avoid_print
import 'dart:convert';
import 'dart:io';

void main() {
  final envFile = File('.env');
  final envJsonFile = File('.env.json');
  final exampleFile = File('.env.example');

  if (!envFile.existsSync()) {
    if (exampleFile.existsSync()) {
      print('[sync_env] No .env found. Creating starter .env from .env.example...');
      exampleFile.copySync('.env');
    } else {
      print('[sync_env] No .env found. Creating empty .env file...');
      envFile.writeAsStringSync(
        '# TeemChat Environment Configuration\n'
        'SUPABASE_URL=\n'
        'SUPABASE_ANON_KEY=\n'
        'LIVEKIT_URL=\n'
        'LIVEKIT_API_KEY=\n'
        'LIVEKIT_API_SECRET=\n'
        'GEMINI_API_KEY=\n',
      );
    }
  }

  final lines = envFile.readAsLinesSync();
  final Map<String, String> envMap = {};

  for (final rawLine in lines) {
    final line = rawLine.trim();
    if (line.isEmpty || line.startsWith('#')) continue;

    final equalsIndex = line.indexOf('=');
    if (equalsIndex == -1) continue;

    final key = line.substring(0, equalsIndex).trim();
    var value = line.substring(equalsIndex + 1).trim();

    // Strip surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      if (value.length >= 2) {
        value = value.substring(1, value.length - 1);
      }
    }

    if (key.isNotEmpty) {
      envMap[key] = value;
    }
  }

  const encoder = JsonEncoder.withIndent('  ');
  envJsonFile.writeAsStringSync('${encoder.convert(envMap)}\n');

  print('[sync_env] Synchronized ${envMap.length} variables from .env to .env.json (gitignored).');
}
