# Architectural Plan & Implementation Specification: Admin Client SDK (`AdminClientService`) and Test Suite

**Author**: `explorer_m1_1` (Client SDK Architect)  
**Milestone**: Milestone 1: Production Admin Dashboard UI  
**Target Files**:
- `next-app/src/lib/services/adminClient.ts` (Client SDK Service)
- `next-app/tests/admin_client.test.ts` (Vitest Unit Test Suite)  
**Date**: 2026-11-05  
**Integrity Mode**: Development / Neo-Brutalist Architecture  

---

## 1. Executive Summary & Architecture Overview

The `AdminClientService` serves as the centralized, strictly typed client SDK that connects the TeemChat Admin Dashboard UI (`/admin`) to the 17 backend administrative REST endpoints under `next-app/src/app/api/admin/`.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   TeemChat Admin Dashboard UI                          │
│               (/admin/page.tsx & Tab Components)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Calls typed methods
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        AdminClientService                              │
│             (next-app/src/lib/services/adminClient.ts)                 │
├────────────────────────────────────────────────────────────────────────┤
│ • Auth Header Injection (Bearer JWT + Machine X-Admin-Api-Key)        │
│ • Query Serialization (Search, Pagination, Sorting, Category, Filters) │
│ • Entity-Specific Normalization (space_settings, space_members)        │
│ • Unified Error Mapping (AdminApiError: 401, 403, 404, 429, 500)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP Fetch (JSON)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Next.js 16 App Router API Handlers                   │
│                        (/api/admin/*)                                  │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ /auth/verify      │ /metrics          │ /users, /users/[id]            │
│ /payments/subs    │ /payments/invoices│ /logs                          │
│ /crud/[entity]    │ /crud/[entity]/id │ Rate Limiters & Audit Logs     │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

### Key Architectural Tenets
1. **Zero External Dependencies**: Uses native web standards (`fetch`, `Headers`, `URLSearchParams`) and TypeScript types derived from `@/lib/admin/schemas`.
2. **Dual Authentication Support**:
   - User Bearer token dynamically obtained from `@supabase/supabase-js` (`supabase.auth.getSession()`).
   - Machine API key (`x-admin-api-key`) retrieved from session storage or in-memory fallback.
3. **Structured Error Handling**: All HTTP error responses (`status >= 400`) are mapped into a standardized `AdminApiError` providing error classification flags (`isUnauthorized`, `isForbidden`, `isRateLimited`, `isNotFound`), HTTP status code, server details, and `retryAfter` timestamps.
4. **Node-Environment Compatibility**: Completely compatible with Vitest's `node` test environment (`environment: 'node'`) without requiring `jsdom` or `@testing-library/react`.

---

## 2. Complete TypeScript Type Definitions & Data Contracts

All interfaces must be cleanly exported from `next-app/src/lib/services/adminClient.ts` to allow type sharing across the UI layer and test suites:

```typescript
import {
  SystemRole,
  CreateUserInput,
  UpdateUserInput,
  PaginationQuery,
  SubscriptionOverrideInput,
  CreateInvoiceLogInput,
  WhitelistedCrudEntity,
  WHITELISTED_CRUD_ENTITIES,
} from '@/lib/admin/schemas';

// Re-export core schemas and types for convenience
export { WHITELISTED_CRUD_ENTITIES };
export type {
  SystemRole,
  CreateUserInput,
  UpdateUserInput,
  PaginationQuery,
  SubscriptionOverrideInput,
  CreateInvoiceLogInput,
  WhitelistedCrudEntity,
};

/* -------------------------------------------------------------------------- */
/*                               Auth & Capabilities                          */
/* -------------------------------------------------------------------------- */

export interface AdminUserIdentity {
  id: string;
  email: string;
  username: string;
  displayName: string;
  systemRole: SystemRole;
  isMachineKey: boolean;
}

export interface AdminCapabilities {
  canManageUsers: boolean;
  canViewPaymentLogs: boolean;
  canViewSystemLogs: boolean;
  canExecuteCrud: boolean;
  canAssignSuperadmin: boolean;
}

export interface AdminVerifyResponse {
  verified: boolean;
  admin: AdminUserIdentity;
  capabilities: AdminCapabilities;
}

/* -------------------------------------------------------------------------- */
/*                               Metrics                                      */
/* -------------------------------------------------------------------------- */

export interface AdminMetricsData {
  totalUsers: number;
  newUsers24h: number;
  activeSubscriptions: number;
  totalRevenueCents: number;
  pendingReports: number;
  activeSpaces: number;
  todayAiMessages: number;
}

export interface AdminMetricsResponse {
  metrics: AdminMetricsData;
  timestamp: string;
}

/* -------------------------------------------------------------------------- */
/*                               Pagination                                   */
/* -------------------------------------------------------------------------- */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/* -------------------------------------------------------------------------- */
/*                               Users Tab                                    */
/* -------------------------------------------------------------------------- */

export interface AdminUserProfile {
  id: string;
  username: string;
  display_name: string;
  status: 'available' | 'away' | 'busy' | 'offline' | 'banned';
  status_message: string | null;
  gender: 'male' | 'female';
  tier: 'free' | 'pro' | 'enterprise';
  is_paid: boolean;
  system_role: SystemRole;
  has_ai_companion: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'created_at' | 'username' | 'display_name' | 'status' | 'tier' | 'system_role';
  sortOrder?: 'asc' | 'desc';
  status?: string;
  role?: SystemRole;
  tier?: string;
}

export interface AdminUsersResponse {
  users: AdminUserProfile[];
  pagination: PaginationMeta;
}

export interface AdminCreateUserResponse {
  message: string;
  user: {
    id: string;
    email: string;
    profile: Record<string, unknown>;
  };
}

export interface AdminUserDossier {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  profile: Record<string, unknown>;
  subscription: Record<string, unknown> | null;
  aiUsage: Array<Record<string, unknown>>;
  reports: {
    total: number;
    items: Array<Record<string, unknown>>;
  };
  spaces: {
    total: number;
    memberships: Array<Record<string, unknown>>;
  };
}

export interface AdminUserDossierResponse {
  user: AdminUserDossier;
}

export interface AdminUpdateUserResponse {
  message: string;
  profile: Record<string, unknown>;
}

export interface AdminDeleteUserResponse {
  message: string;
}

/* -------------------------------------------------------------------------- */
/*                               Payments Tab                                 */
/* -------------------------------------------------------------------------- */

export interface AdminSubscriptionProfile {
  id: string;
  username: string;
  display_name: string;
  tier: string;
  system_role: SystemRole;
}

export interface AdminSubscriptionItem {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  has_ai_unlimited: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  profiles?: AdminSubscriptionProfile;
}

export interface AdminSubscriptionsQuery {
  page?: number;
  limit?: number;
  status?: 'active' | 'trialing' | 'past_due' | 'canceled';
  sortBy?: 'created_at' | 'updated_at' | 'status' | 'current_period_end';
  sortOrder?: 'asc' | 'desc';
}

export interface AdminSubscriptionsResponse {
  subscriptions: AdminSubscriptionItem[];
  pagination: PaginationMeta;
}

export interface AdminSubscriptionUpdatePayload extends SubscriptionOverrideInput {
  id?: string;
  userId?: string;
}

export interface AdminSubscriptionUpdateResponse {
  message: string;
  subscription: Record<string, unknown>;
}

export interface AdminInvoiceItem {
  id: string;
  user_id: string;
  stripe_invoice_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  invoice_pdf: string | null;
  paid_at: string | null;
  created_at: string;
  profiles?: {
    id: string;
    username: string;
    display_name: string;
  };
}

export interface AdminInvoicesQuery {
  page?: number;
  limit?: number;
  status?: 'paid' | 'open' | 'void' | 'uncollectible';
  sortBy?: 'created_at' | 'amount_cents' | 'paid_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface AdminInvoicesResponse {
  invoices: AdminInvoiceItem[];
  pagination: PaginationMeta;
}

export interface AdminCreateInvoiceResponse {
  message: string;
  invoice: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*                               Logs Tab                                     */
/* -------------------------------------------------------------------------- */

export type AdminLogCategory =
  | 'payments'
  | 'admin_audit'
  | 'space_audit'
  | 'ai_usage'
  | 'guest_security'
  | 'reports';

export interface AdminLogsQuery {
  category?: AdminLogCategory;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface AdminLogsResponse<T = Record<string, unknown>> {
  category: AdminLogCategory;
  logs: T[];
  pagination: PaginationMeta;
}

/* -------------------------------------------------------------------------- */
/*                               CRUD Explorer Tab                            */
/* -------------------------------------------------------------------------- */

export interface AdminCrudQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, string | number | boolean>;
}

export interface AdminCrudListResponse<T = Record<string, unknown>> {
  entity: WhitelistedCrudEntity;
  records: T[];
  pagination: PaginationMeta;
}

export interface AdminCrudDetailResponse<T = Record<string, unknown>> {
  entity: WhitelistedCrudEntity;
  record: T;
}

export interface AdminCrudCreateResponse<T = Record<string, unknown>> {
  message: string;
  record: T;
}

export interface AdminCrudUpdateResponse<T = Record<string, unknown>> {
  message: string;
  record: T;
}

export interface AdminCrudDeleteResponse {
  message: string;
}

/* -------------------------------------------------------------------------- */
/*                               Request Options                              */
/* -------------------------------------------------------------------------- */

export interface AdminRequestOptions {
  token?: string;
  apiKey?: string;
  signal?: AbortSignal;
}
```

---

## 3. Standardized Error Architecture (`AdminApiError`)

When an HTTP response code is `>= 400`, `AdminClientService` throws an `AdminApiError`:

```typescript
export class AdminApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  readonly retryAfter?: number;

  constructor(status: number, message: string, data?: unknown, retryAfter?: number) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.data = data;
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, AdminApiError.prototype);
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}
```

### Response Parsing Logic
1. Reads `response.headers.get('retry-after')` or JSON `retryAfter` if status is `429`.
2. Inspects `Content-Type` for `application/json`:
   - If JSON, parses body and extracts `payload.message || payload.error || response.statusText`.
   - If plain text or HTML (e.g. 502 Bad Gateway), grabs raw text or defaults to `HTTP ${response.status} Error`.
3. Constructs and throws `new AdminApiError(response.status, message, payload, retryAfter)`.

---

## 4. `AdminClientService` Concrete Class Specification

The service is designed with static methods (with optional instance methods for custom client scopes).

```typescript
export class AdminClientService {
  private static devApiKey: string | null = null;
  private static readonly API_BASE = '/api/admin';

