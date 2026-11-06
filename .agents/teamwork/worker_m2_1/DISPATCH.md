## 2026-11-06T03:23:45Z
You are worker_m2_1.
Your working directory is: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m2_1\

You MUST read the authoritative request at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md
before starting your work.

Also read the architecture and plan in:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\PROJECT.md
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\TEST_INFRA.md

And thoroughly review the detailed findings and code solutions in the 3 Explorer handoff reports:
1. c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_1\handoff.md (Backend routes, type safety, ESLint solutions, RBAC)
2. c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_2\handoff.md (Test suite gaps, new metrics test blueprint, audit assertions blueprint)
3. c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_3\handoff.md (DB trigger fixes, RPC security & indexes, space_settings PK, updated_at safe injection, space_roles sorting, comma search sanitization)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
You exclusively own and may edit the following files:
- `supabase/migrations/20261109_admin_dashboard_backend.sql`
- `supabase/schema.sql`
- `next-app/src/lib/database.types.ts`
- `next-app/src/lib/admin/adminAuth.ts`
- `next-app/src/lib/services/adminClient.ts`
- `next-app/src/app/api/admin/metrics/route.ts`
- `next-app/src/app/api/admin/users/route.ts`
- `next-app/src/app/api/admin/users/[id]/route.ts`
- `next-app/src/app/api/admin/payments/subscriptions/route.ts`
- `next-app/src/app/api/admin/payments/invoices/route.ts`
- `next-app/src/app/api/admin/logs/route.ts`
- `next-app/src/app/api/admin/crud/[entity]/route.ts`
- `next-app/src/app/api/admin/crud/[entity]/[id]/route.ts`
- `next-app/src/app/admin/components/LogsTab.tsx`
- `next-app/tests/api/admin_metrics.test.ts` (create new test file)
- `next-app/tests/api/admin_auth.test.ts`
- `next-app/tests/api/admin_users.test.ts`
- `next-app/tests/api/admin_payments.test.ts`
- `next-app/tests/api/admin_logs.test.ts`
- `next-app/tests/api/admin_crud.test.ts`

CORE TASKS TO IMPLEMENT:

1. Database Schema & Security Fixes:
   - In `supabase/migrations/20261109_admin_dashboard_backend.sql` and `supabase/schema.sql`:
     - Update `guard_profile_system_role()` to trigger `before insert or update on public.profiles`. If `TG_OP = 'INSERT'`, prevent setting `system_role <> 'user'` unless caller is `service_role` or system admin (`public.is_system_admin(auth.uid())`).
     - In `get_admin_overview_metrics()`, add check: `if auth.role() is distinct from 'service_role' and not public.is_system_admin(auth.uid()) then raise exception 'Unauthorized: Insufficient administrative privileges'; end if;`. Add `set search_path = public, pg_temp;`. Also add `set search_path = public, pg_temp` to `is_system_admin`.
     - Revoke execute on `get_admin_overview_metrics()` from public and anon; grant to authenticated and service_role.
     - Add covering indexes: `idx_profiles_created_at` on `profiles(created_at desc)`, `idx_user_subscriptions_status` on `user_subscriptions(status)`, `idx_billing_invoices_status_amount` on `billing_invoices(status, amount_cents)`, `idx_ai_usage_usage_date` on `ai_usage(usage_date)`.

