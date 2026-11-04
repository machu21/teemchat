# API Behavior & Security Audit Report

**Application**: `TeemChat` (`next-app`)  
**Architecture**: Next.js 16 App Router, React 19, TypeScript  
**Audit Date**: November 3, 2026  
**Auditor**: Teamwork Worker `worker_m1_1` (API Test & Audit Worker)  
**Verification Baseline**: 105 New Route Tests (`tests/api/`), 177 Unit/Game Tests, 282 Total Passing Tests (0 Failures)  

---

## 1. Executive Summary

This behavior audit report provides a forensic-level examination of all REST API route handlers exposed by the TeemChat web application under `next-app/src/app/api/`. TeemChat employs a hybrid communication architecture: while low-latency player movement, spatial proximity chat, and WebSocket event broadcasts occur through Supabase Realtime channels and LiveKit WebRTC client connections, all sensitive server-side operations—identity generation, account onboarding, generative AI companion interactions, multimodal technical assistance, and WebRTC room token provisioning—are strictly encapsulated within Next.js 16 App Router API route handlers.

### Key Audit Findings:
1. **Endpoint Surface**: Exactly five (5) API route endpoints exist across the application:
   - `GET /api/auth/guest-identity`
   - `POST /api/auth/register`
   - `POST /api/companion/chat`
   - `POST /api/companion/screen-help`
   - `POST /api/livekit/token`
2. **Defense-in-Depth Rate Limiting**: All API traffic is intercepted by a global Next.js middleware sliding-window rate limiter (`src/middleware.ts`) before reaching route handlers. Crucial endpoints (`/api/auth/register`, `/api/companion/chat`, `/api/companion/screen-help`, `/api/livekit/token`) implement redundant in-handler sliding-window rate limits, protecting against network flooding and per-user exhaustion.
3. **Anti-Bot Countermeasures**: Account registration features a dual-layer anti-bot barrier consisting of hidden honeypot fields (`website_url`, `company_site_field`, `phone_alt`) and render-to-submission velocity validation (`renderedAt`). Sub-second submissions (<1200ms) are immediately rejected with HTTP 400.
4. **Disposable Email Shield**: Registration integrates a strict 76-domain temporary email blocklist (`DISPOSABLE_EMAIL_DOMAINS`), preventing throwaway account creation while automatically normalizing Gmail/sub-addressed email aliases.
5. **AI Companion Quota & Security**: AI companion endpoints strictly forbid unauthenticated and guest users (`403 Forbidden`). Daily energy quotas (50 messages/day for standard users, 5 messages/day for trial users) are atomically checked via Supabase stored procedure `check_and_increment_ai_usage`.
6. **Scoped WebRTC Room Access**: LiveKit token issuance enforces strict Row-Level Security (RLS) database queries executed under the caller's own JWT token. Arbitrary room names are rejected with HTTP 403; public lobby and Default HQ rooms are fast-pathed without database queries.
7. **Test Verification**: 105 automated unit and integration tests were authored in `next-app/tests/api/`, executing with 100% pass rate. All 177 pre-existing unit and canvas tests continue to pass without any regression (282 total tests).

---

## 2. API Architecture & Security Perimeter

