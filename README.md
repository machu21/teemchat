# TeemChat

A cozy virtual workspace and 2D multiplayer world with proximity voice, spatial audio, AI companions, and real-time social networking.

Built with **Next.js (React 19)**, **Capacitor** (iOS & Android native shells), **Supabase** (PostgreSQL & Realtime), and **LiveKit** (Spatial Audio).

---

## 🚀 Quick Start

### Web Development
From the repository root:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Build
```bash
npm run build
```

---

## 📱 Mobile (iOS & Android via Capacitor)

Capacitor bridges the Next.js application into native iOS and Android projects for distribution on the **Apple App Store** and **Google Play Store**.

### Sync Mobile Assets
```bash
npm run cap:sync
```

### Open in Android Studio
```bash
npm run cap:android
```

### Open in Xcode (macOS)
```bash
npm run cap:ios
```

---

## 🗄️ Database & Realtime Backend
- Database schemas, RLS policies, and migrations live in [`supabase/`](./supabase).
- The previous Flutter client has been permanently archived in git branch `archive/flutter-original` (tag: `v0-flutter-archive`).
