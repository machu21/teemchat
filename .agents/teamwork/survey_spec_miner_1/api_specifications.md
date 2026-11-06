# TeemChat Admin Backend API Specifications

Author: `survey_spec_miner_1` (Phase 0: Survey & Discovery)  
Generated: 2026-11-05  
Integrity Mode: Development / Neo-Brutalist Architecture  
Target Scope: `next-app/src/app/api/admin/` & `next-app/src/lib/admin/`

---

## 1. Executive Summary & Security Architecture

The administration subsystem in TeemChat exposes a dedicated REST interface under `/api/admin/` protected by a multi-tier security barrier (`next-app/src/lib/admin/adminAuth.ts` and `next-app/src/lib/rateLimit.ts`):

1. **Rate Limiting (Sliding Window per IP)**:
   - **Read Operations (`ADMIN_API`)**: 120 requests per 60-second window.
   - **Mutation Operations (`ADMIN_MUTATION`)**: 40 requests per 60-second window.
   - Returns HTTP `429 Too Many Requests` with headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
2. **Dual Authentication Mechanisms**:
   - **Machine API Key (`X-Admin-Api-Key`)**: Authenticated against `process.env.ADMIN_SECRET_KEY`. When valid, grants synthetic `superadmin` identity (`id: '00000000-0000-0000-0000-000000000000'`, `isMachineKey: true`).
   - **User Bearer JWT (`Authorization: Bearer <token>`)**: Validated against Supabase Auth (`supabaseAdmin.auth.getUser(token)`). The caller's user ID is then queried in `public.profiles` (`system_role`), allowing only `'admin'` or `'superadmin'`.
3. **Privilege & Capability Guarding**:
   - Roles supported: `'user'`, `'moderator'`, `'admin'`, `'superadmin'`.
   - Admin access requires at least `'admin'` or `'superadmin'`.
   - Modifying `system_role` or creating an account with `'admin'`/`'superadmin'` requires `'superadmin'` role (`canAssignSuperadmin: true`).
   - Deleting a superadmin requires `'superadmin'`.
   - Self-deletion (`id === auth.admin.id`) is strictly forbidden.
4. **Audit Logging**:
   - All state-altering administrative mutations write immutable records to `public.admin_audit_logs` via `logAdminAction` (capturing `admin_id`, `action`, `target_table`, `target_id`, `changes_before`, `changes_after`, `ip_address`, `user_agent`). Audit log errors are non-blocking.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Auth | `GET /api/admin/auth/verify` | Validates admin caller identity, roles, and capability flags | Headers: `Authorization: Bearer <jwt>` or `x-admin-api-key: <key>` | `{ verified: true, admin: {...}, capabilities: {...} }` | 401 Unauthorized (missing/expired token), 403 Forbidden (not admin/superadmin), 429 (rate limit) | `adminAuth.ts`, `auth/verify/route.ts` |
