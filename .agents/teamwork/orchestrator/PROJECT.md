# Project: TeemChat Admin Dashboard UI & Endpoints Verification

## Architecture
The Admin Dashboard provides a unified, production-grade management portal at `/admin` for TeemChat administrators and superadmins.
It integrates with REST endpoints under `/api/admin/` using a client service layer (`AdminClientService`) and React UI components adhering strictly to TeemChat's Neo-brutalist design system.

### Component & Data Flow Hierarchy
```
User / Admin
    │
    ▼
[next-app/src/app/admin/page.tsx] (Client Component, Route Guard on Mount)
    │
    ├── [AdminClientService] (next-app/src/lib/services/adminClient.ts)
    │       │
    │       ├── GET /api/admin/auth/verify (Token / Key validation & capabilities)
    │       ├── GET /api/admin/metrics
    │       ├── GET/POST/PATCH/DELETE /api/admin/users
    │       ├── GET/PATCH /api/admin/payments/subscriptions
    │       ├── GET/POST /api/admin/payments/invoices
    │       ├── GET /api/admin/logs
    │       └── GET/POST/PATCH/DELETE /api/admin/crud/[entity]
    │
    ├── [AdminHeader] & [AdminThemeToggle] (SVG only, zero emojis)
    ├── [AdminNavigationTabs] (Capability-gated tabs: Overview, Users, Payments, Logs, CRUD)
    │
    ├── Tab Views:
    │   ├── [OverviewTab]: Stat cards (Users, 24h, Subs, Revenue, Reports, Spaces, AI), Quick actions
    │   ├── [UsersTab]: Filter/Search bar, Pagination, User Table, Create User Modal, Edit User Modal, Delete Confirmation
    │   ├── [PaymentsTab]: Subscriptions Table (Status/Tier patch), Invoices Table, Create Invoice Modal
    │   ├── [LogsTab]: Category selector, Date filters, Search input, Log event timeline/table
    │   └── [CrudTab]: Entity dropdown (15 whitelisted tables), Record grid, Record Editor Modal, Delete modal
    │
    └── [AccessDeniedCard] & [UnauthenticatedCard] (Zero emojis, Neo-brutalist, optional dev key entry)
```

## Feature Inventory
Every requirement from ORIGINAL_REQUEST.md is enumerated and assigned below.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Admin Route & Client Guard | `/admin` page route with on-mount auth verification against `GET /api/admin/auth/verify` | M1 | R1 |
| 2 | Capability-Based Access Control | Navigation tabs & action gating via `canManageUsers`, `canViewPaymentLogs`, `canViewSystemLogs`, `canExecuteCrud`, `canAssignSuperadmin` | M1 | R1 |
| 3 | Access Denied & Unauthenticated States | Clear Neo-brutalist feedback cards for 401 and 403 responses with zero emojis | M1 | R1 |
| 4 | Admin Client Service SDK | Encapsulated API client (`AdminClientService`) handling bearer tokens, machine key fallback, and response typing | M1 | R1, R2 |
| 5 | Overview Metrics Tab | Summary metrics cards from `GET /api/admin/metrics` (total users, new 24h, active subs, revenue, reports, spaces, AI messages) | M1 | R2 |
| 6 | User Management Table & Filters | Search, filter by role/tier/status, and pagination consuming `GET /api/admin/users` | M1 | R2 |
| 7 | User Creation Modal | Modal form calling `POST /api/admin/users` with input validation | M1 | R2 |
| 8 | User Detail & Attribute Update | Inspect user details (`GET /api/admin/users/[id]`) and update attributes via `PATCH /api/admin/users/[id]` | M1 | R2 |
| 9 | User Deletion Actions | Soft delete and permanent hard delete via `DELETE /api/admin/users/[id]?permanent=true` | M1 | R2 |
| 10 | Subscriptions Management | List and update subscription status/tier via `GET & PATCH /api/admin/payments/subscriptions` | M1 | R2 |
| 11 | Invoices Management & Creation | List invoices (`GET /api/admin/payments/invoices`) and create manual records (`POST /api/admin/payments/invoices`) | M1 | R2 |
| 12 | Multi-Category System Logs | Filter logs by category (`payments`, `admin_audit`, `space_audit`, `ai_usage`, `guest_security`, `reports`), search, date range | M1 | R2 |
| 13 | Database CRUD Explorer | Entity selector for 15 whitelisted tables, record browser with search/pagination via `GET /api/admin/crud/[entity]` | M1 | R2 |
| 14 | Database CRUD Record Mutation | Create (`POST`), edit (`PATCH`), and delete (`DELETE`) records in whitelisted database entities | M1 | R2 |
| 15 | Neo-brutalist Styling & Theme | 2.5px solid borders, 3.5px hard zero-blur drop shadows, Plus Jakarta Sans, light/dark dual theme support via `admin.module.css` | M1 | R3 |
| 16 | Strict Zero-Emoji Vector Iconography | 100% SVG icon set (`AdminIcons.tsx`) for navigation, actions, status badges, and metrics | M1 | R3 |
| 17 | Quality, Linting & Test Verification | Comprehensive test suites passing with 100% green tests and 0 ESLint errors | M1 | R4 |
| 18 | RBAC Security & Privilege Escalation Hardening | Fix DB trigger INSERT vulnerability (SEC-01), PATCH superadmin account protection (SEC-02), and suspended admin check in adminAuth (SEC-03) | M2 | R1, R2 |
| 19 | RPC Security & Covering Indexes | Fix `get_admin_overview_metrics()` auth check and search_path (SEC-04), add covering indexes | M2 | R2 |
| 20 | CRUD Entity Schema Alignment | Dynamic PK (`space_id` for space_settings), conditional `updated_at`, and `space_roles` sorting fallback | M2 | R2 |
| 21 | Search & Filter Logic Remediation | PostgREST comma sanitization, date range end-of-day handling, search filter application in payments and AI logs | M2 | R2 |
| 22 | Full Type-Safety & Zero-Any Cleanliness | Eliminate all 5 `as any` errors and 7 `eslint-disable` comments via complete `database.types.ts` declarations and typed generic clients | M2 | R3 |
| 23 | Comprehensive Mocked Vitest Expansion | Add `tests/api/admin_metrics.test.ts`, expand `admin_auth`, `admin_users`, `admin_payments`, `admin_logs`, and `admin_crud` with RBAC 401/403, error states, and explicit audit logging assertions | M2 | R1, R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Production Admin Dashboard UI & Test Verification | Complete implementation of `/admin`, `adminClient.ts`, `admin.module.css`, all 5 tab views, SVG icons, and baseline test suites | none | DONE |
| 2 | Admin Endpoints & Workflows Testing, Bug Remediation, and Quality Verification | Remediate SEC-01 to SEC-05, BUG-PK, BUG-UPDATED_AT, BUG-SPACE_ROLES, BUG-OR-COMMA, BUG-DATE-RANGE, BUG-SEARCH-IGNORED, BUG-GHOST-USER, BUG-SOFT-BAN, PERF-USER-DOSSIER; expand Vitest suites to 100% endpoint coverage with audit assertions; achieve 0 ESLint errors | M1 | IN_PROGRESS |

