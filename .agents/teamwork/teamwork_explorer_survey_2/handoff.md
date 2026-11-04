# Handoff Report: Next.js API Route Testing Infrastructure & Execution Survey

**Agent**: teamwork_explorer_survey_2  
**Role**: Test Infra Explorer  
**Date**: 2026-11-03T20:29:00Z  
**Target Repository**: `next-app` (`c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\next-app`)  

---

## 1. Observation

### 1.1 Test Runner, Packages, and Configuration
- **Package Configuration** (`next-app/package.json` lines 5–10, 39–41):
  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "^16.4.3",
    "typescript": "^5",
    "vite": "^8.3.4",
    "vitest": "^5.0.4"
  }
  ```
- **Root Workspace** (`package.json` lines 8–17):
  `"test": "npm --prefix next-app run test"` delegates directly to `next-app`.
- **Vitest Configuration**:
  There is no custom `vitest.config.ts` or `vite.config.ts` present in `next-app`. Vitest operates under zero-config default discovery, automatically resolving test files matching `**/*.{test,spec}.?(c|m)[jt]s?(x)` across both `tests/` and `src/`.
- **Existing Test Suite Baseline**:
  Running `npm test` from root executes Vitest 5.0.4 over 17 test files (14 in `next-app/tests/`, 3 in `next-app/src/game/`):
  ```
  Test Files  17 passed (17)
  Tests       154 passed (154)
  Duration    12.43s
  ```
  Individual test execution (e.g. `cd next-app && npx vitest run tests/guest_identity.test.ts`) completes in ~1.42s with exit code 0.

### 1.2 Identified API Endpoints in Codebase
Directory inspection of `next-app/src/app/api/` revealed exactly 5 Next.js App Router route handlers:
1. **`GET /api/auth/guest-identity`** (`src/app/api/auth/guest-identity/route.ts`):
   - Signature: `export async function GET(req: NextRequest): Promise<NextResponse>`
   - Query parameters: `?instance=<string>` (optional seed)
   - Headers: `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` (fallback to `127.0.0.1`)
   - Returns: `{ success: true, ipTag: string, username: string, displayName: string }`
   - Error fallback: Catch block returns `{ success: true, ipTag: fallbackTag, username, displayName, warning: msg }` with status 200.
2. **`POST /api/auth/register`** (`src/app/api/auth/register/route.ts`):
   - Signature: `export async function POST(req: NextRequest): Promise<NextResponse>`
   - Inputs: JSON payload `{ email, password, username, displayName, gender, website_url, company_site_field, phone_alt, renderedAt }`
   - Status codes:
     - `429`: IP signup rate limit exceeded (sliding window max 5 attempts per 15 min via `RATE_LIMITS.AUTH_SIGNUP`)
     - `400`: Honeypot fields triggered (`website_url || company_site_field || phone_alt`)
     - `400`: Form timing invalid (`validateFormTiming(renderedAt)` fails if submitted < 1500ms or expired)
     - `400`: Email invalid or disposable domain detected (`isDisposableEmail(email)`)
     - `400`: Username format or length invalid (`validateUsername(username)`)
     - `400`: Password length < 6 characters
     - `500`: Missing Supabase environment variables (`!supabaseUrl || !supabaseAnonKey`)
     - `400`: Supabase Auth registration error (`authError || !data.user`)
     - `200`: Success (`{ success: true, user: data.user, session: data.session }`)
3. **`POST /api/companion/chat`** (`src/app/api/companion/chat/route.ts`):
   - Signature: `export async function POST(req: NextRequest): Promise<NextResponse>`
   - Auth & Quota: `authenticateCompanionRequest(req, 'user:ai', RATE_LIMITS.USER_AI_CHAT)` and `checkCompanionQuota(supabase)`
   - Status codes:
     - `401`: Missing `Authorization` header or invalid JWT token
     - `403`: User is guest account (`is_anonymous`, `is_guest`, or email ends with `@guest.teemchat.local`)
     - `429`: User exceeded AI chat velocity rate limit (15 req/min)
     - `400`: Missing `userMessage`
     - `200` with `quotaExceeded: true`: User reached daily energy/trial limit (50 messages or 5 trial)
     - `200` with `{ response: replyText }`: AI companion response generated
     - `500`: Unhandled internal error
4. **`POST /api/companion/screen-help`** (`src/app/api/companion/screen-help/route.ts`):
   - Signature: `export async function POST(req: NextRequest): Promise<NextResponse>`
   - Inputs: JSON body `{ companionName, userName, userMessage, recentHistory, screenshot, platform }`
   - Status codes:
     - `401`: Missing `Authorization` header or invalid token
     - `403`: Guest access forbidden
     - `429`: Rate limit exceeded (6 req/min via `RATE_LIMITS.USER_AI_SCREEN_HELP`)
     - `400`: Invalid body object, missing `userMessage`, or `userMessage.length > 2000`
     - `400`: Invalid screenshot format (must be JPEG/PNG data URL <= 2.5MB base64)
     - `200` with `quotaExceeded: true`: Quota exceeded
     - `200` with `{ response: replyText }`: Success
     - `500`: Unhandled error
5. **`POST /api/livekit/token`** (`src/app/api/livekit/token/route.ts`):
   - Signature: `export async function POST(req: NextRequest): Promise<NextResponse>`
   - Inputs: Header `Authorization: Bearer <token>`, JSON body `{ spaceId, roomName, displayName }`
   - Status codes:
     - `401`: Missing `Authorization` header or invalid token
     - `429`: User rate limit exceeded (25 req/min via `RATE_LIMITS.USER_LIVEKIT_TOKEN`)
     - `400`: Missing both `roomName` and `spaceId`
     - `403`: Room access denied by `canJoinRoom`
     - `500`: Missing `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET`
     - `200`: Success (`{ token: jwt }`)

### 1.3 Environment Variables and Module-Level Load-Time Evaluation
- In `next-app/.env.local`:
  ```ini
  NEXT_PUBLIC_SUPABASE_URL=https://pirpqkbdayorovfzczpq.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
  LIVEKIT_API_KEY=APICpKKK7Wc4UhH
  LIVEKIT_API_SECRET=ixQQYBZb...
  GEMINI_API_KEY=AQ.Ab8RN6...
  GEMINI_MODEL=gemini-3.8-flash
  ```
- **Crucial Module-Level Evaluation**:
  - `src/app/api/auth/register/route.ts` lines 16–17:
    `const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';`
  - `src/app/api/livekit/token/route.ts` lines 9–10:
    `const livekitApiKey = process.env.LIVEKIT_API_KEY || '';`
  - `src/app/api/companion/chat/route.ts` line 9:
    `const ai = new GoogleGenAI({ apiKey: geminiApiKey });`
  These constants are evaluated at module import time in Node.js / ES modules. If environment variables or mocks are not established before module import, handlers evaluate with empty strings.

### 1.4 Rate Limiter Singleton Behavior
- `src/lib/rateLimit.ts` lines 116–118:
  `export const defaultRateLimiter = new RateLimiter();`
  `checkRateLimit()` delegates to `defaultRateLimiter.check()`.
- `defaultRateLimiter.reset()` clears all tracked client and IP timestamps.

---

## 2. Logic Chain

1. **Test Runner Selection**:
   - `vitest` is already installed (`vitest: ^5.0.4`), integrated into `npm test`, and configured to discover TypeScript tests.
   - Adding another test runner (like Jest or Mocha) would introduce duplicate tooling, compilation discrepancies with Next.js 16 / React 19, and unnecessary dependency overhead.
   - Therefore, Vitest is the primary and optimal test framework for route testing.

2. **Route Testing Architecture (Direct Import vs HTTP Server)**:
   - Next.js App Router route handlers (`route.ts`) are pure ES functions exporting `GET(req: NextRequest)` or `POST(req: NextRequest)`.
   - Node.js 22 and `next/server` support instantiating `new NextRequest('http://localhost/api/...')` natively in memory.
   - Running an HTTP server via `next dev` or `next start` with `supertest` or `fetch` requires starting a sub-process, waiting 5–15 seconds for compilation, binding to network ports (subject to Windows firewall / port collision), and prevents in-process mocking of `@google/genai` and `@supabase/supabase-js`.
   - Direct handler invocation runs each test in ~1–5 milliseconds, executes 100% deterministically without open network sockets, and allows Vitest's `vi.mock()` to intercept SDK calls directly.
   - Therefore, direct invocation of `GET` / `POST` using `NextRequest` is the strongly recommended architecture.

3. **Mocking Strategy**:
   - **`@supabase/supabase-js`**:
     Mock `createClient` using `vi.mock('@supabase/supabase-js')`. Provide controlled returns for `auth.signUp`, `auth.getUser`, `from(...).select / insert / upsert / maybeSingle`, and `rpc(...)`. This guarantees offline execution without touching production databases or consuming quotas.
   - **`@google/genai`**:
     Mock `GoogleGenAI` using `vi.mock('@google/genai')` to return mock `embedContent` and `generateContent`. This eliminates network latency, quota consumption, and API key dependencies.
   - **`livekit-server-sdk`**:
     While `AccessToken` can generate JWTs offline when keys are set, mocking `livekit-server-sdk` or providing dummy keys (`LIVEKIT_API_KEY='test-key'`, `LIVEKIT_API_SECRET='test-secret-at-least-32-chars-long'`) prevents crypto performance bottlenecks and lets tests assert grant properties directly.
   - **Rate Limiting Isolation**:
     Because rate limits track request history in a singleton `Map`, running multiple tests with identical IPs/user IDs will trigger `429 Too Many Requests`. Calling `defaultRateLimiter.reset()` in `beforeEach()` guarantees complete test isolation.

---

## 3. Caveats

1. **Module-Level Environment Variable Caching**:
   Because `const supabaseUrl = process.env...` and `const livekitApiKey = process.env...` evaluate at file import time, tests testing the "missing configuration" 500 error branch must either:
   - Use dynamic imports (`await import(...)`) with `vi.stubEnv` / `vi.resetModules()`, OR
   - Test the missing configuration scenario in a separate isolated test file.
2. **NextRequest Body Parsing**:
   When passing bodies to `new NextRequest(url, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } })`, `req.json()` consumes the stream. Avoid reading `req.json()` multiple times in custom wrappers.
3. **No Database Integration Tests**:
   The recommended direct unit/integration tests mock the database layer. They verify that the route handler validates inputs, handles authentication errors, checks rate limits, calls the appropriate database queries/RPCs, and formats responses correctly, but they do not test whether PostgreSQL triggers or RLS policies in Supabase behave properly (which belongs in database migration tests).

---

## 4. Conclusion

- **Testing Framework**: Vitest 5.0.4 (existing in `next-app/package.json`).
- **Test Execution Pattern**: Direct in-memory invocation of route handlers (`GET`, `POST`) using `NextRequest` from `next/server`.
- **Target Coverage**: All 5 API endpoints (`/api/auth/guest-identity`, `/api/auth/register`, `/api/companion/chat`, `/api/companion/screen-help`, `/api/livekit/token`) covering 100% of success codes (200) and error codes (400, 401, 403, 429, 500).
- **Mock Dependencies**:
  - `@supabase/supabase-js` (`createClient`)
  - `@google/genai` (`GoogleGenAI`)
  - `livekit-server-sdk` (`AccessToken`)
  - Rate Limiter store (`defaultRateLimiter.reset()`)
- **Recommended File Organization**:
  Create route tests in `next-app/tests/api/` or `next-app/tests/api_*.test.ts`:
  - `next-app/tests/api/guest_identity.test.ts`
  - `next-app/tests/api/register.test.ts`
  - `next-app/tests/api/chat.test.ts`
  - `next-app/tests/api/screen_help.test.ts`
  - `next-app/tests/api/livekit_token.test.ts`

---

## 5. Verification Method

### 5.1 Verification Commands
To execute and verify all existing and newly authored route tests:
```bash
# 1. Run all workspace tests:
npm test

# 2. Run tests directly inside next-app:
cd next-app && npm test

# 3. Run only API route tests once authored:
cd next-app && npx vitest run tests/api/

# 4. Run tests with coverage:
cd next-app && npx vitest run --coverage
```

### 5.2 Reference Test Implementation Template
The following pattern has been verified to execute cleanly in `next-app` under Vitest:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { defaultRateLimiter } from '@/lib/rateLimit';

// 1. Hoist external dependency mocks
const mockSupabase = {
  auth: {
    signUp: vi.fn(),
    getUser: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
  rpc: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      embedContent: vi.fn().mockResolvedValue({ embedding: { values: [0.1, 0.2] } }),
      generateContent: vi.fn().mockResolvedValue({ text: 'Simulated AI response' }),
    },
  })),
}));

// 2. Set environment variables before route import
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
process.env.LIVEKIT_API_KEY = 'mock-livekit-key';
process.env.LIVEKIT_API_SECRET = 'mock-livekit-secret-32-chars-length';

// 3. Import route handlers
import { GET as guestIdentityGET } from '@/app/api/auth/guest-identity/route';
import { POST as registerPOST } from '@/app/api/auth/register/route';

describe('API Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset(); // Reset in-memory rate limiter
  });

  it('GET /api/auth/guest-identity returns status 200 with formatted handle', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/guest-identity', {
      headers: { 'x-forwarded-for': '198.51.100.42' },
    });
    const res = await guestIdentityGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.username).toMatch(/^guest_[0-9a-f]{4}$/);
  });
});
```

### 5.3 Invalidation Conditions
- Changes to Next.js version that alter `NextRequest` / `NextResponse` exports in `next/server`.
- Addition of Next.js Route Segments / Dynamic Routing parameters (e.g. `[id]`) requiring `{ params }` context argument in handler signatures.
- Migration from in-memory `RateLimiter` to external Redis / Upstash rate limiting.
