#!/bin/bash
set -e

echo "=== Starting Flutter Web Build for Vercel ==="

# 1. Load .env file if present in the build environment
if [ -f ".env" ]; then
  echo "Found .env file, loading environment variables..."
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      \#*|"") continue ;;
    esac
    key=$(echo "$line" | cut -d '=' -f 1 | xargs)
    val=$(echo "$line" | cut -d '=' -f 2- | xargs)
    if [ -n "$key" ] && [ -z "${!key}" ]; then
      export "$key=$val"
    fi
  done < .env
fi

# 2. Generate .env.json for Flutter constant pool injection
echo "Generating .env.json for Flutter compilation..."
cat <<EOF > .env.json
{
  "SUPABASE_URL": "${SUPABASE_URL:-}",
  "SUPABASE_ANON_KEY": "${SUPABASE_ANON_KEY:-}",
  "LIVEKIT_URL": "${LIVEKIT_URL:-}",
  "LIVEKIT_API_KEY": "${LIVEKIT_API_KEY:-}",
  "LIVEKIT_API_SECRET": "${LIVEKIT_API_SECRET:-}",
  "GEMINI_API_KEY": "${GEMINI_API_KEY:-}"
}
EOF

# 3. Install Flutter SDK (pinned to 3.10.5 to match codebase and dependencies)
if [ ! -d "flutter" ]; then
  echo "Cloning Flutter SDK 3.10.5..."
  git clone https://github.com/flutter/flutter.git --depth 1 -b 3.10.5 flutter
fi

# 4. Add Flutter binary to PATH
export PATH="$PWD/flutter/bin:$PATH"
git config --global --add safe.directory "$PWD/flutter"

# 5. Print Flutter Version
flutter --version

# 6. Resolve dependencies
flutter pub get

# 7. Build Flutter Web bundle with environment variables
echo "Building Flutter Web in Release mode..."
DART_DEFINES=""
[ -n "$SUPABASE_URL" ] && DART_DEFINES="$DART_DEFINES --dart-define=SUPABASE_URL=$SUPABASE_URL"
[ -n "$SUPABASE_ANON_KEY" ] && DART_DEFINES="$DART_DEFINES --dart-define=SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY"
[ -n "$LIVEKIT_URL" ] && DART_DEFINES="$DART_DEFINES --dart-define=LIVEKIT_URL=$LIVEKIT_URL"
[ -n "$LIVEKIT_API_KEY" ] && DART_DEFINES="$DART_DEFINES --dart-define=LIVEKIT_API_KEY=$LIVEKIT_API_KEY"
[ -n "$LIVEKIT_API_SECRET" ] && DART_DEFINES="$DART_DEFINES --dart-define=LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET"
[ -n "$GEMINI_API_KEY" ] && DART_DEFINES="$DART_DEFINES --dart-define=GEMINI_API_KEY=$GEMINI_API_KEY"

flutter build web --release --dart-define-from-file=.env.json $DART_DEFINES -v

echo "=== Flutter Web build complete! Bundle ready in build/web ==="
