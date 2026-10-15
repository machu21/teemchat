#!/bin/bash
set -e

echo "=========================================="
echo "🚀 TeemChat Next.js Build Pipeline (Vercel)"
echo "=========================================="

# If running from root directory, enter next-app
if [ -d "next-app" ]; then
  echo "📦 Entering next-app directory..."
  cd next-app
fi

echo "📦 Installing Next.js dependencies..."
npm install --legacy-peer-deps

echo "🏗️  Building Next.js application..."
npm run build

echo "✅ Next.js build completed successfully."

# In case Vercel project settings still expect a legacy 'build/web' output directory:
if [ -d "../build" ] || [ ! -d "build" ]; then
  echo "📁 Populating legacy build/web fallback directory..."
  mkdir -p ../build/web
  if [ -d "public" ]; then
    cp -r public/* ../build/web/ 2>/dev/null || true
  fi
  if [ -d ".next/server/app" ]; then
    cp -r .next/server/app/* ../build/web/ 2>/dev/null || true
  fi
fi

echo "🎉 Vercel build script finished successfully!"
