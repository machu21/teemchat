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

# If running from root, sync build artifacts to root for Vercel runner detection
if [ -f "../package.json" ]; then
  cd ..
  echo "📁 Syncing build outputs to root for Vercel detection..."
  rm -rf .next public
  cp -r next-app/.next .next 2>/dev/null || true
  cp -r next-app/public public 2>/dev/null || true

  # Also populate build/web in case Vercel dashboard still has legacy Flutter outputDirectory
  mkdir -p build/web/_next
  if [ -d "next-app/public" ]; then
    cp -r next-app/public/* build/web/ 2>/dev/null || true
  fi
  if [ -d "next-app/.next/static" ]; then
    cp -r next-app/.next/static build/web/_next/ 2>/dev/null || true
  fi
  if [ -d "next-app/.next/server/app" ]; then
    cp -r next-app/.next/server/app/* build/web/ 2>/dev/null || true
  fi
fi

echo "🎉 Vercel build script finished successfully!"
