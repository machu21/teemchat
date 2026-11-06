# Survey & Discovery Report: Admin Routing, Auth/Session Lifecycle & Testing Setup

**Agent**: `survey_explorer_3` (teamwork_explorer)  
**Date**: 2026-11-05T22:25:00Z  
**Target Milestone**: Phase 0: Survey & Discovery for Admin Dashboard UI  
**Target Output File**: `c:\Users\ACER.DESKTOP-FLMICGU\Documents\antigravity\clever-carson\.agents\teamwork\survey_explorer_3\routing_auth_test_report.md`

---

## Executive Summary

This report establishes the foundational architecture for the TeemChat Admin Dashboard UI at `/admin`. Through direct inspection of the codebase, existing API route handlers, authentication stores, and testing framework, we have determined:
1. **Route Status**: The directory `next-app/src/app/admin/` does not currently exist (`Test-Path` returned `False`). It represents a greenfield route implementation where `page.tsx`, `admin.module.css`, and associated admin UI components will be introduced.
2. **Backend API Readiness**: All required backend endpoints under `next-app/src/app/api/admin/` (`auth/verify`, `metrics`, `users`, `payments`, `logs`, `crud`) are already fully implemented, rate-limited, and backed by robust unit tests (`next-app/tests/api/admin_*.test.ts`).
3. **Auth & Session Mechanism**: Authentication tokens in TeemChat are client-side JWTs managed via `@supabase/supabase-js` (`supabase.auth.getSession()`). Route protection for `/admin` must be handled client-side on mount via `GET /api/admin/auth/verify`, attaching the Bearer access token (or optional `x-admin-api-key` machine secret). Next.js middleware is intentionally scoped only to `['/', '/api/:path*']` and does not intercept page navigations because session tokens reside in `localStorage`, not HTTP-only cookies.
4. **Test Environment Constraints**: Vitest is configured with `environment: 'node'` (`next-app/vitest.config.mts`). Neither `jsdom` nor `@testing-library/react` are installed in `next-app/package.json`. Following the established pattern across the existing 48 test files, the Admin Dashboard should be tested via modular service, guard, and state test suites (`tests/admin_client.test.ts`, `tests/admin_guard.test.ts`), guaranteeing clean execution.
5. **Baseline Quality Verification**: The existing codebase passes `npm test` with 515/515 passing tests across 48 test files (0 failures) and passes `npm run lint` with 0 ESLint errors.

---

## 1. `/admin` Route Exploration & Status

### 1.1 Filesystem Check
Inspection of `next-app/src/app/` reveals:
- Existing user-facing routes:
  - `/` (`page.tsx`)
  - `/dashboard` (`page.tsx`, `dashboard.module.css`)
  - `/space/[code]` (`page.tsx`, `world.module.css`)
  - `/auth/callback` (`page.tsx`, `callback.module.css`)
  - `/contact`, `/privacy`, `/refunds`, `/terms`
- Checking `next-app/src/app/admin`:
  ```powershell
  Test-Path next-app\src\app\admin  # Returns False
  ```
- **Conclusion**: There is no legacy or incomplete `/admin` page code. We are building on a clean slate.

### 1.2 Layout & Global Shell Context
`next-app/src/app/layout.tsx` defines the root HTML document with:
- Font configuration: `Plus_Jakarta_Sans` via CSS variable `--font-plus-jakarta`.
- `NativeAuthListener`: Listens for native Capacitor app deep links and auth callbacks.
- Global styles imported from `./globals.css`.
- Notice that `RootLayout` does **not** provide a React Context provider tree (no session provider or Redux). All state is distributed via Zustand stores (`useSessionStore`, `useThemeStore`, `useSocialStore`).
- Therefore, `/admin` inherits the global font and styling tokens without interference, and must be marked with `'use client'` because it depends on client-side state, lifecycle hooks, and browser navigation.

---

## 2. Client Auth, Session Lifecycle & Token Propagation