  /**
   * Sets or clears a persistent developer/machine API key used for X-Admin-Api-Key headers.
   */
  static setDevApiKey(key: string | null): void {
    this.devApiKey = key ? key.trim() : null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (key) {
        window.sessionStorage.setItem('teem_admin_api_key', key.trim());
      } else {
        window.sessionStorage.removeItem('teem_admin_api_key');
      }
    }
  }

  /**
   * Retrieves the currently active developer/machine API key.
   */
  static getDevApiKey(): string | null {
    if (this.devApiKey) return this.devApiKey;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem('teem_admin_api_key');
    }
    return null;
  }

  /**
   * Assembles standard administrative request headers, automatically resolving
   * Supabase session bearer tokens and stored developer API keys.
   */
  static async getHeaders(options?: AdminRequestOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // 1. Explicit token parameter or Supabase Auth session token
    let token = options?.token;
    if (!token) {
      try {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
      } catch {
        // In node/test environments without active session, ignore
      }
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 2. Explicit apiKey parameter or machine key from storage
    const apiKey = options?.apiKey || this.getDevApiKey();
    if (apiKey) {
      headers['x-admin-api-key'] = apiKey;
    }

    return headers;
  }

  /**
   * Serializes arbitrary query parameters into a URL-encoded search string.
   */
  static buildQuery(params?: Record<string, unknown>): string {
    if (!params) return '';
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      if (key === 'filters' && typeof value === 'object' && !Array.isArray(value)) {
        for (const [filterKey, filterValue] of Object.entries(value as Record<string, unknown>)) {
          if (filterValue !== undefined && filterValue !== null && filterValue !== '') {
            searchParams.append(filterKey, String(filterValue));
          }
        }
      } else {
        searchParams.append(key, String(value));
      }
    }

    const query = searchParams.toString();
    return query ? `?${query}` : '';
  }

  /**
   * Internal request executor handling fetch, headers, and error mapping.
   */
  private static async request<T>(
    endpoint: string,
    init: RequestInit,
    options?: AdminRequestOptions
  ): Promise<T> { ... }
