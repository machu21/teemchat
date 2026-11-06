# Handoff Report — Existing Test Suites & Test Gap Analysis

**Author**: `survey_explorer_2`  
**Working Directory**: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_2\`  
**Target Milestone**: Admin Dashboard Test Suite & Gap Analysis  
**Date**: 2026-11-06T03:18:00Z  

---

## 1. Observation

### 1.1 Test Runner & Environment
- **Configuration File**: `next-app/vitest.config.mts` uses `environment: 'node'` and `@` path alias mapped to `./src`.
- **Command & Status**:
  Command executed: `cd next-app; npx vitest run tests/api/admin_ tests/admin_`
  Result: **9 test files passed, 178 tests passed, 0 failures, duration 3.01s**.
  - `tests/admin_client.test.ts` (36 tests)
  - `tests/admin_stress.test.ts` (36 tests)
  - `tests/admin_adversarial_guard.test.ts` (49 tests)
  - `tests/api/admin_auth.test.ts` (7 tests)
  - `tests/api/admin_logs.test.ts` (7 tests)
  - `tests/api/admin_payments.test.ts` (4 tests)
  - `tests/api/admin_users.test.ts` (9 tests)
  - `tests/api/admin_crud.test.ts` (6 tests)
  - `tests/admin_guard.test.ts` (24 tests)

---

### 1.2 Inventory of Admin Endpoints vs Existing Test Files

| Route Handler File | HTTP Methods | Existing Route Test File | Route Tests Count | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `src/app/api/admin/auth/verify/route.ts` | `GET` | `tests/api/admin_auth.test.ts` | 7 | Auth verification & rate limiting tested |
| `src/app/api/admin/metrics/route.ts` | `GET` | **NONE** | **0** | **Completely missing test file** |
| `src/app/api/admin/users/route.ts` | `GET`, `POST` | `tests/api/admin_users.test.ts` | 4 | List (1), Create (3) |
| `src/app/api/admin/users/[id]/route.ts` | `GET`, `PATCH`, `DELETE` | `tests/api/admin_users.test.ts` | 5 | Get (1), Patch (1), Delete (3) |
| `src/app/api/admin/payments/subscriptions/route.ts` | `GET`, `PATCH` | `tests/api/admin_payments.test.ts` | 2 | List (1), Update (1) |
| `src/app/api/admin/payments/invoices/route.ts` | `GET`, `POST` | `tests/api/admin_payments.test.ts` | 2 | List (1), Create (1) |
| `src/app/api/admin/logs/route.ts` | `GET` | `tests/api/admin_logs.test.ts` | 7 | 6 category tests + 1 invalid category |
| `src/app/api/admin/crud/[entity]/route.ts` | `GET`, `POST` | `tests/api/admin_crud.test.ts` | 3 | Reject invalid entity (1), List spaces (1), Create space (1) |
| `src/app/api/admin/crud/[entity]/[id]/route.ts` | `GET`, `PATCH`, `DELETE` | `tests/api/admin_crud.test.ts` | 3 | Get space (1), Patch space (1), Delete space (1) |

---

### 1.3 Detailed Endpoint-by-Endpoint Observations

#### A. `/api/admin/auth/verify` (`tests/api/admin_auth.test.ts`)
- **Directly Observed Tests**:
  - Line 54: Rejects missing Authorization / API key with 401.
  - Line 63: Rejects invalid or expired tokens with 401.
  - Line 74: Rejects ordinary users (`system_role = 'user'`) with 403.
  - Line 100: Accepts admin (`system_role = 'admin'`) with 200 and capability flags (`canAssignSuperadmin: false`).
  - Line 128: Accepts superadmin (`system_role = 'superadmin'`) with 200 and `canAssignSuperadmin: true`.
  - Line 155: Accepts `x-admin-api-key` matching `ADMIN_SECRET_KEY` with 200 (`isMachineKey: true`).
  - Line 166: Enforces rate limiting at 120 calls with 429 response.
- **Missing Verifications**:
  - `system_role = 'moderator'` rejection with 403 (moderator role is defined in enum in `supabase/migrations/20261109_admin_dashboard_backend.sql:13` but not tested).
  - Malformed Authorization headers (e.g. `Basic ...`, `Bearer ` with empty token, tokens with invalid UTF-8).
  - Invalid machine API key (e.g. `x-admin-api-key: wrong-key` -> must reject with 401, not accept).
  - Behavior when `ADMIN_SECRET_KEY` is undefined on server.
  - Database error handling when fetching profile from Supabase.

#### B. `/api/admin/metrics` (`src/app/api/admin/metrics/route.ts`)
- **Directly Observed**:
  - File exists at `next-app/src/app/api/admin/metrics/route.ts` (lines 1-29).
  - Invokes `verifyAdminRequest(req)` at line 5.
  - Invokes RPC `auth.supabaseAdmin.rpc('get_admin_overview_metrics')` at line 9.
  - Returns 500 `{ error: 'Failed to retrieve metrics', message: error.message }` on RPC error.
  - Returns 200 with `{ metrics: data, timestamp: ... }` on success.
- **Coverage Status**:
  - **NO TEST FILE EXISTS** in `next-app/tests/api/`.
  - While `tests/admin_client.test.ts` tests client-side `AdminClientService.getMetrics` with mock `fetch`, the actual Next.js route handler function `GET` has **ZERO automated tests**.

#### C. `/api/admin/users` & `/api/admin/users/[id]` (`tests/api/admin_users.test.ts`)
- **Directly Observed Tests**:
  - Line 131: `GET /api/admin/users` returns paginated list of users (1 test).
  - Line 149: `POST /api/admin/users` creates user with auto-confirmation and provisions profile (superadmin).
  - Line 197: `POST /api/admin/users` rejects invalid email/password with 400.
  - Line 220: `POST /api/admin/users` prevents regular admin from creating admin or superadmin (403).
  - Line 245: `GET /api/admin/users/[id]` returns user dossier (1 test).
  - Line 265: `PATCH /api/admin/users/[id]` updates user profile (1 test).
  - Line 290: `DELETE /api/admin/users/[id]` prevents self-deletion (403).
  - Line 307: `DELETE /api/admin/users/[id]` performs soft ban by default (200).
  - Line 324: `DELETE /api/admin/users/[id]?mode=hard` calls `deleteUser` (200).
- **Missing Verifications & Vulnerabilities**:
  - **Zero Security/RBAC Tests on Individual Endpoints**: Neither `GET /api/admin/users`, `POST`, `GET [id]`, `PATCH [id]`, nor `DELETE [id]` test unauthenticated (401) or non-admin (403) rejection!
  - **Critical Privilege Escalation Gap in PATCH (`users/[id]/route.ts`)**:
    In `DELETE [id]`, lines 224-229 explicitly check:
    ```ts
    if (targetProfile.system_role === 'superadmin' && auth.admin.systemRole !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden', message: 'Only a superadmin can remove another superadmin.' }, { status: 403 });
    }
    ```
    However, in `PATCH [id]` (lines 84-196), there is **NO check** stopping a regular admin from modifying a superadmin account or resetting a superadmin's password (`password` parameter at lines 134-140)! A regular admin could reset a superadmin's password and take over their account. This is completely untested.
  - **Privilege Escalation on system_role in PATCH**: Line 124 of `users/[id]/route.ts` checks `if (systemRole && systemRole !== currentProfile.system_role && auth.admin.systemRole !== 'superadmin') return 403;` — this check is NEVER tested in `admin_users.test.ts`.
  - **404 Not Found Handling**: Neither `GET [id]`, `PATCH [id]`, nor `DELETE [id]` test target user not found (404).
  - **Query Validation & Filtering**: GET does not test invalid query parameters (e.g. `limit > 100`), nor filtering by `status`, `role`, `tier`, or `search`.
  - **Search Sanitization**: `users/route.ts:31` uses `.or('username.ilike.%${search}%,display_name.ilike.%${search}%')`. Unsanitized search containing commas or PostgREST operators is untested.
  - **Auth Admin Failures**: Neither `createUser` failure (e.g. duplicate email) nor `updateUserById` failure (e.g. weak password) is tested for 400 response handling.
  - **Audit Logging Assertions**: Line 106 mocks `admin_audit_logs.insert`, but **zero assertions** verify that `logAdminAction` was called with correct action, targetTable, targetId, or payload!

#### D. `/api/admin/payments/subscriptions` & `/invoices` (`tests/api/admin_payments.test.ts`)
- **Directly Observed Tests**:
  - Line 152: `GET /api/admin/payments/subscriptions` returns subscription list (1 test).
  - Line 165: `PATCH /api/admin/payments/subscriptions` overrides subscription status (1 test).
  - Line 189: `GET /api/admin/payments/invoices` returns invoices payment log (1 test).
  - Line 202: `POST /api/admin/payments/invoices` creates invoice log entry (1 test).
- **Missing Verifications**:
  - **Total of only 4 tests**.
  - **Zero 401/403 Tests**: Unauthenticated and non-admin access is never tested on either route.
  - **PATCH Subscription Bad Request (400)**: Line 66 in `subscriptions/route.ts` requires `id` or `userId`. Missing both is never tested.
  - **PATCH Subscription Validation Failure (400)**: Invalid `status` or malformed body is never tested.
  - **PATCH Subscription Not Found (404)**: Non-existent subscription ID is never tested.
  - **Profile Synchronization Side Effects**: `subscriptions/route.ts:120-130` updates `profiles` to `tier: 'pro', is_paid: true` when `status === 'active'`, and `tier: 'free', is_paid: false` when `status === 'canceled'`. Neither state transition is verified in tests.
  - **POST Invoice Validation Failure (400)**: Non-UUID `userId`, negative `amountCents`, invalid `status`, or invalid `invoicePdf` URL are never tested.
  - **Audit Logging Assertions**: Neither `subscription_override` nor `create_invoice_log` audit entries are asserted.

#### E. `/api/admin/logs` (`tests/api/admin_logs.test.ts`)
- **Directly Observed Tests**:
  - Line 70: Loops over 6 categories (`payments`, `admin_audit`, `space_audit`, `ai_usage`, `guest_security`, `reports`) to verify 200 response (6 tests).
  - Line 88: Rejects unrecognized log categories with 400 (1 test).
- **Missing Verifications**:
  - **Zero 401/403 Tests**: Unauthenticated / non-admin access is never tested.
  - **Default Category**: Line 11 in `logs/route.ts` defaults to `admin_audit` when `category` and `type` are omitted. Untested.
  - **Date Range Filters**: `startDate` (`gte`) and `endDate` (`lte`) query filtering is untested.
  - **Search Filtering**: `search` parameter application across categories is untested.
  - **Pagination Validation (400)**: Malformed pagination params (`limit > 100`, negative page) are untested.
  - **Database Error (500)**: Supabase query throwing an error is untested.

#### F. `/api/admin/crud/[entity]` & `[entity]/[id]` (`tests/api/admin_crud.test.ts`)
- **Directly Observed Tests**:
  - Line 103: Rejects access to non-whitelisted entity (`auth_users`) with 400.
  - Line 116: Reads paginated collection for whitelisted entity (`spaces`).
  - Line 130: Creates record in whitelisted entity (`spaces`).
  - Line 149: Reads single record by ID (`spaces`).
  - Line 161: Updates record by ID (`spaces`).
  - Line 180: Deletes record by ID (`spaces`).
- **Critical Code Flaw & Gap Observed**:
  - **Primary Key Mismatch in `crud/[entity]/[id]/route.ts`**:
    In `supabase/schema.sql:1503` and `supabase/migrations/20261015_production_3nf_schema_normalization.sql:122`:
    ```sql
    create table if not exists public.space_settings (
      space_id uuid references public.spaces(id) on delete cascade primary key,
      ...
    );
    ```
    `space_settings` has **no `id` column**; its primary key is `space_id`.
    However, `crud/[entity]/[id]/route.ts` hardcodes:
    - Line 30: `.eq('id', id)` (GET)
    - Line 71: `.eq('id', id)` (PATCH)
    - Line 81: `.eq('id', id)` (PATCH)
    - Line 131: `.eq('id', id)` (DELETE)
    - Line 140: `.eq('id', id)` (DELETE)
    Calling `GET/PATCH/DELETE /api/admin/crud/space_settings/<space_id>` will crash with `column space_settings.id does not exist`. Because `admin_crud.test.ts` only tested `spaces`, this fatal defect was never caught.
- **Other Missing CRUD Verifications**:
  - Non-whitelisted entity checks on POST, GET [id], PATCH [id], and DELETE [id].
  - 404 Not Found tests on GET [id], PATCH [id], and DELETE [id].
  - Invalid payload handling on POST and PATCH (e.g. body is null, array, or non-object -> 400).
  - Dynamic equality filters on GET collection (e.g. `?space_id=...&is_active=true`).
  - Zero 401/403 tests across all 5 CRUD operations.
  - Audit logging calls are never asserted.

---

## 2. Logic Chain

1. **Premise 1 (Coverage Completeness)**: The project's acceptance criteria state:
   *"Automated tests cover all admin endpoints (`/api/admin/auth/verify`, `/api/admin/metrics`, `/api/admin/users`, `/api/admin/payments/subscriptions`, `/api/admin/payments/invoices`, `/api/admin/logs`, `/api/admin/crud/[entity]`) for valid inputs, invalid inputs, and error states."*
2. **Observation Step 1**: `/api/admin/metrics` exists in `src/app/api/admin/metrics/route.ts` but has **no corresponding test file** in `tests/api/`. Therefore, test coverage for admin endpoints is incomplete.
3. **Premise 2 (Security Boundary Enforcement)**: Acceptance criteria state:
   *"Permission boundary enforcement is verified: non-admin/unauthenticated access is rejected, and privilege escalation attempts are blocked."*
4. **Observation Step 2**: While `admin_auth.test.ts` tests 401/403 for `/api/admin/auth/verify`, the remaining 8 route handlers (`users`, `users/[id]`, `payments/subscriptions`, `payments/invoices`, `logs`, `crud/[entity]`, `crud/[entity]/[id]`, `metrics`) **rely on `verifyAdminRequest` internally, but have zero route-level tests verifying rejection of unauthenticated or non-admin callers**.
5. **Observation Step 3 (Privilege Escalation Bug & Test Gap)**:
   In `users/[id]/route.ts`, regular admins are prohibited from deleting superadmins, but `PATCH` contains no check preventing a regular admin from modifying or resetting the password of a superadmin profile. No test currently exercises this scenario.
6. **Premise 3 (Audit Logging Verification)**: Acceptance criteria state:
   *"Audit logging trigger and recording mechanisms are tested and verified."*
7. **Observation Step 4**: In `admin_users.test.ts:106`, `admin_payments.test.ts:141`, and `admin_crud.test.ts:55`, `admin_audit_logs.insert` is mocked with a stub, but in **no test file** is `mockAuditInsert` asserted with `toHaveBeenCalledWith(...)`. There is zero test verification that mutating actions actually emit audit events with proper action names, target tables, target IDs, or before/after diffs.
8. **Observation Step 5 (Schema/CRUD Key Inconsistency)**:
   `space_settings` has primary key `space_id` rather than `id`. `crud/[entity]/[id]/route.ts` hardcodes `.eq('id', id)`. Existing tests only mock and execute against `spaces`, leaving this runtime bug undetected.
9. **Deductive Conclusion**: To reach 100% acceptance criteria compliance, the test suite must be expanded to:
   - Create `tests/api/admin_metrics.test.ts`.
   - Add parameterized RBAC tests (401 unauthenticated, 403 standard user, 403 moderator) across all admin route files.
   - Add explicit audit logging assertions for all mutating endpoints.
   - Add boundary, pagination, search sanitization, and 404/500 error state tests.
   - Add regression tests covering primary key resolution for composite/non-standard entities like `space_settings`.

---

## 3. Caveats

1. **Vitest Mocking Isolation**: All existing tests use mocked Supabase clients (`@supabase/supabase-js` `createClient` mock). New tests must continue to use isolated mocks without requiring live database connections or network access.
2. **Rate Limiting State**: In Vitest, `defaultRateLimiter` is in-memory and shared across tests in a file. `beforeEach(() => defaultRateLimiter.reset())` is essential to prevent rate limit collisions between tests.
3. **Trigger vs API Guarding**: `supabase/migrations/20261109_admin_dashboard_backend.sql` contains PostgreSQL trigger `guard_profile_system_role()`. In Node/Vitest unit tests, PostgreSQL triggers do not run because queries are mocked. Verification of trigger logic is covered by checking that the route handler enforces system_role guards before calling Supabase with service role privileges.

---

## 4. Conclusion

The existing admin test suite passes cleanly (9 files, 178 tests), but harbors **substantial test gaps and two critical undetected defects**:
1. **Missing Route Test**: `/api/admin/metrics` has zero route-level unit tests.
2. **Audit Logging Unverified**: Zero tests assert that audit log entries are actually recorded with correct payloads upon mutation.
3. **Security Testing Gaps**: Unauthenticated (401), non-admin (403), and moderator (403) rejections are omitted across 8 out of 9 route handlers.
4. **Privilege Escalation Risk**: `PATCH /api/admin/users/[id]` lacks protection preventing regular admins from resetting passwords or modifying superadmin profiles.
5. **Entity Key Bug in CRUD**: `space_settings` uses `space_id` as primary key, but `crud/[entity]/[id]` hardcodes `.eq('id', id)`, causing runtime SQL failure on space_settings mutations/lookups.

---

## 5. Concrete Blueprint for New & Updated Test Suites

Below is the exact implementation blueprint for resolving 100% of the test gaps and quality gates under Vitest with complete mock isolation.

### 5.1 New File: `next-app/tests/api/admin_metrics.test.ts`
**Objective**: 100% coverage of `/api/admin/metrics/route.ts`.

```typescript
// Blueprint Structure:
describe('Admin Overview Metrics API (GET /api/admin/metrics)', () => {
  // Test 1: Rejects unauthenticated request with 401
  // Test 2: Rejects standard user (system_role = 'user') with 403
  // Test 3: Rejects moderator (system_role = 'moderator') with 403
  // Test 4: Returns 200 with aggregated metrics for admin (system_role = 'admin')
  //         Asserts rpc('get_admin_overview_metrics') called and payload matches:
  //         { totalUsers: 120, newUsers24h: 5, activeSubscriptions: 10, totalRevenueCents: 50000, ... }
  // Test 5: Returns 200 with aggregated metrics for superadmin (system_role = 'superadmin')
  // Test 6: Returns 200 when authenticated via valid X-Admin-Api-Key
  // Test 7: Handles RPC database error and returns 500 { error: 'Failed to retrieve metrics' }
  // Test 8: Handles unhandled throw/rejection and returns 500 { error: 'Internal server error' }
  // Test 9: Enforces rate limiting (429) after threshold exceeded
});
```

---

### 5.2 Updated File: `next-app/tests/api/admin_auth.test.ts`
**Objective**: Harden RBAC boundaries and machine secret handling.

- **Add Test**: Rejects moderator (`system_role = 'moderator'`) with 403 `Insufficient administrative privileges`.
- **Add Test**: Rejects missing profile record with 403 `Admin profile record not found`.
- **Add Test**: Rejects invalid `x-admin-api-key` (e.g. `x-admin-api-key: wrong-key`) with 401.
- **Add Test**: Rejects `x-admin-api-key` when server `process.env.ADMIN_SECRET_KEY` is undefined/blank.
- **Add Test**: Rejects malformed `Authorization` header (`Basic xyz`, empty `Bearer `) with 401.

---

### 5.3 Updated File: `next-app/tests/api/admin_users.test.ts`
**Objective**: Comprehensive endpoint, RBAC, edge case, and audit logging coverage.

#### A. RBAC & Rejection Suite (All Methods)
- **Add Tests**: 401 unauthenticated and 403 non-admin rejection for `GET /api/admin/users`, `POST /api/admin/users`, `GET /api/admin/users/[id]`, `PATCH /api/admin/users/[id]`, and `DELETE /api/admin/users/[id]`.

#### B. GET /api/admin/users
- **Add Test**: Query parameter validation: rejects `limit=0` or `limit=500` with 400.
- **Add Test**: Search filter: verifies `.or('username.ilike.%search%,display_name.ilike.%search%')` with special characters.
- **Add Test**: Role filter: verifies `.eq('system_role', 'moderator')`.
- **Add Test**: Status filter: verifies `.eq('status', 'banned')`.
- **Add Test**: Tier filter: verifies `.eq('tier', 'enterprise')`.
- **Add Test**: Sorting fallback: passing invalid `sortBy=hack` safely defaults to `created_at`.
- **Add Test**: Database select error returns 500.

#### C. POST /api/admin/users
- **Add Test**: Superadmin successfully provisions account with `systemRole = 'admin'` (201).
- **Add Test**: Regular admin successfully provisions account with `systemRole = 'user'` (201).
- **Add Test**: Handles Supabase `createUser` error (e.g. duplicate email) returning 400.
- **AUDIT ASSERTION**: Verify `from('admin_audit_logs').insert` called with:
  `action: 'create_user'`, `target_table: 'profiles'`, `target_id: createdUser.id`, `changes_after: expect.objectContaining({ email, tier, systemRole })`.

#### D. GET /api/admin/users/[id]
- **Add Test**: User not found in `profiles` returns 404 `{ error: 'User not found' }`.
- **Add Test**: Dossier handles null subscription, empty AI usage, 0 reports, and 0 spaces gracefully.

#### E. PATCH /api/admin/users/[id]
- **Add Test**: User not found in `profiles` returns 404.
- **Add Test**: Validation failure (password < 8, invalid tier) returns 400.
- **Add Test (Security Guard)**: Regular admin attempting to promote user to `admin` or `superadmin` returns 403 `Only a superadmin can modify system roles`.
- **Add Test (Security Guard)**: Regular admin attempting to modify/reset password of a `superadmin` user returns 403 (verifying the recommended fix).
- **Add Test**: Superadmin successfully changes `systemRole` to `admin` (200).
- **Add Test**: Auth `updateUserById` password failure returns 400.
- **AUDIT ASSERTION**: Verify `from('admin_audit_logs').insert` called with:
  `action: 'update_user'`, `target_table: 'profiles'`, `target_id: targetUserId`, `changes_before`, `changes_after`.

#### F. DELETE /api/admin/users/[id]
- **Add Test**: User not found returns 404.
- **Add Test (Security Guard)**: Regular admin attempting to delete superadmin returns 403 `Only a superadmin can remove another superadmin`.
- **Add Test**: Hard delete failure (`deleteUser` error) returns 500.
- **AUDIT ASSERTION**:
  - Soft ban: Verify `action: 'suspend_user'`, `changes_after: { status: 'banned' }`.
  - Hard delete: Verify `action: 'delete_user_hard'`, `changes_after: null`.

---

### 5.4 Updated File: `next-app/tests/api/admin_payments.test.ts`
**Objective**: Full input validation, profile synchronization, and audit logging.

- **Add Tests**: 401 unauthenticated and 403 non-admin rejection for both GET/PATCH subscriptions and GET/POST invoices.
- **PATCH Subscriptions**:
  - Rejects request missing both `id` and `userId` with 400.
  - Rejects invalid `status` (e.g. `status: 'invalid'`) with 400.
  - Returns 404 when subscription ID not found.
  - Verifies profile sync: when status changes to `'active'`, verifies `from('profiles').update({ is_paid: true, tier: 'pro', has_ai_companion: true })` called.
  - Verifies profile sync: when status changes to `'canceled'`, verifies `from('profiles').update({ is_paid: false, tier: 'free' })` called.
  - **AUDIT ASSERTION**: Verify `action: 'subscription_override'`, `target_table: 'user_subscriptions'`, `target_id: subId`.
- **GET Subscriptions & Invoices**:
  - Query parameter validation (invalid limit/page) returns 400.
  - Status filter queries `status = 'active'` or `status = 'paid'`.
- **POST Invoices**:
  - Rejects invalid UUID for `userId` with 400.
  - Rejects negative `amountCents` with 400.
  - Rejects invalid `invoicePdf` (not URL) with 400.
  - Auto-sets `paid_at` when status is `'paid'` and `paidAt` is omitted.
  - **AUDIT ASSERTION**: Verify `action: 'create_invoice_log'`, `target_table: 'billing_invoices'`, `target_id: newInvoice.id`.

---

### 5.5 Updated File: `next-app/tests/api/admin_logs.test.ts`
**Objective**: Category defaulting, date bounds, search filters, and RBAC.

- **Add Tests**: 401 unauthenticated and 403 non-admin rejection.
- **Add Test**: Omitting category parameter correctly defaults to `admin_audit`.
- **Add Test**: Date range filtering applies `gte('created_at', startDate)` and `lte('created_at', endDate)`.
- **Add Test**: Date range filtering for `ai_usage` applies `gte('usage_date', startDate)`.
- **Add Test**: Search parameter filtering for `payments` (`stripe_invoice_id` / `status`) and `guest_security` (`client_ip`).
- **Add Test**: Query parameter validation: `limit > 100` returns 400.
- **Add Test**: Database query exception returns 500 `{ error: 'Internal server error' }`.

---

### 5.6 Updated File: `next-app/tests/api/admin_crud.test.ts`
**Objective**: Non-whitelisted checks on all methods, primary key bug coverage, dynamic filtering, and audit logging.

- **Add Tests**: 401 unauthenticated and 403 non-admin rejection across GET, POST, GET [id], PATCH [id], and DELETE [id].
- **Add Tests**: Rejection of non-whitelisted entities (`auth_users`, `pg_shadow`) with 400 on POST, GET [id], PATCH [id], and DELETE [id].
- **Add Tests (Primary Key Bug Coverage)**:
  - Test `GET /api/admin/crud/space_settings/<space_id>`: verifies query uses `space_id` primary key.
  - Test `PATCH /api/admin/crud/space_settings/<space_id>`: verifies update filters on `space_id`.
  - Test `DELETE /api/admin/crud/space_settings/<space_id>`: verifies delete filters on `space_id`.
- **Add Tests**: Dynamic equality filtering on GET collection (e.g. `?space_id=xyz&is_active=true` applies `.eq('space_id', 'xyz').eq('is_active', 'true')`).
- **Add Tests**: 404 Not Found handling on GET [id], PATCH [id], and DELETE [id].
- **Add Tests**: Invalid payload on POST and PATCH (e.g. body is null, array `[]`, or non-object) returns 400 `Payload must be a valid JSON object.`.
- **Add Tests**: Database error on insert/update returns 400 with error message.
- **AUDIT ASSERTIONS**:
  - POST: Verify `action: 'crud_create_spaces'`, `target_table: 'spaces'`, `target_id`.
  - PATCH: Verify `action: 'crud_update_spaces'`, `changes_before`, `changes_after`.
  - DELETE: Verify `action: 'crud_delete_spaces'`, `changes_before`, `changes_after: null`.

---

## 6. Verification Method

To independently verify the baseline and new test suites:

```bash
# 1. Run all admin tests currently present
cd next-app
npx vitest run tests/api/admin_ tests/admin_

# 2. Run linting across the project
npm run lint

# 3. Check for any missing imports or TypeScript errors
npx tsc --noEmit
```

### Invalidation Conditions
- Any test requires a live network connection, live Supabase project, or live Stripe instance.
- Any test fails or throws unhandled promise rejections.
- Test suites take longer than 15 seconds to run in aggregate.