### 2.1 The Session Store (`next-app/src/stores/session.ts`)
The client session is managed by `useSessionStore` (`zustand`):
```typescript
interface SessionState {
  session: UserSession | null;
  isLoading: boolean;
  isGuest: boolean;
  initSession: () => Promise<void>;
  signInGuest: (...) => Promise<void>;
  signInWithPassword: (...) => Promise<{ error?: string }>;
  ...
}
```
Key observations regarding `session.ts`:
1. On initialization (`initSession()`), it calls:
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   ```
2. If `session?.user` is present, it queries the `profiles` table:
   ```typescript
   const { data: profile } = await supabase
     .from('profiles')
     .select('*')
     .eq('id', session.user.id)
     .maybeSingle();
   ```
3. The stored `UserSession` model (`next-app/src/lib/models/user.ts`) contains:
   ```typescript
   export interface UserSession {
     id: string;
     displayName: string;
     username: string;
     email: string;
     status: string;
     avatarConfig: AvatarConfig;
     gender: Gender;
     isGuest: boolean;
     tier: 'free' | 'paid';
     isPaid: boolean;
     hasAiCompanion: boolean;
   }
   ```
4. Note that `UserSession` currently stores profile presentation details, but does **not** cache administrative security roles (`system_role`) on the client session object. This is a deliberate security decision: administrative privileges must always be validated authoritatively against the backend rather than trusted from client store cache.

### 2.2 Token Retrieval & API Header Construction
When client code communicates with administrative endpoints in `/api/admin/*`, the server-side validator `verifyAdminRequest(req)` (`next-app/src/lib/admin/adminAuth.ts`) requires either:
1. **Bearer Token Authentication**:
   ```http
   Authorization: Bearer <supabase_access_token>
   ```
   On the client, this token is retrieved dynamically:
   ```typescript
   import { supabase } from '@/lib/supabase';

   export async function getAdminAuthHeaders(): Promise<HeadersInit> {
     const headers: Record<string, string> = {
       'Content-Type': 'application/json',
     };

     // 1. Check for active Supabase session access token
     const { data: { session } } = await supabase.auth.getSession();
     if (session?.access_token) {
       headers['Authorization'] = `Bearer ${session.access_token}`;
     }

     // 2. Check for optional machine API key stored in sessionStorage/dev fallback
     if (typeof window !== 'undefined') {
       const devApiKey = sessionStorage.getItem('teem_admin_api_key');
       if (devApiKey) {
         headers['x-admin-api-key'] = devApiKey.trim();
       }
     }

     return headers;
   }
   ```
2. **Machine Secret Authentication**:
   ```http
   x-admin-api-key: <ADMIN_SECRET_KEY>
   ```
   If valid, `adminAuth.ts` creates a synthetic superadmin context:
   `id: '00000000-0000-0000-0000-000000000000'`, `systemRole: 'superadmin'`, `isMachineKey: true`.

---

## 3. Route Guarding Architecture for `/admin`

### 3.1 Why Client-Side Route Guarding is Necessary
In `next-app/src/middleware.ts`:
```typescript
export const config = {
  matcher: ['/', '/api/:path*'],
};
```
Middleware only intercepts `/` (for native Capacitor app rewrites to `/app`) and `/api/:path*` (for rate limiting). It does **not** intercept `/admin` or `/dashboard`.
- **Reason**: TeemChat sessions are stored client-side in browser `localStorage` under `@supabase/supabase-js`. Edge/server middleware does not have access to these tokens unless converted to HTTP cookies.
- **Precedent**: The `/dashboard` route (`next-app/src/app/dashboard/page.tsx:156-160`) demonstrates this established pattern:
  ```typescript
  // Auth guard: the dashboard requires a signed-in user or a guest session.
  // Sessions live in localStorage, so this has to run client-side after initSession resolves.
  const needsAuthRedirect = !isSessionLoading && !session;
  useEffect(() => {
    if (needsAuthRedirect) router.replace('/');
  }, [needsAuthRedirect, router]);
  ```

### 3.2 The `/admin` Verification Contract
For `/admin`, the route guard must be much stricter than `/dashboard`: it requires not just *any* authenticated session, but explicit verification by calling `GET /api/admin/auth/verify`.

Inspection of `next-app/src/app/api/admin/auth/verify/route.ts` and `adminAuth.ts` shows the exact server response contract:

| Status Code | Scenario | Server Response Body |
|---|---|---|
| **401 Unauthorized** | Missing `Authorization` / `x-admin-api-key` or expired/invalid token | `{"error": "Unauthorized", "message": "Missing or malformed Authorization header."}` |
| **403 Forbidden** | Valid user token, but `profile.system_role` is `'user'` or `'moderator'` | `{"error": "Forbidden", "message": "Insufficient administrative privileges. Access denied."}` |
| **429 Too Many Requests** | Rate limit exceeded (>120 requests/min from IP) | `{"error": "Rate limit exceeded", "retryAfter": <seconds>}` |
| **200 OK** | Authenticated admin or superadmin | See payload below |

#### 200 OK Response Payload:
```json
{
  "verified": true,
  "admin": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "admin@teemchat.chat",
    "username": "admin_joe",
    "displayName": "Joe Admin",
    "systemRole": "admin",
    "isMachineKey": false
  },
  "capabilities": {
    "canManageUsers": true,
    "canViewPaymentLogs": true,
    "canViewSystemLogs": true,
    "canExecuteCrud": true,
    "canAssignSuperadmin": false
  }
}
```
*Note*: `capabilities.canAssignSuperadmin` is dynamically computed on the server as `auth.admin.systemRole === 'superadmin'`.

### 3.3 Guard Lifecycle State Machine
The `/admin` client component must implement a 4-state lifecycle machine:

```
                  ┌────────────────────────┐
                  │    1. CHECKING_AUTH    │
                  │ (Full-screen Spinner)  │
                  └───────────┬────────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
     ┌──────────────────┐ ┌──────────────┐ ┌─────────────────┐
     │ 2. UNAUTHENTICATED│ │3. FORBIDDEN │ │ 4. AUTHORIZED   │
     │     (HTTP 401)   │ │  (HTTP 403)  │ │   (HTTP 200)    │
     │ Prompt login /   │ │ Access Denied│ │ Render Tabs &   │
     │ Enter Admin Key  │ │ Return Home  │ │ Capabilities UI │
     └──────────────────┘ └──────────────┘ └─────────────────┘
```

1. **`CHECKING_AUTH`**:
   - Render a centered Neo-brutalist card with an animated SVG spinner and text: *"Verifying administrative credentials..."*.
   - Never flash admin dashboard components before verification completes.
2. **`UNAUTHENTICATED` (401)**:
   - Render `AccessDenied` view with SVG Lock icon (zero emojis).
   - Headline: *"Authentication Required"*.
   - Explanatory copy: *"You must be logged in with an administrative account to access this area."*
   - Actions:
     - `NeoButton variant="primary"`: *"Sign In"* (triggers login flow).
     - `NeoButton variant="secondary"`: *"Enter Admin API Key"* (opens secret key input prompt for machine/emergency access).
     - `NeoButton variant="subtle"`: *"Return to Home"*.
3. **`FORBIDDEN` (403)**:
   - Render `AccessDenied` view with SVG Shield/Alert icon.
   - Headline: *"Access Forbidden"*.
   - Explanatory copy: *"Your account (`{username}`) does not have administrative privileges."*
   - Displays user ID, current role (`user`), and timestamp.
   - Actions:
     - `NeoButton variant="secondary"`: *"Switch Account"*.
     - `NeoButton variant="primary"`: *"Return to Dashboard"*.
4. **`AUTHORIZED` (200)**:
   - Sets verified state and stores `admin` profile and `capabilities`.
   - Mounts dashboard layout with tabbed navigation: Overview, Users, Payments, Logs, CRUD.
   - Conditionally displays tabs based on `capabilities`:
     - Users tab disabled/hidden if `!capabilities.canManageUsers`
     - Payments tab disabled/hidden if `!capabilities.canViewPaymentLogs`
     - Logs tab disabled/hidden if `!capabilities.canViewSystemLogs`
     - CRUD tab disabled/hidden if `!capabilities.canExecuteCrud`
     - In user creation/edit modal, the `"superadmin"` role selector is disabled unless `capabilities.canAssignSuperadmin` is `true`.

---

## 4. Test Environment & Linter Setup

### 4.1 Vitest Configuration (`next-app/vitest.config.mts`)
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
```
**Critical Discovery**:
- The Vitest environment is explicitly set to `'node'`.
- `jsdom` and `@testing-library/react` are **not installed** in `next-app/package.json`.
- Therefore, running tests that attempt to use `render(<AdminDashboard />)` without DOM emulation will throw `ReferenceError: document is not defined`.

### 4.2 How the Existing Codebase Solves Testing (Patterns in `next-app/tests/`)
Review of all 48 existing test files shows how the engineering team achieves 100% test coverage and high confidence without `jsdom`:

1. **API Route Handlers (`tests/api/*.test.ts`)**:
   Directly invokes `GET(req)`, `POST(req)`, `PATCH(req)`, `DELETE(req)` handlers using `next/server`'s `NextRequest`. Database calls (`@supabase/supabase-js`) and rate limiters are mocked using `vi.mock()` and `vi.fn()`.
2. **Service Layer & API Clients (`tests/billing.test.ts`, `tests/invite.test.ts`)**:
   Mocks `fetch` or `supabase.functions.invoke`. Stubs `window` using `vi.stubGlobal('window', { ... })` and resets in `afterEach(() => vi.unstubAllGlobals())`.
3. **State & Store Logic (`tests/social.test.ts`, `tests/controls_settings.test.ts`)**:
   Directly tests store actions, mutation reducers, and async side effects.
4. **Event & Presence Simulation (`tests/dashboard_presence.test.ts:58-62`)**:
   Minimal browser globals are stubbed via `EventTarget`:
   ```typescript
   const fakeDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
   vi.stubGlobal('window', new EventTarget());
   vi.stubGlobal('document', fakeDocument);
   ```

### 4.3 ESLint Configuration (`next-app/eslint.config.mjs`)
Uses the Next.js 16 flat config:
- Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts`.
- Strictest rules: no unused variables, React 19 hook dependency rules, zero syntax or import errors.
- Baseline check: `npm run lint` executed cleanly with 0 errors.

---

## 5. Architectural Blueprint for `/admin` Implementation & Testing

Based on the survey findings, the recommended architecture separates UI rendering, service communication, and state management into clean, highly testable layers.

### 5.1 Proposed Directory & File Layout
```
next-app/src/
├── app/
│   └── admin/
│       ├── page.tsx                  # Main client entrypoint ('use client') with route guard
│       └── admin.module.css          # Neo-brutalist dashboard styles (borders, shadows, grid)
├── components/
│   └── admin/
│       ├── AdminNav.tsx              # Top bar, capability badges, theme toggle, logout
│       ├── AccessDenied.tsx          # 401 & 403 access blocked states with SVG iconography
│       ├── OverviewTab.tsx           # Metrics cards, 24h stats, revenue counter
│       ├── UsersTab.tsx              # User table, filters, create/edit modal, delete
│       ├── PaymentsTab.tsx           # Subscriptions & invoices manager
│       ├── LogsTab.tsx               # Categorized system & audit log viewer
│       ├── CrudExplorerTab.tsx       # Entity browser & CRUD inspector
│       └── AdminIcons.tsx            # Zero-emoji crisp SVG icon library
├── lib/
│   └── services/
│       └── adminClient.ts            # Client-side typed SDK for all /api/admin/* endpoints
└── stores/
    └── admin.ts                      # Optional: lightweight Zustand store for admin state
```

### 5.2 The Admin Client SDK (`src/lib/services/adminClient.ts`)
To make both the UI and test suites effortless to maintain, all fetch calls to `/api/admin/*` should be encapsulated in `AdminClientService`:
```typescript
export interface AdminAuthVerifyResult {
  verified: boolean;
  admin: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    systemRole: 'admin' | 'superadmin';
    isMachineKey: boolean;
  };
  capabilities: {
    canManageUsers: boolean;
    canViewPaymentLogs: boolean;
    canViewSystemLogs: boolean;
    canExecuteCrud: boolean;
    canAssignSuperadmin: boolean;
  };
}

export class AdminClientService {
  static async getHeaders(): Promise<HeadersInit> { ... }
  static async verifyAuth(): Promise<AdminAuthVerifyResult> { ... }
  static async getMetrics(): Promise<AdminMetricsPayload> { ... }
  static async getUsers(params: PaginationQuery): Promise<AdminUsersResponse> { ... }
  static async createUser(payload: CreateUserInput): Promise<AdminUserRecord> { ... }
  static async updateUser(id: string, payload: UpdateUserInput): Promise<AdminUserRecord> { ... }
  static async deleteUser(id: string, hard?: boolean): Promise<{ success: boolean }> { ... }
  static async getSubscriptions(params: PaginationQuery): Promise<SubscriptionsResponse> { ... }
  static async updateSubscription(id: string, payload: SubscriptionOverrideInput): Promise<any> { ... }
  static async getInvoices(params: PaginationQuery): Promise<InvoicesResponse> { ... }
  static async createInvoice(payload: CreateInvoiceLogInput): Promise<any> { ... }
  static async getLogs(params: LogQueryParams): Promise<AdminLogsResponse> { ... }
  static async getCrudEntities(): Promise<readonly string[]> { ... }
  static async getCrudList(entity: string, params: PaginationQuery): Promise<CrudListResponse> { ... }
  static async createCrudRecord(entity: string, data: Record<string, unknown>): Promise<any> { ... }
  static async updateCrudRecord(entity: string, id: string, data: Record<string, unknown>): Promise<any> { ... }
  static async deleteCrudRecord(entity: string, id: string): Promise<{ success: boolean }> { ... }
}
```

### 5.3 Test Suite Strategy for `/admin`
We will introduce two focused test suites in `next-app/tests/`:

#### Test Suite 1: `next-app/tests/admin_client.test.ts`
- Tests `AdminClientService` methods against mocked `fetch` calls.
- Verifies header propagation (`Bearer <token>` and `x-admin-api-key`).
- Verifies query parameter serialization (`search`, `status`, `role`, `tier`, `page`, `limit`, `category`).
- Verifies HTTP error handling (401, 403, 429, 500).
- Verifies mutation payload structure and URL targeting (`PATCH /api/admin/users/[id]`, `DELETE /api/admin/crud/[entity]/[id]`).

#### Test Suite 2: `next-app/tests/admin_guard.test.ts`
- Tests route guard decision logic:
  - Transition from `CHECKING` -> `UNAUTHENTICATED` when 401 is received.
  - Transition from `CHECKING` -> `FORBIDDEN` when 403 is received.
  - Transition from `CHECKING` -> `AUTHORIZED` when 200 is received.
  - Evaluation of capability flags (`canManageUsers`, `canViewPaymentLogs`, `canViewSystemLogs`, `canExecuteCrud`, `canAssignSuperadmin`).
  - Permission checks preventing non-superadmins from assigning superadmin roles.

---

## 6. Verification Results

| Quality Gate | Command | Baseline Result | Details |
|---|---|---|---|
| **Unit & Integration Tests** | `npm test` | **PASS (515/515 passed)** | 48 test files, 0 failures, completed in 16.43s. All existing admin API tests (`admin_auth.test.ts`, `admin_crud.test.ts`, `admin_logs.test.ts`, `admin_payments.test.ts`, `admin_users.test.ts`) pass cleanly. |
| **Linter** | `npm run lint` | **PASS (0 errors)** | Flat ESLint with core-web-vitals and typescript checks exits cleanly with 0 errors or warnings. |

---

## 7. Actionable Recommendations for Implementation Phases

1. **Create Greenfield Route**:
   Build `next-app/src/app/admin/page.tsx` and `next-app/src/app/admin/admin.module.css`.
2. **Client-Side Auth Mounting**:
   Implement `useEffect` on mount in `/admin/page.tsx` that calls `AdminClientService.verifyAuth()`.
3. **Graceful Unauthorized/Forbidden UI**:
   Build dedicated Neo-brutalist `AccessDenied` component displaying appropriate instructions and action buttons for 401 vs 403.
4. **Clean Capability Checks**:
   Use capability flags directly from the server response rather than calculating permissions client-side.
5. **Node-Compatible Testing**:
   Write tests in `next-app/tests/admin_client.test.ts` and `next-app/tests/admin_guard.test.ts` using Vitest's node environment, avoiding DOM-dependent library imports.