```

### Detailed Method Signatures (All 17 Features)

#### 1. Auth & Verification
```typescript
/**
 * Verifies admin credentials and returns identity and capability flags.
 * Endpoint: GET /api/admin/auth/verify
 */
static async verifyAuth(options?: AdminRequestOptions): Promise<AdminVerifyResponse>
```

#### 2. System Overview Metrics
```typescript
/**
 * Retrieves aggregate platform statistics and metrics.
 * Endpoint: GET /api/admin/metrics
 */
static async getMetrics(options?: AdminRequestOptions): Promise<AdminMetricsResponse>
```

#### 3. User Listing & Filtering
```typescript
/**
 * Lists users with pagination, text search, role/tier/status filters, and sorting.
 * Endpoint: GET /api/admin/users
 */
static async getUsers(
  query?: AdminUsersQuery,
  options?: AdminRequestOptions
): Promise<AdminUsersResponse>
```

#### 4. User Provisioning
```typescript
/**
 * Provisions a new user account in auth and profiles.
 * Endpoint: POST /api/admin/users
 */
static async createUser(
  payload: CreateUserInput,
  options?: AdminRequestOptions
): Promise<AdminCreateUserResponse>
```

#### 5. User Dossier Inspection
```typescript
/**
 * Retrieves full user details (auth, profile, subscriptions, AI usage, reports, spaces).
 * Endpoint: GET /api/admin/users/[id]
 */
static async getUser(
  id: string,
  options?: AdminRequestOptions
): Promise<AdminUserDossierResponse>
```

#### 6. User Profile Modification
```typescript
/**
 * Updates profile fields, optional password reset, and system role (superadmin required).
 * Endpoint: PATCH /api/admin/users/[id]
 */
