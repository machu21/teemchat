# E2E Test Infra: Next.js API Test Suite

## Test Philosophy
- Direct in-memory invocation of Next.js 16 route handlers using `NextRequest` from `next/server`.
- Deterministic isolation: `defaultRateLimiter.reset()` in `beforeEach()`, mock `@supabase/supabase-js`, `@google/genai`, and `livekit-server-sdk`.
- Complete coverage across valid inputs, validation failures, security gates, anti-bot traps, rate limits, edge cases, and unexpected server errors.

## Feature Inventory
| # | Feature | Route | Source (requirement) | Tier 1 (Happy Path) | Tier 2 (Boundary & Errors) | Tier 3 (Cross-Feature) | Tier 4 (Workload Scenarios) |
|---|---------|-------|----------------------|:-------------------:|:--------------------------:|:----------------------:|:---------------------------:|
| 1 | Guest Identity | `GET /api/auth/guest-identity` | ORIGINAL_REQUEST §R1 | >=5 | >=5 | Yes | Yes |
| 2 | Registration | `POST /api/auth/register` | ORIGINAL_REQUEST §R1 | >=5 | >=5 | Yes | Yes |
| 3 | Companion Chat | `POST /api/companion/chat` | ORIGINAL_REQUEST §R1 | >=5 | >=5 | Yes | Yes |
| 4 | Screen Help | `POST /api/companion/screen-help` | ORIGINAL_REQUEST §R1 | >=5 | >=5 | Yes | Yes |
| 5 | LiveKit Token | `POST /api/livekit/token` | ORIGINAL_REQUEST §R1 | >=5 | >=5 | Yes | Yes |

## Test Architecture
- Test runner: Vitest 5.0.4 (`npm test` or `npx vitest run tests/api/`)
- Test location: `next-app/tests/api/`
  - `tests/api/guest_identity.test.ts`
  - `tests/api/register.test.ts`
  - `tests/api/chat.test.ts`
  - `tests/api/screen_help.test.ts`
  - `tests/api/livekit_token.test.ts`
- Pass/Fail semantics: All tests must run to completion, assert exact status codes, payload structures, and error messages, and exit 0 without unhandled runtime crashes.

## Coverage Goals
- 100% of discovered API route endpoints tested
- Both valid input scenarios and error/edge cases tested for each route
- Status codes verified: 200, 400, 401, 403, 429, 500
- Exit code 0 on test execution
- Comprehensive behavior audit report documenting all status codes, payloads, error formats, and verified behaviors
