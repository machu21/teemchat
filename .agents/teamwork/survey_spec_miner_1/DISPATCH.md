# Task Assignment: Admin Backend API Specification Mining

**Role**: teamwork_spec_miner
**Working Directory**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_spec_miner_1\
**Workspace Root**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson

## Objective
Thoroughly examine all existing backend administration endpoints in `next-app/src/app/api/admin/` and associated auth/helper/service logic.
Mine exact request/response schemas, query parameters, path variables, error conditions, capability checks, and data models for:
1. `GET /api/admin/auth/verify` - auth headers/cookies, return payload (`authenticated`, `role`, `capabilities`: `canManageUsers`, `canViewPaymentLogs`, `canViewSystemLogs`, `canExecuteCrud`, `canAssignSuperadmin`), 401/403 status codes.
2. `GET /api/admin/metrics` - payload fields (total users, new users in 24h, active subscriptions, total revenue in cents, pending reports, active spaces, today's AI messages).
3. `GET /api/admin/users`, `POST /api/admin/users`, `GET /api/admin/users/[id]`, `PATCH /api/admin/users/[id]`, `DELETE /api/admin/users/[id]` - pagination, filtering (role, tier, status), search, user create/update fields, soft vs hard delete parameters.
4. `GET /api/admin/payments/subscriptions`, `PATCH /api/admin/payments/subscriptions`, `GET /api/admin/payments/invoices`, `POST /api/admin/payments/invoices` - subscription and invoice payload shapes, status values, creation/patch fields.
5. `GET /api/admin/logs` - category filtering (`payments`, `admin_audit`, `space_audit`, `ai_usage`, `guest_security`, `reports`), search, date range parameters, pagination.
6. `GET & POST /api/admin/crud/[entity]`, `GET, PATCH, DELETE /api/admin/crud/[entity]/[id]` - whitelisted entities, validation rules, primary key expectations, schema structures.

## Output
Write a comprehensive specification document to:
`c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_spec_miner_1\api_specifications.md`
and write your `handoff.md`.
Report back when complete.


## 2026-11-05T22:12:07Z
[Message] timestamp=2026-11-05T22:12:07Z sender=b94baafd-665a-4ce2-870b-448b49783b93 priority=MESSAGE_PRIORITY_HIGH content=You are teamwork_spec_miner assigned to Phase 0: Survey & Discovery for the Admin Dashboard UI.
Your working directory is:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_spec_miner_1\

Read ORIGINAL_REQUEST.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md

Also read your task dispatch at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_spec_miner_1\DISPATCH.md

Investigate all existing admin backend API route handlers under `next-app/src/app/api/admin/` and associated auth/helper files. Extract exact endpoint signatures, request methods, query parameters, payload schemas, response structures, status codes, error models, capability flags, and whitelisted CRUD entities.

Write your findings to:
`c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_spec_miner_1\api_specifications.md`
and write your `handoff.md`.
Use send_message to report completion back to parent when done.