```
                             [ Incoming HTTP Request ]
                                         │
                                         ▼
                     ┌───────────────────────────────────────┐
                     │       Next.js API Middleware          │
                     │         (src/middleware.ts)           │
                     │  - IP extraction (x-forwarded-for)    │
                     │  - Path-based sliding window limiter  │
                     └───────────────────┬───────────────────┘
                                         │ Pass (or 429 Too Many Requests)
                                         ▼
                     ┌───────────────────────────────────────┐
                     │          Route Dispatcher             │
                     │       (src/app/api/.../route.ts)      │
                     └───────────────────┬───────────────────┘
                                         │
       ┌──────────────────┬──────────────┼──────────────┬──────────────────┐
       ▼                  ▼              ▼              ▼                  ▼
┌──────────────┐   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Guest ID     │   │ Register     │ │ Companion    │ │ Screen Help  │ │ LiveKit      │
│ GET          │   │ POST         │ │ Chat POST    │ │ POST         │ │ Token POST   │
├──────────────┤   ├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤
│ - FNV-1a     │   │ - Honeypots  │ │ - JWT Auth   │ │ - JWT Auth   │ │ - Scoped RLS │
│ - IP hash    │   │ - Velocity   │ │ - Guest Block│ │ - Guest Block│ │ - Lobby regex│
│ - Seed tag   │   │ - Disposable │ │ - Quota RPC  │ │ - Quota RPC  │ │ - HQ bypass  │
│ - 0 external │   │ - Supabase   │ │ - RAG Embed  │ │ - Base64 PNG │ │ - Call auth  │
│   calls      │   │   Auth & DB  │ │ - Gemini SDK │ │ - Gemini Vis │ │ - LiveKit SDK│
└──────────────┘   └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Rate Limiting Hierarchy
TeemChat uses an in-memory sliding window rate limiter (`src/lib/rateLimit.ts`):
- `RATE_LIMITS.AUTH_SIGNUP`: 5 requests per 15 minutes (900,000 ms) per IP
- `RATE_LIMITS.AI_CHAT`: 10 requests per 60 seconds per IP (Middleware)
- `RATE_LIMITS.USER_AI_CHAT`: 15 requests per 60 seconds per user ID (Handler)
- `RATE_LIMITS.AI_SCREEN_HELP`: 8 requests per 60 seconds per IP (Middleware)
- `RATE_LIMITS.USER_AI_SCREEN_HELP`: 6 requests per 60 seconds per user ID (Handler)
- `RATE_LIMITS.LIVEKIT_TOKEN`: 20 requests per 60 seconds per IP (Middleware)
- `RATE_LIMITS.USER_LIVEKIT_TOKEN`: 25 requests per 60 seconds per user ID (Handler)
- `RATE_LIMITS.DEFAULT_API`: 60 requests per 60 seconds per IP (Middleware fallback)

---

## 3. Discovered Endpoints Catalog

| # | Route Path | Method | Auth Level | Rate Limit (IP / User) | Core Service Dependencies | Handler Source Location |
|---|------------|--------|------------|------------------------|---------------------------|-------------------------|
| 1 | `/api/auth/guest-identity` | `GET` | Public (Anonymous) | 60 req / 60s (IP) | In-memory FNV-1a hash | `src/app/api/auth/guest-identity/route.ts` |
| 2 | `/api/auth/register` | `POST` | Public (Unauthenticated) | 5 req / 15m (IP) | Supabase Auth (`signUp`), Supabase DB (`profiles`), Anti-Bot Timing/Honeypot | `src/app/api/auth/register/route.ts` |
| 3 | `/api/companion/chat` | `POST` | Protected (Non-Guest User) | 10 req/m (IP), 15 req/m (User) | Supabase Auth, RPCs (`check_and_increment_ai_usage`, `match_companion_memories`), Google Gemini AI (`@google/genai`) | `src/app/api/companion/chat/route.ts` |
| 4 | `/api/companion/screen-help` | `POST` | Protected (Non-Guest User) | 8 req/m (IP), 6 req/m (User) | Supabase Auth, RPC (`check_and_increment_ai_usage`), Google Gemini Multimodal Vision (`@google/genai`), Screenshot Validator | `src/app/api/companion/screen-help/route.ts` |
| 5 | `/api/livekit/token` | `POST` | Protected (Any Authenticated User / Guest) | 20 req/m (IP), 25 req/m (User) | Scoped Supabase Client (RLS view), Database (`spaces`, `buddy_conversations`, `group_conversation_members`), LiveKit Server SDK | `src/app/api/livekit/token/route.ts` |

---

## 4. Deep Endpoint Behavior & Schema Audit

### 4.1 Endpoint: `GET /api/auth/guest-identity`

#### 4.1.1 Purpose & Architectural Role
Generates deterministic, collision-resistant guest identity tags for unauthenticated visitors entering the virtual world. When a guest opens TeemChat, the system hashes their client IP using the 32-bit FNV-1a hashing algorithm to assign an uppercase 4-character hex tag (e.g., `D9C1`), constructing a uniform username (`guest_d9c1`) and display name (`Explorer #D9C1`).

#### 4.1.2 Request Specification
- **HTTP Method**: `GET`
- **Authentication**: None required.
- **Headers**:
  - `x-forwarded-for`: Client IP chain (first IP extracted).
  - `x-real-ip`: Fallback IP header.
  - `cf-connecting-ip`: Cloudflare connecting IP header.
  - Default: `'127.0.0.1'` when no IP headers exist.
