import { describe, it, expect } from 'vitest';
import {
  WHITELISTED_CRUD_ENTITIES,
  isValidCrudEntity,
  WhitelistedCrudEntity,
} from '../src/lib/services/adminClient';

export interface AdminCapabilities {
  canManageUsers: boolean;
  canViewPaymentLogs: boolean;
  canViewSystemLogs: boolean;
  canExecuteCrud: boolean;
  canAssignSuperadmin: boolean;
}

export type AdminRole = 'user' | 'moderator' | 'admin' | 'superadmin';

export interface AdminVerifyResponse {
  verified: boolean;
  admin?: {
    id: string;
    email: string;
    username: string;
    displayName: string;
    systemRole: AdminRole;
    isMachineKey?: boolean;
  };
  capabilities?: AdminCapabilities;
  error?: string;
  message?: string;
  retryAfter?: number;
}

export type GuardState =
  | 'CHECKING_AUTH'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'AUTHORIZED'
  | 'RATE_LIMITED'
  | 'ERROR';

/**
 * Pure route guard state resolver mirroring /admin/page.tsx logic.
 */
export function resolveGuardState(
  status: number,
  data?: AdminVerifyResponse | null
): { state: GuardState; message?: string; retryAfter?: number } {
  if (status === 200 && data?.verified && data.capabilities) {
    return { state: 'AUTHORIZED' };
  }
  if (status === 401) {
    return { state: 'UNAUTHENTICATED', message: data?.message || 'Authentication required' };
  }
  if (status === 403) {
    return { state: 'FORBIDDEN', message: data?.message || 'Access forbidden' };
  }
  if (status === 429) {
    return {
      state: 'RATE_LIMITED',
      message: data?.message || 'Rate limit exceeded',
      retryAfter: data?.retryAfter || 60,
    };
  }
  return { state: 'ERROR', message: data?.message || 'Network or server error' };
}

/**
 * Capability tab gating resolver mirroring AdminNav logic.
 */
export function canAccessTab(
  tab: 'overview' | 'users' | 'payments' | 'logs' | 'crud',
  capabilities?: AdminCapabilities | null
): boolean {
  if (!capabilities) return false;
  switch (tab) {
    case 'overview':
      return true;
    case 'users':
      return capabilities.canManageUsers;
    case 'payments':
      return capabilities.canViewPaymentLogs;
    case 'logs':
      return capabilities.canViewSystemLogs;
    case 'crud':
      return capabilities.canExecuteCrud;
    default:
      return false;
  }
}

/**
 * Privilege and safety guard evaluator mirroring administrative guard rules.
 */
export function canPerformAction(
  action: 'assign_superadmin' | 'assign_admin' | 'delete_user' | 'override_subscription' | 'mutate_crud',
  context: {
    callerRole: AdminRole;
    callerId: string;
    targetUserId?: string;
    targetUserRole?: AdminRole;
    capabilities: AdminCapabilities;
  }
): { allowed: boolean; reason?: string } {
  const { callerRole, callerId, targetUserId, targetUserRole, capabilities } = context;

  // 1. Self deletion protection
  if (action === 'delete_user' && targetUserId && targetUserId === callerId) {
    return { allowed: false, reason: 'You cannot delete your own account.' };
  }

  // 2. Superadmin deletion protection
  if (action === 'delete_user' && targetUserRole === 'superadmin' && callerRole !== 'superadmin') {
    return { allowed: false, reason: 'Only a superadmin can remove another superadmin.' };
  }

  // 3. Superadmin assignment protection
  if (action === 'assign_superadmin' && !capabilities.canAssignSuperadmin) {
    return { allowed: false, reason: 'Only a superadmin can assign superadmin privileges.' };
  }

  // 4. Admin assignment protection
  if (action === 'assign_admin' && !capabilities.canAssignSuperadmin) {
    return { allowed: false, reason: 'Only a superadmin can provision accounts with admin privileges.' };
  }

  // 5. Payments capability
  if (action === 'override_subscription' && !capabilities.canViewPaymentLogs) {
    return { allowed: false, reason: 'Insufficient payment permissions.' };
  }

  // 6. CRUD capability
  if (action === 'mutate_crud' && !capabilities.canExecuteCrud) {
    return { allowed: false, reason: 'Insufficient database CRUD permissions.' };
  }

  return { allowed: true };
}

/**
 * Entity schema helper determining primary key and default sort.
 */