static async updateUser(
  id: string,
  payload: UpdateUserInput,
  options?: AdminRequestOptions
): Promise<AdminUpdateUserResponse>
```

#### 7. User Suspension & Deletion
```typescript
/**
 * Soft bans (100-yr auth suspension) or permanently hard-deletes a user.
 * Endpoint: DELETE /api/admin/users/[id]?mode=soft|hard
 */
static async deleteUser(
  id: string,
  mode: 'soft' | 'hard' = 'soft',
  options?: AdminRequestOptions
): Promise<AdminDeleteUserResponse>
```

#### 8. Subscriptions Listing
```typescript
/**
 * Lists subscriptions with joined user profile details.
 * Endpoint: GET /api/admin/payments/subscriptions
 */
static async getSubscriptions(
  query?: AdminSubscriptionsQuery,
  options?: AdminRequestOptions
): Promise<AdminSubscriptionsResponse>
```

#### 9. Subscription Override
```typescript
/**
 * Overrides subscription status and auto-syncs profile tier/is_paid.
 * Endpoint: PATCH /api/admin/payments/subscriptions
 */
static async updateSubscription(
  payload: AdminSubscriptionUpdatePayload,
  options?: AdminRequestOptions
): Promise<AdminSubscriptionUpdateResponse>
```

#### 10. Billing Invoices Listing
```typescript
/**
 * Lists billing invoice records with user profile details.
 * Endpoint: GET /api/admin/payments/invoices
 */
static async getInvoices(
  query?: AdminInvoicesQuery,
  options?: AdminRequestOptions
): Promise<AdminInvoicesResponse>
```

#### 11. Invoice Log Creation
```typescript
/**
 * Manually logs a billing invoice record.
 * Endpoint: POST /api/admin/payments/invoices
 */
static async createInvoice(
  payload: CreateInvoiceLogInput,
  options?: AdminRequestOptions
): Promise<AdminCreateInvoiceResponse>
```

#### 12. Multi-Category System Logs
```typescript
/**
 * Queries categorized system and audit logs (payments, admin_audit, space_audit, ai_usage, guest_security, reports).
 * Endpoint: GET /api/admin/logs
 */
static async getLogs<T = Record<string, unknown>>(
  query?: AdminLogsQuery,
  options?: AdminRequestOptions
): Promise<AdminLogsResponse<T>>
```

#### 13. Whitelisted Entity Listing (CRUD Browser)
```typescript
/**
 * Lists records from any of the 15 whitelisted database entities with sorting & filters.
 * Endpoint: GET /api/admin/crud/[entity]
 */
static async getCrudRecords<T = Record<string, unknown>>(
  entity: WhitelistedCrudEntity,
  query?: AdminCrudQuery,
  options?: AdminRequestOptions
): Promise<AdminCrudListResponse<T>>
```

#### 14. Entity Record Creation
```typescript
/**
 * Inserts a new record into a whitelisted entity.
 * Endpoint: POST /api/admin/crud/[entity]
 */
static async createCrudRecord<T = Record<string, unknown>>(
  entity: WhitelistedCrudEntity,
  payload: Record<string, unknown>,
  options?: AdminRequestOptions
): Promise<AdminCrudCreateResponse<T>>
```

#### 15. Entity Record Inspection
```typescript
/**
 * Fetches a single record by primary ID from a whitelisted entity.
 * Endpoint: GET /api/admin/crud/[entity]/[id]
 */
static async getCrudRecord<T = Record<string, unknown>>(
  entity: WhitelistedCrudEntity,
  id: string,
  options?: AdminRequestOptions
): Promise<AdminCrudDetailResponse<T>>
```

#### 16. Entity Record Mutation
```typescript
/**
 * Updates a record by primary ID in a whitelisted entity.
 * Endpoint: PATCH /api/admin/crud/[entity]/[id]
 */
static async updateCrudRecord<T = Record<string, unknown>>(
  entity: WhitelistedCrudEntity,
  id: string,
  payload: Record<string, unknown>,
  options?: AdminRequestOptions
): Promise<AdminCrudUpdateResponse<T>>
```

#### 17. Entity Record Deletion
```typescript
/**
 * Deletes a record by primary ID from a whitelisted entity.
 * Endpoint: DELETE /api/admin/crud/[entity]/[id]
 */
