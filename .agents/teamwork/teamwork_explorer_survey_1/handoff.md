# Handoff Report — API Endpoint Survey

**Agent**: `teamwork_explorer_survey_1`  
**Identity**: `teamwork_explorer`  
**Role**: Codebase Route Explorer  
**Date**: 2026-11-03T20:29:00Z  

---

## 1. Observation

### Discovered Route Handler Files
Search across `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\next-app` identified exactly five (5) API route handler files in Next.js 16 App Router:

1. **`src/app/api/auth/guest-identity/route.ts`**
   - Route path: `/api/auth/guest-identity`
   - HTTP Method: `GET` (exported at line 5: `export async function GET(req: NextRequest)`)
2. **`src/app/api/auth/register/route.ts`**
   - Route path: `/api/auth/register`
   - HTTP Method: `POST` (exported at line 19: `export async function POST(req: NextRequest)`)
3. **`src/app/api/companion/chat/route.ts`**
   - Route path: `/api/companion/chat`
   - HTTP Method: `POST` (exported at line 11: `export async function POST(req: NextRequest)`)
4. **`src/app/api/companion/screen-help/route.ts`**
   - Route path: `/api/companion/screen-help`
   - HTTP Method: `POST` (exported at line 20: `export async function POST(req: NextRequest)`)
5. **`src/app/api/livekit/token/route.ts`**
   - Route path: `/api/livekit/token`
   - HTTP Method: `POST` (exported at line 62: `export async function POST(req: NextRequest)`)

### Middleware Interceptor (`src/middleware.ts`)
- Matches: `export const config = { matcher: ['/api/:path*'] };` (line 66)
- Implements global IP extraction (`getClientIp` at lines 15, 126–144 of `src/lib/rateLimit.ts`) using headers `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` (fallback `127.0.0.1`).
- Applies endpoint-specific rate limiting windows via `RATE_LIMITS` (`src/lib/rateLimit.ts:14-32`):
  - `/api/auth/register`: `RATE_LIMITS.AUTH_SIGNUP` (max 5 requests per 15 min / 900,000 ms)
  - `/api/companion/chat`: `RATE_LIMITS.AI_CHAT` (max 10 requests per 60,000 ms)
  - `/api/companion/screen-help`: `RATE_LIMITS.AI_SCREEN_HELP` (max 8 requests per 60,000 ms)
  - `/api/livekit/token`: `RATE_LIMITS.LIVEKIT_TOKEN` (max 20 requests per 60,000 ms)
  - All other `/api/*` (including `/api/auth/guest-identity`): `RATE_LIMITS.DEFAULT_API` (max 60 requests per 60,000 ms)
- Returns HTTP 429 `{ error: 'Too Many Requests', message: '...', retryAfter: number }` with headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

---

## 2. Logic Chain & Endpoint Specification Details

### Endpoint 1: `GET /api/auth/guest-identity`
- **File**: `next-app/src/app/api/auth/guest-identity/route.ts`
- **HTTP Method**: `GET`
- **Authentication**: None required (public guest endpoint).
- **Rate Limit**: Middleware `RATE_LIMITS.DEFAULT_API` (60 requests / 60 seconds per IP).
- **Query Parameters**:
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `instance` | `string` | Optional | Client instance/tab seed (e.g. `sessionStorage.getItem('teem_instance_seed')`). Disambiguates multiple browser tabs sharing the same IP address. |
- **Request Headers**: Standard GET headers. IP parsed from `x-forwarded-for`, `x-real-ip`, or `cf-connecting-ip`.
- **Request Body**: None (GET).
- **Core Behavior**:
  1. Hashes the client IP + optional `instance` seed using FNV-1a 32-bit algorithm (`src/lib/security/guestIdentity.ts:12-27`).
  2. Formats a 4-character uppercase hex IP tag (e.g., `"7B4D"`).
  3. Formats username (`"guest_" + ipTag.toLowerCase()`, e.g., `"guest_7b4d"`) and displayName (`"Explorer #" + ipTag`, e.g., `"Explorer #7B4D"`).
  4. Exception safety: If an unexpected error occurs, catches error and returns a random fallback tag with 200 OK and a `warning` property.
- **Service Dependencies**:
  - `@/lib/rateLimit` (`getClientIp`)
  - `@/lib/security/guestIdentity` (`generateIpTag`, `formatGuestHandles`)
  - No database or external service calls.