| 2 | Metrics | `GET /api/admin/metrics` | Fetches aggregate system performance and business metrics | Auth header | `{ metrics: { totalUsers, newUsers24h, activeSubscriptions, totalRevenueCents, pendingReports, activeSpaces, todayAiMessages }, timestamp }` | 401/403 (auth), 500 (RPC failure) | `metrics/route.ts`, `supabase/schema.sql` (`get_admin_overview_metrics`) |
| 3 | Users | `GET /api/admin/users` | Lists users with pagination, text search, role/tier/status filter, and sorting | Query: `page`, `limit`, `search`, `sortBy`, `sortOrder`, `status`, `role`, `tier` | `{ users: Profile[], pagination: { page, limit, total, totalPages } }` | 400 (invalid query params), 401/403, 500 | `users/route.ts`, `schemas.ts` |
| 4 | Users | `POST /api/admin/users` | Provisions new user in auth and inserts profile record; superadmin check for admin role | Body: `CreateUserSchema` (email, password, username, displayName, gender, tier, systemRole, autoConfirm, hasAiCompanion) | `{ message, user: { id, email, profile } }` (201 Created) | 400 (validation fail or auth failure), 403 (non-superadmin assigning admin/superadmin), 429 | `users/route.ts`, `schemas.ts` |
| 5 | Users | `GET /api/admin/users/[id]` | Retrieves full user dossier (auth info, profile, subscription, AI usage, reports, spaces) | Path: `id` (UUID) | `{ user: { id, email, emailConfirmedAt, lastSignInAt, bannedUntil, profile, subscription, aiUsage, reports, spaces } }` | 404 (user not found), 401/403, 500 | `users/[id]/route.ts` |
| 6 | Users | `PATCH /api/admin/users/[id]` | Updates profile fields, optional password reset, and system role (superadmin required) | Path: `id`; Body: `UpdateUserSchema` (displayName, username, status, statusMessage, tier, isPaid, systemRole, password, hasAiCompanion) | `{ message, profile }` | 400 (validation fail / pwd err), 403 (unauthorized role escalation), 404 (not found), 500 | `users/[id]/route.ts`, `schemas.ts` |
| 7 | Users | `DELETE /api/admin/users/[id]` | Soft bans (status='banned', 100yr auth ban) or permanently deletes user | Path: `id`; Query: `mode=soft\|hard` (default 'soft') | `{ message }` | 403 (self-deletion or non-superadmin deleting superadmin), 404 (not found), 500 | `users/[id]/route.ts` |
| 8 | Payments | `GET /api/admin/payments/subscriptions` | Lists subscriptions with joined user profile details | Query: `page`, `limit`, `status`, `sortBy`, `sortOrder` | `{ subscriptions: SubscriptionWithProfile[], pagination: {...} }` | 400 (invalid query), 401/403, 500 | `payments/subscriptions/route.ts` |
| 9 | Payments | `PATCH /api/admin/payments/subscriptions` | Overrides subscription status and auto-syncs profile tier/is_paid/has_ai_companion | Body: `id` or `userId` + `status`, `planId`, `hasAiUnlimited`, `currentPeriodEnd`, `cancelAtPeriodEnd` | `{ message, subscription }` | 400 (missing id & userId or validation fail), 404 (sub not found), 500 | `payments/subscriptions/route.ts` |
| 10 | Payments | `GET /api/admin/payments/invoices` | Lists billing invoices with user profile info | Query: `page`, `limit`, `status`, `sortBy`, `sortOrder` | `{ invoices: InvoiceWithProfile[], pagination: {...} }` | 400 (invalid query), 401/403, 500 | `payments/invoices/route.ts` |
| 11 | Payments | `POST /api/admin/payments/invoices` | Manually records a billing invoice log entry | Body: `CreateInvoiceLogSchema` (userId, stripeInvoiceId, amountCents, currency, status, invoicePdf, paidAt) | `{ message, invoice }` (201 Created) | 400 (validation fail), 401/403, 500 | `payments/invoices/route.ts` |
| 12 | Logs | `GET /api/admin/logs` | Unified multi-category system log viewer | Query: `category` or `type` (`payments`, `admin_audit`, `space_audit`, `ai_usage`, `guest_security`, `reports`), `page`, `limit`, `startDate`, `endDate`, `search` | `{ category, logs: any[], pagination: {...} }` | 400 (invalid category or pagination params), 401/403, 500 | `logs/route.ts`, `schemas.ts` |
| 13 | CRUD | `GET /api/admin/crud/[entity]` | Dynamic table reader for 15 whitelisted entities with equality filters and sorting | Path: `entity`; Query: `page`, `limit`, `sortBy`, `sortOrder` + any column equality filters | `{ entity, records: any[], pagination: {...} }` | 400 (non-whitelisted entity), 401/403, 500 | `crud/[entity]/route.ts`, `schemas.ts` |
| 14 | CRUD | `POST /api/admin/crud/[entity]` | Inserts arbitrary valid JSON object record into whitelisted entity | Path: `entity`; Body: JSON object | `{ message, record }` (201 Created) | 400 (non-whitelisted entity, non-object body, DB constraint failure), 401/403, 500 | `crud/[entity]/route.ts` |
| 15 | CRUD | `GET /api/admin/crud/[entity]/[id]` | Fetches single record by ID from whitelisted entity | Path: `entity`, `id` | `{ entity, record }` | 400 (non-whitelisted entity), 404 (record not found), 500 | `crud/[entity]/[id]/route.ts` |
| 16 | CRUD | `PATCH /api/admin/crud/[entity]/[id]` | Updates record by ID, injecting `updated_at`, diffing before/after for audit log | Path: `entity`, `id`; Body: JSON object | `{ message, record }` | 400 (non-whitelisted entity, non-object body, DB error), 404 (record not found), 500 | `crud/[entity]/[id]/route.ts` |
| 17 | CRUD | `DELETE /api/admin/crud/[entity]/[id]` | Deletes record by ID from whitelisted entity with audit logging | Path: `entity`, `id` | `{ message }` | 400 (non-whitelisted entity), 404 (record not found), 500 | `crud/[entity]/[id]/route.ts` |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | `GET /api/admin/logs` (`guest_security`) | `category=guest_security` | Route attempts to filter `provisioned_at` and search `ip_address,guest_username`. The physical table `public.guest_provision_log` in `supabase/schema.sql` only has `(id, client_ip, created_at)`. Querying with date filters or search on this category may trigger Postgres column not found error unless aligned. |
| 2 | `GET /api/admin/crud/space_settings` | Default query (`sortBy=created_at`) | `space_settings` table has NO `created_at` column (only `updated_at`). Requesting with default `sortBy` causes database query error. Caller must pass `?sortBy=updated_at`. |
| 3 | `GET/PATCH/DELETE /api/admin/crud/space_settings/[id]` | Any `id` | `space_settings` table has `space_id` as primary key and does NOT have an `id` column. Route queries `.eq('id', id)`, triggering "column space_settings.id does not exist" error. |
| 4 | `PATCH /api/admin/crud/[entity]/[id]` | Entities without `updated_at` column | Route unconditionally appends `updated_at: new Date().toISOString()`. Entities like `worlds`, `space_members`, `space_roles`, `space_bans`, `space_mutes`, `space_playlists`, `playlist_tracks`, `world_objects`, and `billing_invoices` do not have an `updated_at` column in `database.types.ts`, which may cause Supabase/PostgREST update error. |
| 5 | `GET /api/admin/crud/space_members` | Default query (`sortBy=created_at`) | `space_members` does not have a `created_at` column (has `joined_at` and `last_seen_at`). Default sorting will fail unless `?sortBy=joined_at` is specified. |
| 6 | `DELETE /api/admin/users/[id]` | `id === auth.admin.id` | Returns `403 Forbidden` (`"You cannot delete your own account."`) regardless of soft or hard delete mode. |
| 7 | `DELETE /api/admin/users/[id]` | Target is `superadmin`, caller is `admin` | Returns `403 Forbidden` (`"Only a superadmin can remove another superadmin."`). |
| 8 | `POST /api/admin/users` | `systemRole: 'admin'` with non-superadmin caller | Returns `403 Forbidden` (`"Only a superadmin can provision accounts with admin privileges."`). |
| 9 | `PATCH /api/admin/users/[id]` | Updating `systemRole` with non-superadmin caller | Returns `403 Forbidden` (`"Only a superadmin can modify system roles."`). |
| 10 | `PATCH /api/admin/payments/subscriptions` | Status changed to `'active'` or `'canceled'` | Side effect: Automatically modifies `profiles` table. `'active'` sets `{ is_paid: true, tier: 'pro', has_ai_companion: true }`. `'canceled'` sets `{ is_paid: false, tier: 'free' }`. |
| 11 | `PATCH /api/admin/payments/subscriptions` | Body without `id` and without `userId` | Returns `400 Bad Request` (`"Either subscription id or userId is required."`). |
| 12 | `GET /api/admin/auth/verify` | Request with `x-admin-api-key` matching `ADMIN_SECRET_KEY` | Bypasses Supabase Auth and database lookup; returns synthetic admin context with `id: '00000000-0000-0000-0000-000000000000'`, `isMachineKey: true`, and all capabilities granted including `canAssignSuperadmin: true`. |
| 13 | Rate Limiting | 121st GET request within 60 seconds from same IP | Returns `429 Too Many Requests` with retry time header and JSON payload (`error: 'Rate limit exceeded'`). |
| 14 | Rate Limiting | 41st mutation (POST/PATCH/DELETE) within 60 seconds | Throttled under `ADMIN_MUTATION` rule (max 40) rather than `ADMIN_API` rule (max 120). |

