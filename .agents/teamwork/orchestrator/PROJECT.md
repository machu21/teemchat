# Project: Next.js API Testing and Behavior Audit

## Architecture
- Target Application: `next-app` (Next.js 16 App Router, React 19, TypeScript).
- API Route Handlers: Located in `next-app/src/app/api/`.
- Middleware: `next-app/src/middleware.ts` enforces global rate-limiting across `/api/:path*`.
- Service Dependencies:
  - Supabase Auth & Database (`@supabase/supabase-js`)
  - Google Gemini AI (`@google/genai`)
  - LiveKit WebRTC Server SDK (`livekit-server-sdk`)
  - Internal Security & Rate Limiting (`@/lib/rateLimit`, `@/lib/security/*`, `@/lib/companionAuth`)
- Test Framework: Vitest 5.0.4 (`npm test` in `next-app`).
- Test Execution Architecture: Direct in-memory invocation of route handlers (`GET`/`POST`) via `NextRequest` from `next/server`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `GET /api/auth/guest-identity` | Deterministic guest identity & FNV-1a IP hashing with optional `instance` seed and error fallback | M1 | Survey Explorer 1, Spec Miner 3 |
| 2 | `POST /api/auth/register` | User registration with anti-bot honeypots, form timing check, disposable email blocking, username/password rules, Supabase Auth | M1 | Survey Explorer 1, Spec Miner 3 |
| 3 | `POST /api/companion/chat` | AI companion conversational chat with vector RAG memory retrieval, quota check, Gemini text generation, guest blocking | M1 | Survey Explorer 1, Spec Miner 3 |
| 4 | `POST /api/companion/screen-help` | Multimodal screenshot tech support guidance, base64 JPEG/PNG validation (max 2MB), quota check, Gemini vision, guest blocking | M1 | Survey Explorer 1, Spec Miner 3 |
| 5 | `POST /api/livekit/token` | LiveKit WebRTC token dispenser with `canJoinRoom` authorization across lobby, spaces, call DMs/groups | M1 | Survey Explorer 1, Spec Miner 3 |
| 6 | API Rate Limiting & Error Formatting | Global middleware & in-handler sliding-window rate limiters returning 429 and structured error formats | M1 | Survey Explorer 1, 2, Spec Miner 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | API Test Suite Implementation & Behavior Audit | Author unit/integration test suites covering all 5 endpoints (all valid cases, invalid inputs, edge cases, status codes 200, 400, 401, 403, 429, 500), execute tests to completion without crashes, and produce comprehensive API Behavior Audit Report | Survey Complete | DONE |

## Interface Contracts
### Route Handlers ↔ Vitest Test Suite
- Handlers imported directly: `import { GET, POST } from '@/app/api/.../route'`
- Requests dispatched via: `new NextRequest(url, { method, headers, body })`
- RateLimiter isolation: `defaultRateLimiter.reset()` invoked in `beforeEach()`
- Mocking: `@supabase/supabase-js`, `@google/genai`, `livekit-server-sdk` mocked cleanly in Vitest
- Responses asserted via: `res.status` and `await res.json()`

## Code Layout
- Test Suite Location: `next-app/tests/api/`
  - `next-app/tests/api/guest_identity.test.ts` (12 tests)
  - `next-app/tests/api/register.test.ts` (35 tests)
  - `next-app/tests/api/chat.test.ts` (16 tests)
  - `next-app/tests/api/screen_help.test.ts` (20 tests)
  - `next-app/tests/api/livekit_token.test.ts` (22 tests)
  - `next-app/tests/api/adversarial_probe.test.ts` (13 tests)
  - `next-app/tests/api/ratelimit_complexity.test.ts` (1 test)
- Audit Report Location: `next-app/API_BEHAVIOR_AUDIT.md` (and `.agents/teamwork/orchestrator/API_BEHAVIOR_AUDIT.md`)
