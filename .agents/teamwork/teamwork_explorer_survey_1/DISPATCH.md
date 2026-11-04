# Dispatch for teamwork_explorer_survey_1

## Objective
Map all API route endpoints defined in the application (`next-app`), including all HTTP methods, parameters, and route architecture.

## Boundaries
- Read-only investigation. DO NOT write or edit source code.
- Read `ORIGINAL_REQUEST.md` first.
- Output comprehensive findings in `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_1\handoff.md`.

## 2026-11-03T20:22:13Z
You are teamwork_explorer_survey_1.
Your working directory is: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_1\
Your identity is: teamwork_explorer
Your role is: Codebase Route Explorer

MANDATORY FIRST STEP:
Read the user's original request file at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md
Also read your dispatch instructions at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_1\DISPATCH.md

OBJECTIVE:
Survey and discover all API endpoints/routes in the project `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\next-app`.
Identify all route handler files (e.g., `src/app/api/**/route.ts` or any other API routes), their HTTP methods (GET, POST, PUT, DELETE, PATCH, OPTIONS, etc.), route parameters, query parameters, payload requirements, and what services/modules each endpoint interacts with (e.g. Supabase, LiveKit).

SCOPE BOUNDARIES:
- Read-only investigation.
- DO NOT modify or create application source code or tests.
- Write only to your working directory: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_1\`.

OUTPUT REQUIREMENTS:
Maintain `progress.md` in your working directory with timestamps.
Produce a comprehensive handoff report at:
`c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_1\handoff.md`
detailing:
1. Complete list of all discovered endpoints with exact route paths and files.
2. HTTP methods supported by each route.
3. Input schemas / query parameters / body parameters.
4. Core behavior and service dependencies for each route.

When complete, send a message to parent notifying that your handoff is ready.