---

## 2. Detailed Endpoint Specifications

### 2.1 Authentication & Authorization: `GET /api/admin/auth/verify`

- **HTTP Method**: `GET`
- **Rate Limit**: `ADMIN_API` (120 req / 60 sec)
- **Headers**:
  - Option A: `Authorization: Bearer <supabase_jwt_access_token>`
  - Option B: `X-Admin-Api-Key: <ADMIN_SECRET_KEY>`
- **Query Parameters**: None
- **Success Response (200 OK)**:
```json
{
  "verified": true,
  "admin": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "admin@teemchat.chat",
    "username": "admin_joe",
    "displayName": "Joe Admin",
    "systemRole": "admin",
    "isMachineKey": false
  },
  "capabilities": {
    "canManageUsers": true,
    "canViewPaymentLogs": true,
    "canViewSystemLogs": true,
    "canExecuteCrud": true,
    "canAssignSuperadmin": false
  }
}
```
*Note*: `canAssignSuperadmin` is `true` if and only if `systemRole === 'superadmin'`.

- **Error Responses**:
  - `401 Unauthorized`:
    ```json
    { "error": "Unauthorized", "message": "Missing or malformed Authorization header." }
    ```
    or
    ```json
    { "error": "Unauthorized", "message": "Invalid or expired administrative session token." }
    ```
  - `403 Forbidden`:
    ```json
    { "error": "Forbidden", "message": "Admin profile record not found." }
    ```
    or
    ```json
    { "error": "Forbidden", "message": "Insufficient administrative privileges. Access denied." }
    ```
  - `429 Too Many Requests`:
    ```json
    {
      "error": "Rate limit exceeded",
      "message": "Too many requests to admin interface. Please wait 45 seconds.",
      "retryAfter": 45
    }
    ```

---

### 2.2 System Overview Metrics: `GET /api/admin/metrics`