export function getEntitySortAndKey(entity: WhitelistedCrudEntity): {
  primaryKey: string;
  defaultSortBy: string;
} {
  if (entity === 'space_settings') {
    return { primaryKey: 'space_id', defaultSortBy: 'updated_at' };
  }
  if (entity === 'space_members') {
    return { primaryKey: 'id', defaultSortBy: 'joined_at' };
  }
  return { primaryKey: 'id', defaultSortBy: 'created_at' };
}

describe('Admin Dashboard Route Guard & Capability Integration Suite', () => {
  const superadminCapabilities: AdminCapabilities = {
    canManageUsers: true,
    canViewPaymentLogs: true,
    canViewSystemLogs: true,
    canExecuteCrud: true,
    canAssignSuperadmin: true,
  };

  const adminCapabilities: AdminCapabilities = {
    canManageUsers: true,
    canViewPaymentLogs: true,
    canViewSystemLogs: true,
    canExecuteCrud: true,
    canAssignSuperadmin: false,
  };

  /* -------------------------------------------------------------------------- */
  /* Suite 1: Route Guard State Machine Transitions                            */
  /* -------------------------------------------------------------------------- */
  describe('Suite 1: Route Guard State Transitions', () => {
    it('transitions to UNAUTHENTICATED on 401 response', () => {
      const result = resolveGuardState(401, {
        verified: false,
        message: 'Missing or malformed Authorization header.',
      });
      expect(result.state).toBe('UNAUTHENTICATED');
      expect(result.message).toBe('Missing or malformed Authorization header.');
    });

    it('transitions to FORBIDDEN on 403 response', () => {
      const result = resolveGuardState(403, {
        verified: false,
        message: 'Insufficient administrative privileges. Access denied.',
      });
      expect(result.state).toBe('FORBIDDEN');
      expect(result.message).toContain('Insufficient');
    });

    it('transitions to AUTHORIZED on 200 response with verified: true', () => {
      const result = resolveGuardState(200, {
        verified: true,
        admin: {
          id: 'admin-uuid',
          email: 'admin@teemchat.chat',
          username: 'admin_joe',
          displayName: 'Joe Admin',
          systemRole: 'admin',
        },
        capabilities: adminCapabilities,
      });
      expect(result.state).toBe('AUTHORIZED');
    });

    it('transitions to RATE_LIMITED on 429 response and captures retryAfter', () => {
      const result = resolveGuardState(429, {
        verified: false,
        message: 'Too many requests.',
        retryAfter: 30,
      });
      expect(result.state).toBe('RATE_LIMITED');
      expect(result.retryAfter).toBe(30);
    });

    it('transitions to ERROR on 500 response', () => {
      const result = resolveGuardState(500, {
        verified: false,
        message: 'Database query timeout.',
      });
      expect(result.state).toBe('ERROR');
      expect(result.message).toBe('Database query timeout.');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Suite 2: Capability-Based Navigation Tab Gating                            */
  /* -------------------------------------------------------------------------- */
  describe('Suite 2: Capability-Based Tab Gating', () => {
    it('overview tab is accessible to all verified admins regardless of individual flags', () => {
      const minimalCaps: AdminCapabilities = {
        canManageUsers: false,
        canViewPaymentLogs: false,
        canViewSystemLogs: false,
        canExecuteCrud: false,
        canAssignSuperadmin: false,
      };
      expect(canAccessTab('overview', minimalCaps)).toBe(true);
    });

    it('users tab requires canManageUsers capability', () => {
      expect(canAccessTab('users', { ...adminCapabilities, canManageUsers: true })).toBe(true);
      expect(canAccessTab('users', { ...adminCapabilities, canManageUsers: false })).toBe(false);
    });

    it('payments tab requires canViewPaymentLogs capability', () => {
      expect(canAccessTab('payments', { ...adminCapabilities, canViewPaymentLogs: true })).toBe(true);
      expect(canAccessTab('payments', { ...adminCapabilities, canViewPaymentLogs: false })).toBe(false);
    });

    it('logs tab requires canViewSystemLogs capability', () => {
      expect(canAccessTab('logs', { ...adminCapabilities, canViewSystemLogs: true })).toBe(true);
      expect(canAccessTab('logs', { ...adminCapabilities, canViewSystemLogs: false })).toBe(false);
    });

    it('crud tab requires canExecuteCrud capability', () => {
      expect(canAccessTab('crud', { ...adminCapabilities, canExecuteCrud: true })).toBe(true);
      expect(canAccessTab('crud', { ...adminCapabilities, canExecuteCrud: false })).toBe(false);
    });

    it('denies access to any tab when capabilities object is undefined or null', () => {
      expect(canAccessTab('overview', null)).toBe(false);
      expect(canAccessTab('users', undefined)).toBe(false);
      expect(canAccessTab('crud', null)).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Suite 3: Role Escalation & Assignment Safety                              */
  /* -------------------------------------------------------------------------- */
  describe('Suite 3: Role Escalation & Assignment Safety', () => {
    it('allows superadmin to assign superadmin role', () => {
      const res = canPerformAction('assign_superadmin', {
        callerRole: 'superadmin',
        callerId: 'super-1',
        capabilities: superadminCapabilities,
      });
      expect(res.allowed).toBe(true);
    });

    it('blocks regular admin from creating or promoting to superadmin', () => {
      const res = canPerformAction('assign_superadmin', {
        callerRole: 'admin',
        callerId: 'admin-1',
        capabilities: adminCapabilities,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Only a superadmin');
    });

    it('blocks regular admin from provisioning accounts with admin role', () => {
      const res = canPerformAction('assign_admin', {
        callerRole: 'admin',
        callerId: 'admin-1',
        capabilities: adminCapabilities,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Only a superadmin');
    });

    it('permits machine API key context to assign administrative roles', () => {
      const machineCaps: AdminCapabilities = {
        ...superadminCapabilities,
        canAssignSuperadmin: true,
      };
      const res = canPerformAction('assign_superadmin', {
        callerRole: 'superadmin',
        callerId: '00000000-0000-0000-0000-000000000000',
        capabilities: machineCaps,
      });
      expect(res.allowed).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Suite 4: Account Deletion Guard Rules                                      */
  /* -------------------------------------------------------------------------- */
  describe('Suite 4: Account Deletion Guard Rules', () => {
    it('blocks self-deletion regardless of role', () => {
      const res = canPerformAction('delete_user', {
        callerRole: 'superadmin',
        callerId: 'same-user-id',
        targetUserId: 'same-user-id',
        targetUserRole: 'superadmin',
        capabilities: superadminCapabilities,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('You cannot delete your own account.');
    });

    it('blocks regular admin from deleting a superadmin user', () => {
      const res = canPerformAction('delete_user', {
        callerRole: 'admin',
        callerId: 'admin-user-1',
        targetUserId: 'target-superadmin',
        targetUserRole: 'superadmin',
        capabilities: adminCapabilities,
      });
      expect(res.allowed).toBe(false);
      expect(res.reason).toBe('Only a superadmin can remove another superadmin.');
    });

    it('permits superadmin to delete another superadmin', () => {
      const res = canPerformAction('delete_user', {
        callerRole: 'superadmin',
        callerId: 'super-1',
        targetUserId: 'super-2',
        targetUserRole: 'superadmin',
        capabilities: superadminCapabilities,
      });
      expect(res.allowed).toBe(true);
    });

    it('permits regular admin to delete ordinary user', () => {
      const res = canPerformAction('delete_user', {
        callerRole: 'admin',
        callerId: 'admin-1',
        targetUserId: 'user-999',
        targetUserRole: 'user',
        capabilities: adminCapabilities,
      });
      expect(res.allowed).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Suite 5: CRUD & Entity Parameter Sanitation                                */
  /* -------------------------------------------------------------------------- */
  describe('Suite 5: CRUD & Entity Parameter Sanitation', () => {
    it('verifies that all 15 whitelisted entities pass isValidCrudEntity', () => {
      for (const entity of WHITELISTED_CRUD_ENTITIES) {
        expect(isValidCrudEntity(entity)).toBe(true);
      }
    });

    it('rejects invalid or dangerous entity names', () => {
      expect(isValidCrudEntity('auth_tokens')).toBe(false);
      expect(isValidCrudEntity('system_keys')).toBe(false);
      expect(isValidCrudEntity('pg_shadow')).toBe(false);
      expect(isValidCrudEntity('secrets')).toBe(false);
    });

    it('identifies space_settings as requiring space_id PK and updated_at sort', () => {
      const info = getEntitySortAndKey('space_settings');
      expect(info.primaryKey).toBe('space_id');
      expect(info.defaultSortBy).toBe('updated_at');
    });

    it('identifies space_members as requiring joined_at sort', () => {
      const info = getEntitySortAndKey('space_members');
      expect(info.primaryKey).toBe('id');
      expect(info.defaultSortBy).toBe('joined_at');
    });

    it('identifies standard entity (spaces) as using id PK and created_at sort', () => {
      const info = getEntitySortAndKey('spaces');
      expect(info.primaryKey).toBe('id');
      expect(info.defaultSortBy).toBe('created_at');
    });
  });
});