- **Query Parameters**:
  - `instance` (`string`, optional): A client session or browser tab seed (e.g. `?instance=TAB_A`). Allows multiple browser tabs on the same IP to receive distinct tags.

#### 4.1.3 Audited Status Codes & Concrete Conditions
- `200 OK`: Standard execution. Deterministic tag generated and returned with handles.
- `200 OK` (Exception Fallback): Catch block safety handler. If an unexpected runtime exception occurs, generates a random 4-character hex tag and returns status 200 with a `warning` property describing the error.
- `429 Too Many Requests`: Triggered by middleware when client IP exceeds 60 requests per 60 seconds.

#### 4.1.4 Payload Schemas & Verified Concrete Examples

##### Standard Success Response (`200 OK`)
```json
{
  "success": true,
  "ipTag": "D9C1",
  "username": "guest_d9c1",
  "displayName": "Explorer #D9C1"
}
```

##### Fallback Success Response (`200 OK` with Warning)
```json
{
  "success": true,
  "ipTag": "A4B7",
  "username": "guest_a4b7",
  "displayName": "Explorer #A4B7",
  "warning": "Failed to determine guest identity"
}
```

##### Rate Limit Exceeded Response (`429 Too Many Requests` via Middleware)
```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please wait 15 seconds before trying again.",
  "retryAfter": 15
}
```

#### 4.1.5 Edge Cases & Forensic Observations
1. **Loopback Normalization**: `127.0.0.1`, `::1`, and `localhost` are explicitly normalized to `127.0.0.1` before hashing, ensuring developers and local testers always receive the identical baseline tag (`D9C1`).
2. **Whitespace Instance Seeds**: Query parameter `?instance=%20%20%20` is trimmed and evaluated as undefined, falling back to pure IP hashing without corruption.
3. **Zero Network Latency**: Operates completely in-memory without external database or third-party API dependencies.

---

### 4.2 Endpoint: `POST /api/auth/register`

#### 4.2.1 Purpose & Architectural Role
Handles new user registration, enforcing anti-bot defenses, disposable email domain filtering, password quality rules, and automated Supabase Auth profile provisioning.

#### 4.2.2 Request Specification
- **HTTP Method**: `POST`
- **Authentication**: None required.
- **Headers**: `Content-Type: application/json`
- **Request Body Fields**:
  - `email` (`string`, required): Permanent email address.
  - `password` (`string`, required): Minimum 6 characters.
  - `username` (`string`, required): 3–24 characters, alphanumeric plus hyphens/underscores (`/^[a-zA-Z0-9_-]+$/`).
  - `displayName` (`string`, optional): Trimmed and truncated to 32 characters. Defaults to `username`.
  - `gender` (`string`, optional): `'female'` or `'male'`. Defaults to `'male'`.
  - `renderedAt` (`number`, required): Epoch timestamp (ms) when form was rendered client-side.
  - `website_url`, `company_site_field`, `phone_alt` (`string`, optional): Anti-bot honeypot fields. Must be falsy/empty.

#### 4.2.3 Audited Status Codes & Concrete Conditions
- `200 OK`: Account created in Supabase Auth, profile upserted in `profiles` table, returns user and session objects.
- `400 Bad Request`:
  - Anti-bot honeypot triggered: `website_url`, `company_site_field`, or `phone_alt` contains text.
  - Timing check failed: `now - renderedAt < 1200ms` (submission was too fast).
  - Missing timestamp: `renderedAt` missing or non-numeric.
  - Missing email: `email` missing, empty string, or non-string.
  - Disposable email domain: `email` domain matches one of 76 blocked disposable email providers.
  - Username missing or invalid: Length < 3, length > 24, or contains illegal characters.
  - Password too short: `password` length < 6 or non-string.
  - Supabase Auth rejection: User already registered or invalid credentials.
- `429 Too Many Requests`: Exceeded 5 signup attempts per 15 minutes from the client IP address.
- `500 Internal Server Error`: Server authentication configuration missing (`NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` unset) or fatal uncaught exception.

#### 4.2.4 Payload Schemas & Verified Concrete Examples

##### Success Payload (`200 OK`)
```json
{
  "success": true,
  "user": {
    "id": "usr-12345",
    "email": "newplayer@example.com"
  },
  "session": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "dGhpcy1pcy1hLXJlZnJlc2gtdG9rZW4..."
  }
}
```