- **HTTP Method**: `GET`
- **Rate Limit**: `ADMIN_API` (120 req / 60 sec)
- **Authentication**: Admin or Superadmin
- **Backend Data Source**: Supabase RPC `public.get_admin_overview_metrics()`
- **Success Response (200 OK)**:
```json
{
  "metrics": {
    "totalUsers": 1284,
    "newUsers24h": 37,
    "activeSubscriptions": 89,
    "totalRevenueCents": 178500,
    "pendingReports": 3,
    "activeSpaces": 42,
    "todayAiMessages": 312
  },
  "timestamp": "2026-11-05T22:15:00.000Z"
}
```
- **Error Responses**:
  - `401/403/429`: Standard admin authentication errors.
  - `500 Internal Server Error`:
    ```json
    { "error": "Failed to retrieve metrics", "message": "RPC execution failed" }
    ```

---

### 2.3 User Management

#### 2.3.1 List Users: `GET /api/admin/users`
- **HTTP Method**: `GET`
- **Query Parameters**:
  - `page` (optional integer >= 1, default `1`)
  - `limit` (optional integer 1..100, default `20`)
  - `search` (optional string): Case-insensitive ILIKE search against `username` and `display_name`.
  - `sortBy` (optional string): Must be one of `['created_at', 'username', 'display_name', 'status', 'tier', 'system_role']` (defaults to `'created_at'`).
  - `sortOrder` (optional enum: `'asc' | 'desc'`, default `'desc'`)
  - `status` (optional string): Filter by user presence status (`'available'`, `'away'`, `'busy'`, `'offline'`, `'banned'`).
  - `role` (optional enum: `'user' | 'moderator' | 'admin' | 'superadmin'`)
  - `tier` (optional string: `'free'`, `'pro'`, `'enterprise'`)
- **Success Response (200 OK)**:
```json
{
  "users": [
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "username": "player_one",
      "display_name": "Player One",
      "status": "available",
      "status_message": "Chilling in the lounge",
      "gender": "male",
      "tier": "pro",
      "is_paid": true,
      "system_role": "user",
      "has_ai_companion": true,
      "created_at": "2026-10-15T08:30:00Z",
      "updated_at": "2026-11-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1284,
    "totalPages": 65
  }
}
```

#### 2.3.2 Create User: `POST /api/admin/users`
- **HTTP Method**: `POST`
- **Rate Limit**: `ADMIN_MUTATION` (40 req / 60 sec)
- **Privilege Requirement**: Regular Admin can create `'user'` or `'moderator'`. Only **Superadmin** can create `'admin'` or `'superadmin'`.
- **Request Body (JSON)**:
```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "username": "newbie",
  "displayName": "New Explorer",
  "gender": "male",
  "tier": "pro",
  "systemRole": "user",
  "autoConfirm": true,
  "hasAiCompanion": false
}
```
*Validation Rules*:
- `email`: Valid email format (required)
- `password`: Minimum 8 characters (required)
- `username`: 3-30 chars, alphanumeric with `_`, `-`, `.` (optional, defaults to email username)
- `displayName`: 1-50 chars (default `'Explorer'`)
- `gender`: `'male' | 'female'` (default `'male'`)
- `tier`: `'free' | 'pro' | 'enterprise'` (default `'free'`)
- `systemRole`: `'user' | 'moderator' | 'admin' | 'superadmin'` (default `'user'`)
- `autoConfirm`: boolean (default `true`)
- `hasAiCompanion`: boolean (default `false`)
- **Success Response (201 Created)**:
```json
{
  "message": "User created successfully",
  "user": {
    "id": "33333333-3333-3333-3333-333333333333",
    "email": "newuser@example.com",
    "profile": {
      "id": "33333333-3333-3333-3333-333333333333",
      "username": "newbie",
      "display_name": "New Explorer",
      "tier": "pro",
      "system_role": "user"
    }
  }
}
```

#### 2.3.3 Get User Dossier: `GET /api/admin/users/[id]`
- **HTTP Method**: `GET`
- **Path Parameter**: `id` (UUID of the user)
- **Success Response (200 OK)**:
```json
{
  "user": {
    "id": "22222222-2222-2222-2222-222222222222",
    "email": "target@example.com",
    "emailConfirmedAt": "2026-10-15T08:35:00Z",
    "lastSignInAt": "2026-11-05T14:10:00Z",
    "bannedUntil": null,
    "profile": {
      "id": "22222222-2222-2222-2222-222222222222",
      "username": "player_one",
      "display_name": "Player One",
      "status": "available",
      "status_message": "Chilling",
      "gender": "male",
      "tier": "pro",
      "is_paid": true,
      "system_role": "user",
      "has_ai_companion": true,
      "avatar_config": {},
      "created_at": "2026-10-15T08:30:00Z",
      "updated_at": "2026-11-01T12:00:00Z"
    },
    "subscription": {
      "id": "sub-123",
      "user_id": "22222222-2222-2222-2222-222222222222",
      "plan_id": "pro_monthly",
      "status": "active",
      "current_period_end": "2026-12-01T00:00:00Z",
      "cancel_at_period_end": false,
      "has_ai_unlimited": true
    },
    "aiUsage": [
      {
        "id": "ai-1",
        "user_id": "22222222-2222-2222-2222-222222222222",
        "usage_date": "2026-11-05",
        "message_count": 14,
        "max_daily_messages": 100
      }
    ],
    "reports": {
      "total": 0,
      "items": []
    },
    "spaces": {
      "total": 2,
      "memberships": [
        { "space_id": "space-uuid-1", "role": "admin", "joined_at": "2026-10-16T10:00:00Z" }
      ]
    }
  }
}
```