static async deleteCrudRecord(
  entity: WhitelistedCrudEntity,
  id: string,
  options?: AdminRequestOptions
): Promise<AdminCrudDeleteResponse>
```

---

## 5. Entity-Specific Normalization & Edge Case Safeguards

The `AdminClientService` encapsulates domain safeguards to prevent known backend database query errors:

| Entity | Problem Identified in Survey | Client Service Safeguard |
|---|---|---|
| `space_settings` | Has NO `created_at` column (only `updated_at`). Default sorting with `created_at` triggers Postgres column missing error. | If `entity === 'space_settings'` and `query?.sortBy` is unspecified, automatically set `sortBy = 'updated_at'`. |
| `space_members` | Has NO `created_at` column (uses `joined_at` and `last_seen_at`). Default sorting with `created_at` triggers error. | If `entity === 'space_members'` and `query?.sortBy` is unspecified, automatically set `sortBy = 'joined_at'`. |
| Non-whitelisted entity | Calling `/api/admin/crud/unknown_table` triggers 400 Bad Request on backend. | Method parameters strictly typed as `WhitelistedCrudEntity`. In addition, runtime check validates against `WHITELISTED_CRUD_ENTITIES` before sending the request. |
| Self-Deletion | Calling `deleteUser(ownId)` triggers 403 Forbidden. | Error is mapped cleanly to `AdminApiError` with `isForbidden: true` and descriptive message. |

---

## 6. Comprehensive Vitest Unit Test Suite Specification (`next-app/tests/admin_client.test.ts`)

The test suite must be fully executable under Vitest's Node test environment without `jsdom`.

### 6.1 Test Infrastructure Setup Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 1. Mock Supabase client session retrieval
const mockGetSession = vi.fn();
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

// 2. Import service under test
import {
  AdminClientService,
  AdminApiError,
  WHITELISTED_CRUD_ENTITIES,
} from '../src/lib/services/adminClient';

describe('AdminClientService', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    AdminClientService.setDevApiKey(null);
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    AdminClientService.setDevApiKey(null);
  });
  
  // Helper to construct mock fetch response
  const mockJsonResponse = (status: number, data: unknown, headers: Record<string, string> = {}) => {
    return Promise.resolve(
      new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      })
    );
  };
  ...
});
```

### 6.2 Test Inventory (Organized by Test Tiers)

#### Test Group 1: Auth Headers & Machine Secret Fallback
1. **`getHeaders` with Supabase session**: Returns `Authorization: Bearer mock-jwt-token`.
2. **`getHeaders` with `setDevApiKey`**: Returns `x-admin-api-key: super-secret-key`.
3. **`getHeaders` with both**: Includes both `Authorization` and `x-admin-api-key`.
4. **`getHeaders` with explicit options**: Overrides default session and machine key when passed in options.
5. **`setDevApiKey(null)`**: Properly removes active machine key.

#### Test Group 2: Error Mapping & Classification (`AdminApiError`)
1. **401 Unauthorized**: Maps server message, sets `status: 401`, `isUnauthorized: true`.
2. **403 Forbidden**: Maps server message, sets `status: 403`, `isForbidden: true`.
3. **404 Not Found**: Maps server message, sets `status: 404`, `isNotFound: true`.
4. **429 Rate Limited**: Parses `retryAfter` from header and payload, sets `status: 429`, `isRateLimited: true`.
5. **500 Internal Server Error**: Maps server error and sets `isServerError: true`.
6. **Non-JSON error response**: Handles HTML or plaintext errors gracefully without crashing JSON parser.
7. **Network rejection**: Propagates native network error (`TypeError: Failed to fetch`).

#### Test Group 3: Overview Metrics (`getMetrics`)
1. **Calls `/api/admin/metrics`**: Verifies HTTP `GET`, auth header, and returns `AdminMetricsResponse`.

#### Test Group 4: Users Management
1. **`getUsers` default query**: Calls `GET /api/admin/users` with default empty search params.
2. **`getUsers` complex query serialization**:
   - Query: `{ page: 2, limit: 50, search: 'alice', sortBy: 'username', sortOrder: 'asc', status: 'available', role: 'admin', tier: 'pro' }`
   - URL verified: `/api/admin/users?page=2&limit=50&search=alice&sortBy=username&sortOrder=asc&status=available&role=admin&tier=pro`
3. **`createUser`**:
   - Calls `POST /api/admin/users` with JSON body.
   - Verifies 201 response returns `user` and `message`.
4. **`getUser`**:
   - Calls `GET /api/admin/users/11111111-1111-1111-1111-111111111111`.
   - Returns full dossier including subscription, reports, and spaces.
5. **`updateUser`**:
   - Calls `PATCH /api/admin/users/11111111-1111-1111-1111-111111111111` with `{ status: 'away', tier: 'enterprise' }`.
   - Returns updated profile record.
6. **`deleteUser` soft mode**:
   - Calls `DELETE /api/admin/users/11111111-1111-1111-1111-111111111111?mode=soft`.
   - Returns soft ban confirmation.
7. **`deleteUser` hard mode**:
   - Calls `DELETE /api/admin/users/11111111-1111-1111-1111-111111111111?mode=hard`.
   - Returns permanent deletion confirmation.

