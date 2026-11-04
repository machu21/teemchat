# BRIEFING — 2026-11-03T20:28:00Z

## Mission
Investigate test infrastructure and execution options for testing Next.js API route handlers in `next-app`.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: Test Infra Explorer
- Working directory: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_2
- Original parent: f7d714a1-bf43-49e6-b994-19f708dca4d9
- Milestone: Survey Phase

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify application code/tests
- Write only to working directory: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_2\
- Do not copy code from existing open-source projects for core logic

## Current Parent
- Conversation ID: f7d714a1-bf43-49e6-b994-19f708dca4d9
- Updated: 2026-11-03T20:28:00Z

## Investigation State
- **Explored paths**:
  - `next-app/package.json`
  - `next-app/tsconfig.json`
  - `next-app/.env.local`
  - `next-app/tests/` (14 test files inspected)
  - `next-app/src/app/api/auth/guest-identity/route.ts`
  - `next-app/src/app/api/auth/register/route.ts`
  - `next-app/src/app/api/companion/chat/route.ts`
  - `next-app/src/app/api/companion/screen-help/route.ts`
  - `next-app/src/app/api/livekit/token/route.ts`
  - `next-app/src/lib/rateLimit.ts`
  - `next-app/src/lib/companionAuth.ts`
  - `next-app/src/lib/models/space.ts`
- **Key findings**:
  - Test runner: Vitest 5.0.4 with Vite 8.3.4, zero-config default discovery for `**/*.test.ts`. 17 test files and 154 tests currently pass.
  - All 5 Next.js API route handlers export standard async `GET` / `POST` functions taking `NextRequest` and returning `NextResponse`.
  - Direct handler function invocation via `NextRequest` is dramatically faster (<2s), avoids HTTP server startup/port binding, and enables in-memory Vitest mocking.
  - Critical module-level environment variable evaluation discovered: `register` and `livekit/token` evaluate `process.env` at module load time, requiring env vars to be set before import.
  - Rate limiting uses an in-memory sliding window singleton `defaultRateLimiter`; test suites must call `defaultRateLimiter.reset()` in `beforeEach` to prevent test flakiness.
  - Dependencies needing mocks: `@supabase/supabase-js`, `@google/genai`, `livekit-server-sdk`.
- **Unexplored areas**: None. Complete coverage of test runner, route endpoints, env vars, mocking strategy, and verification commands.

## Key Decisions Made
- Recommend direct route handler invocation pattern with `NextRequest` and Vitest `vi.mock` / `vi.hoisted`.
- Recommend organizing tests in `next-app/tests/api/` or `next-app/tests/api_*.test.ts`.

## Artifact Index
- DISPATCH.md — System dispatch instructions
- BRIEFING.md — Situational awareness and investigation state
- progress.md — Liveness & step tracking
- handoff.md — Comprehensive handoff report