#### 2.3.4 Update User: `PATCH /api/admin/users/[id]`
- **HTTP Method**: `PATCH`
- **Rate Limit**: `ADMIN_MUTATION` (40 req / 60 sec)
- **Path Parameter**: `id`
- **Request Body (JSON)**:
```json
{
  "displayName": "Renamed Player",
  "username": "player_renamed",
  "status": "away",
  "statusMessage": "In a meeting",
  "tier": "enterprise",
  "isPaid": true,
  "systemRole": "moderator",
  "password": "NewSecurePassword456!",
  "hasAiCompanion": true
}
```
*Validation & Guard Rules*:
- Modifying `systemRole` to any value different from current requires caller to be `superadmin` (403 otherwise).
- Providing `password` triggers `auth.admin.updateUserById(id, { password })`.
- Records audit action `update_user` with full before/after diff.
- **Success Response (200 OK)**:
```json
{
  "message": "User updated successfully",
  "profile": { ...updatedProfileRecord }
}
```

#### 2.3.5 Delete / Suspend User: `DELETE /api/admin/users/[id]`
- **HTTP Method**: `DELETE`
- **Rate Limit**: `ADMIN_MUTATION` (40 req / 60 sec)
- **Path Parameter**: `id`
- **Query Parameters**:
  - `mode` (`'soft' | 'hard'`, default `'soft'`)
- **Behavior**:
  - Self-deletion forbidden (403).
  - Deleting a superadmin requires caller to be superadmin (403).
  - **`mode=soft`**: Updates profile `status='banned'`, `status_message='Account suspended by administrator'`, calls Supabase Auth `updateUserById(id, { ban_duration: '876000h' })`, audit log action `suspend_user`.
  - **`mode=hard`**: Calls Supabase Auth `deleteUser(id)` (permanent cascade deletion), audit log action `delete_user_hard`.
- **Success Response (200 OK)**:
```json
{ "message": "User suspended successfully (soft ban)." }
```
or
```json
{ "message": "User permanently deleted." }
```

---

### 2.4 Payments & Subscriptions

#### 2.4.1 List Subscriptions: `GET /api/admin/payments/subscriptions`
- **HTTP Method**: `GET`
- **Query Parameters**:
  - `page` (default `1`)
  - `limit` (default `20`, max `100`)
  - `status` (optional: `'active' | 'trialing' | 'past_due' | 'canceled'`)
  - `sortBy` (optional: `'created_at' | 'updated_at' | 'status' | 'current_period_end'`, default `'created_at'`)
  - `sortOrder` (`'asc' | 'desc'`, default `'desc'`)
- **Success Response (200 OK)**:
```json
{
  "subscriptions": [
    {
      "id": "44444444-4444-4444-4444-444444444444",
      "user_id": "33333333-3333-3333-3333-333333333333",
      "plan_id": "ai_unlimited_monthly",
      "status": "active",
      "current_period_start": "2026-11-01T00:00:00Z",
      "current_period_end": "2026-12-01T00:00:00Z",
      "cancel_at_period_end": false,
      "has_ai_unlimited": true,
      "stripe_customer_id": "cus_12345",
      "stripe_subscription_id": "sub_12345",
      "metadata": {},
      "created_at": "2026-11-01T00:00:00Z",
      "updated_at": "2026-11-01T00:00:00Z",
      "profiles": {
        "id": "33333333-3333-3333-3333-333333333333",
        "username": "paying_user",
        "display_name": "Paying User",
        "tier": "pro",
        "system_role": "user"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 89,
    "totalPages": 5
  }
}
```

#### 2.4.2 Override Subscription: `PATCH /api/admin/payments/subscriptions`
- **HTTP Method**: `PATCH`
- **Rate Limit**: `ADMIN_MUTATION` (40 req / 60 sec)
- **Request Body (JSON)**:
```json
{
  "id": "44444444-4444-4444-4444-444444444444",
  "status": "canceled",
  "planId": "pro_monthly",
  "hasAiUnlimited": false,
  "currentPeriodEnd": "2026-12-01T00:00:00Z",
  "cancelAtPeriodEnd": true
}
```
*Note*: Either `id` or `userId` is required. `status` is required (`'active' | 'trialing' | 'past_due' | 'canceled'`).
- **Profile Synchronization**:
  - If status becomes `'active'`: updates `profiles` to `{ is_paid: true, tier: 'pro', has_ai_companion: true }`.
  - If status becomes `'canceled'`: updates `profiles` to `{ is_paid: false, tier: 'free' }`.