## Interface Contracts

### `AdminClientService` (`next-app/src/lib/services/adminClient.ts`)
- `verifyAuth(token?: string, apiKey?: string): Promise<AdminVerifyResponse>`
- `getMetrics(authHeaders): Promise<AdminMetrics>`
- `getUsers(params, authHeaders): Promise<PaginatedUsers>`
- `createUser(payload, authHeaders): Promise<User>`
- `getUser(id, authHeaders): Promise<UserDetails>`
- `updateUser(id, payload, authHeaders): Promise<User>`
- `deleteUser(id, permanent, authHeaders): Promise<{ success: boolean }>`
- `getSubscriptions(params, authHeaders): Promise<PaginatedSubscriptions>`
- `updateSubscription(payload, authHeaders): Promise<Subscription>`
- `getInvoices(params, authHeaders): Promise<PaginatedInvoices>`
- `createInvoice(payload, authHeaders): Promise<Invoice>`
- `getLogs(params, authHeaders): Promise<PaginatedLogs>`
- `getCrudRecords(entity, params, authHeaders): Promise<PaginatedRecords>`
- `createCrudRecord(entity, payload, authHeaders): Promise<Record>`
- `updateCrudRecord(entity, id, payload, authHeaders): Promise<Record>`
- `deleteCrudRecord(entity, id, authHeaders): Promise<{ success: boolean }>`

### Component Boundaries
- `AdminDashboardPage` (`next-app/src/app/admin/page.tsx`): Main client route. Manages auth state, active tab, and notification toasts.
- `AdminNavigationTabs` (`next-app/src/app/admin/components/AdminNav.tsx`): Renders navigation pills with capability gating.
- `AdminIcons` (`next-app/src/app/admin/components/AdminIcons.tsx`): Pure vector SVGs with standardized `size`, `className`, and `strokeWidth`.
- CSS Module (`next-app/src/app/admin/admin.module.css`): Neo-brutalist tokens (`--card-border`, `--neo-shadow`, `--card-bg`).

## Code Layout
- `next-app/src/lib/database.types.ts`: Supabase database types including admin tables and RPC definitions
- `next-app/src/lib/admin/adminAuth.ts`: RBAC authentication and request verification helper
- `next-app/src/lib/admin/auditLogger.ts`: Immutable audit logging service
- `next-app/src/lib/admin/schemas.ts`: Zod validation schemas
- `next-app/src/lib/services/adminClient.ts`: Admin API client service
- `next-app/src/app/api/admin/auth/verify/route.ts`: Admin verification endpoint
- `next-app/src/app/api/admin/metrics/route.ts`: Admin overview metrics endpoint
- `next-app/src/app/api/admin/users/route.ts`: Admin users list & create endpoint
- `next-app/src/app/api/admin/users/[id]/route.ts`: Admin user detail, update & delete endpoint
- `next-app/src/app/api/admin/payments/subscriptions/route.ts`: Subscriptions list & update endpoint
- `next-app/src/app/api/admin/payments/invoices/route.ts`: Invoices list & create endpoint
- `next-app/src/app/api/admin/logs/route.ts`: Admin multi-category logs endpoint
- `next-app/src/app/api/admin/crud/[entity]/route.ts`: Generic CRUD list & create endpoint
- `next-app/src/app/api/admin/crud/[entity]/[id]/route.ts`: Generic CRUD item GET, PATCH, DELETE endpoint
- `supabase/migrations/20261109_admin_dashboard_backend.sql`: Database schema migration for admin dashboard backend
- `supabase/schema.sql`: Authoritative database schema
- `next-app/tests/api/admin_auth.test.ts`: Auth verification and RBAC tests
- `next-app/tests/api/admin_metrics.test.ts`: Overview metrics tests (new file)
- `next-app/tests/api/admin_users.test.ts`: User management and privilege escalation tests
- `next-app/tests/api/admin_payments.test.ts`: Payments, subscriptions, invoices, and profile sync tests
- `next-app/tests/api/admin_logs.test.ts`: Multi-category logs, date range, and search tests
- `next-app/tests/api/admin_crud.test.ts`: Generic CRUD, space_settings PK, and updated_at tests
- `next-app/tests/admin_client.test.ts`: Client SDK service tests
- `next-app/tests/admin_guard.test.ts`: Route guard and UI capability gating tests
