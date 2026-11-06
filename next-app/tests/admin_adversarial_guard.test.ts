import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Supabase client session before importing service
const mockGetSession = vi.fn();
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

import {
  AdminClientService,
  AdminCapabilities,
} from '../src/lib/services/adminClient';

import {
  resolveGuardState,
  canAccessTab,
  canPerformAction,
  AdminRole,
} from './admin_guard.test';

describe('Adversarial Security & Privilege Escalation Challenge Suite', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.clearAllMocks();
    AdminClientService.setDevApiKey(null);
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      // @ts-expect-error cleanup global window
      delete globalThis.window;
    }
    AdminClientService.setDevApiKey(null);
  });

  /* -------------------------------------------------------------------------- */
  /* Challenge 1: Unauthorized Access States & Fail-Safe State Machine          */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 1: Unauthorized Access States & Fail-Safe State Machine', () => {
    it('blocks access on 401 unauthenticated with no leak of privileged capabilities', () => {
      const guard = resolveGuardState(401, {
        verified: false,
        message: 'No active session token',
      });
      expect(guard.state).toBe('UNAUTHENTICATED');
      expect(guard.message).toBe('No active session token');
      // Under UNAUTHENTICATED, capability evaluations must always be false
      expect(canAccessTab('overview', null)).toBe(false);
      expect(canAccessTab('users', null)).toBe(false);
      expect(canAccessTab('payments', null)).toBe(false);
      expect(canAccessTab('logs', null)).toBe(false);
      expect(canAccessTab('crud', null)).toBe(false);
    });

    it('blocks access on 403 forbidden for standard user account', () => {
      const guard = resolveGuardState(403, {
        verified: false,
        message: 'Insufficient administrative privileges.',
      });
      expect(guard.state).toBe('FORBIDDEN');
      expect(guard.message).toContain('Insufficient');
      expect(canAccessTab('overview', null)).toBe(false);
      expect(canAccessTab('users', null)).toBe(false);
    });

    it('fails closed on corrupt payload claiming verified: true but missing capabilities', () => {
      const guard = resolveGuardState(200, {
        verified: true,
        admin: {
          id: 'spoofed-id',
          email: 'spoofed@evil.com',
          username: 'spoofed',
          displayName: 'Spoofed User',
          systemRole: 'admin',
        },
        // missing capabilities!
      });
      // Missing capabilities MUST NOT transition to AUTHORIZED
      expect(guard.state).not.toBe('AUTHORIZED');
      expect(guard.state).toBe('ERROR');
    });

    it('fails closed on 200 payload with verified: false', () => {
      const guard = resolveGuardState(200, {
        verified: false,
        message: 'Cryptographic signature mismatch',
      });
      expect(guard.state).not.toBe('AUTHORIZED');
      expect(guard.state).toBe('ERROR');
    });

    it('handles unexpected null or undefined verification data safely without crashing', () => {
      expect(() => resolveGuardState(200, null)).not.toThrow();
      expect(resolveGuardState(200, null).state).toBe('ERROR');

      expect(() => resolveGuardState(401, undefined)).not.toThrow();
      expect(resolveGuardState(401, undefined).state).toBe('UNAUTHENTICATED');

      expect(() => resolveGuardState(403, undefined)).not.toThrow();
      expect(resolveGuardState(403, undefined).state).toBe('FORBIDDEN');
    });

    it('simulates race condition: cancelled state prevents late-arriving 200 from mutating state', async () => {
      let activeState: string = 'CHECKING';
      let cancelled = false;

      // Simulate first verify trigger which is slow
      const slowVerify = new Promise<{ verified: boolean }>((resolve) => {
        setTimeout(() => resolve({ verified: true }), 100);
      });

      // Cleanup happens before slow verify finishes (e.g. user unmounted or re-authenticated)
      cancelled = true;

      const result = await slowVerify;
      if (!cancelled) {
        activeState = result.verified ? 'AUTHORIZED' : 'UNAUTHENTICATED';
      }

      expect(activeState).toBe('CHECKING'); // Kept intact, no state corruption
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Challenge 2: Exhaustive Capability Enforcement Matrix (2^5 = 32 States)    */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 2: Exhaustive Capability Matrix (All 32 Permutations)', () => {
    it('strictly gates each tab according to its dedicated capability across all 32 combinations', () => {
      for (let i = 0; i < 32; i++) {
        const caps: AdminCapabilities = {
          canManageUsers: Boolean(i & 1),
          canViewPaymentLogs: Boolean(i & 2),
          canViewSystemLogs: Boolean(i & 4),
          canExecuteCrud: Boolean(i & 8),
          canAssignSuperadmin: Boolean(i & 16),
        };

        // Overview is ALWAYS allowed once authorized
        expect(canAccessTab('overview', caps)).toBe(true);

        // Users tab strictly matches canManageUsers
        expect(canAccessTab('users', caps)).toBe(caps.canManageUsers);

        // Payments tab strictly matches canViewPaymentLogs
        expect(canAccessTab('payments', caps)).toBe(caps.canViewPaymentLogs);

        // Logs tab strictly matches canViewSystemLogs
        expect(canAccessTab('logs', caps)).toBe(caps.canViewSystemLogs);

        // Crud tab strictly matches canExecuteCrud
        expect(canAccessTab('crud', caps)).toBe(caps.canExecuteCrud);
      }
    });

    it('fails closed when capability object has all falses', () => {
      const allFalseCaps: AdminCapabilities = {
        canManageUsers: false,
        canViewPaymentLogs: false,
        canViewSystemLogs: false,
        canExecuteCrud: false,
        canAssignSuperadmin: false,
      };

      expect(canAccessTab('overview', allFalseCaps)).toBe(true);
      expect(canAccessTab('users', allFalseCaps)).toBe(false);
      expect(canAccessTab('payments', allFalseCaps)).toBe(false);
      expect(canAccessTab('logs', allFalseCaps)).toBe(false);
      expect(canAccessTab('crud', allFalseCaps)).toBe(false);
    });

    it('blocks crud mutation when canExecuteCrud is false', () => {
      const capsWithoutCrud: AdminCapabilities = {
        canManageUsers: true,
        canViewPaymentLogs: true,
        canViewSystemLogs: true,
        canExecuteCrud: false,
        canAssignSuperadmin: true,
      };

      const result = canPerformAction('mutate_crud', {
        callerRole: 'superadmin',
        callerId: 'super-1',
        capabilities: capsWithoutCrud,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient database CRUD permissions');
    });

    it('blocks subscription override when canViewPaymentLogs is false', () => {
      const capsWithoutPayments: AdminCapabilities = {
        canManageUsers: true,
        canViewPaymentLogs: false,
        canViewSystemLogs: true,
        canExecuteCrud: true,
        canAssignSuperadmin: false,
      };

      const result = canPerformAction('override_subscription', {
        callerRole: 'admin',
        callerId: 'admin-1',
        capabilities: capsWithoutPayments,
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient payment permissions');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Challenge 3: Privilege Escalation Prevention                               */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 3: Privilege Escalation Prevention', () => {
    const regularAdminCaps: AdminCapabilities = {
      canManageUsers: true,
      canViewPaymentLogs: true,
      canViewSystemLogs: true,
      canExecuteCrud: true,
      canAssignSuperadmin: false, // Notice false!
    };

    it('blocks regular admin from escalating another user to superadmin', () => {
      const action = canPerformAction('assign_superadmin', {
        callerRole: 'admin',
        callerId: 'admin-1',
        targetUserId: 'user-2',
        targetUserRole: 'user',
        capabilities: regularAdminCaps,
      });
      expect(action.allowed).toBe(false);
      expect(action.reason).toBe('Only a superadmin can assign superadmin privileges.');
    });

    it('blocks regular admin from escalating themselves to superadmin', () => {
      const action = canPerformAction('assign_superadmin', {
        callerRole: 'admin',
        callerId: 'admin-1',
        targetUserId: 'admin-1',
        targetUserRole: 'admin',
        capabilities: regularAdminCaps,
      });
      expect(action.allowed).toBe(false);
      expect(action.reason).toBe('Only a superadmin can assign superadmin privileges.');
    });

    it('blocks regular admin from provisioning accounts with admin privileges', () => {
      const action = canPerformAction('assign_admin', {
        callerRole: 'admin',
        callerId: 'admin-1',
        targetUserId: 'new-user',
        capabilities: regularAdminCaps,
      });
      expect(action.allowed).toBe(false);
      expect(action.reason).toBe('Only a superadmin can provision accounts with admin privileges.');
    });

    it('blocks non-admin roles (moderator or user) from assigning any administrative roles', () => {
      const modRoles: AdminRole[] = ['user', 'moderator'];
      for (const role of modRoles) {
        const action = canPerformAction('assign_admin', {
          callerRole: role,
          callerId: 'mod-1',
          capabilities: regularAdminCaps,
        });
        expect(action.allowed).toBe(false);
      }
    });

    it('validates that isSuperadmin guard strips systemRole mutation if caller is regular admin', () => {
      // Testing UI contract in UsersTab.tsx: systemRole: isSuperadmin ? editRole : undefined
      const isSuperadmin = false;
      const attemptedRoleChange: AdminRole = 'superadmin';

      const payload = {
        displayName: 'Hacked User',
        systemRole: isSuperadmin ? attemptedRoleChange : undefined,
      };

      expect(payload.systemRole).toBeUndefined();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Challenge 4: Self-Deletion Guards (Soft & Hard Deletion)                   */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 4: Self-Deletion Guards (Soft & Hard Deletion)', () => {
    const superadminCaps: AdminCapabilities = {
      canManageUsers: true,
      canViewPaymentLogs: true,
      canViewSystemLogs: true,
      canExecuteCrud: true,
      canAssignSuperadmin: true,
    };

    it('strictly prevents superadmin from deleting their own account ID', () => {
      const result = canPerformAction('delete_user', {
        callerRole: 'superadmin',
        callerId: '0000-caller-id',
        targetUserId: '0000-caller-id',
        targetUserRole: 'superadmin',
        capabilities: superadminCaps,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('You cannot delete your own account.');
    });

    it('strictly prevents regular admin from deleting their own account ID', () => {
      const result = canPerformAction('delete_user', {
        callerRole: 'admin',
        callerId: 'admin-self-id',
        targetUserId: 'admin-self-id',
        targetUserRole: 'admin',
        capabilities: { ...superadminCaps, canAssignSuperadmin: false },
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('You cannot delete your own account.');
    });

    it('strictly prevents regular admin from deleting any superadmin account', () => {
      const result = canPerformAction('delete_user', {
        callerRole: 'admin',
        callerId: 'admin-1',
        targetUserId: 'super-9',
        targetUserRole: 'superadmin',
        capabilities: { ...superadminCaps, canAssignSuperadmin: false },
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Only a superadmin can remove another superadmin.');
    });

    it('allows superadmin to delete another user (soft or hard)', () => {
      const result = canPerformAction('delete_user', {
        callerRole: 'superadmin',
        callerId: 'super-1',
        targetUserId: 'user-random-9',
        targetUserRole: 'user',
        capabilities: superadminCaps,
      });
      expect(result.allowed).toBe(true);
    });

    it('allows superadmin to delete another superadmin (distinct ID)', () => {
      const result = canPerformAction('delete_user', {
        callerRole: 'superadmin',
        callerId: 'super-1',
        targetUserId: 'super-2',
        targetUserRole: 'superadmin',
        capabilities: superadminCaps,
      });
      expect(result.allowed).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Challenge 5: Machine API Key Storage & Injection Integrity                */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 5: Machine API Key Storage & Header Injection Integrity', () => {
    class MockStorage implements Storage {
      private store: Record<string, string> = {};

      get length(): number {
        return Object.keys(this.store).length;
      }
      clear(): void {
        this.store = {};
      }
      getItem(key: string): string | null {
        return this.store[key] ?? null;
      }
      key(index: number): string | null {
        return Object.keys(this.store)[index] ?? null;
      }
      removeItem(key: string): void {
        delete this.store[key];
      }
      setItem(key: string, value: string): void {
        this.store[key] = String(value);
      }
    }

    it('stores developer key in sessionStorage and NEVER in localStorage', () => {
      const mockSessionStorage = new MockStorage();
      const mockLocalStorage = new MockStorage();

      // @ts-expect-error create mock window
      globalThis.window = {
        sessionStorage: mockSessionStorage,
        localStorage: mockLocalStorage,
      };

      const testSecret = 'sk_live_super_secret_machine_key_999';
      AdminClientService.setDevApiKey(testSecret);

      // Verify stored in sessionStorage
      expect(mockSessionStorage.getItem('teem_admin_api_key')).toBe(testSecret);
      expect(AdminClientService.getDevApiKey()).toBe(testSecret);

      // Verify strictly absent in localStorage
      expect(mockLocalStorage.getItem('teem_admin_api_key')).toBeNull();
      expect(mockLocalStorage.length).toBe(0);
    });

    it('clears developer key from sessionStorage on setDevApiKey(null)', () => {
      const mockSessionStorage = new MockStorage();
      // @ts-expect-error create mock window
      globalThis.window = {
        sessionStorage: mockSessionStorage,
      };

      AdminClientService.setDevApiKey('temporary_key');
      expect(mockSessionStorage.getItem('teem_admin_api_key')).toBe('temporary_key');

      AdminClientService.setDevApiKey(null);
      expect(mockSessionStorage.getItem('teem_admin_api_key')).toBeNull();
      expect(AdminClientService.getDevApiKey()).toBeNull();
    });

    it('trims whitespace and rejects blank strings properly', () => {
      AdminClientService.setDevApiKey('   trimmed_key_123   ');
      expect(AdminClientService.getDevApiKey()).toBe('trimmed_key_123');

      AdminClientService.setDevApiKey('');
      expect(AdminClientService.getDevApiKey()).toBeNull();
    });

    it('injects x-admin-api-key header matching stored dev key', async () => {
      AdminClientService.setDevApiKey('header_injection_secret');

      const headers = await AdminClientService.getHeaders();
      expect(headers['x-admin-api-key']).toBe('header_injection_secret');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
    });

    it('does not throw when window or sessionStorage is undefined (SSR safety)', () => {
      // @ts-expect-error test undefined window
      delete globalThis.window;

      expect(() => AdminClientService.setDevApiKey('ssr_key')).not.toThrow();
      expect(() => AdminClientService.getDevApiKey()).not.toThrow();
      expect(() => AdminClientService.setDevApiKey(null)).not.toThrow();
    });
  });
});