- **Success Response (200 OK)**:
```json
{
  "message": "Subscription updated successfully",
  "subscription": { ...updatedSubscription }
}
```

#### 2.4.3 List Invoices: `GET /api/admin/payments/invoices`
- **HTTP Method**: `GET`
- **Query Parameters**:
  - `page` (default `1`)
  - `limit` (default `20`, max `100`)
  - `status` (optional: `'paid' | 'open' | 'void' | 'uncollectible'`)
  - `sortBy` (optional: `'created_at' | 'amount_cents' | 'paid_at' | 'status'`, default `'created_at'`)
  - `sortOrder` (`'asc' | 'desc'`, default `'desc'`)
- **Success Response (200 OK)**:
```json
{
  "invoices": [
    {
      "id": "inv-001",
      "user_id": "33333333-3333-3333-3333-333333333333",
      "stripe_invoice_id": "in_12345",
      "amount_cents": 1500,
      "currency": "usd",
      "status": "paid",
      "invoice_pdf": "https://stripe.com/invoice.pdf",
      "paid_at": "2026-11-01T12:00:00Z",
      "created_at": "2026-11-01T12:00:00Z",
      "profiles": {
        "id": "33333333-3333-3333-3333-333333333333",
        "username": "paying_user",
        "display_name": "Paying User"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 142, "totalPages": 8 }
}
```

#### 2.4.4 Create Invoice Log: `POST /api/admin/payments/invoices`
- **HTTP Method**: `POST`
- **Rate Limit**: `ADMIN_MUTATION` (40 req / 60 sec)
- **Request Body (JSON)**:
```json
{
  "userId": "33333333-3333-3333-3333-333333333333",
  "stripeInvoiceId": "in_manual_999",
  "amountCents": 2500,
  "currency": "usd",
  "status": "paid",
  "invoicePdf": "https://example.com/receipt.pdf",
  "paidAt": "2026-11-05T20:00:00Z"
}
```
*Validation*:
- `userId`: Valid UUID regex (required)
- `amountCents`: integer >= 0 (required)
- `currency`: string (default `'usd'`)
- `status`: `'paid' | 'open' | 'void' | 'uncollectible'` (default `'paid'`)
- `invoicePdf`: optional valid URL
- `paidAt`: optional ISO datetime (defaults to current timestamp if status is `'paid'`)
- **Success Response (201 Created)**:
```json
{
  "message": "Invoice log created",
  "invoice": { ...newInvoiceRecord }
}
```

---

### 2.5 Multi-Category System Logs: `GET /api/admin/logs`

- **HTTP Method**: `GET`
- **Rate Limit**: `ADMIN_API` (120 req / 60 sec)
- **Query Parameters**:
  - `category` or `type` (required, defaults to `'admin_audit'`). Valid values:
    - `'payments'` (Queries `public.billing_invoices`)
    - `'admin_audit'` (Queries `public.admin_audit_logs`)
    - `'space_audit'` (Queries `public.space_audit_logs`)
    - `'ai_usage'` (Queries `public.ai_usage`)
    - `'guest_security'` (Queries `public.guest_provision_log`)
    - `'reports'` (Queries `public.user_reports`)
  - `page` (default `1`)
  - `limit` (default `20`, max `100`)
  - `startDate` (ISO string for timestamp filtering)
  - `endDate` (ISO string for timestamp filtering)
  - `search` (Search term for ILIKE matching)
