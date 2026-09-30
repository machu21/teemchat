#!/bin/bash
set -e

echo "=== Starting Flutter Web Build for Vercel ==="

# 1. Install Flutter SDK (pinned to 3.10.5 to match codebase and dependencies)
if [ ! -d "flutter" ]; then
  echo "Cloning Flutter SDK 3.10.5..."
  git clone https://github.com/flutter/flutter.git --depth 1 -b 3.10.5 flutter
fi

# 2. Add Flutter binary to PATH
export PATH="$PWD/flutter/bin:$PATH"
git config --global --add safe.directory "$PWD/flutter"

# 3. Print Flutter Version
flutter --version

# 4. Resolve dependencies
flutter pub get

# 5. Build Flutter Web bundle
echo "Building Flutter Web in Release mode..."
flutter build web --release -v

echo "=== Flutter Web build complete! Bundle ready in build/web ==="
