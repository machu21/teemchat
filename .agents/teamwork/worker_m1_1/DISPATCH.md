## 2026-11-03T20:31:00Z
You are worker_m1_1.
Your working directory is: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m1_1\
Your identity is: teamwork_worker
Your role is: API Test & Audit Worker

MANDATORY FIRST STEP:
Read the user's original request file at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md
Also read the project architecture, test infrastructure, and explorer handoffs at:
- c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\PROJECT.md
- c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\TEST_INFRA.md
- c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_1\handoff.md
- c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_explorer_survey_2\handoff.md
- c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\teamwork_spec_miner_survey_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
The team must NOT: copy code from existing open-source projects for core logic.

EXCLUSIVE WRITE OWNERSHIP:
You own exclusively:
- `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\next-app\tests\api\` (and all files inside it)
- `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\next-app\API_BEHAVIOR_AUDIT.md`
- Your working directory: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m1_1\`

OBJECTIVES & REQUIREMENTS:
1. Implement automated test suites in `next-app/tests/api/` covering all five (5) Next.js route handlers:
   - `tests/api/guest_identity.test.ts` (`GET /api/auth/guest-identity`)
   - `tests/api/register.test.ts` (`POST /api/auth/register`)
   - `tests/api/chat.test.ts` (`POST /api/companion/chat`)
   - `tests/api/screen_help.test.ts` (`POST /api/companion/screen-help`)
   - `tests/api/livekit_token.test.ts` (`POST /api/livekit/token`)

2. Test Coverage Requirements:
   - Cover every endpoint with both valid input scenarios and error/edge cases.
   - Assert exact status codes: 200, 400, 401, 403, 429, 500.
   - Assert response payload structures (both success JSON and error JSON).
   - Test rate limiting, anti-bot honeypots, form timing, disposable email filters, guest restrictions, quota exhaustion, and room authorization rules.
   - Ensure test isolation: reset `defaultRateLimiter.reset()` in `beforeEach()`, mock `@supabase/supabase-js`, `@google/genai`, and `livekit-server-sdk` cleanly.

3. Execute Test Verification:
   - Run the tests via terminal (`npm test` and `cd next-app && npx vitest run tests/api/`).
   - Ensure ALL tests run to completion and exit 0 without any unhandled runtime crashes or regressions.
   - Verify that all existing 154 unit tests also continue to pass.

4. Produce the API Behavior Audit Report:
   - Write a comprehensive audit report in `next-app/API_BEHAVIOR_AUDIT.md` (and copy to your working directory).
   - Document:
     - All 5 endpoints with routes, methods, and auth requirements.
     - Audited status codes and conditions.
     - Success and error payload schemas with concrete examples.
     - Error handling, security validations, and edge case resilience.
     - Full test execution summary: test files, test counts, execution time, pass rate.

5. Deliverable:
   - Write `handoff.md` in `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m1_1\handoff.md` with Observation, Logic Chain, Caveats, Conclusion, and Verification Method.
   - Send a message to parent when complete.