##### Honeypot Rejection Payload (`400 Bad Request`)
```json
{
  "error": "Security validation failed. Please reload and try again."
}
```

##### Timing Velocity Rejection Payload (`400 Bad Request`)
```json
{
  "error": "Form submission was too fast. Please take your time."
}
```

##### Disposable Email Rejection Payload (`400 Bad Request`)
```json
{
  "error": "Disposable and temporary email addresses are not permitted. Please use a permanent email address."
}
```

##### Rate Limit Exceeded Payload (`429 Too Many Requests`)
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many registration attempts from this network. Please wait 840 seconds before trying again.",
  "retryAfter": 840
}
```

#### 4.2.5 Edge Cases & Forensic Observations
1. **Timing Validation Precedence**: In `src/lib/security/disposableEmails.ts:150-157`, `elapsed < minDurationMs` (1200ms) is evaluated before `elapsed < -5000ms`. When `renderedAt` is skewed into the future (`elapsed < 0`), it is caught by `elapsed < 1200ms`, returning `'Form submission was too fast. Please take your time.'`.
2. **Sub-addressing Normalization**: Email aliases such as `alice+spam@gmail.com` are normalized to `alice@gmail.com` before checking uniqueness and creating the account, preventing duplicate trial farming.
3. **Resilient Profile Provisioning**: If `supabase.from('profiles').upsert` fails due to a transient database warning, the catch block logs a warning but still returns status 200 with the active Supabase Auth session, ensuring new users are not locked out.

---

### 4.3 Endpoint: `POST /api/companion/chat`

#### 4.3.1 Purpose & Architectural Role
Powers multi-turn conversational interactions with the user's retro AI companion in the 2D world. Integrates RAG (Retrieval-Augmented Generation) memory lookup via vector embeddings, enforces daily quota limits, formats persona and world-zone system instructions, and asynchronously extracts user preferences in the background.

#### 4.3.2 Request Specification
- **HTTP Method**: `POST`
- **Authentication**: `Authorization: Bearer <supabase_jwt>` (Strictly required).
- **Guest Restriction**: Guest users are completely blocked (`403 Forbidden`).
- **Headers**: `Content-Type: application/json`
- **Request Body Fields**:
  - `userMessage` (`string`, required): User message prompt.
  - `companion` (`object`, optional): Companion descriptor (`id`, `name`, `persona`, `companionType`, `avatarStyle`, `learnedContext`).
  - `userName` (`string`, optional): Display name of user.
  - `currentZone` (`string`, optional): Virtual world zone (e.g. `'Adventure Camp'`).
  - `recentHistory` (`Array<{role: string, content: string}>`, optional): Last conversational turns (sliced to 8).

#### 4.3.3 Audited Status Codes & Concrete Conditions
- `200 OK`: AI companion response successfully generated by Google Gemini model.
- `200 OK` (Quota Exceeded): Daily energy limit reached (50 msgs standard, 5 msgs trial). Response message returned with `quotaExceeded: true`.
- `400 Bad Request`: `userMessage` missing or empty string.
- `401 Unauthorized`: Missing `Authorization` header or invalid/expired Supabase JWT token.
- `403 Forbidden`: Caller is a guest session (`is_anonymous`, `@guest.teemchat.local`).
- `429 Too Many Requests`: Caller exceeded 15 companion chat messages per minute.
- `500 Internal Server Error`: Unhandled Gemini inference error or malformed JSON stream.

#### 4.3.4 Payload Schemas & Verified Concrete Examples

##### Success Response (`200 OK`)
```json
{
  "response": "Adventure Camp has a secret cave path! Let us check it out together!"
}
```

##### Daily Quota Exceeded Response (`200 OK` with Flag)
```json
{
  "response": "⚡ I've reached my daily energy limit (50/50 messages). Energy recharges at midnight UTC! Let's chat again tomorrow.",
  "quotaExceeded": true
}
```

##### Trial Quota Exceeded Response (`200 OK` with Flag)
```json
{
  "response": "⚡ You've reached your free daily trial limit (5/5 messages). Upgrade your account for full access, or chat again tomorrow!",
  "quotaExceeded": true
}
```

##### Guest Forbidden Response (`403 Forbidden`)
```json
{
  "error": "Forbidden",
  "message": "Sign in with an account to chat with your companion."
}
```

#### 4.3.5 Edge Cases & Forensic Observations
1. **RAG Vector Search**: Embeds `userMessage` via Gemini `text-embedding-004` and queries Supabase stored procedure `match_companion_memories` (minimum similarity 0.55). If memories exist, they are appended to system instructions under `RELEVANT MEMORIES ABOUT <userName>:`.
2. **Background Fact Extraction**: After generating the companion reply, the route fires an asynchronous, non-blocking promise to extract facts and insert them into `companion_memories` with new embeddings, without delaying the HTTP response.
3. **Resilience to RAG Errors**: If RAG semantic search throws an exception, the handler catches the error, logs a warning, and continues prompt synthesis with default greeting instructions.

---

### 4.4 Endpoint: `POST /api/companion/screen-help`

#### 4.4.1 Purpose & Architectural Role
Enables guided, multimodal tech support. A user takes a screenshot in TeemChat, and their companion analyzes the screen image using Gemini's vision model, providing step-by-step guidance.

#### 4.4.2 Privacy & Security Guarantees
- **Ephemerality**: Screenshots exist purely in in-flight server memory during the request. They are never written to disk, never stored in Supabase Storage, never embedded in vector tables, and never indexed into companion memory.
- **Prompt Injection Defense**: Explicit system instructions enforce that text visible on screen must be treated as untrusted information and never executed as instructions. Sensitive fields (passwords, PINs, card numbers) are never read aloud.

#### 4.4.3 Request Specification
- **HTTP Method**: `POST`
- **Authentication**: `Authorization: Bearer <supabase_jwt>` (Required).
- **Guest Restriction**: Blocked (`403 Forbidden`).
- **Headers**: `Content-Type: application/json`
- **Request Body Fields**:
  - `userMessage` (`string`, required): Tech support question (max 2000 chars).
  - `screenshot` (`string`, required): Base64 data URL (`data:image/jpeg;base64,...` or `data:image/png;base64,...`). Max 2,000,000 characters.
  - `companionName` (`string`, optional): Max 60 chars, default `'Pixel Companion'`.
  - `userName` (`string`, optional): Max 60 chars, default `'your owner'`.
  - `platform` (`string`, optional): `'Windows' | 'macOS' | 'Linux' | 'ChromeOS' | 'Unknown'`.
  - `recentHistory` (`array`, optional): Sliced to last 6 turns.

#### 4.4.4 Audited Status Codes & Concrete Conditions
- `200 OK`: Step-by-step multimodal assistance returned.
- `200 OK` (Quota Exceeded): Shared daily companion quota reached (`quotaExceeded: true`).
- `400 Bad Request`:
  - Request body is not an object.
  - Missing or empty `userMessage`.
  - `userMessage` exceeds 2000 characters.
  - Missing `screenshot`.
  - `screenshot` is not a valid base64 image data URL.
  - `screenshot` format is not JPEG or PNG (e.g. GIF, WebP, SVG).
  - `screenshot` base64 payload exceeds 2,000,000 characters.
- `401 Unauthorized`: Missing or invalid `Authorization` header.
- `403 Forbidden`: Guest user access denied.
- `429 Too Many Requests`: Exceeded 6 screen-help requests per minute.
- `500 Internal Server Error`: Gemini API vision model error. Sanitized message returned: `{ "error": "Screen help is unavailable right now." }`.

#### 4.4.5 Payload Schemas & Verified Concrete Examples

##### Success Response (`200 OK`)
```json
{
  "response": "Click on the \"Audio & Voice\" tab on the left navigation bar."
}
```

##### Unsupported Image Type Error (`400 Bad Request`)
```json
{
  "error": "Screenshot must be a JPEG or PNG image"
}
```

##### Oversized Screenshot Error (`400 Bad Request`)
```json
{
  "error": "Screenshot is too large"
}
```

#### 4.4.6 Edge Cases & Forensic Observations
1. **Regex Delimiter Precision**: Data URL validation regex `/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/` accepts `image/png` and `image/jpeg`. Formats like `image/svg+xml` fail the `[a-z]+` token due to the `+` character, returning `"Screenshot must be a base64 image data URL"`, whereas standard raster formats like `image/gif` and `image/webp` pass regex parsing but fail the MIME allowlist, returning `"Screenshot must be a JPEG or PNG image"`.
2. **Error Message Sanitization**: On unexpected model failures, internal API error details are withheld, and a safe, friendly message is returned (`"Screen help is unavailable right now."`).

---

### 4.5 Endpoint: `POST /api/livekit/token`

#### 4.5.1 Purpose & Architectural Role
WebRTC access token dispenser for LiveKit real-time spatial voice, video, and screen sharing. Issues signed LiveKit JWT access tokens with 2-hour TTL and verified room permissions.

#### 4.5.2 Scoped RLS Permission Verification
Token generation runs queries using a scoped Supabase client initialized with the caller's JWT:
```typescript
function createScopedClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```
Because queries execute under the caller's JWT, PostgreSQL Row-Level Security (RLS) ensures that private spaces and conversations are strictly invisible unless the user has authorized access.

#### 4.5.3 Room Authorization Rules (`canJoinRoom`)
1. **Public Lobby Rooms**: Match `/^space-room-[a-z0-9_-]{1,64}$/` -> Permitted immediately for all authenticated users and provisioned guests.
2. **Space Rooms**: Match `/^space-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`:
   - If UUID matches Default HQ (`b6941fa2-8305-4e00-833c-ca3cd5f08c9b`), access is granted immediately without querying the database.
   - For all other spaces, queries `spaces` table; access is granted only if the row is visible under the caller's RLS view.
3. **Call Rooms**: Match `/^call-(dm|group)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i`:
   - DM calls (`call-dm-<uuid>`): Caller must be `user_one` or `user_two` in `buddy_conversations`.
   - Group calls (`call-group-<uuid>`): Caller must be present in `group_conversation_members`.
4. **All Other Patterns**: Denied with `403 Forbidden`.

#### 4.5.4 Audited Status Codes & Concrete Conditions
- `200 OK`: Signed LiveKit WebRTC access token returned.
- `400 Bad Request`: Both `roomName` and `spaceId` are missing or empty string.
- `401 Unauthorized`: Missing `Authorization` header or invalid Supabase user token.
- `403 Forbidden`: Room authorization rejected by `canJoinRoom`.
- `429 Too Many Requests`: Exceeded 25 token requests per minute.
- `500 Internal Server Error`: `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` unconfigured, token signing failure, or unparseable JSON stream.

#### 4.5.5 Payload Schemas & Verified Concrete Examples

##### Success Payload (`200 OK`)
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NjIyMzEwMDAsImlzcyI6IkFQSWNwS0tLN1djNFVoSCIsIm5hbWUiOiJFeHBsb3JlciBTdGV2ZSIsInN1YiI6InVzZXItbGstY2FsbGVyLTAwMSIsInZpZGVvIjp7ImNhblB1Ymxpc2giOnRydWUsImNhblB1Ymxpc2hEYXRhIjp0cnVlLCJjYW5TdWJzY3JpYmUiOnRydWUsInJvb20iOiJzcGFjZS1yb29tLWxvYmJ5Iiwicm9vbUpvaW4iOnRydWV9fQ.signature..."
}
```

