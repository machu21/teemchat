#!/bin/bash
set -e

echo "=== Starting Flutter Web Build for Vercel ==="

# 1. Install Flutter SDK if not present in container
if [ ! -d "flutter" ]; then
  echo "Cloning Flutter SDK (stable branch)..."
  git clone https://github.com/flutter/flutter.git --depth 1 -b stable flutter
fi

# 2. Add Flutter binary to PATH
export PATH="$PWD/flutter/bin:$PATH"

# 3. Print Flutter Version
flutter --version

# 4. Resolve dependencies
flutter pub get

# 5. Build Flutter Web bundle
echo "Building Flutter Web in Release mode..."
flutter build web --release

echo "=== Flutter Web build complete! Bundle ready in build/web ==="
