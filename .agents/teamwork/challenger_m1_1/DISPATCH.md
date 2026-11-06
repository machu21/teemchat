# Task Assignment: Empirical Verification - API Client & Edge Case Stress Testing

**Role**: teamwork_challenger
**Working Directory**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\challenger_m1_1\
**Workspace Root**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson

## Mandatory Background Files to Read:
1. `ORIGINAL_REQUEST.md`: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md`
2. `PROJECT.md`: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\PROJECT.md`
3. `TEST_INFRA.md`: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\TEST_INFRA.md`
4. `worker_m1_2 handoff`: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m1_2\handoff.md`

## Challenge Mission:
Empirically stress-test `AdminClientService` (`next-app/src/lib/services/adminClient.ts`):
1. **Adversarial Input & Edge Cases**:
   - Empty queries, undefined values, special characters in search (`/`, `?`, `&`, `#`, `%`).
   - Unicode, zero-width characters, oversized strings, and SQL injection strings (`' OR 1=1 --`).
   - Rate limiting handling (HTTP 429) and retry-after header parsing.
   - Non-JSON server error responses (HTTP 502 Bad Gateway with raw HTML text).
   - Network timeout or fetch abort simulation.
   - CRUD entity validation: verify that non-whitelisted entities (`evil_table`, `users`, `auth.users`) are strictly rejected with 400 bad request before making network calls.
2. **Execute Empirical Verification**:
   - You may write an ephemeral test runner or execute vitest assertions to verify how `AdminClientService` handles these stresses.
   - Run `cd next-app; npx vitest run tests/admin_client.test.ts tests/admin_guard.test.ts`
   - Run `cd next-app; npm run lint`

Write `handoff.md` with your findings and verdict: **APPROVE** (correct and resilient) or **REQUEST_CHANGES** (vulnerabilities or crashes found). Send a message back to parent when done.

## 2026-11-05T23:03:40Z
[Message] timestamp=2026-11-05T23:03:40Z sender=b94baafd-665a-4ce2-870b-448b49783b93 priority=MESSAGE_PRIORITY_HIGH
content=You are challenger_m1_1, assigned as Empirical Verification Challenger for Milestone 1 (API Client & Edge Case Stress Testing).
Your working directory is:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\challenger_m1_1\

Read your dispatch instructions at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\challenger_m1_1\DISPATCH.md

Read ORIGINAL_REQUEST.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md

Read PROJECT.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\PROJECT.md

Read TEST_INFRA.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\TEST_INFRA.md

Read worker_m1_2's handoff report at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m1_2\handoff.md

Empirically challenge and stress-test the AdminClientService (malformed queries, special characters, error handling, rate limits, non-whitelisted entities). Run tests, write handoff.md with verdict APPROVE or REQUEST_CHANGES, and send_message back to parent when done.