##### Room Forbidden Payload (`403 Forbidden`)
```json
{
  "error": "Not allowed to join this room"
}
```

##### Missing Room Target Payload (`400 Bad Request`)
```json
{
  "error": "Missing roomName or spaceId"
}
```

##### Missing Server Credentials Payload (`500 Internal Server Error`)
```json
{
  "error": "LiveKit server credentials unconfigured"
}
```

#### 4.5.6 Edge Cases & Forensic Observations
1. **Guest Inclusion**: Unlike AI companion routes which forbid guests, the LiveKit token route permits provisioned guests to join public lobbies and Default HQ spaces, ensuring seamless drop-in audio/video for exploratory users.
2. **Display Name Truncation**: `displayName` is sliced to 64 characters, preventing buffer bloat in WebRTC participant metadata.
3. **Default HQ Bypass**: Default HQ bypasses the database query, ensuring users can always enter the primary world hub even during database load spikes or maintenance windows.

---

## 5. Security & Threat Mitigation Summary

| Security Domain | Threat Addressed | Mechanism Implemented | Audit Status |
| :--- | :--- | :--- | :--- |
| **Denial of Service** | Network flooding, resource exhaustion | Sliding-window IP rate limiter in Next.js middleware + per-user token buckets | **VERIFIED** (HTTP 429 asserted across all routes) |
| **Automated Bot Abuse** | Rapid script registration, credential stuffing | Hidden honeypot fields (`website_url`, etc.) + render-to-submit timing checks (>=1200ms) | **VERIFIED** (HTTP 400 asserted on honeypot/velocity trigger) |
| **Account Farming** | Disposable/throwaway accounts | 76-domain disposable email blocklist + plus-addressing sub-alias normalization | **VERIFIED** (HTTP 400 asserted on temporary domains) |
| **AI Resource Abuse** | Gemini quota drainage, unauthorized API usage | Strict guest blocker (`403 Forbidden`) + daily usage counter RPC (`check_and_increment_ai_usage`) | **VERIFIED** (HTTP 403 & quotaExceeded asserted) |
| **Prompt Injection** | LLM hijacking via user screenshots | Defensive system instructions treating on-screen text as untrusted data | **VERIFIED** (Instruction synthesis tested) |
| **Data Privacy** | Sensitive screenshot leak | Ephemeral in-flight memory handling; zero disk or database persistence | **VERIFIED** (Storage bypass verified) |
| **Eavesdropping / Wiretapping** | Unauthorized WebRTC audio room access | Scoped RLS queries under caller's JWT + strict regex room classification | **VERIFIED** (HTTP 403 asserted on unauthorized rooms) |