#### Test Group 5: Payments & Subscriptions
1. **`getSubscriptions`**:
   - Query: `{ page: 1, limit: 10, status: 'active', sortBy: 'current_period_end', sortOrder: 'desc' }`.
   - URL verified: `/api/admin/payments/subscriptions?page=1&limit=10&status=active&sortBy=current_period_end&sortOrder=desc`.
2. **`updateSubscription`**:
   - Calls `PATCH /api/admin/payments/subscriptions` with `{ id: 'sub-1', status: 'canceled', cancelAtPeriodEnd: true }`.
   - Returns updated subscription object.
3. **`getInvoices`**:
   - Query: `{ status: 'paid', sortBy: 'amount_cents', sortOrder: 'asc' }`.
   - URL verified: `/api/admin/payments/invoices?status=paid&sortBy=amount_cents&sortOrder=asc`.
4. **`createInvoice`**:
   - Calls `POST /api/admin/payments/invoices` with `{ userId: '...', amountCents: 2500, currency: 'usd', status: 'paid' }`.
   - Returns 201 created invoice.

#### Test Group 6: Multi-Category System Logs
1. **`getLogs` default**: Queries `/api/admin/logs?category=admin_audit`.
2. **`getLogs` category filtering**: Tests all 6 categories (`payments`, `admin_audit`, `space_audit`, `ai_usage`, `guest_security`, `reports`).
3. **`getLogs` date range & search**:
   - Query: `{ category: 'space_audit', startDate: '2026-11-01T00:00:00Z', endDate: '2026-11-05T00:00:00Z', search: 'kick' }`.
   - URL verified: `/api/admin/logs?category=space_audit&startDate=2026-11-01T00%3A00%3A00Z&endDate=2026-11-05T00%3A00%3A00Z&search=kick`.

#### Test Group 7: Database CRUD Explorer
1. **`getCrudRecords` on `spaces`**:
   - URL: `/api/admin/crud/spaces?page=1&limit=20&sortBy=created_at&sortOrder=desc`.
2. **`getCrudRecords` automatic sort default for `space_settings`**:
   - Query without `sortBy` automatically injects `sortBy=updated_at`.
   - URL: `/api/admin/crud/space_settings?sortBy=updated_at`.
3. **`getCrudRecords` automatic sort default for `space_members`**:
   - Query without `sortBy` automatically injects `sortBy=joined_at`.
   - URL: `/api/admin/crud/space_members?sortBy=joined_at`.
4. **`getCrudRecords` dynamic equality filters**:
   - Query: `{ filters: { space_id: 'space-123', is_active: true } }`.
   - URL: `/api/admin/crud/spaces?space_id=space-123&is_active=true&sortBy=created_at&sortOrder=desc`.
5. **`createCrudRecord`**:
   - Calls `POST /api/admin/crud/worlds` with payload `{ name: 'Cyber World', slug: 'cyber-world' }`.
   - Returns 201 created record.
6. **`getCrudRecord`**:
   - Calls `GET /api/admin/crud/worlds/world-uuid-1`.
   - Returns record.
7. **`updateCrudRecord`**:
   - Calls `PATCH /api/admin/crud/worlds/world-uuid-1` with payload `{ description: 'New description' }`.
   - Returns updated record.
8. **`deleteCrudRecord`**:
   - Calls `DELETE /api/admin/crud/worlds/world-uuid-1`.
   - Returns deletion confirmation.
9. **CRUD invalid entity rejection**:
   - Passing `'invalid_table'` as entity rejects early with validation error or 400.

---

## 7. Concrete Implementation Blueprint for Backend Developer

The Backend Developer (`backend_developer`) should implement `next-app/src/lib/services/adminClient.ts` following this blueprint:

