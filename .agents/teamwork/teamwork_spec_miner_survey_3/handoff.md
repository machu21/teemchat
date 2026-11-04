# Specification Mining Report: Next.js API Route Handlers

## 1. Observation
A comprehensive scan and static analysis of `next-app/src/app/api/` and related security middleware was performed.

### Discovered Route Handlers and Supporting Files:
1. `next-app/src/middleware.ts` (Lines 1-68): Next.js global API routing middleware governing all `/api/:path*` requests with IP rate limiting and header injection.
2. `next-app/src/app/api/auth/guest-identity/route.ts` (Lines 1-34): Generates deterministic guest handles and IP tags.
3. `next-app/src/app/api/auth/register/route.ts` (Lines 1-175): User registration endpoint with anti-bot honeypots, timing verification, disposable email screening, and Supabase Auth integration.
4. `next-app/src/app/api/companion/chat/route.ts` (Lines 1-175): AI companion conversational endpoint with vector memory retrieval, quota enforcement, and Gemini LLM inference.
5. `next-app/src/app/api/companion/screen-help/route.ts` (Lines 1-117): Multimodal AI companion guided tech support endpoint accepting base64 screenshot data URLs.
6. `next-app/src/app/api/livekit/token/route.ts` (Lines 1-132): LiveKit WebRTC access token dispenser with scoped Supabase RLS permission verification.
7. Supporting Utilities:
   - `next-app/src/lib/rateLimit.ts` (Lines 1-159): Sliding-window rate limiter, client IP extraction (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`), and header generation.
   - `next-app/src/lib/security/disposableEmails.ts` (Lines 1-160): Disposable domain set (76 domains), sub-addressing email normalizer, username regex validator, and form timing validator.
   - `next-app/src/lib/security/guestIdentity.ts` (Lines 1-89): FNV-1a 32-bit hash algorithm and guest handle formatting.
   - `next-app/src/lib/companionAuth.ts` (Lines 1-94): Authenticated user gate, guest blocker, user rate limiter, and daily quota RPC runner.
   - `next-app/src/lib/utils/screenshot.ts` (Lines 1-75): Base64 image validator, MIME type validator, and platform normalizer.
   - `next-app/src/lib/models/space.ts` (Lines 1-91): Default HQ space definition (`b6941fa2-8305-4e00-833c-ca3cd5f08c9b`).

Existing automated test suites (`npm test` via Vitest) were executed and passed cleanly across 17 test files and 154 unit tests.

---

## 2. Logic Chain
1. **Architecture Discovery**: All incoming HTTP requests to `/api/*` first pass through `next-app/src/middleware.ts` before reaching any route handler. Middleware enforces sliding-window IP rate limits based on path prefix:
   - `/api/auth/register` -> `RATE_LIMITS.AUTH_SIGNUP` (5 req / 15 min)
   - `/api/companion/chat` -> `RATE_LIMITS.AI_CHAT` (10 req / 1 min)
   - `/api/companion/screen-help` -> `RATE_LIMITS.AI_SCREEN_HELP` (8 req / 1 min)
   - `/api/livekit/token` -> `RATE_LIMITS.LIVEKIT_TOKEN` (20 req / 1 min)
   - Other routes (`/api/auth/guest-identity`, etc.) -> `RATE_LIMITS.DEFAULT_API` (60 req / 1 min)
2. **Double Rate-Limiting Observation**: In `/api/auth/register/route.ts` (Line 24), `checkRateLimit('ip:signup:' + ip, RATE_LIMITS.AUTH_SIGNUP)` is called again using the same key and default singleton limiter. Each registration request from an IP therefore consumes two increments from the sliding window bucket.
3. **Authentication Hierarchy**:
   - Public / Guest-Friendly: `GET /api/auth/guest-identity` requires no credentials. `POST /api/auth/register` requires no credentials.
   - Protected: `POST /api/companion/chat`, `POST /api/companion/screen-help`, and `POST /api/livekit/token` strictly require an `Authorization: Bearer <token>` header.
   - Guest Discrimination: `POST /api/companion/chat` and `POST /api/companion/screen-help` block guest accounts (`403 Forbidden`) via `authenticateCompanionRequest`. `POST /api/livekit/token` allows guest user JWTs provided the guest is a verified Supabase user and has permission to enter the target room.
4. **Error Handling Conventions**:
   - Most endpoints return `{ "error": string }`.
   - `/api/auth/register` includes `{ "error": string, "message": string, "retryAfter": number }` on 429.
   - `/api/companion/chat` on quota exhaustion returns status `200` with `{ "response": string, "quotaExceeded": true }`.
   - `/api/companion/screen-help` on quota exhaustion returns status `200` with `{ "response": string, "quotaExceeded": true }`.
   - `/api/auth/guest-identity` on internal exception catches error, falls back to randomized hex tag, and returns status `200` with `{ "success": true, "ipTag": string, "username": string, "displayName": string, "warning": string }`.

---

## 3. Caveats
- No database mutations or live network calls to external Gemini or LiveKit servers were made during this specification mining turn, preserving the read-only boundary.
- External dependencies (LiveKit Cloud, Supabase Auth/DB, Google Gemini API) depend on valid environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`). If missing in runtime test runs, route handlers trigger specific 500 error responses identified in the matrix below.

---

## 4. Conclusion
The Next.js API layer is fully cataloged into 5 distinct endpoints with explicit status codes, validation rules, error formats, and failure branches. The application exhibits defense-in-depth through middleware rate limiting, payload sanitization, anti-bot traps, and scoped Supabase RLS authorization.

---

## 5. Verification Method
1. Run existing unit test suites:
   `npm test` in `next-app` directory. Expected: 17 test files passed, 154 tests passed.
2. Inspect route implementations in `next-app/src/app/api/` against the Behavioral Matrix below.
3. Invalidation Conditions: Any modification to route handlers in `next-app/src/app/api/`, `next-app/src/middleware.ts`, `next-app/src/lib/rateLimit.ts`, `next-app/src/lib/companionAuth.ts`, or `next-app/src/lib/security/`.

---

## Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Middleware | IP-Based API Rate Limiter | Intercepts all `/api/*` traffic and rate-limits by client IP before route handlers execute | Client IP via headers (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`) | Passed request with `X-RateLimit-*` headers | 429 `{ error: "Too Many Requests", message: string, retryAfter: number }` | `next-app/src/middleware.ts:10` |
| 2 | Auth | Deterministic Guest Identity | Derives 4-character hex IP tags and handles using FNV-1a hash of client IP and optional session seed | Query: `instance` (optional); Headers: IP headers | 200 `{ success: true, ipTag: string, username: string, displayName: string }` | 200 with fallback tag `{ success: true, ipTag: string, username: string, displayName: string, warning: string }` | `next-app/src/app/api/auth/guest-identity/route.ts:5` |
| 3 | Auth | Secure Account Registration | Registers new user in Supabase Auth, provisions free profile, blocks bots via honeypot and timing checks | JSON body: `email`, `password`, `username`, `displayName`, `gender`, `renderedAt`, honeypot fields | 200 `{ success: true, user: object, session: object \| null }` | 400 (validation/bot/disposable), 429 (rate limit), 500 (missing env) | `next-app/src/app/api/auth/register/route.ts:19` |
| 4 | AI Companion | Companion Conversational Chat | Multi-turn contextual chat with vector RAG memory retrieval and background memory persistence via Gemini | Header: `Authorization: Bearer <jwt>`; JSON body: `companion`, `userName`, `currentZone`, `userMessage`, `recentHistory` | 200 `{ response: string }` | 400 (missing message), 401 (unauthorized), 403 (guest blocked), 429 (rate limit), 500 (inference failure) | `next-app/src/app/api/companion/chat/route.ts:11` |
| 5 | AI Companion | Screen Help Tech Support | Multimodal screenshot-guided tech support assistant using Gemini vision model | Header: `Authorization: Bearer <jwt>`; JSON body: `screenshot` (base64 data URL), `userMessage`, `companionName`, `userName`, `platform`, `recentHistory` | 200 `{ response: string }` | 400 (bad body, missing/invalid screenshot, long message), 401 (unauthorized), 403 (guest blocked), 429 (rate limit), 500 (unavailable) | `next-app/src/app/api/companion/screen-help/route.ts:20` |
| 6 | Realtime WebRTC | LiveKit Access Token Dispenser | Generates room join JWT tokens for spatial voice and video rooms guarded by Supabase RLS permissions | Header: `Authorization: Bearer <jwt>`; JSON body: `roomName`, `spaceId`, `displayName` | 200 `{ token: string }` | 400 (missing room/spaceId), 401 (unauthorized), 403 (unauthorized room), 429 (rate limit), 500 (missing credentials) | `next-app/src/app/api/livekit/token/route.ts:62` |

---

## Edge Cases
| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Middleware Rate Limit | IP sends > max allowed requests within window | Returns 429 with `Retry-After` header and `{ error: "Too Many Requests", message: "...", retryAfter: N }` |
| 2 | Guest Identity Seed | `?instance=%20%20%20` (whitespace only) | Treated as undefined; computes deterministic tag based purely on normalized IP |
| 3 | Guest Identity Loopback | `x-forwarded-for: ::1` or `127.0.0.1` or `localhost` | Normalized to `127.0.0.1`, yielding identical hash tag `7B4D` |
| 4 | Guest Identity Failure | Exception thrown inside handler | Catches exception, generates random 4-character hex fallback tag, returns status 200 with `warning` field |
| 5 | Registration Honeypot | `website_url: "https://bot.xyz"` or `company_site_field: "test"` or `phone_alt: "123"` | Returns 400 `{ error: "Security validation failed. Please reload and try again." }` |
| 6 | Registration Timing | `renderedAt: Date.now() - 500` (< 1200ms elapsed) | Returns 400 `{ error: "Form submission was too fast. Please take your time." }` |
| 7 | Registration Timing | `renderedAt: Date.now() + 10000` (timestamp in future > 5s) | Returns 400 `{ error: "Invalid form submission timestamp." }` |
| 8 | Registration Timing | `renderedAt: "not-a-number"` or `undefined` | Returns 400 `{ error: "Form security timestamp is missing." }` |
| 9 | Registration Email | Disposable domain (e.g. `user@mailinator.com`, `user@10minutemail.com`) | Returns 400 `{ error: "Disposable and temporary email addresses are not permitted. Please use a permanent email address." }` |
| 10 | Registration Email | Plus-addressing alias (e.g. `alice+spam123@gmail.com`) | Normalized by stripping sub-addressing to `alice@gmail.com` before checking uniqueness and registering |
| 11 | Registration Username | Length < 3 (e.g. `"ab"`) | Returns 400 `{ error: "Username must be at least 3 characters long." }` |
| 12 | Registration Username | Length > 24 (e.g. 25 characters) | Returns 400 `{ error: "Username cannot exceed 24 characters." }` |
| 13 | Registration Username | Invalid characters (e.g. `"user@name"`, `"user name"`, `"<script>"`) | Returns 400 `{ error: "Username may only contain letters, numbers, hyphens, and underscores." }` |
| 14 | Registration Password | Length < 6 (e.g. `"12345"`) or non-string | Returns 400 `{ error: "Password must be at least 6 characters long." }` |
| 15 | Companion Chat Auth | Missing `Authorization` header | Returns 401 `{ error: "Unauthorized" }` |
| 16 | Companion Chat Auth | User has guest metadata (`is_anonymous: true` or `@guest.teemchat.local`) | Returns 403 `{ error: "Forbidden", message: "Sign in with an account to chat with your companion." }` |
| 17 | Companion Chat Body | Malformed JSON or empty request body | Throws JSON parse error, caught by outer handler catch block, returns 500 `{ error: "<SyntaxError message>" }` |
| 18 | Companion Chat Message | `userMessage: ""` or missing | Returns 400 `{ error: "Missing userMessage" }` |
| 19 | Companion Chat Quota | Free trial quota reached (5/5 messages) | Returns 200 `{ response: "⚡ You've reached your free daily trial limit (5/5 messages)...", quotaExceeded: true }` |
| 20 | Companion Chat Quota | Daily user energy reached (50/50 messages) | Returns 200 `{ response: "⚡ I've reached my daily energy limit (50/50 messages)...", quotaExceeded: true }` |
| 21 | Screen Help Body | Request body is not an object (e.g. string or null) | Returns 400 `{ error: "Invalid request body" }` |
| 22 | Screen Help Message | `userMessage` length > 2000 characters | Returns 400 `{ error: "Message is too long" }` |
| 23 | Screen Help Image | Missing `screenshot` field or non-string | Returns 400 `{ error: "Missing screenshot" }` |
| 24 | Screen Help Image | Non-base64 or invalid data URL scheme (`http://...` or raw text) | Returns 400 `{ error: "Screenshot must be a base64 image data URL" }` |
| 25 | Screen Help Image | Unsupported MIME type (e.g. `data:image/svg+xml;base64,...`) | Returns 400 `{ error: "Screenshot must be a JPEG or PNG image" }` |
| 26 | Screen Help Image | Base64 string length > 2,000,000 chars (~1.5MB) | Returns 400 `{ error: "Screenshot is too large" }` |
| 27 | Screen Help Error | Gemini API failure or unhandled exception | Returns 500 `{ error: "Screen help is unavailable right now." }` (sanitized error message) |
| 28 | LiveKit Token Auth | Missing `Authorization` header | Returns 401 `{ error: "Missing Authorization header" }` |
| 29 | LiveKit Token Target | Missing both `roomName` and `spaceId` | Returns 400 `{ error: "Missing roomName or spaceId" }` |
| 30 | LiveKit Token Room | Target room is Default HQ (`space-b6941fa2-8305-4e00-833c-ca3cd5f08c9b`) | Permitted automatically without DB query |
| 31 | LiveKit Token Room | Target room is public lobby matching `/^space-room-[a-z0-9_-]{1,64}$/` | Permitted automatically without DB query |
| 32 | LiveKit Token Room | Target room is private space user does not own or have access to | Returns 403 `{ error: "Not allowed to join this room" }` |
| 33 | LiveKit Token Room | Target room is DM call (`call-dm-<uuid>`) user is not a participant of | Returns 403 `{ error: "Not allowed to join this room" }` |
| 34 | LiveKit Token Room | Target room format does not match any known pattern (e.g. `"arbitrary-room"`) | Returns 403 `{ error: "Not allowed to join this room" }` |
| 35 | LiveKit Token Config | Missing `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` environment variables | Returns 500 `{ error: "LiveKit server credentials unconfigured" }` |

---

## Complete Behavioral Matrix for All Endpoints

### 1. Endpoint: `GET /api/auth/guest-identity`
- **File**: `next-app/src/app/api/auth/guest-identity/route.ts`
- **HTTP Methods Allowed**: `GET` (Other methods return `405 Method Not Allowed`).
- **Authentication**: None (Public).
- **Middleware Rate Limit**: `RATE_LIMITS.DEFAULT_API` (60 req / 60s per IP).

#### Input Parameters:
| Source | Name | Type | Required | Description / Constraints |
|---|---|---|---|---|
| Query | `instance` | `string` | No | Optional seed string used to disambiguate multiple tabs on the same IP. |
| Header | `x-forwarded-for` | `string` | No | Client IP chain (first IP used). Falls back to `x-real-ip`, `cf-connecting-ip`, then `'127.0.0.1'`. |

#### Response Matrix:
| Scenario | Status | Headers | Response Payload Schema |
|---|---|---|---|
| Valid request (normal execution) | `200 OK` | `Content-Type: application/json`<br>`X-RateLimit-Limit: 60`<br>`X-RateLimit-Remaining: <N>`<br>`X-RateLimit-Reset: <timestamp>` | ```json<br>{<br>  "success": true,<br>  "ipTag": "7B4D",<br>  "username": "guest_7b4d",<br>  "displayName": "Explorer #7B4D"<br>}<br>``` |
| Rate limit exceeded (Middleware) | `429 Too Many Requests` | `Content-Type: application/json`<br>`Retry-After: <seconds>`<br>`X-RateLimit-*` | ```json<br>{<br>  "error": "Too Many Requests",<br>  "message": "Rate limit exceeded. Please wait <retryAfter> seconds before trying again.",<br>  "retryAfter": 15<br>}<br>``` |
| Internal catch block triggered | `200 OK` | `Content-Type: application/json` | ```json<br>{<br>  "success": true,<br>  "ipTag": "A1B2",<br>  "username": "guest_a1b2",<br>  "displayName": "Explorer #A1B2",<br>  "warning": "Failed to determine guest identity"<br>}<br>``` |

---

### 2. Endpoint: `POST /api/auth/register`
- **File**: `next-app/src/app/api/auth/register/route.ts`
- **HTTP Methods Allowed**: `POST` (Other methods return `405 Method Not Allowed`).
- **Authentication**: None (Public sign-up).
- **Middleware Rate Limit**: `RATE_LIMITS.AUTH_SIGNUP` (5 req / 15 min per IP).
- **Handler Rate Limit**: `RATE_LIMITS.AUTH_SIGNUP` (5 req / 15 min per IP; note: increments same bucket).

#### Input Parameters (JSON Body):
| Name | Type | Required | Constraints / Validation |
|---|---|---|---|
| `email` | `string` | Yes | Must be non-empty string; domain cannot be in `DISPOSABLE_EMAIL_DOMAINS`. Normalized via `normalizeEmail()`. |
| `password` | `string` | Yes | `typeof password === 'string' && password.length >= 6`. |
| `username` | `string` | Yes | `typeof username === 'string'`, trimmed length 3-24, regex `/^[a-zA-Z0-9_-]+$/`. |
| `displayName` | `string` | No | Trimmed and sliced to 32 chars. Defaults to `username.trim()`. |
| `gender` | `string` | No | `'female' ? 'female' : 'male'`. Defaults to `'male'`. |
| `renderedAt` | `number` | Yes | Anti-bot timestamp. Must be a number; `now - renderedAt >= 1200ms`; cannot be in future (> 5000ms). |
| `website_url` | `unknown` | No | Honeypot field. Must be empty/falsy. |
| `company_site_field` | `unknown` | No | Honeypot field. Must be empty/falsy. |
| `phone_alt` | `unknown` | No | Honeypot field. Must be empty/falsy. |

#### Response Matrix:
| Scenario | Status | Response Payload Schema |
|---|---|---|
| Valid registration | `200 OK` | ```json<br>{<br>  "success": true,<br>  "user": { "id": "...", "email": "..." },<br>  "session": { "access_token": "...", "refresh_token": "..." }<br>}<br>``` |
| Honeypot triggered (`website_url`, etc. filled) | `400 Bad Request` | ```json<br>{ "error": "Security validation failed. Please reload and try again." }<br>``` |
| `renderedAt` missing / non-number | `400 Bad Request` | ```json<br>{ "error": "Form security timestamp is missing." }<br>``` |
| `renderedAt` submission elapsed < 1200ms | `400 Bad Request` | ```json<br>{ "error": "Form submission was too fast. Please take your time." }<br>``` |
| `renderedAt` timestamp > 5000ms in future | `400 Bad Request` | ```json<br>{ "error": "Invalid form submission timestamp." }<br>``` |
| `email` missing or not a string | `400 Bad Request` | ```json<br>{ "error": "A valid email address is required." }<br>``` |
| `email` domain is disposable (e.g. `mailinator.com`) | `400 Bad Request` | ```json<br>{ "error": "Disposable and temporary email addresses are not permitted. Please use a permanent email address." }<br>``` |
| `username` missing or not a string | `400 Bad Request` | ```json<br>{ "error": "Username is required." }<br>``` |
| `username` length < 3 | `400 Bad Request` | ```json<br>{ "error": "Username must be at least 3 characters long." }<br>``` |
| `username` length > 24 | `400 Bad Request` | ```json<br>{ "error": "Username cannot exceed 24 characters." }<br>``` |
| `username` contains invalid characters | `400 Bad Request` | ```json<br>{ "error": "Username may only contain letters, numbers, hyphens, and underscores." }<br>``` |
| `password` missing or length < 6 | `400 Bad Request` | ```json<br>{ "error": "Password must be at least 6 characters long." }<br>``` |
| Supabase Auth error (e.g. user already registered) | `400 Bad Request` | ```json<br>{ "error": "<authError.message or 'Failed to create user account.'>" }<br>``` |
| Rate limit exceeded (Middleware) | `429 Too Many Requests` | ```json<br>{<br>  "error": "Too Many Requests",<br>  "message": "Rate limit exceeded. Please wait <retryAfter> seconds before trying again.",<br>  "retryAfter": 15<br>}<br>``` |
| Rate limit exceeded (Route Handler) | `429 Too Many Requests` | ```json<br>{<br>  "error": "Rate limit exceeded",<br>  "message": "Too many registration attempts from this network. Please wait <retryAfter> seconds before trying again.",<br>  "retryAfter": 15<br>}<br>``` |
| Server configuration missing (`SUPABASE_URL` / `SUPABASE_ANON_KEY`) | `500 Internal Server Error` | ```json<br>{ "error": "Server authentication configuration missing." }<br>``` |
| Unhandled runtime error in handler catch block | `500 Internal Server Error` | ```json<br>{ "error": "<error message string>" }<br>``` |

---

### 3. Endpoint: `POST /api/companion/chat`
- **File**: `next-app/src/app/api/companion/chat/route.ts`
- **HTTP Methods Allowed**: `POST` (Other methods return `405 Method Not Allowed`).
- **Authentication**: `Authorization: Bearer <token>` required.
- **Role Restriction**: Authenticated non-guest users only (`403 Forbidden` for guests).
- **Middleware Rate Limit**: `RATE_LIMITS.AI_CHAT` (10 req / 60s per IP).
- **Handler Rate Limit**: `RATE_LIMITS.USER_AI_CHAT` (15 req / 60s per user ID).

#### Input Parameters:
| Source | Name | Type | Required | Description / Constraints |
|---|---|---|---|---|
| Header | `Authorization` | `string` | Yes | `Bearer <supabase_jwt>`. |
| Body | `userMessage` | `string` | Yes | User's prompt. Must be truthy / non-empty. |
| Body | `companion` | `object` | No | Companion descriptor (`id`, `name`, `persona`, `companionType`, `avatarStyle`, `learnedContext`). |
| Body | `userName` | `string` | No | User's display handle (e.g. `"Alex"`). |
| Body | `currentZone` | `string` | No | Current zone name (e.g. `"Verdant Village"`). |
| Body | `recentHistory` | `array` | No | Array of `{ role: string, content: string }`. Sliced to last 8 messages. |

#### Response Matrix:
| Scenario | Status | Response Payload Schema |
|---|---|---|
| Successful AI response | `200 OK` | ```json<br>{<br>  "response": "I'm right beside you! Let's explore the village together!"<br>}<br>``` |
| Daily quota reached (trial / standard) | `200 OK` | ```json<br>{<br>  "response": "⚡ You've reached your free daily trial limit (5/5 messages)...",<br>  "quotaExceeded": true<br>}<br>``` |
| Missing `userMessage` | `400 Bad Request` | ```json<br>{ "error": "Missing userMessage" }<br>``` |
| Missing `Authorization` header | `401 Unauthorized` | ```json<br>{ "error": "Unauthorized" }<br>``` |
| Invalid / expired Supabase JWT | `401 Unauthorized` | ```json<br>{ "error": "Invalid user token" }<br>``` |
| Caller is guest account (`is_anonymous`, `@guest.teemchat.local`) | `403 Forbidden` | ```json<br>{<br>  "error": "Forbidden",<br>  "message": "Sign in with an account to chat with your companion."<br>}<br>``` |
| IP rate limit exceeded (Middleware) | `429 Too Many Requests` | ```json<br>{<br>  "error": "Too Many Requests",<br>  "message": "Rate limit exceeded. Please wait <retryAfter> seconds before trying again.",<br>  "retryAfter": 15<br>}<br>``` |
| Per-user rate limit exceeded (Handler) | `429 Too Many Requests` | ```json<br>{<br>  "error": "Rate limit exceeded",<br>  "message": "You are sending messages too quickly. Please wait <retryAfter> seconds before sending another message.",<br>  "retryAfter": 15<br>}<br>``` |
| Malformed JSON body | `500 Internal Server Error` | ```json<br>{ "error": "Unexpected end of JSON input" }<br>``` |
| Gemini API error (quota, bad key, timeout) | `500 Internal Server Error` | ```json<br>{ "error": "<error message string>" }<br>``` |

---

### 4. Endpoint: `POST /api/companion/screen-help`
- **File**: `next-app/src/app/api/companion/screen-help/route.ts`
- **HTTP Methods Allowed**: `POST` (Other methods return `405 Method Not Allowed`).
- **Authentication**: `Authorization: Bearer <token>` required.
- **Role Restriction**: Authenticated non-guest users only (`403 Forbidden` for guests).
- **Middleware Rate Limit**: `RATE_LIMITS.AI_SCREEN_HELP` (8 req / 60s per IP).
- **Handler Rate Limit**: `RATE_LIMITS.USER_AI_SCREEN_HELP` (6 req / 60s per user ID).

#### Input Parameters:
| Source | Name | Type | Required | Description / Constraints |
|---|---|---|---|---|
| Header | `Authorization` | `string` | Yes | `Bearer <supabase_jwt>`. |
| Body | `userMessage` | `string` | Yes | Question / prompt. String, non-empty, max 2000 chars. |
| Body | `screenshot` | `string` | Yes | Base64 data URL: `data:image/jpeg;base64,...` or `data:image/png;base64,...`. Max 2,000,000 base64 chars. |
| Body | `companionName` | `string` | No | Truncated to 60 chars. Defaults to `'Pixel Companion'`. |
| Body | `userName` | `string` | No | Truncated to 60 chars. Defaults to `'your owner'`. |
| Body | `platform` | `string` | No | Allowlist: `'Windows' \| 'macOS' \| 'Linux' \| 'ChromeOS' \| 'Unknown'`. Defaults to `'Unknown'`. |
| Body | `recentHistory` | `array` | No | Array of `{ role, content }`. Sliced last 6; content truncated to 2000 chars. |

#### Response Matrix:
| Scenario | Status | Response Payload Schema |
|---|---|---|
| Successful multimodal analysis | `200 OK` | ```json<br>{<br>  "response": "I see your browser settings. Click on 'Privacy & Security' on the left menu."<br>}<br>``` |
| Daily quota reached | `200 OK` | ```json<br>{<br>  "response": "⚡ You've reached your free daily trial limit. Upgrade your account for full access, or try again tomorrow!",<br>  "quotaExceeded": true<br>}<br>``` |
| Request body is null or not an object | `400 Bad Request` | ```json<br>{ "error": "Invalid request body" }<br>``` |
| `userMessage` missing, not string, or empty | `400 Bad Request` | ```json<br>{ "error": "Missing userMessage" }<br>``` |
| `userMessage` length > 2000 characters | `400 Bad Request` | ```json<br>{ "error": "Message is too long" }<br>``` |
| `screenshot` missing or empty | `400 Bad Request` | ```json<br>{ "error": "Missing screenshot" }<br>``` |
| `screenshot` not a valid base64 image data URL | `400 Bad Request` | ```json<br>{ "error": "Screenshot must be a base64 image data URL" }<br>``` |
| `screenshot` image format is not JPEG or PNG | `400 Bad Request` | ```json<br>{ "error": "Screenshot must be a JPEG or PNG image" }<br>``` |
| `screenshot` base64 length > 2,000,000 chars | `400 Bad Request` | ```json<br>{ "error": "Screenshot is too large" }<br>``` |
| Missing `Authorization` header | `401 Unauthorized` | ```json<br>{ "error": "Unauthorized" }<br>``` |
| Invalid / expired Supabase JWT | `401 Unauthorized` | ```json<br>{ "error": "Invalid user token" }<br>``` |
| Caller is guest account | `403 Forbidden` | ```json<br>{<br>  "error": "Forbidden",<br>  "message": "Sign in with an account to chat with your companion."<br>}<br>``` |
| IP rate limit exceeded (Middleware) | `429 Too Many Requests` | ```json<br>{<br>  "error": "Too Many Requests",<br>  "message": "Rate limit exceeded. Please wait <retryAfter> seconds before trying again.",<br>  "retryAfter": 15<br>}<br>``` |
| Per-user rate limit exceeded (Handler) | `429 Too Many Requests` | ```json<br>{<br>  "error": "Rate limit exceeded",<br>  "message": "You are sending messages too quickly. Please wait <retryAfter> seconds before sending another message.",<br>  "retryAfter": 15<br>}<br>``` |
| Gemini API error or uncaught exception | `500 Internal Server Error` | ```json<br>{ "error": "Screen help is unavailable right now." }<br>``` |

---

### 5. Endpoint: `POST /api/livekit/token`
- **File**: `next-app/src/app/api/livekit/token/route.ts`
- **HTTP Methods Allowed**: `POST` (Other methods return `405 Method Not Allowed`).
- **Authentication**: `Authorization: Bearer <token>` required (Verified Supabase user; guests permitted if provisioned as Supabase auth user).
- **Middleware Rate Limit**: `RATE_LIMITS.LIVEKIT_TOKEN` (20 req / 60s per IP).
- **Handler Rate Limit**: `RATE_LIMITS.USER_LIVEKIT_TOKEN` (25 req / 60s per user ID).

#### Input Parameters:
| Source | Name | Type | Required | Description / Constraints |
|---|---|---|---|---|
| Header | `Authorization` | `string` | Yes | `Bearer <supabase_jwt>`. Scopes queries to user's RLS view. |
| Body | `roomName` | `string` | Conditional | Explicit room identifier. Either `roomName` or `spaceId` must be provided. |
| Body | `spaceId` | `string` | Conditional | Space UUID. Converted to target room `space-${spaceId}`. |
| Body | `displayName` | `string` | No | Participant display name (truncated to 64 chars). Defaults to email or user ID. |

#### Room Authorization Rules (`canJoinRoom`):
1. Lobby Room (`/^space-room-[a-z0-9_-]{1,64}$/`): Always allowed.
2. Space Room (`/^space-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`):
   - Default HQ (`b6941fa2-8305-4e00-833c-ca3cd5f08c9b`): Always allowed.
   - Other Spaces: Allowed if row exists and is readable in `spaces` table under caller's RLS context.
3. Call Room (`/^call-(dm|group)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`):
   - `dm`: Allowed if caller is `user_one` or `user_two` in `buddy_conversations`.
   - `group`: Allowed if caller exists in `group_conversation_members` for the conversation.
4. Any other room name format: Denied (`403 Forbidden`).

#### Response Matrix:
| Scenario | Status | Response Payload Schema |
|---|---|---|
| Token generated successfully | `200 OK` | ```json<br>{<br>  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."<br>}<br>``` |
| Missing `roomName` and `spaceId` | `400 Bad Request` | ```json<br>{ "error": "Missing roomName or spaceId" }<br>``` |
| Missing `Authorization` header | `401 Unauthorized` | ```json<br>{ "error": "Missing Authorization header" }<br>``` |
| Invalid / unauthorized Supabase user token | `401 Unauthorized` | ```json<br>{ "error": "Unauthorized user token" }<br>``` |
| User not permitted to join requested room | `403 Forbidden` | ```json<br>{ "error": "Not allowed to join this room" }<br>``` |
| IP rate limit exceeded (Middleware) | `429 Too Many Requests` | ```json<br>{<br>  "error": "Too Many Requests",<br>  "message": "Rate limit exceeded. Please wait <retryAfter> seconds before trying again.",<br>  "retryAfter": 15<br>}<br>``` |
| Per-user rate limit exceeded (Handler) | `429 Too Many Requests` | ```json<br>{<br>  "error": "Rate limit exceeded",<br>  "message": "Too many token requests. Please wait <retryAfter> seconds before requesting another token.",<br>  "retryAfter": 15<br>}<br>``` |
| Server credentials unconfigured (`LIVEKIT_API_KEY` / `SECRET` missing) | `500 Internal Server Error` | ```json<br>{ "error": "LiveKit server credentials unconfigured" }<br>``` |
| Malformed JSON body or unhandled error | `500 Internal Server Error` | ```json<br>{ "error": "Failed to generate token" }<br>``` |