- **Expected Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "ipTag": "7B4D",
      "username": "guest_7b4d",
      "displayName": "Explorer #7B4D"
    }
    ```
  - `200 OK` (Fallback on exception):
    ```json
    {
      "success": true,
      "ipTag": "A1B2",
      "username": "guest_a1b2",
      "displayName": "Explorer #A1B2",
      "warning": "Failed to determine guest identity"
    }
    ```
  - `429 Too Many Requests`: Triggered when client IP exceeds 60 req/min limit.

---

### Endpoint 2: `POST /api/auth/register`
- **File**: `next-app/src/app/api/auth/register/route.ts`
- **HTTP Method**: `POST`
- **Authentication**: Public registration endpoint (no auth header required).
- **Rate Limit**:
  - Middleware: `ip:signup:${ip}` (max 5 requests per 15 minutes).
  - In-handler redundant check: `checkRateLimit('ip:signup:' + ip, RATE_LIMITS.AUTH_SIGNUP)`.
- **Request Headers**: `Content-Type: application/json`
- **Payload Schema (JSON Body)**:
  | Field | Type | Required | Validation / Description |
  | :--- | :--- | :--- | :--- |
  | `email` | `string` | Yes | Valid email format. Normalizes sub-addressing (`user+tag@domain` -> `user@domain`). Rejects disposable domains in `DISPOSABLE_EMAIL_DOMAINS` (`src/lib/security/disposableEmails.ts:7-83`). |
  | `password` | `string` | Yes | Minimum length: 6 characters. |
  | `username` | `string` | Yes | 3 to 24 characters. Regex: `^[a-zA-Z0-9_-]+$`. |
  | `displayName` | `string` | Optional | Max 32 characters. Defaults to `username`. |
  | `gender` | `string` | Optional | `'male'` or `'female'`. Defaults to `'male'`. |
  | `renderedAt` | `number` | Yes | Anti-bot timestamp (ms epoch). Requires `now - renderedAt >= 1200ms` and `now - renderedAt >= -5000ms`. |
  | `website_url` | `string` | Optional (Honeypot) | Must remain empty/undefined. Truthy value triggers anti-bot 400 rejection. |
  | `company_site_field`| `string` | Optional (Honeypot) | Must remain empty/undefined. Truthy value triggers anti-bot 400 rejection. |
  | `phone_alt` | `string` | Optional (Honeypot) | Must remain empty/undefined. Truthy value triggers anti-bot 400 rejection. |
- **Core Behavior**:
  1. Verifies anti-bot honeypots (`website_url`, `company_site_field`, `phone_alt`); rejects bots with 400 if filled.
  2. Verifies submission velocity via `renderedAt`; rejects sub-second submissions (< 1200ms) with 400.
  3. Validates email against `DISPOSABLE_EMAIL_DOMAINS` blocklist (60+ temporary mail providers).
  4. Validates username pattern (`^[a-zA-Z0-9_-]+$`, 3-24 characters) and password length (>= 6 chars).
  5. Calls Supabase Auth `supabase.auth.signUp(...)` with email, password, and metadata (`username`, `display_name`, `gender`).
  6. On successful sign-up, provisions free user profile in Supabase table `profiles` (`status: 'available'`, `tier: 'free'`, `is_paid: false`, `has_ai_companion: false`).
- **Service Dependencies**:
  - Supabase Auth (`supabase.auth.signUp`)
  - Supabase Database (`supabase.from('profiles').upsert`)
  - Environment variables: `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY`.
- **Expected Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "user": { "id": "...", "email": "...", ... },
      "session": { "access_token": "...", ... }
    }
    ```
  - `400 Bad Request`:
    - Anti-bot honeypot triggered: `{ "error": "Security validation failed. Please reload and try again." }`
    - Timing violation: `{ "error": "Form submission was too fast. Please take your time." }` or `{ "error": "Form security timestamp is missing." }`
    - Missing email: `{ "error": "A valid email address is required." }`
    - Disposable email: `{ "error": "Disposable and temporary email addresses are not permitted. Please use a permanent email address." }`
    - Username error: `{ "error": "Username must be at least 3 characters long." }` or `{ "error": "Username may only contain letters, numbers, hyphens, and underscores." }`
    - Password error: `{ "error": "Password must be at least 6 characters long." }`
    - Supabase sign-up error: `{ "error": "User already registered" }` (or other Supabase auth message)
  - `429 Too Many Requests`: Exceeded 5 registration attempts per 15 minutes.
  - `500 Internal Server Error`: `{ "error": "Server authentication configuration missing." }` or unhandled error message.

---