```typescript
import { supabase } from '../supabase';
import {
  SystemRole,
  CreateUserInput,
  UpdateUserInput,
  SubscriptionOverrideInput,
  CreateInvoiceLogInput,
  WhitelistedCrudEntity,
  WHITELISTED_CRUD_ENTITIES,
  isValidCrudEntity,
} from '../admin/schemas';

// (Export all interfaces defined in Section 2)
// (Export AdminApiError defined in Section 3)

export class AdminClientService {
  private static devApiKey: string | null = null;
  private static readonly API_BASE = '/api/admin';

  static setDevApiKey(key: string | null): void {
    this.devApiKey = key ? key.trim() : null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (key) {
        window.sessionStorage.setItem('teem_admin_api_key', key.trim());
      } else {
        window.sessionStorage.removeItem('teem_admin_api_key');
      }
    }
  }

  static getDevApiKey(): string | null {
    if (this.devApiKey) return this.devApiKey;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem('teem_admin_api_key');
    }
    return null;
  }

  static async getHeaders(options?: AdminRequestOptions): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    let token = options?.token;
    if (!token) {
      try {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
      } catch {
        // Fallback for tests
      }
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const apiKey = options?.apiKey || this.getDevApiKey();
    if (apiKey) {
      headers['x-admin-api-key'] = apiKey;
    }

    return headers;
  }

  static buildQuery(params?: Record<string, unknown>): string {
    if (!params) return '';
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      if (key === 'filters' && typeof value === 'object' && !Array.isArray(value)) {
        for (const [filterKey, filterValue] of Object.entries(value as Record<string, unknown>)) {
          if (filterValue !== undefined && filterValue !== null && filterValue !== '') {
            searchParams.append(filterKey, String(filterValue));
          }
        }
      } else {
        searchParams.append(key, String(value));
      }
    }

    const query = searchParams.toString();
    return query ? `?${query}` : '';
  }

  private static async request<T>(
    endpoint: string,
    init: RequestInit,
    options?: AdminRequestOptions
  ): Promise<T> {
    const headers = await this.getHeaders(options);
    const mergedInit: RequestInit = {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string>),
      },
      signal: options?.signal || init.signal,
    };

    const url = `${this.API_BASE}${endpoint}`;
    const response = await fetch(url, mergedInit);

    if (!response.ok) {
      let errorData: unknown = null;
      let errorMessage = `Request failed with status ${response.status}`;
      let retryAfter: number | undefined;

      const retryHeader = response.headers.get('retry-after');
      if (retryHeader) {
        retryAfter = parseInt(retryHeader, 10);
      }

      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
          if (errorData && typeof errorData === 'object') {
            const errObj = errorData as Record<string, unknown>;
            errorMessage =
              (typeof errObj.message === 'string' && errObj.message) ||
              (typeof errObj.error === 'string' && errObj.error) ||
              errorMessage;
            if (typeof errObj.retryAfter === 'number') {
              retryAfter = errObj.retryAfter;
            }
          }
        } else {
          errorData = await response.text();
        }
      } catch {
        // Use default error message if parsing fails
      }

      throw new AdminApiError(response.status, errorMessage, errorData, retryAfter);
    }

    return (await response.json()) as T;
  }

  // --- Auth & Verification ---
  static async verifyAuth(options?: AdminRequestOptions): Promise<AdminVerifyResponse> {
    return this.request<AdminVerifyResponse>('/auth/verify', { method: 'GET' }, options);
  }

  // --- Overview Metrics ---
  static async getMetrics(options?: AdminRequestOptions): Promise<AdminMetricsResponse> {
    return this.request<AdminMetricsResponse>('/metrics', { method: 'GET' }, options);
  }

  // --- Users Management ---
  static async getUsers(query?: AdminUsersQuery, options?: AdminRequestOptions): Promise<AdminUsersResponse> {
    const q = this.buildQuery(query as Record<string, unknown>);
    return this.request<AdminUsersResponse>(`/users${q}`, { method: 'GET' }, options);
  }

  static async createUser(payload: CreateUserInput, options?: AdminRequestOptions): Promise<AdminCreateUserResponse> {
    return this.request<AdminCreateUserResponse>(
      '/users',
      { method: 'POST', body: JSON.stringify(payload) },
      options
    );
  }

  static async getUser(id: string, options?: AdminRequestOptions): Promise<AdminUserDossierResponse> {
    return this.request<AdminUserDossierResponse>(`/users/${encodeURIComponent(id)}`, { method: 'GET' }, options);
  }

  static async updateUser(
    id: string,
    payload: UpdateUserInput,
    options?: AdminRequestOptions
  ): Promise<AdminUpdateUserResponse> {
    return this.request<AdminUpdateUserResponse>(
      `/users/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      options
    );
  }

  static async deleteUser(
    id: string,
    mode: 'soft' | 'hard' = 'soft',
    options?: AdminRequestOptions
  ): Promise<AdminDeleteUserResponse> {
    const q = this.buildQuery({ mode });
    return this.request<AdminDeleteUserResponse>(
      `/users/${encodeURIComponent(id)}${q}`,
      { method: 'DELETE' },
      options
    );
  }

  // --- Payments & Subscriptions ---
  static async getSubscriptions(
    query?: AdminSubscriptionsQuery,
    options?: AdminRequestOptions
  ): Promise<AdminSubscriptionsResponse> {
    const q = this.buildQuery(query as Record<string, unknown>);
    return this.request<AdminSubscriptionsResponse>(`/payments/subscriptions${q}`, { method: 'GET' }, options);
  }

  static async updateSubscription(
    payload: AdminSubscriptionUpdatePayload,
    options?: AdminRequestOptions
  ): Promise<AdminSubscriptionUpdateResponse> {
    return this.request<AdminSubscriptionUpdateResponse>(
      '/payments/subscriptions',
      { method: 'PATCH', body: JSON.stringify(payload) },
      options
    );
  }

  static async getInvoices(
    query?: AdminInvoicesQuery,
    options?: AdminRequestOptions
  ): Promise<AdminInvoicesResponse> {
    const q = this.buildQuery(query as Record<string, unknown>);
    return this.request<AdminInvoicesResponse>(`/payments/invoices${q}`, { method: 'GET' }, options);
  }

  static async createInvoice(
    payload: CreateInvoiceLogInput,
    options?: AdminRequestOptions
  ): Promise<AdminCreateInvoiceResponse> {
    return this.request<AdminCreateInvoiceResponse>(
      '/payments/invoices',
      { method: 'POST', body: JSON.stringify(payload) },
      options
    );
  }

  // --- Multi-Category Logs ---
  static async getLogs<T = Record<string, unknown>>(
    query?: AdminLogsQuery,
    options?: AdminRequestOptions
  ): Promise<AdminLogsResponse<T>> {
    const q = this.buildQuery({ category: 'admin_audit', ...query });
    return this.request<AdminLogsResponse<T>>(`/logs${q}`, { method: 'GET' }, options);
  }

  // --- Database CRUD Explorer ---
  static async getCrudRecords<T = Record<string, unknown>>(
    entity: WhitelistedCrudEntity,
    query?: AdminCrudQuery,
    options?: AdminRequestOptions
  ): Promise<AdminCrudListResponse<T>> {
    if (!isValidCrudEntity(entity)) {
      throw new AdminApiError(400, `Entity '${entity}' is not permitted for administrative CRUD operations.`);
    }

    // Apply entity sort defaults to prevent database column missing errors
    let sortBy = query?.sortBy;
    if (!sortBy) {
      if (entity === 'space_settings') sortBy = 'updated_at';
      else if (entity === 'space_members') sortBy = 'joined_at';
      else sortBy = 'created_at';
    }

    const q = this.buildQuery({
      page: query?.page,
      limit: query?.limit,
      sortBy,
      sortOrder: query?.sortOrder || 'desc',
      filters: query?.filters,
    });

    return this.request<AdminCrudListResponse<T>>(`/crud/${encodeURIComponent(entity)}${q}`, { method: 'GET' }, options);
  }

  static async createCrudRecord<T = Record<string, unknown>>(
    entity: WhitelistedCrudEntity,
    payload: Record<string, unknown>,
    options?: AdminRequestOptions
  ): Promise<AdminCrudCreateResponse<T>> {
    if (!isValidCrudEntity(entity)) {
      throw new AdminApiError(400, `Entity '${entity}' is not permitted for administrative CRUD operations.`);
    }

    return this.request<AdminCrudCreateResponse<T>>(
      `/crud/${encodeURIComponent(entity)}`,
      { method: 'POST', body: JSON.stringify(payload) },
      options
    );
  }

  static async getCrudRecord<T = Record<string, unknown>>(
    entity: WhitelistedCrudEntity,
    id: string,
    options?: AdminRequestOptions
  ): Promise<AdminCrudDetailResponse<T>> {
    if (!isValidCrudEntity(entity)) {
      throw new AdminApiError(400, `Entity '${entity}' is not permitted for administrative CRUD operations.`);
    }

    return this.request<AdminCrudDetailResponse<T>>(
      `/crud/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
      { method: 'GET' },
      options
    );
  }

  static async updateCrudRecord<T = Record<string, unknown>>(
    entity: WhitelistedCrudEntity,
    id: string,
    payload: Record<string, unknown>,
    options?: AdminRequestOptions
  ): Promise<AdminCrudUpdateResponse<T>> {
    if (!isValidCrudEntity(entity)) {
      throw new AdminApiError(400, `Entity '${entity}' is not permitted for administrative CRUD operations.`);
    }

    return this.request<AdminCrudUpdateResponse<T>>(
      `/crud/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      options
    );
  }

  static async deleteCrudRecord(
    entity: WhitelistedCrudEntity,
    id: string,
    options?: AdminRequestOptions
  ): Promise<AdminCrudDeleteResponse> {
    if (!isValidCrudEntity(entity)) {
      throw new AdminApiError(400, `Entity '${entity}' is not permitted for administrative CRUD operations.`);
    }

    return this.request<AdminCrudDeleteResponse>(
      `/crud/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      options
    );
  }
}
```

---

## 8. Verification Strategy

1. **Static Type Checking**:
   Ensure `npm run lint` evaluates all signatures against TypeScript compiler with 0 errors.
2. **Vitest Test Suite Run**:
   Execute `npx vitest run tests/admin_client.test.ts` to confirm 100% of test assertions pass.
3. **End-to-End Test Suite Compatibility**:
   Ensure `npm test` runs all 48+ test files without regressions.
