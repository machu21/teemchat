# E2E & Unit Test Infra: TeemChat Admin Dashboard

## Test Philosophy
- Multi-tier requirement-driven verification covering authentication guards, capability enforcement, API error mapping, query parameter serialization, pagination, input validation, mutation flows, and audit logging.
- Node-compatible Vitest testing with mocked Supabase/service clients to ensure 100% offline, deterministic execution with 0 external live service requirements.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|----------------------|:------:|:------:|:------:|
| 1 | Auth Verify & Guard | R1 (401, 403, 200, Token, Key, Moderator) | 5 | 5 | ✓ |
| 2 | Capability Flags | R1 (`canManageUsers`, `canViewPaymentLogs`, etc.) | 5 | 5 | ✓ |
| 3 | Overview Metrics | R2 (`GET /api/admin/metrics`, RPC, 401/403, 500) | 5 | 5 | ✓ |
| 4 | Users Management | R2 (List, Search, Role/Tier/Status filter, Page) | 5 | 5 | ✓ |
| 5 | Users Mutation | R2 (Create POST, Detail GET, Update PATCH, Delete, Audit) | 5 | 5 | ✓ |
| 6 | Subscriptions | R2 (List, Tier/Status filter, Patch, Profile Sync, Audit) | 5 | 5 | ✓ |
| 7 | Invoices | R2 (List, Status filter, Create POST, Auto Paid, Audit) | 5 | 5 | ✓ |
| 8 | Multi-Category Logs | R2 (Category, Search, Date range, Page, Default) | 5 | 5 | ✓ |
| 9 | CRUD Explorer | R2 (15 entities, PK handling, UpdatedAt guard, Mutation, Audit) | 5 | 5 | ✓ |
| 10 | Zero Emojis & Styling | R3 (SVG verification, CSS module classes) | 5 | 5 | ✓ |
| 11 | RBAC Escalation Defense | R1, R2 (Block regular admin modifying superadmin, block insert elevation) | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: Vitest (`cd next-app; npm test` or `npx vitest run tests/api/admin_*.test.ts tests/admin_*.test.ts`)
- **Pass/Fail Semantics**: 0 failures, 100% assertions green, exit code 0.
- **Linter Check**: `npm run lint` must pass with 0 ESLint errors and 0 warnings.
- **Test Suites**:
  - `next-app/tests/api/admin_auth.test.ts`: Auth verification, moderator rejection, machine key validation, rate limiting.
  - `next-app/tests/api/admin_metrics.test.ts`: Route handler tests for `/api/admin/metrics`, 401 unauthenticated, 403 non-admin/moderator, 200 admin/superadmin, 500 RPC error.
  - `next-app/tests/api/admin_users.test.ts`: RBAC checks on all endpoints, privilege escalation prevention, user creation/editing/soft-ban/hard-delete, and audit log assertions.
  - `next-app/tests/api/admin_payments.test.ts`: Subscriptions and invoices management, profile sync transitions (`active` -> pro/paid, `canceled` -> free), input validation, audit assertions.
  - `next-app/tests/api/admin_logs.test.ts`: Multi-category log fetching, category defaulting, date range filtering, search filtering, and pagination validation.
  - `next-app/tests/api/admin_crud.test.ts`: Whitelisted entities, non-whitelisted rejection, `space_settings` PK (`space_id`), `updated_at` safe updates, `space_roles` sort fallback, and audit logging.
  - `next-app/tests/admin_client.test.ts`: Complete API client service test suite covering all REST methods, query serialization, auth header injection, and parameter encoding.
  - `next-app/tests/admin_guard.test.ts`: Route guarding logic, capability flags evaluation, unauthenticated/unauthorized decision tree, and role promotion safety.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Admin Login & Metric Inspection | Auth Guard, Bearer token, Overview Metrics, Rate limiting | Medium |
| 2 | User Lifecycle: Search, Create, Edit, Suspend, Soft Delete | Users Tab, Create Modal, Edit Modal, Soft Delete, Audit logs | High |
| 3 | Financial Auditing: Invoices & Subscriptions Review | Payments Tab, Subscriptions Patch, Invoice Create, Profile sync | Medium |
| 4 | Security Incident Investigation | Logs Tab, Category filter (guest_security, admin_audit), Date range | High |
| 5 | Database Record Maintenance via CRUD Explorer | CRUD Tab, Entity selector, Validation, Mutation, space_settings PK | High |
| 6 | Unauthorized Access Rejection | 401 unauthenticated, 403 regular user & moderator rejection | Low |
| 7 | Superadmin Privilege Escalation Defense | Role update to superadmin blocked when `canAssignSuperadmin` is false, regular admin blocked from editing superadmin | High |
