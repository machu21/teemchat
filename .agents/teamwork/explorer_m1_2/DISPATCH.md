# Task Assignment: Admin UI Shell, Navigation, Overview & Users Tab Architecture

**Role**: teamwork_explorer
**Working Directory**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_2\
**Workspace Root**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson

## Objective
Read `PROJECT.md`, `TEST_INFRA.md`, and the survey reports:
- `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_2\design_system_report.md`
- `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_3\routing_auth_test_report.md`

Produce the detailed, step-by-step implementation strategy for:
1. `next-app/src/app/admin/admin.module.css`: Neo-brutalist styling rules (borders, shadows, theme support).
2. `next-app/src/app/admin/components/AdminIcons.tsx`: Complete vector SVG library ensuring strictly ZERO emojis.
3. `next-app/src/app/admin/components/AdminNav.tsx`: Capability-gated navigation pills.
4. `next-app/src/app/admin/page.tsx`: Route guard on mount via `verifyAuth()`, handling loading, 401 unauthenticated, 403 forbidden, and 200 admin view.
5. `next-app/src/app/admin/components/OverviewTab.tsx`: Summary metrics cards (Users, 24h, Subs, Revenue, Reports, Spaces, AI).
6. `next-app/src/app/admin/components/UsersTab.tsx`: User list, search, role/tier/status filters, pagination, Create User modal, Edit User modal, and Delete confirmation.

Write your findings to:
`c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_2\ui_shell_users_plan.md`
and write your `handoff.md`.
Report back when complete.

## 2026-11-05T22:23:37Z
You are teamwork_explorer assigned to Milestone 1: Production Admin Dashboard UI (UI Shell & Users Architect).
Your working directory is:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_2\

Read ORIGINAL_REQUEST.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md

Read PROJECT.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\PROJECT.md

Read TEST_INFRA.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\TEST_INFRA.md

Read your task dispatch at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_2\DISPATCH.md

Inspect the survey design system report in:
`c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_2\design_system_report.md`

Produce a comprehensive, concrete implementation specification for:
- `next-app/src/app/admin/admin.module.css` (drop-in Neo-brutalist styling)
- `next-app/src/app/admin/components/AdminIcons.tsx` (100% SVG icon components, STRICTLY ZERO EMOJIS)
- `next-app/src/app/admin/components/AdminNav.tsx` (capability-gated navigation pills)
- `next-app/src/app/admin/page.tsx` (on-mount auth verification, 401 unauthenticated, 403 forbidden, and 200 admin view)
- `next-app/src/app/admin/components/OverviewTab.tsx` (summary metrics cards from `/api/admin/metrics`)
- `next-app/src/app/admin/components/UsersTab.tsx` (table, search, filters, pagination, Create User modal, Edit User modal, and Delete confirmation)

Write your report to:
`c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\explorer_m1_2\ui_shell_users_plan.md`
and write your `handoff.md`.
Use send_message to report completion back to parent when done.
