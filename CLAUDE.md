# TeemChat — Claude Code Instructions

TeemChat is a 2D multiplayer virtual world: Next.js 16 (App Router) + React 19 + TypeScript in `next-app/`, a custom HTML5 Canvas 2D engine in `next-app/src/game/`, Supabase (Postgres, RLS, Realtime) in `supabase/`, LiveKit spatial voice, Zustand stores, and Capacitor for iOS/Android.

## Agent roster

The team personas and their boundaries are defined here — follow them:

@AGENTS.md

Full persona specs live in `.agents/agents/` (`senior_developer.md`, `frontend_engineer.md`, `backend_developer.md`, `database_manager.md`). When a message starts with a persona prefix (e.g. "Frontend Engineer: ..."), read that persona file and work within its rules.

## Domain knowledge (RAG)

@.agents/rag/README.md

Read the relevant doc in `.agents/rag/` **before** changing that area:

| Changing… | Read first |
| :--- | :--- |
| `next-app/src/lib/services/` (esp. `worldSync.ts`), Realtime channels | `realtime_sync_spec.md` |
| `next-app/src/game/` (canvas, RAF loop, entities) | `canvas_game_engine.md` |
| `supabase/schema.sql`, `supabase/migrations/`, RLS | `database_schema_and_rls.md` |
| Chat / message retention | `chat_system_and_retention.md` |
| Any sync or avatar-visibility bug | `known_issues_and_solutions.md` |
| Cross-layer architecture | `system_architecture.md` |

## Commands (run from `next-app/`)

```bash
npm run dev     # local dev server
npm run lint    # ESLint — must be 0 errors
npm test        # Vitest (vitest run) — must be all green
npm run build   # Next.js production build
npm run cap:sync
```

## Non-negotiables

- Every code change leaves `npm run lint` at 0 errors and `npm test` green; run `npm run build` for larger changes.
- Mark interactive / canvas / browser-API components `'use client'`; guard against hydration mismatches.
- Clean up everything in teardown: `cancelAnimationFrame`, window/DOM listeners, intervals/timeouts, `supabase.removeChannel(channel)`, LiveKit room disconnects.
- Movement broadcasts: only while moving (plus one on stop), throttled to ≥100ms. Never `channel.track()` every frame. Never add coordinate tables to `supabase_realtime`.
- Presence keys and inbound filtering use `clientInstanceId`, not `userId`.
- All SQL is idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), RLS enabled on every public table, no destructive SQL without explicit confirmation.
- Guests (`guest_*`) are real `auth.users` rows — RLS must keep working for them.
- UI follows the Neo-brutalist tokens in `next-app/src/styles/colors.ts`: 2px solid borders, `3px 3.5px 0` shadows (no blur), Plus Jakarta Sans, light + dark mode, responsive 320px–1440px+.
- Prefer minimal, surgical diffs; inspect existing code before changing it.