2. Backend Route Handler & Helper Remediations:
   - In `next-app/src/lib/admin/adminAuth.ts`:
     - Select `status` from `profiles` and return 403 if `profile.status === 'banned'` or `profile.status === 'suspended'`.
     - Use timing-safe comparison (`crypto.timingSafeEqual`) for machine secret key validation.
   - In `next-app/src/app/api/admin/users/[id]/route.ts`:
     - In `PATCH`, guard against standard admins modifying or resetting the password of superadmins: if `currentProfile.system_role === 'superadmin' && auth.admin.systemRole !== 'superadmin'`, return 403 `Only a superadmin can modify another superadmin.`
     - In `GET [id]`, execute independent queries in parallel via `Promise.all`.
     - In `DELETE [id]?mode=soft`, check return errors from `profiles.update` and `updateUserById`.
     - In password reset, record credential update in audit log.
   - In `next-app/src/app/api/admin/users/route.ts`:
     - In `POST`, if `profiles.upsert` fails, rollback/delete the newly created user from `auth.users` via `auth.admin.deleteUser(createdUser.id)` and return 400 with the error message.
     - Sanitize search input to prevent comma-delimited PostgREST `.or(...)` breakage.
   - In `next-app/src/app/api/admin/crud/[entity]/[id]/route.ts`:
     - Dynamically determine primary key: `const pkColumn = entity === 'space_settings' ? 'space_id' : 'id';`. Use `pkColumn` across GET, PATCH, DELETE.
     - Only inject `updated_at` on PATCH if the table actually has that column (`['spaces', 'space_settings', 'user_reports', 'ai_companions', 'user_subscriptions'].includes(entity)`).
   - In `next-app/src/app/api/admin/crud/[entity]/route.ts` & `next-app/src/lib/services/adminClient.ts`:
     - Default `space_roles` sorting to `priority` or `name` (since it lacks `created_at`).
   - In `next-app/src/app/api/admin/payments/subscriptions/route.ts` & `invoices/route.ts`:
     - Apply search parameter to queries (e.g. searching stripe customer ID, user ID, status, invoice number).
   - In `next-app/src/app/api/admin/logs/route.ts` & `next-app/src/app/admin/components/LogsTab.tsx`:
     - Sanitize search input for PostgREST `.or(...)`.
     - Handle `ai_usage` search parameter.
     - In `LogsTab.tsx`, ensure `endDate` converts to end of day (`23:59:59.999Z`).

3. Type-Safety & Zero-Any Cleanliness:
   - In `next-app/src/lib/database.types.ts`:
     - Declare `get_admin_overview_metrics` in `Functions`.
     - Declare `guest_provision_log` in `Tables`.
     - Add `system_role` and `gender` to `profiles` table definition.
   - In `next-app/src/app/api/admin/metrics/route.ts`, `logs/route.ts`, `payments/subscriptions/route.ts`, `users/[id]/route.ts`, `users/route.ts`:
     - Remove all `as any` type bypasses; use proper TypeScript types.
   - In generic CRUD route handlers:
     - Replace `as any` and `eslint-disable-next-line` with a typed dynamic client interface using `unknown` casts.
   - Ensure `npm run lint` passes with 0 errors and 0 warnings, and `npx tsc --noEmit` passes with 0 errors.

4. Test Suite Implementation & Expansion:
   - Create `next-app/tests/api/admin_metrics.test.ts`: 100% test coverage for `/api/admin/metrics` covering unauthenticated (401), non-admin (403), moderator (403), admin (200), superadmin (200), machine key (200), RPC database error (500), rate limiting (429).
   - Expand `next-app/tests/api/admin_auth.test.ts`: test moderator 403, invalid API key rejection, missing profile rejection.
   - Expand `next-app/tests/api/admin_users.test.ts`: test unauthenticated (401) and non-admin (403) across all endpoints; test regular admin prevented from editing/resetting password of superadmin; test search/filter/pagination edge cases; test 404s; test ghost user cleanup; ASSERT audit logging (`expect(mockAuditInsert).toHaveBeenCalledWith(...)`).
   - Expand `next-app/tests/api/admin_payments.test.ts`: test 401/403, validation errors, 404s, search filtering, profile sync state transitions (`active` -> pro/paid, `canceled` -> free), ASSERT audit logging.
   - Expand `next-app/tests/api/admin_logs.test.ts`: test 401/403, default category, date range filtering, search filtering across categories including `ai_usage`, pagination errors.
   - Expand `next-app/tests/api/admin_crud.test.ts`: test 401/403, non-whitelisted entity rejection on all methods, `space_settings` using `space_id` PK, updating tables without `updated_at`, `space_roles` sort fallback, ASSERT audit logging.
   - All tests MUST run in mocked Vitest environment without requiring live external services.

5. Mandatory Verification Commands to run before handoff:
   - `npm test` in `next-app` (ALL tests pass, 0 failures)
   - `npm run lint` in `next-app` (0 errors, 0 warnings)
   - `npx tsc --noEmit` in `next-app` (0 compilation errors)
   - `npm run build` in `next-app` (production build succeeds)

Write your full completion handoff to `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m2_1\handoff.md` and notify me via send_message.


## 2026-11-06T03:36:28Z
**Context**: Milestone 2 Implementation & Verification
**Content**: Checking in on your progress. 10 minutes have elapsed since your initial setup at 03:26:00Z.
**Action**: Please update your `progress.md` with your current status and progress across database changes, route handler fixes, type safety, test suite implementations, and build/lint runs.