---

## 6. Automated Test Execution Verification Report

### 6.1 Test Execution Architecture
The test suite utilizes Vitest 5.0.4 with direct in-memory invocation of route handlers via `NextRequest` from `next/server`. This architecture delivers instantaneous, 100% deterministic execution without requiring child processes, network port binding, or live external database connections.

### 6.2 Test Suite Breakdown

| # | Test Suite File | Route Handler Tested | Tests | Passed | Failed | Duration | Status Codes Verified |
|---|-----------------|----------------------|:-----:|:------:|:------:|:--------:|:---------------------:|
| 1 | `tests/api/guest_identity.test.ts` | `GET /api/auth/guest-identity` | 12 | 12 | 0 | 109ms | `200` (standard & fallback), `429` |
| 2 | `tests/api/register.test.ts` | `POST /api/auth/register` | 35 | 35 | 0 | 379ms | `200`, `400` (honeypots, timing, email, user, pwd, supabase), `429`, `500` (missing env, runtime error) |
| 3 | `tests/api/chat.test.ts` | `POST /api/companion/chat` | 16 | 16 | 0 | 239ms | `200` (AI response & quota exceeded), `400`, `401`, `403` (guests), `429`, `500` (model error, bad JSON) |
| 4 | `tests/api/screen_help.test.ts` | `POST /api/companion/screen-help` | 20 | 20 | 0 | 281ms | `200` (PNG, JPEG, platforms & quota), `400` (bad body, msg length, image format, size), `401`, `403`, `429`, `500` |
| 5 | `tests/api/livekit_token.test.ts` | `POST /api/livekit/token` | 22 | 22 | 0 | 285ms | `200` (lobby, HQ, space, DM, group, guest), `400`, `401`, `403` (unauthorized rooms), `429`, `500` (unconfigured, signing) |
| **Total** | **5 Test Suites** | **All 5 Discovered Endpoints** | **105** | **105** | **0** | **~2.64s** | **100% Pass Rate** |

### 6.3 Full Workspace Regression Verification
Running the complete test command (`npm test`) validates all 24 test files across the repository:
- **Pre-existing Unit & Game Tests**: 19 test files (177 tests) -> **177 passed**
- **New API Route Handler Tests**: 5 test files (105 tests) -> **105 passed**
- **Total Workspace Test Count**: **282 tests passed**, **0 failed**
- **Exit Code**: `0`

---

## 7. Audit Invalidation & Maintenance Guidance

This audit report reflects the implementation state of `next-app` as of November 3, 2026. The findings in this report remain authoritative unless any of the following files are modified:
1. `next-app/src/app/api/**/route.ts` (any modification to route handlers)
2. `next-app/src/middleware.ts` (changes to matcher or global rate limit windows)
3. `next-app/src/lib/rateLimit.ts` (changes to token bucket configurations or IP extractors)
4. `next-app/src/lib/companionAuth.ts` (changes to guest gating or quota RPC calls)
5. `next-app/src/lib/security/disposableEmails.ts` (changes to domain blocklist or timing formulas)
6. `next-app/src/lib/models/space.ts` (changes to Default HQ UUID)
