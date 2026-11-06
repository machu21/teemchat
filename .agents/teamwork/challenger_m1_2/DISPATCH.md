# Task Assignment: Empirical Verification - Route Guard & Privilege Escalation Hardening

**Role**: teamwork_challenger
**Working Directory**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\challenger_m1_2\
**Workspace Root**: c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson

## Mandatory Background Files to Read:
1. `ORIGINAL_REQUEST.md`: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md`
2. `PROJECT.md`: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\PROJECT.md`
3. `TEST_INFRA.md`: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\TEST_INFRA.md`
4. `worker_m1_2 handoff`: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m1_2\handoff.md`

## Challenge Mission:
Empirically stress-test the route guard and security state machine (`next-app/src/app/admin/page.tsx` and `next-app/tests/admin_guard.test.ts`):
1. **Adversarial Security Probing**:
   - Unauthorized access states: verify that unauthenticated sessions (401) and non-admin accounts (403) cannot mount or view administrative controls under any timing conditions.
   - Capability enforcement: test matrix of capability combinations (e.g. only `canManageUsers`, only `canExecuteCrud`, all false). Verify that forbidden tabs are completely inaccessible and unrenderable.
   - Privilege Escalation: verify that an admin with `canAssignSuperadmin: false` cannot escalate any account or themselves to `superadmin`.
   - Self-Deletion Guard: verify that an administrator cannot trigger soft or hard deletion against their own account ID.
   - Machine API Key Injection: verify `x-admin-api-key` header storage and persistence in `sessionStorage` vs `localStorage`.
2. **Execute Empirical Verification**:
   - Run `cd next-app; npx vitest run tests/admin_guard.test.ts tests/admin_client.test.ts`
   - Run `cd next-app; npm test`

Write `handoff.md` with your findings and verdict: **APPROVE** (secure and robust) or **REQUEST_CHANGES** (security gap found). Send a message back to parent when done.


## 2026-11-05T23:03:45Z
You are challenger_m1_2, assigned as Empirical Verification Challenger for Milestone 1 (Route Guard & Privilege Escalation Hardening).
Your working directory is:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\challenger_m1_2\

Read your dispatch instructions at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\challenger_m1_2\DISPATCH.md

Read ORIGINAL_REQUEST.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\ORIGINAL_REQUEST.md

Read PROJECT.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\PROJECT.md

Read TEST_INFRA.md at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\orchestrator\TEST_INFRA.md

Read worker_m1_2's handoff report at:
c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\worker_m1_2\handoff.md

Empirically challenge and stress-test the route guard, capability matrix, privilege escalation prevention, self-deletion guards, and dev machine key persistence. Run tests, write handoff.md with verdict APPROVE or REQUEST_CHANGES, and send_message back to parent when done.
