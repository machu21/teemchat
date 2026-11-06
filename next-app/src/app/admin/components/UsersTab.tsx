'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  AdminClientService,
  AdminUserProfile,
  AdminUserDossier,
  SystemRole,
} from '@/lib/services/adminClient';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoInput } from '@/components/neo/NeoInput';
import { NeoModal } from '@/components/neo/NeoModal';
import styles from '../admin.module.css';
import {
  SearchIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  EyeIcon,
  CloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RefreshIcon,
  AlertTriangleIcon,
  BotIcon,
} from './AdminIcons';
import { AdminCapabilities } from './AdminNav';

export interface UsersTabProps {
  capabilities: AdminCapabilities;
  currentAdminId: string;
  isSuperadmin: boolean;
  onNotify?: (msg: string, type: 'success' | 'error') => void;
}

export const UsersTab: React.FC<UsersTabProps> = ({
  capabilities,
  currentAdminId,
  isSuperadmin,
  onNotify,
}) => {
  const [, startTransition] = useTransition();

  // Listing state
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUserProfile | null>(null);
  const [dossierUser, setDossierUser] = useState<AdminUserDossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);

  // Create form state
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createGender, setCreateGender] = useState<'male' | 'female'>('male');
  const [createTier, setCreateTier] = useState<'free' | 'pro' | 'enterprise'>('free');
  const [createRole, setCreateRole] = useState<SystemRole>('user');
  const [createAutoConfirm, setCreateAutoConfirm] = useState(true);
  const [createAiCompanion, setCreateAiCompanion] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editStatus, setEditStatus] = useState<AdminUserProfile['status']>('available');
  const [editStatusMessage, setEditStatusMessage] = useState('');
  const [editTier, setEditTier] = useState<'free' | 'pro' | 'enterprise'>('free');
  const [editIsPaid, setEditIsPaid] = useState(false);
  const [editRole, setEditRole] = useState<SystemRole>('user');
  const [editPassword, setEditPassword] = useState('');
  const [editAiCompanion, setEditAiCompanion] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete modal state
  const [deleteMode, setDeleteMode] = useState<'soft' | 'hard'>('soft');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch Users via Effect
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await AdminClientService.getUsers({
          page,
          limit: 20,
          search: search.trim() || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          role: roleFilter !== 'all' ? (roleFilter as SystemRole) : undefined,
          tier: tierFilter !== 'all' ? tierFilter : undefined,
        });
        if (cancelled) return;
        setUsers(response.users);
        setTotalPages(response.pagination.totalPages || 1);
        setTotalCount(response.pagination.total || 0);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to retrieve user list.';
        setError(msg);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [page, search, statusFilter, roleFilter, tierFilter, refreshTrigger]);

  const handleManualRefresh = () => {
    setLoading(true);
    setRefreshTrigger((v) => v + 1);
  };

  // Reset page when filters change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    startTransition(() => {
      setSearch(val);
      setPage(1);
    });
  };

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  const handleRoleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRoleFilter(e.target.value);
    setPage(1);
  };

  const handleTierFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTierFilter(e.target.value);
    setPage(1);
  };

  // Open Create Modal
  const openCreateModal = () => {
    setCreateEmail('');
    setCreatePassword('');
    setCreateUsername('');
    setCreateDisplayName('');
    setCreateGender('male');
    setCreateTier('free');
    setCreateRole('user');
    setCreateAutoConfirm(true);
    setCreateAiCompanion(false);
    setCreateError(null);
    setIsCreateOpen(true);
  };

  // Handle Create User
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await AdminClientService.createUser({
        email: createEmail,
        password: createPassword,
        username: createUsername.trim() || undefined,
        displayName: createDisplayName.trim() || 'Explorer',
        gender: createGender,
        tier: createTier,
        systemRole: createRole,
        autoConfirm: createAutoConfirm,
        hasAiCompanion: createAiCompanion,
      });
      setIsCreateOpen(false);
      onNotify?.('User provisioned successfully', 'success');
      handleManualRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user account.';
      setCreateError(msg);
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (user: AdminUserProfile) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name || '');
    setEditUsername(user.username || '');
    setEditStatus(user.status);
    setEditStatusMessage(user.status_message || '');
    setEditTier(user.tier);
    setEditIsPaid(user.is_paid);
    setEditRole(user.system_role);
    setEditPassword('');
    setEditAiCompanion(user.has_ai_companion);
    setEditError(null);
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await AdminClientService.updateUser(editingUser.id, {
        displayName: editDisplayName.trim() || undefined,
        username: editUsername.trim() || undefined,
        status: editStatus,
        statusMessage: editStatusMessage.trim() || null,
        tier: editTier,
        isPaid: editIsPaid,
        systemRole: isSuperadmin ? editRole : undefined,
        password: editPassword.trim() || undefined,
        hasAiCompanion: editAiCompanion,
      });
      setEditingUser(null);
      onNotify?.(`User @${editingUser.username} updated successfully`, 'success');
      handleManualRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user profile.';
      setEditError(msg);
    } finally {
      setEditSubmitting(false);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (user: AdminUserProfile) => {
    setDeletingUser(user);
    setDeleteMode('soft');
    setDeleteError(null);
  };

  // Handle Delete Submit
  const handleDeleteSubmit = async () => {
    if (!deletingUser) return;

    if (deletingUser.id === currentAdminId) {
      setDeleteError('You cannot delete your own administrative account.');
      return;
    }

    if (deletingUser.system_role === 'superadmin' && !isSuperadmin) {
      setDeleteError('Only a superadmin can remove or suspend another superadmin.');
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await AdminClientService.deleteUser(deletingUser.id, deleteMode);
      setDeletingUser(null);
      onNotify?.(
        deleteMode === 'soft'
          ? `User @${deletingUser.username} suspended (soft ban)`
          : `User @${deletingUser.username} permanently deleted`,
        'success'
      );
      handleManualRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete user account.';
      setDeleteError(msg);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Open Dossier
  const openDossier = async (userId: string) => {
    setDossierLoading(true);
    try {
      const response = await AdminClientService.getUser(userId);
      setDossierUser(response.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load user dossier.';
      onNotify?.(msg, 'error');
    } finally {
      setDossierLoading(false);
    }
  };

  // Helpers
  const getStatusColor = (status: AdminUserProfile['status']) => {
    switch (status) {
      case 'available':
        return '#22C55E';
      case 'away':
        return '#FBBF24';
      case 'busy':
      case 'banned':
        return '#EF4444';
      default:
        return '#71717A';
    }
  };

  const getRoleColor = (role: SystemRole) => {
    switch (role) {
      case 'superadmin':
      case 'admin':
        return '#6D28D9';
      case 'moderator':
        return '#3B82F6';
      default:
        return '#71717A';
    }
  };

  if (!capabilities.canManageUsers) {
    return (
      <div className={styles.guardCentering}>
        <div className={styles.guardCard}>
          <div className={styles.guardIconWrapper}>
            <AlertTriangleIcon size={32} color="#EF4444" />
          </div>
          <h2 className={styles.guardTitle}>Permission Restricted</h2>
          <p className={styles.guardBody}>
            Your administrator role does not possess the <code>canManageUsers</code> capability.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Stats Bar */}
      <div className={styles.titleBar}>
        <div className={styles.titleColumn}>
          <h1 className={styles.pageHeadline}>User Management</h1>
          <p className={styles.pageDescription}>
            Manage explorer profiles, permissions, tiers, and access credentials. ({totalCount} total registered)
          </p>
        </div>
        <div className={styles.titleActions}>
          <NeoButton variant="primary" onClick={openCreateModal}>
            <PlusIcon size={16} />
            <span>Create User</span>
          </NeoButton>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className={styles.toolbarCard}>
        <div className={styles.searchCluster}>
          <SearchIcon size={16} className={styles.searchLensIcon} />
          <input
            type="text"
            className={styles.searchField}
            placeholder="Search by username or display name..."
            value={search}
            onChange={handleSearchChange}
          />
          {search && (
            <button
              type="button"
              className={styles.clearSearchAction}
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              title="Clear search"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>

        <div className={styles.filterCluster}>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={handleStatusFilterChange}
            aria-label="Filter by Status"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="away">Away</option>
            <option value="busy">Busy</option>
            <option value="offline">Offline</option>
            <option value="banned">Banned</option>
          </select>

          <select
            className={styles.filterSelect}
            value={roleFilter}
            onChange={handleRoleFilterChange}
            aria-label="Filter by Role"
          >
            <option value="all">All Roles</option>
            <option value="user">User</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>

          <select
            className={styles.filterSelect}
            value={tierFilter}
            onChange={handleTierFilterChange}
            aria-label="Filter by Tier"
          >
            <option value="all">All Tiers</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>

          <NeoButton
            variant="secondary"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
            title="Refresh List"
          >
            <RefreshIcon size={16} className={loading ? styles.skeletonLoading : undefined} />
          </NeoButton>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '2px solid #EF4444',
            borderRadius: '8px',
            padding: '14px 18px',
            color: '#B91C1C',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertTriangleIcon size={20} color="#EF4444" />
          <span>{error}</span>
        </div>
      )}

      {/* Users Data Table */}
      <div className={styles.tableEnvelope}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Role</th>
              <th>Tier</th>
              <th>Paid</th>
              <th>AI Companion</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                  <div className={styles.skeletonLoading}>Loading user records...</div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No user accounts found matching query criteria.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className={styles.userCell}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--primary)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          border: '1.5px solid var(--card-border)',
                          boxShadow: '1.5px 1.5px 0px var(--card-border)',
                        }}
                      >
                        {user.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className={styles.userMetaColumn}>
                        <span className={styles.userDisplayName}>{user.display_name}</span>
                        <span className={styles.userUsername}>@{user.username}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <NeoBadge color={getStatusColor(user.status)} textColor="#FFFFFF">
                      {user.status.toUpperCase()}
                    </NeoBadge>
                  </td>
                  <td>
                    <NeoBadge color={getRoleColor(user.system_role)} textColor="#FFFFFF">
                      {user.system_role.toUpperCase()}
                    </NeoBadge>
                  </td>
                  <td>
                    <span className={styles.badgeTag} style={{ backgroundColor: 'var(--card-inner)' }}>
                      {user.tier.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <NeoBadge color={user.is_paid ? '#22C55E' : '#71717A'} textColor="#FFFFFF">
                      {user.is_paid ? 'PAID' : 'FREE'}
                    </NeoBadge>
                  </td>
                  <td>
                    {user.has_ai_companion ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--primary)',
                          fontWeight: 700,
                        }}
                      >
                        <BotIcon size={16} />
                        <span>Enabled</span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className={styles.actionsCell}>
                      <button
                        type="button"
                        className={styles.tableActionBtn}
                        onClick={() => openDossier(user.id)}
                        title="View User Dossier"
                      >
                        <EyeIcon size={16} />
                      </button>
                      <button
                        type="button"
                        className={styles.tableActionBtn}
                        onClick={() => openEditModal(user)}
                        title="Edit User"
                      >
                        <EditIcon size={16} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.tableActionBtn} ${styles.dangerAction}`}
                        onClick={() => openDeleteModal(user)}
                        title="Delete or Suspend User"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className={styles.paginationBar}>
        <span className={styles.pageInfoText}>
          Showing Page {page} of {totalPages} ({totalCount} total users)
        </span>
        <div className={styles.pageActionsGroup}>
          <NeoButton
            variant="secondary"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeftIcon size={16} />
            <span>Prev</span>
          </NeoButton>
          <NeoButton
            variant="secondary"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <span>Next</span>
            <ChevronRightIcon size={16} />
          </NeoButton>
        </div>
      </div>

      {/* =========================================================================
         Modal 1: Provision New User
         ========================================================================= */}
      <NeoModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Provision New User" maxWidth="560px">
        <form onSubmit={handleCreateSubmit} className={styles.formGrid}>
          {createError && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '2px solid #EF4444',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#B91C1C',
                fontSize: '0.88rem',
                fontWeight: 700,
              }}
            >
              {createError}
            </div>
          )}

          <div className={styles.formRow}>
            <NeoInput
              label="Email Address *"
              type="email"
              required
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              placeholder="explorer@example.com"
            />
            <NeoInput
              label="Initial Password *"
              type="password"
              required
              minLength={8}
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              placeholder="Min 8 characters"
            />
          </div>

          <div className={styles.formRow}>
            <NeoInput
              label="Username (Optional)"
              value={createUsername}
              onChange={(e) => setCreateUsername(e.target.value)}
              placeholder="e.g. cyber_sam"
            />
            <NeoInput
              label="Display Name"
              value={createDisplayName}
              onChange={(e) => setCreateDisplayName(e.target.value)}
              placeholder="e.g. Sam Explorer"
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formFieldWrap}>
              <label className={styles.formLabel}>Gender</label>
              <div className={styles.radioGroup}>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="createGender"
                    value="male"
                    checked={createGender === 'male'}
                    onChange={() => setCreateGender('male')}
                  />
                  <span>Male</span>
                </label>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="createGender"
                    value="female"
                    checked={createGender === 'female'}
                    onChange={() => setCreateGender('female')}
                  />
                  <span>Female</span>
                </label>
              </div>
            </div>

            <div className={styles.formFieldWrap}>
              <label className={styles.formLabel}>Account Tier</label>
              <select
                className={styles.filterSelect}
                value={createTier}
                onChange={(e) => setCreateTier(e.target.value as 'free' | 'pro' | 'enterprise')}
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className={styles.formFieldWrap}>
            <label className={styles.formLabel}>System Role</label>
            <select
              className={styles.filterSelect}
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value as SystemRole)}
            >
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin" disabled={!isSuperadmin}>
                Admin {!isSuperadmin ? '(Superadmin Only)' : ''}
              </option>
              <option value="superadmin" disabled={!isSuperadmin}>
                Superadmin {!isSuperadmin ? '(Superadmin Only)' : ''}
              </option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className={styles.checkboxOption}>
              <input
                type="checkbox"
                checked={createAutoConfirm}
                onChange={(e) => setCreateAutoConfirm(e.target.checked)}
              />
              <span>Auto-confirm Email Address (Bypass email verification token)</span>
            </label>

            <label className={styles.checkboxOption}>
              <input
                type="checkbox"
                checked={createAiCompanion}
                onChange={(e) => setCreateAiCompanion(e.target.checked)}
              />
              <span>Provision AI Companion Instance Immediately</span>
            </label>
          </div>

          <div className={styles.modalFooter}>
            <NeoButton variant="secondary" type="button" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton variant="primary" type="submit" disabled={createSubmitting}>
              {createSubmitting ? 'Creating...' : 'Provision User'}
            </NeoButton>
          </div>
        </form>
      </NeoModal>

      {/* =========================================================================
         Modal 2: Edit User Profile
         ========================================================================= */}
      <NeoModal
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title={editingUser ? `Edit User: @${editingUser.username}` : 'Edit User'}
        maxWidth="560px"
      >
        <form onSubmit={handleEditSubmit} className={styles.formGrid}>
          {editError && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '2px solid #EF4444',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#B91C1C',
                fontSize: '0.88rem',
                fontWeight: 700,
              }}
            >
              {editError}
            </div>
          )}

          <div className={styles.formRow}>
            <NeoInput
              label="Display Name"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
            />
            <NeoInput
              label="Username"
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formFieldWrap}>
              <label className={styles.formLabel}>Presence Status</label>
              <select
                className={styles.filterSelect}
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as AdminUserProfile['status'])}
              >
                <option value="available">Available</option>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
                <option value="banned">Banned</option>
              </select>
            </div>

            <div className={styles.formFieldWrap}>
              <label className={styles.formLabel}>Subscription Tier</label>
              <select
                className={styles.filterSelect}
                value={editTier}
                onChange={(e) => setEditTier(e.target.value as 'free' | 'pro' | 'enterprise')}
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <NeoInput
            label="Status Message (Max 160 chars)"
            maxLength={160}
            value={editStatusMessage}
            onChange={(e) => setEditStatusMessage(e.target.value)}
            placeholder="User custom status message..."
          />

          <div className={styles.formFieldWrap}>
            <label className={styles.formLabel}>
              System Security Role {!isSuperadmin && '(Locked: Superadmin Only)'}
            </label>
            <select
              className={styles.filterSelect}
              value={editRole}
              disabled={!isSuperadmin}
              onChange={(e) => setEditRole(e.target.value as SystemRole)}
            >
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>

          <NeoInput
            label="Reset Password (Leave blank to keep current)"
            type="password"
            placeholder="••••••••"
            value={editPassword}
            onChange={(e) => setEditPassword(e.target.value)}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className={styles.checkboxOption}>
              <input
                type="checkbox"
                checked={editIsPaid}
                onChange={(e) => setEditIsPaid(e.target.checked)}
              />
              <span>Is Paid Customer Account</span>
            </label>

            <label className={styles.checkboxOption}>
              <input
                type="checkbox"
                checked={editAiCompanion}
                onChange={(e) => setEditAiCompanion(e.target.checked)}
              />
              <span>AI Companion Entitlement Enabled</span>
            </label>
          </div>

          <div className={styles.modalFooter}>
            <NeoButton variant="secondary" type="button" onClick={() => setEditingUser(null)}>
              Cancel
            </NeoButton>
            <NeoButton variant="primary" type="submit" disabled={editSubmitting}>
              {editSubmitting ? 'Saving...' : 'Save Profile Changes'}
            </NeoButton>
          </div>
        </form>
      </NeoModal>

      {/* =========================================================================
         Modal 3: Delete / Suspend User Confirmation
         ========================================================================= */}
      <NeoModal
        isOpen={Boolean(deletingUser)}
        onClose={() => setDeletingUser(null)}
        title={deletingUser ? `Suspend or Delete @${deletingUser.username}` : 'Delete User'}
        maxWidth="500px"
      >
        <div className={styles.formGrid}>
          {deleteError && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '2px solid #EF4444',
                borderRadius: '8px',
                padding: '12px 14px',
                color: '#B91C1C',
                fontSize: '0.88rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangleIcon size={18} color="#EF4444" />
              <span>{deleteError}</span>
            </div>
          )}

          {deletingUser?.id === currentAdminId ? (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '2px solid #EF4444',
                borderRadius: '8px',
                padding: '14px',
                color: '#B91C1C',
                fontWeight: 800,
              }}
            >
              Self-deletion is prohibited. You cannot suspend or delete the administrative account
              you are currently authenticated with.
            </div>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                Select whether to soft-ban or permanently purge the account of{' '}
                <strong>@{deletingUser?.username}</strong> ({deletingUser?.display_name}).
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '2px solid var(--card-border)',
                    backgroundColor: deleteMode === 'soft' ? 'var(--card-inner)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="deleteMode"
                    value="soft"
                    checked={deleteMode === 'soft'}
                    onChange={() => setDeleteMode('soft')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem' }}>
                      Soft Ban (Recommended)
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Locks auth login for 100 years and marks profile as banned. Keeps spaces,
                      chats, and payment records intact for auditing.
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '2px solid #EF4444',
                    backgroundColor: deleteMode === 'hard' ? '#FEF2F2' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="deleteMode"
                    value="hard"
                    checked={deleteMode === 'hard'}
                    onChange={() => setDeleteMode('hard')}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: '#B91C1C' }}>
                      Hard Delete (Permanent & Irreversible)
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#991B1B' }}>
                      Completely purges the user from auth and deletes all cascading records from the
                      database.
                    </span>
                  </div>
                </label>
              </div>

              <div className={styles.modalFooter}>
                <NeoButton variant="secondary" type="button" onClick={() => setDeletingUser(null)}>
                  Cancel
                </NeoButton>
                <NeoButton
                  variant="danger"
                  type="button"
                  disabled={deleteSubmitting}
                  onClick={handleDeleteSubmit}
                >
                  {deleteSubmitting
                    ? 'Executing...'
                    : deleteMode === 'soft'
                    ? 'Confirm Suspension'
                    : 'Purge Account'}
                </NeoButton>
              </div>
            </>
          )}
        </div>
      </NeoModal>

      {/* =========================================================================
         Modal 4: User Dossier Inspector
         ========================================================================= */}
      <NeoModal
        isOpen={Boolean(dossierUser) || dossierLoading}
        onClose={() => setDossierUser(null)}
        title={dossierUser ? `User Dossier: ${dossierUser.id}` : 'Loading Dossier...'}
        maxWidth="640px"
      >
        {dossierLoading ? (
          <div style={{ textAlign: 'center', padding: '30px' }} className={styles.skeletonLoading}>
            Loading complete administrative dossier...
          </div>
        ) : dossierUser ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Account Metadata */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                padding: '14px',
                backgroundColor: 'var(--card-inner)',
                borderRadius: '8px',
                border: '1.5px solid var(--card-border)',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <strong>Email:</strong> {dossierUser.email || 'None'}
              </div>
              <div>
                <strong>Email Confirmed:</strong>{' '}
                {dossierUser.emailConfirmedAt ? (
                  <span style={{ color: '#22C55E' }}>Confirmed</span>
                ) : (
                  <span style={{ color: '#EF4444' }}>Unconfirmed</span>
                )}
              </div>
              <div>
                <strong>Last Sign-In:</strong>{' '}
                {dossierUser.lastSignInAt
                  ? new Date(dossierUser.lastSignInAt).toLocaleString()
                  : 'Never'}
              </div>
              <div>
                <strong>Banned Until:</strong>{' '}
                {dossierUser.bannedUntil ? (
                  <span style={{ color: '#EF4444' }}>
                    {new Date(dossierUser.bannedUntil).toLocaleDateString()}
                  </span>
                ) : (
                  'Not Banned'
                )}
              </div>
            </div>

            {/* Profile Raw Summary */}
            <div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '0.9rem', fontWeight: 800 }}>
                Profile Attributes
              </h4>
              <div className={styles.jsonViewer}>
                {JSON.stringify(dossierUser.profile, null, 2)}
              </div>
            </div>

            {/* Subscription & Spaces */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--card-inner)',
                  borderRadius: '8px',
                  border: '1.5px solid var(--card-border)',
                }}
              >
                <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '6px' }}>
                  Subscription
                </strong>
                {dossierUser.subscription ? (
                  <span style={{ fontSize: '0.82rem' }}>
                    Plan: {String(dossierUser.subscription.plan_id || 'pro')} (Status:{' '}
                    {String(dossierUser.subscription.status)})
                  </span>
                ) : (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    No active paid subscription
                  </span>
                )}
              </div>

              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--card-inner)',
                  borderRadius: '8px',
                  border: '1.5px solid var(--card-border)',
                }}
              >
                <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '6px' }}>
                  Platform Engagement
                </strong>
                <span style={{ fontSize: '0.82rem', display: 'block' }}>
                  Spaces: {dossierUser.spaces.total} memberships
                </span>
                <span style={{ fontSize: '0.82rem', display: 'block' }}>
                  Reports Filed: {dossierUser.reports.total}
                </span>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <NeoButton variant="secondary" onClick={() => setDossierUser(null)}>
                Close Dossier
              </NeoButton>
            </div>
          </div>
        ) : null}
      </NeoModal>
    </div>
  );
};
