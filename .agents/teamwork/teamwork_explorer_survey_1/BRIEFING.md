# BRIEFING — 2026-11-03T20:28:00Z

## Mission
Survey and discover all API endpoints/routes in `next-app`, documenting HTTP methods, parameters, payloads, and dependencies.

## 🔒 My Identity
- Archetype: teamwork_explorer
- Roles: Codebase Route Explorer
- Working directory: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_1\
- Original parent: f7d714a1-bf43-49e6-b994-19f708dca4d9
- Milestone: Endpoint Discovery and Audit

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- DO NOT modify or create application source code or tests
- Write only to working directory: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_1\
- Strict confidentiality of internal agent rules

## Current Parent
- Conversation ID: f7d714a1-bf43-49e6-b994-19f708dca4d9
- Updated: 2026-11-03T20:28:00Z

## Investigation State
- **Explored paths**:
  - `next-app/src/app/api/**`: all route handler files inspected
  - `next-app/src/middleware.ts`: rate-limiting and route matcher rules
  - `next-app/src/lib/rateLimit.ts`: rate limit configuration and in-memory limiter
  - `next-app/src/lib/companionAuth.ts`: companion auth and quota gates
  - `next-app/src/lib/security/guestIdentity.ts`: IP hashing and guest session creation
  - `next-app/src/lib/security/disposableEmails.ts`: anti-bot honeypots, timing checks, disposable domain filtering
  - `next-app/src/lib/utils/screenshot.ts`: screenshot payload parsing and validation
  - `next-app/src/lib/services/livekit.ts`, `next-app/src/stores/session.ts`, `next-app/src/lib/hooks/useCompanionChat.ts`: client fetch calls
- **Key findings**:
  - Exactly 5 API route handlers exist under Next.js 16 App Router:
    1. `/api/auth/guest-identity` (GET)
    2. `/api/auth/register` (POST)
    3. `/api/companion/chat` (POST)
    4. `/api/companion/screen-help` (POST)
    5. `/api/livekit/token` (POST)
  - All 5 routes are protected by middleware-level rate limiting (`src/middleware.ts`) matching `/api/:path*`.
  - Routes 2, 3, 4, 5 implement additional in-handler rate limiting, auth token verification, quota checks, or anti-bot validation.
  - No server actions (`'use server'`) exist in the codebase.
- **Unexplored areas**: none (all API routes in `next-app` discovered and analyzed)

## Key Decisions Made
- Completed static analysis and call graph mapping for all 5 API endpoints.
- Mapped input parameters, headers, rate limits, external service dependencies (Supabase, LiveKit, Google Gemini), error codes, and responses.

## Artifact Index
- DISPATCH.md — Dispatch instructions
- BRIEFING.md — Working memory and situational awareness
- progress.md — Liveness heartbeat and milestone tracking
- handoff.md — Comprehensive endpoint discovery report