### Endpoint 3: `POST /api/companion/chat`
- **File**: `next-app/src/app/api/companion/chat/route.ts`
- **HTTP Method**: `POST`
- **Authentication**: Required (`Authorization: Bearer <supabase_jwt>`).
- **Rate Limit**:
  - Middleware: `ip:ai_chat:${ip}` (max 10 requests per 60 seconds per IP).
  - In-handler: `user:ai:${user.id}` (max 15 requests per 60 seconds per authenticated user via `RATE_LIMITS.USER_AI_CHAT`).
- **Authorization Restrictions**:
  - Guest users are **forbidden** (`403 Forbidden`): checked via `user.is_anonymous`, `user.app_metadata?.is_guest`, `user.user_metadata?.is_guest`, or email ending with `@guest.teemchat.local`.
- **Request Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Payload Schema (JSON Body)**:
  | Field | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `userMessage` | `string` | Yes | Chat prompt sent to the companion. Must not be empty. |
  | `companion` | `object` | Optional | Companion profile object: `{ id, name, persona, companionType, avatarStyle, learnedContext }`. |
  | `userName` | `string` | Optional | User display name for persona addressing. |
  | `currentZone` | `string` | Optional | Map location name (e.g. `'Verdant Village'`). |
  | `recentHistory` | `Array<{role: string, content: string}>` | Optional | Recent message turns (sliced to last 8). |
- **Core Behavior**:
  1. Validates Supabase JWT and blocks guests (`403 Forbidden`).
  2. Evaluates user daily AI message quota via Supabase RPC `check_and_increment_ai_usage` (limit 50 msgs/day, or 5 msgs for trial accounts). If quota exceeded, returns 200 with `{ response: "...", quotaExceeded: true }`.
  3. Performs RAG semantic search: embeds `userMessage` using Gemini `text-embedding-004` and queries Supabase RPC `match_companion_memories` (`p_match_count: 6`, `p_min_similarity: 0.55`).
  4. Synthesizes system instructions with companion persona, owner name, zone, and retrieved memories.
  5. Generates reply text via Google Gemini SDK (`gemini-2.5-flash` or `process.env.GEMINI_MODEL`, `gemini-3.8-flash` configured in `.env.local`).
  6. Asynchronously extracts user facts from the exchange in background and persists to Supabase `companion_memories` table with vector embeddings.
- **Service Dependencies**:
  - Supabase Auth (`supabase.auth.getUser`)
  - Supabase RPCs: `check_and_increment_ai_usage`, `match_companion_memories`
  - Supabase Database: `companion_memories` insert
  - Google Gemini SDK (`@google/genai`): models `text-embedding-004` and `gemini-2.5-flash` / `gemini-3.8-flash`
  - Environment variables: `GEMINI_API_KEY`, `GEMINI_MODEL`.
- **Expected Responses**:
  - `200 OK`:
    ```json
    { "response": "I'm right beside you! Let's explore Verdant Village together!" }
    ```
  - `200 OK` (Quota Exceeded):
    ```json
    {
      "response": "⚡ I've reached my daily energy limit (50/50 messages). Energy recharges at midnight UTC! Let's chat again tomorrow.",
      "quotaExceeded": true
    }
    ```
  - `400 Bad Request`: `{ "error": "Missing userMessage" }`
  - `401 Unauthorized`: `{ "error": "Unauthorized" }` or `{ "error": "Invalid user token" }`
  - `403 Forbidden`: `{ "error": "Forbidden", "message": "Sign in with an account to chat with your companion." }`
  - `429 Too Many Requests`: Exceeded per-IP (10/min) or per-user (15/min) limit.
  - `500 Internal Server Error`: `{ "error": "<message>" }`

---

### Endpoint 4: `POST /api/companion/screen-help`
- **File**: `next-app/src/app/api/companion/screen-help/route.ts`
- **HTTP Method**: `POST`
- **Authentication**: Required (`Authorization: Bearer <supabase_jwt>`).
- **Rate Limit**:
  - Middleware: `ip:ai_screen_help:${ip}` (max 8 requests per 60 seconds per IP).
  - In-handler: `user:ai_screen_help:${user.id}` (max 6 requests per 60 seconds per user via `RATE_LIMITS.USER_AI_SCREEN_HELP`).
- **Authorization Restrictions**:
  - Guest users are **forbidden** (`403 Forbidden`).
- **Request Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Payload Schema (JSON Body)**:
  | Field | Type | Required | Validation / Description |
  | :--- | :--- | :--- | :--- |
  | `userMessage` | `string` | Yes | Non-empty text, max length 2,000 characters. |
  | `screenshot` | `string` | Yes | Base64 image data URL (`data:image/jpeg;base64,...` or `data:image/png;base64,...`). Max length: 2,000,000 chars (~1.5 MB binary). |
  | `companionName` | `string` | Optional | Companion name (max 60 chars, defaults to `'Pixel Companion'`). |
  | `userName` | `string` | Optional | User name (max 60 chars, defaults to `'your owner'`). |
  | `platform` | `string` | Optional | Operating system: `'Windows'`, `'macOS'`, `'Linux'`, `'ChromeOS'`, or `'Unknown'`. |
  | `recentHistory` | `Array<{role: string, content: string}>` | Optional | Previous turns (sliced to last 6 messages). |
