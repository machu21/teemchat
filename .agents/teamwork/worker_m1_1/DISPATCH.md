# Task Assignment: Complete Production Admin Dashboard UI Implementation & Test Suite

**Role**: teamwork_worker
**Working Directory**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m1_1\
**Workspace Root**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective
Implement the complete, production-grade Admin Dashboard UI at `/admin` for TeemChat, strictly following the architectural specifications and blueprints prepared by the survey and explorer agents. Ensure 0 ESLint errors and 100% green tests with zero regressions.

### Reference Documents
1. `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md`
2. `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\PROJECT.md`
3. `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\TEST_INFRA.md`
4. `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_1\client_service_plan.md` (Client SDK & admin_client.test.ts)
5. `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_2\ui_shell_users_plan.md` (CSS, Icons, Nav, Page guard, OverviewTab, UsersTab)
6. `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_3\payments_logs_crud_plan.md` (PaymentsTab, LogsTab, CrudTab, admin_guard.test.ts)
7. `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_2\design_system_report.md` (CSS Tokens, Components, Zero Emojis)
8. `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_spec_miner_1\api_specifications.md` (API Schemas & Endpoints)

### Files to Implement (Exclusive Write Ownership)
1. `next-app/src/lib/services/adminClient.ts`: Admin API client service
2. `next-app/src/app/admin/admin.module.css`: Neo-brutalist styling (2.5px solid borders, 3.5px hard zero-blur drop shadows, dark mode overrides)
3. `next-app/src/app/admin/components/AdminIcons.tsx`: 100% pure inline SVG icons (STRICTLY ZERO EMOJIS anywhere)
4. `next-app/src/app/admin/components/AdminNav.tsx`: Capability-gated navigation pills (`canManageUsers`, `canViewPaymentLogs`, `canViewSystemLogs`, `canExecuteCrud`, `canAssignSuperadmin`)
5. `next-app/src/app/admin/page.tsx`: Route guard on mount (`GET /api/admin/auth/verify`), handling `CHECKING`, `UNAUTHENTICATED` (with optional dev key input), `FORBIDDEN`, and `AUTHORIZED` admin portal
6. `next-app/src/app/admin/components/OverviewTab.tsx`: Summary metric cards matching backend RPC `get_admin_overview_metrics`, quick actions
7. `next-app/src/app/admin/components/UsersTab.tsx`: User list, search, role/tier/status filters, pagination, Create User modal, Edit User modal, Delete modal (soft vs hard delete, self-deletion guarded), User Dossier modal
8. `next-app/src/app/admin/components/PaymentsTab.tsx`: Subscriptions table with status/tier patch, Invoices table with status badges and manual invoice creation modal
9. `next-app/src/app/admin/components/LogsTab.tsx`: Multi-category selector (`payments`, `admin_audit`, `space_audit`, `ai_usage`, `guest_security`, `reports`), search input, date range filters, JSON diff modal
10. `next-app/src/app/admin/components/CrudTab.tsx`: 15 whitelisted table explorer, dynamic columns, record grid, JSON/field modal editor, record deletion. Handle `space_settings` (`space_id` PK, `updated_at` sort) and `space_members` (`joined_at` sort)
11. `next-app/tests/admin_client.test.ts`: Vitest unit test suite covering `AdminClientService` methods, error mapping, and headers
12. `next-app/tests/admin_guard.test.ts`: Vitest integration test suite covering capability gating, auth verification, and unauthorized state transitions

### Verification Requirements
- Execute `npm run lint` in `next-app`: Must pass with 0 ESLint errors and 0 warnings.
- Execute `npm test` in `next-app`: Must pass 100% of tests with 0 failures (including existing 515 tests plus the new admin tests).
- Document all executed commands, test results, and file layout compliance in your `handoff.md`.
Report back when complete.