- **Filtering by Category**:
  1. `payments`: Filters `created_at` between dates; searches `stripe_invoice_id` and `status`; joins `profiles:user_id(username, display_name)`.
  2. `admin_audit`: Filters `created_at` between dates; searches `action`, `target_table`, `target_id`; joins `admin:admin_id(username, display_name)`.
  3. `space_audit`: Filters `created_at` between dates; searches `action`, `target_type`; joins `actor:actor_id(username, display_name)` and `space:space_id(name)`.
  4. `ai_usage`: Filters `usage_date` between dates; joins `profiles:user_id(username, display_name, tier)`. *(Note: no text search)*.
  5. `guest_security`: Filters `provisioned_at` between dates; searches `ip_address`, `guest_username`. *(See Edge Case #1)*.
  6. `reports`: Filters `created_at` between dates; searches `reason`, `status`; joins `reporter:reporter_id(username, display_name)` and `reported:reported_user_id(username, display_name)`.
- **Success Response (200 OK)**:
```json
{
  "category": "admin_audit",
  "logs": [
    {
      "id": "log-001",
      "admin_id": "11111111-1111-1111-1111-111111111111",
      "action": "update_user",
      "target_table": "profiles",
      "target_id": "22222222-2222-2222-2222-222222222222",
      "changes_before": { "status": "available" },
      "changes_after": { "status": "busy" },
      "ip_address": "198.51.100.5",
      "user_agent": "Mozilla/5.0 ...",
      "created_at": "2026-11-05T18:00:00Z",
      "admin": {
        "username": "admin_joe",
        "display_name": "Joe Admin"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 54,
    "totalPages": 3
  }
}
```

---

### 2.6 Database CRUD Explorer

Governed by `WHITELISTED_CRUD_ENTITIES` in `schemas.ts`:
```ts
export const WHITELISTED_CRUD_ENTITIES = [
  'spaces',
  'worlds',
  'space_settings',
  'space_members',
  'space_roles',
  'user_reports',
  'space_bans',
  'space_mutes',
  'ai_companions',
  'companion_memories',
  'space_playlists',
  'playlist_tracks',
  'world_objects',
  'billing_invoices',
  'user_subscriptions',
] as const;
```

#### 2.6.1 List Entity Records: `GET /api/admin/crud/[entity]`
- **HTTP Method**: `GET`
- **Path Parameter**: `entity` (must be in `WHITELISTED_CRUD_ENTITIES`)
- **Query Parameters**:
  - `page` (default `1`)
  - `limit` (default `20`, max `100`)
  - `sortBy` (default `'created_at'`)
  - `sortOrder` (`'asc' | 'desc'`, default `'desc'`)
  - *Dynamic column equality filters*: Any query parameters other than `page`, `limit`, `sortBy`, `sortOrder`, `search` are automatically applied as `.eq(key, value)` (e.g., `?space_id=xxx&is_active=true`).
- **Success Response (200 OK)**:
```json
{
  "entity": "spaces",
  "records": [ ...rows ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

#### 2.6.2 Create Entity Record: `POST /api/admin/crud/[entity]`
- **HTTP Method**: `POST`
- **Rate Limit**: `ADMIN_MUTATION` (40 req / 60 sec)
- **Path Parameter**: `entity`
- **Request Body (JSON)**: Valid JSON object with columns for table.
- **Audit Action**: `crud_create_[entity]`
- **Success Response (201 Created)**:
```json
{
  "message": "Record created in spaces",
  "record": { "id": "uuid", "name": "Created Item", ... }
}
```

#### 2.6.3 Get Entity Record: `GET /api/admin/crud/[entity]/[id]`
- **HTTP Method**: `GET`
- **Path Parameters**: `entity`, `id`
- **Success Response (200 OK)**:
```json
{
  "entity": "spaces",
  "record": { "id": "uuid", ... }
}
```

#### 2.6.4 Update Entity Record: `PATCH /api/admin/crud/[entity]/[id]`
- **HTTP Method**: `PATCH`
- **Rate Limit**: `ADMIN_MUTATION` (40 req / 60 sec)
- **Path Parameters**: `entity`, `id`
- **Request Body (JSON)**: Object with fields to modify.
- **Audit Action**: `crud_update_[entity]` with diff.
- **Success Response (200 OK)**:
```json
{
  "message": "Record in spaces updated successfully.",
  "record": { ...updatedRecord }
}
```

#### 2.6.5 Delete Entity Record: `DELETE /api/admin/crud/[entity]/[id]`
- **HTTP Method**: `DELETE`
- **Rate Limit**: `ADMIN_MUTATION` (40 req / 60 sec)
- **Path Parameters**: `entity`, `id`
- **Audit Action**: `crud_delete_[entity]`
- **Success Response (200 OK)**:
```json
{
  "message": "Record uuid in spaces deleted successfully."
}
```

---

## 3. Whitelisted Entities Schema Matrix

The following table details the 15 whitelisted CRUD entities, their primary keys, timestamp fields, and specific implementation considerations for UI builders:

| Entity Name | Primary Key | Created At? | Updated At? | Key Columns | Implementation Caveat / Note |
|---|---|---|---|---|---|
| `spaces` | `id` (UUID) | `created_at` | `updated_at` | `name`, `slug`, `category`, `visibility`, `tier`, `max_capacity`, `member_count`, `map_theme`, `is_active`, `owner_id` | Standard CRUD operations fully supported. |
| `worlds` | `id` (UUID) | `created_at` | **NO** | `name`, `slug`, `description`, `visibility`, `created_by` | Lacks `updated_at` column; PATCH route appends `updated_at`, which PostgREST may reject unless handled. |
| `space_settings` | **`space_id`** (UUID) | **NO** | `updated_at` | `space_id`, `default_spawn_x`, `default_spawn_y`, `allow_guest_chat`, `allow_screen_share`, `max_audio_bitrate`, `background_music_volume`, `welcome_message` | **Has NO `id` column!** `GET/PATCH/DELETE /[entity]/[id]` queries `.eq('id', id)` which errors on `space_settings`. Must be sorted by `?sortBy=updated_at`. |
| `space_members` | `id` (UUID) | **NO** | **NO** | `space_id`, `user_id`, `role`, `role_id`, `is_pinned`, `joined_at`, `last_seen_at` | Uses `joined_at` rather than `created_at`. Lacks `updated_at`. Must specify `?sortBy=joined_at`. |
| `space_roles` | `id` (UUID) | `created_at` | **NO** | `space_id`, `name`, `color`, `priority`, `is_default`, `permissions` (JSON) | Lacks `updated_at`. |
| `user_reports` | `id` (UUID) | `created_at` | `updated_at` | `reporter_id`, `reported_user_id`, `space_id`, `room_id`, `reason`, `details`, `status`, `resolved_by` | Supports filtering by `status` (`'pending'`, `'resolved'`, `'dismissed'`). |
| `space_bans` | `id` (UUID) | `created_at` | **NO** | `space_id`, `user_id`, `banned_by`, `reason`, `expires_at` | Lacks `updated_at`. |
| `space_mutes` | `id` (UUID) | `created_at` | **NO** | `space_id`, `user_id`, `muted_by`, `mute_type`, `reason`, `expires_at` | Lacks `updated_at`. |
| `ai_companions` | `id` (UUID) | `created_at` | `updated_at` | `user_id`, `name`, `avatar_style`, `companion_type`, `persona`, `is_active`, `learned_context` (JSON) | Standard CRUD supported. |
| `companion_memories`| `id` (UUID) | `created_at` | `updated_at` | `companion_id`, `user_id`, `category`, `memory_key`, `memory_value`, `importance_score`, `embedding` | Standard CRUD supported. |
| `space_playlists` | `id` (UUID) | `created_at` | **NO** | `space_id`, `title`, `artist`, `audio_url`, `duration_seconds`, `order_index`, `is_active`, `created_by` | Lacks `updated_at`. |
| `playlist_tracks` | `id` (UUID) | `created_at` | **NO** | `playlist_id`, `title`, `artist`, `audio_url`, `duration_seconds`, `order_index`, `is_active`, `created_by` | Lacks `updated_at`. |
| `world_objects` | `id` (UUID) | `created_at` | **NO** | `space_id`, `object_type`, `x`, `y`, `rotation`, `properties` (JSON), `placed_by` | Lacks `updated_at`. |
| `billing_invoices` | `id` (UUID) | `created_at` | **NO** | `user_id`, `stripe_invoice_id`, `amount_cents`, `currency`, `status`, `invoice_pdf`, `paid_at` | Lacks `updated_at`. |
| `user_subscriptions`| `id` (UUID) | `created_at` | `updated_at` | `user_id`, `plan_id`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `has_ai_unlimited`, `metadata` | Standard CRUD supported. |

---

## 4. UI Recommendations for Admin Dashboard Frontend

1. **Authentication Mount & Capability Gate**:
   - Call `GET /api/admin/auth/verify` on component mount (`/admin/page.tsx`).
   - If response is 401/403, render an "Access Denied" Neo-brutal card with clear instructions and return early.
   - Cache capability flags in component state or session store. Disable or hide the "Superadmin" user creation role option if `capabilities.canAssignSuperadmin === false`.
2. **Overview Tab**:
   - Query `GET /api/admin/metrics` on tab activation with a manual refresh button.
   - Display cards for Total Users, 24h New Users, Active Subscriptions, Total Revenue (formatted as currency: `$${(totalRevenueCents / 100).toFixed(2)}`), Pending Reports, Active Spaces, and Today's AI Messages.
3. **Users Tab**:
   - Table displaying `username`, `display_name`, `tier`, `status`, `system_role`, `is_paid`, and `created_at`.
   - Filters: search input (debounced), role dropdown, tier dropdown, status dropdown.
   - Action buttons: "Inspect" (loads modal calling `GET /api/admin/users/[id]`), "Edit" (calls `PATCH /api/admin/users/[id]`), "Suspend/Delete" (modal with soft ban toggle calling `DELETE /api/admin/users/[id]?mode=soft|hard`).
   - "New User" button opening modal calling `POST /api/admin/users`.
4. **Payments Tab**:
   - Two sub-sections / toggle: "Subscriptions" and "Invoices".
   - Subscriptions table calling `GET /api/admin/payments/subscriptions` with status override modal calling `PATCH /api/admin/payments/subscriptions`.
   - Invoices table calling `GET /api/admin/payments/invoices` with "Record Invoice" modal calling `POST /api/admin/payments/invoices`.
5. **Logs Tab**:
   - Category selector pills (`admin_audit`, `payments`, `space_audit`, `ai_usage`, `guest_security`, `reports`).
   - Date range picker (`startDate`, `endDate`) and search bar.
   - Dynamic table columns adapting to the selected log category.
6. **CRUD Explorer Tab**:
   - Entity selector dropdown listing all 15 whitelisted entities.
   - For `space_settings`: automatically pass `sortBy=updated_at` and disable row-level `[id]` view/delete unless handled by entity-specific mapper.
   - For `space_members`: automatically pass `sortBy=joined_at`.
   - Table of records with JSON viewer modal for complex columns (`permissions`, `properties`, `metadata`, `learned_context`).
   - "Create Record" modal providing dynamic form or raw JSON editor.
