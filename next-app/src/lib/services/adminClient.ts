import { supabase } from '../supabase';
import {
  SystemRole,
  CreateUserInput,
  UpdateUserInput,
  PaginationQuery,
  SubscriptionOverrideInput,
  CreateInvoiceLogInput,
  WhitelistedCrudEntity,
  WHITELISTED_CRUD_ENTITIES,
  isValidCrudEntity,
} from '../admin/schemas';

// Re-export core schemas and types for convenience
export { WHITELISTED_CRUD_ENTITIES, isValidCrudEntity };
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

/* -------------------------------------------------------------------------- */
/*                               AdminApiError                                */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*                             AdminClientService                             */
/* -------------------------------------------------------------------------- */

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
  ): Promise<T> {
    const headers = await this.getHeaders(options);
    const mergedInit: RequestInit = {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined),
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
        // Fallback to default message
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
  static async getUsers(
    query?: AdminUsersQuery,
    options?: AdminRequestOptions
  ): Promise<AdminUsersResponse> {
    const q = this.buildQuery(query as Record<string, unknown>);
    return this.request<AdminUsersResponse>(`/users${q}`, { method: 'GET' }, options);
  }

  static async createUser(
    payload: CreateUserInput,
    options?: AdminRequestOptions
  ): Promise<AdminCreateUserResponse> {
    return this.request<AdminCreateUserResponse>(
      '/users',
      { method: 'POST', body: JSON.stringify(payload) },
      options
    );
  }

  static async getUser(
    id: string,
    options?: AdminRequestOptions
  ): Promise<AdminUserDossierResponse> {
    return this.request<AdminUserDossierResponse>(
      `/users/${encodeURIComponent(id)}`,
      { method: 'GET' },
      options
    );
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
    return this.request<AdminSubscriptionsResponse>(
      `/payments/subscriptions${q}`,
      { method: 'GET' },
      options
    );
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
      throw new AdminApiError(
        400,
        `Entity '${entity}' is not permitted for administrative CRUD operations.`
      );
    }

    // Apply entity sort defaults to prevent database column missing errors
    let sortBy = query?.sortBy;
    if (!sortBy) {
      if (entity === 'space_settings') sortBy = 'updated_at';
      else if (entity === 'space_members') sortBy = 'joined_at';
      else if (entity === 'space_roles') sortBy = 'priority';
      else sortBy = 'created_at';
    }

    const q = this.buildQuery({
      page: query?.page,
      limit: query?.limit,
      sortBy,
      sortOrder: query?.sortOrder || 'desc',
      filters: query?.filters,
    });

    return this.request<AdminCrudListResponse<T>>(
      `/crud/${encodeURIComponent(entity)}${q}`,
      { method: 'GET' },
      options
    );
  }

  static async createCrudRecord<T = Record<string, unknown>>(
    entity: WhitelistedCrudEntity,
    payload: Record<string, unknown>,
    options?: AdminRequestOptions
  ): Promise<AdminCrudCreateResponse<T>> {
    if (!isValidCrudEntity(entity)) {
      throw new AdminApiError(
        400,
        `Entity '${entity}' is not permitted for administrative CRUD operations.`
      );
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
      throw new AdminApiError(
        400,
        `Entity '${entity}' is not permitted for administrative CRUD operations.`
      );
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
      throw new AdminApiError(
        400,
        `Entity '${entity}' is not permitted for administrative CRUD operations.`
      );
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
      throw new AdminApiError(
        400,
        `Entity '${entity}' is not permitted for administrative CRUD operations.`
      );
    }

    return this.request<AdminCrudDeleteResponse>(
      `/crud/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      options
    );
  }
}