- **Core Behavior**:
  1. Authenticates caller token and enforces guest restriction.
  2. Enforces payload boundaries: `userMessage` <= 2000 chars; `screenshot` validated as base64 JPEG or PNG <= 2MB base64 length (`src/lib/utils/screenshot.ts:36-57`).
  3. Checks shared daily companion message quota (`check_and_increment_ai_usage`).
  4. Formulates a specialized tech-support guidance prompt with prompt injection defenses (instructions on screen must not be followed; passwords/PINs must never be read out).
  5. Sends multimodal request (`contents: [recentHistory..., userMessage + inlineData: { mimeType, data: base64 }]`) to Gemini (`gemini-2.5-flash` / `gemini-3.8-flash`).
  6. Privacy guarantee: Screenshot is strictly in-flight memory; never stored in Supabase or persistent files.
- **Service Dependencies**:
  - Supabase Auth (`supabase.auth.getUser`)
  - Supabase RPC: `check_and_increment_ai_usage`
  - Google Gemini Multimodal SDK (`@google/genai`)
  - Environment variables: `GEMINI_API_KEY`, `GEMINI_MODEL`.
- **Expected Responses**:
  - `200 OK`: `{ "response": "<step-by-step guidance>" }`
  - `200 OK` (Quota Exceeded): `{ "response": "⚡ ...", "quotaExceeded": true }`
  - `400 Bad Request`:
    - `{ "error": "Invalid request body" }`
    - `{ "error": "Missing userMessage" }`
    - `{ "error": "Message is too long" }`
    - `{ "error": "Missing screenshot" }`
    - `{ "error": "Screenshot must be a base64 image data URL" }`
    - `{ "error": "Screenshot must be a JPEG or PNG image" }`
    - `{ "error": "Screenshot is too large" }`
  - `401 Unauthorized`: `{ "error": "Unauthorized" }` or `{ "error": "Invalid user token" }`
  - `403 Forbidden`: `{ "error": "Forbidden", "message": "Sign in with an account to chat with your companion." }`
  - `429 Too Many Requests`: Exceeded rate limit (8/min per IP or 6/min per user).
  - `500 Internal Server Error`: `{ "error": "Screen help is unavailable right now." }`

---

### Endpoint 5: `POST /api/livekit/token`
- **File**: `next-app/src/app/api/livekit/token/route.ts`
- **HTTP Method**: `POST`
- **Authentication**: Required (`Authorization: Bearer <supabase_jwt>`). Supports both registered users and provisioned guests.
- **Rate Limit**:
  - Middleware: `ip:livekit:${ip}` (max 20 requests per 60 seconds per IP).
  - In-handler: `user:livekit:${userId}` (max 25 requests per 60 seconds per user via `RATE_LIMITS.USER_LIVEKIT_TOKEN`).
- **Request Headers**:
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Payload Schema (JSON Body)**:
  | Field | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `roomName` | `string` | Optional* | Explicit room identifier (e.g. `'space-room-lobby'`, `'space-<uuid>'`, `'call-dm-<uuid>'`). |
  | `spaceId` | `string` | Optional* | Space UUID (resolves `targetRoom` to `'space-' + spaceId`). |
  | `displayName` | `string` | Optional | Participant display name (truncated to 64 chars). |
  *\*At least one of `roomName` or `spaceId` must be provided.*
- **Room Authorization Logic (`canJoinRoom`)**:
  Target room string is evaluated against three regex patterns:
  1. **Lobby rooms**: `/^space-room-[a-z0-9_-]{1,64}$/` -> Permitted for all authenticated users.
  2. **Space rooms**: `/^space-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`
     - If UUID matches `defaultHQ().id` (`"00000000-0000-0000-0000-000000000001"`) -> Permitted for all users.
     - Otherwise queries `spaces` table with caller's RLS token: permitted only if space exists and caller has RLS view access.
  3. **Call rooms**: `/^call-(dm|group)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`
     - If `dm`: checks `buddy_conversations` table; caller must be `user_one` or `user_two`.
     - If `group`: checks `group_conversation_members` table; caller must be an enrolled member.
  4. Any other room name format is rejected with `403 Forbidden`.
