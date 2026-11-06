Test admin workflow and endpoints, check bugs, logic errors, and inefficiencies across the admin dashboard implementation (backend API route handlers, helper services, database schema/migrations, and frontend UI), fix any detected issues, and ensure test suites and lints pass cleanly.

Integrity mode: development

## Context & Reference Material
- Backend Admin API Route Handlers:
  - `GET /api/admin/auth/verify`
  - `GET /api/admin/metrics`
  - `GET & POST /api/admin/users`
  - `GET, PATCH, DELETE /api/admin/users/[id]`
  - `GET & PATCH /api/admin/payments/subscriptions`
  - `GET & POST /api/admin/payments/invoices`
  - `GET /api/admin/logs`
  - `GET & POST /api/admin/crud/[entity]`
  - `GET, PATCH, DELETE /api/admin/crud/[entity]/[id]`
- Helper Services:
  - `next-app/src/lib/admin/adminAuth.ts` (RBAC checking `system_role IN ('admin', 'superadmin')`, JWT & API key verification)
  - `next-app/src/lib/admin/auditLogger.ts` (immutable audit logging into `admin_audit_logs`)
  - `next-app/src/lib/admin/schemas.ts` (Zod schemas for queries, inputs, entity allowlist)
- Database Schema & Migrations:
  - `supabase/migrations/20261109_admin_dashboard_backend.sql`
  - `public.profiles.system_role` ('user' | 'moderator' | 'admin' | 'superadmin')
  - `public.admin_audit_logs` table
  - `public.get_admin_overview_metrics()` RPC
  - `public.guard_profile_system_role()` trigger
- Frontend Admin UI:
  - `next-app/src/app/admin/page.tsx`
  - `next-app/src/app/admin/OverviewTab.tsx`
  - `next-app/src/app/admin/UsersTab.tsx`
  - `next-app/src/app/admin/PaymentsTab.tsx`
  - `next-app/src/app/admin/LogsTab.tsx`
  - `next-app/src/app/admin/CrudTab.tsx`
  - `next-app/src/app/admin/AdminNav.tsx`
  - `next-app/src/app/admin/admin.module.css`
- Existing Test Suites:
  - `next-app/tests/api/admin_auth.test.ts`
  - `next-app/tests/api/admin_users.test.ts`
  - `next-app/tests/api/admin_payments.test.ts`
  - `next-app/tests/api/admin_logs.test.ts`
  - `next-app/tests/api/admin_crud.test.ts`

## Requirements

### R1. Comprehensive Workflow and API Endpoint Testing
Execute comprehensive testing across all admin dashboard API endpoints and workflows, covering normal operations, error handling, edge cases, permission escalation vulnerabilities, pagination, and search filtering. Tests must run as mocked unit and integration tests via Vitest without requiring live external services.

### R2. Bug Detection and Remediation
Identify and fix any bugs, logic errors, security flaws, or performance inefficiencies discovered in the admin backend route handlers, helper services, database schema/triggers, and frontend admin components.

### R3. Test Suite and Quality Verification
Maintain and expand test coverage for admin endpoints and workflows, verifying that all unit/integration tests (`npm test`) and code linting (`npm run lint`) pass with 0 errors.

## Verification Resources
- Existing test suites: `next-app/tests/api/admin_auth.test.ts`, `next-app/tests/api/admin_users.test.ts`, `next-app/tests/api/admin_payments.test.ts`, `next-app/tests/api/admin_logs.test.ts`, `next-app/tests/api/admin_crud.test.ts`
- Existing codebase and configuration files in `next-app/` and `supabase/`

## Acceptance Criteria

### Testing & Verification
- [ ] Automated tests cover all admin endpoints (`/api/admin/auth/verify`, `/api/admin/metrics`, `/api/admin/users`, `/api/admin/payments/subscriptions`, `/api/admin/payments/invoices`, `/api/admin/logs`, `/api/admin/crud/[entity]`) for valid inputs, invalid inputs, and error states.
- [ ] Permission boundary enforcement is verified: non-admin/unauthenticated access is rejected, and privilege escalation attempts are blocked.
- [ ] Audit logging trigger and recording mechanisms are tested and verified.
- [ ] All tests execute and pass via Vitest (`npm test`) using mocks without requiring live external services.

### Bug Fixes & Code Quality
- [ ] All detected bugs, logic flaws, and pagination/search inefficiencies across the admin dashboard stack are resolved.
- [ ] `npm test` executes cleanly with all tests passing and 0 failures.
- [ ] `npm run lint` completes with 0 errors.