- **Core Behavior**:
  1. Validates JWT via scoped Supabase client.
  2. Verifies room join permission according to RLS database rules.
  3. Uses `livekit-server-sdk` `AccessToken` with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
  4. Grants permissions: `roomJoin: true`, `canPublish: true`, `canSubscribe: true`, `canPublishData: true`, `ttl: '2h'`.
  5. Signs and returns LiveKit WebRTC access token JWT.
- **Service Dependencies**:
  - LiveKit Server SDK (`livekit-server-sdk` `AccessToken`)
  - Supabase Auth (`getUser`)
  - Supabase Database (`spaces`, `buddy_conversations`, `group_conversation_members`)
  - Environment variables: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Expected Responses**:
  - `200 OK`:
    ```json
    { "token": "<livekit_jwt_token>" }
    ```
  - `400 Bad Request`: `{ "error": "Missing roomName or spaceId" }`
  - `401 Unauthorized`: `{ "error": "Missing Authorization header" }` or `{ "error": "Unauthorized user token" }`
  - `403 Forbidden`: `{ "error": "Not allowed to join this room" }`
  - `429 Too Many Requests`: Exceeded 20 req/min (IP) or 25 req/min (user).
  - `500 Internal Server Error`: `{ "error": "LiveKit server credentials unconfigured" }` or `{ "error": "Failed to generate token" }`

---

## 3. Summary Matrix of Discovered Endpoints

| # | Route | Method | Auth Required | Rate Limit (IP / User) | Core Service Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `/api/auth/guest-identity` | `GET` | No | 60 / min (IP) | In-memory FNV-1a IP hashing |
| 2 | `/api/auth/register` | `POST` | No | 5 / 15 min (IP) | Supabase Auth (`signUp`), Supabase DB (`profiles`), anti-bot timing/honeypot validator |
| 3 | `/api/companion/chat` | `POST` | Yes (Bearer JWT, non-guest) | 10 / min (IP), 15 / min (User) | Supabase Auth, RPCs (`check_and_increment_ai_usage`, `match_companion_memories`), DB (`companion_memories`), Google Gemini AI (`@google/genai`) |
| 4 | `/api/companion/screen-help` | `POST` | Yes (Bearer JWT, non-guest) | 8 / min (IP), 6 / min (User) | Supabase Auth, RPC (`check_and_increment_ai_usage`), Google Gemini Multimodal AI (`@google/genai`), screenshot validator |
| 5 | `/api/livekit/token` | `POST` | Yes (Bearer JWT, any user) | 20 / min (IP), 25 / min (User) | Supabase Auth, Supabase DB (`spaces`, `buddy_conversations`, `group_conversation_members`), LiveKit Server SDK (`livekit-server-sdk`) |

---

## 4. Caveats

1. **Non-API Operations**: Other real-time collaborative features in TeemChat (such as player coordinates sync, spatial proximity chat, friend requests, group messaging, and playlist updates) do not use Next.js API route handlers; they communicate directly via Supabase PostgREST client, Supabase Realtime WebSockets (`supabase.channel(...)`), and LiveKit WebRTC client (`Room.connect`).
2. **Server Actions**: No Next.js Server Actions (`"use server"`) exist in the application; all custom server-side logic is encapsulated within the five route handlers above.
3. **Stripe Integration**: Stripe secret keys exist in `.env.local` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), and SQL migration `supabase/migrations/20261008_stripe_subscriptions.sql` exists, but no `/api/stripe` or webhook route handler has been created in `next-app/src/app/api/`.
4. **Environment Variables**: Live tests against live services require valid credentials. The local `.env.local` provides configured keys for Supabase, LiveKit, and Gemini.

---

## 5. Conclusion

- The application exposes exactly five (5) REST API endpoints under `next-app/src/app/api/`.
- Every endpoint has been fully cataloged with exact paths, HTTP methods, query/body schemas, rate-limiting rules, security constraints, and third-party dependencies.
- This survey provides the complete blueprint required for implementing automated endpoint test suites covering both valid input scenarios and error/edge cases as demanded by `ORIGINAL_REQUEST.md`.

---

## 6. Verification Method

1. **Verify Route Handler Files**:
   ```powershell
   fd -p "next-app/src/app/api/**/route.ts"
   ```
   Confirm all 5 paths match.

2. **Verify Middleware Matcher and Limits**:
   Inspect `next-app/src/middleware.ts` (lines 14–33, 65–67) and `next-app/src/lib/rateLimit.ts` (lines 14–32).

3. **Verify Existing Project Unit Tests**:
   ```powershell
   npm test
   ```
   Confirm all 17 test suites (154 tests) pass with exit code 0.
