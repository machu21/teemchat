'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { AdminClientService, AdminLogCategory } from '@/lib/services/adminClient';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoModal } from '@/components/neo/NeoModal';
import styles from '../admin.module.css';
import {
  ShieldIcon,
  GemIcon,
  UsersIcon,
  CpuIcon,
  LockIcon,
  AlertTriangleIcon,
  SearchIcon,
  CloseIcon,
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  CopyIcon,
  CheckIcon,
  AdminIconProps,
} from './AdminIcons';

export interface LogsTabProps {
  capabilities: { canViewSystemLogs: boolean };
  onNotify?: (msg: string, type: 'success' | 'error') => void;
}

interface CategoryDefinition {
  key: AdminLogCategory;
  label: string;
  icon: React.ComponentType<AdminIconProps>;
  description: string;
}

const CATEGORIES: CategoryDefinition[] = [
  {
    key: 'admin_audit',
    label: 'Admin Audit',
    icon: ShieldIcon,
    description: 'Mutations and privileged actions executed by administrators',
  },
  {
    key: 'payments',
    label: 'Billing Events',
    icon: GemIcon,
    description: 'Financial transactions and invoice state events',
  },
  {
    key: 'space_audit',
    label: 'Space Moderation',
    icon: UsersIcon,
    description: 'Virtual world actions (kicks, room changes, setting updates)',
  },
  {
    key: 'ai_usage',
    label: 'AI Companion Usage',
    icon: CpuIcon,
    description: 'Daily token and message volume consumed per user',
  },
  {
    key: 'guest_security',
    label: 'Guest Provisions',
    icon: LockIcon,
    description: 'Security provisioning telemetry for anonymous guest sessions',
  },
  {
    key: 'reports',
    label: 'User Reports',
    icon: AlertTriangleIcon,
    description: 'Harassment and misconduct reports filed across spaces',
  },
];

export const LogsTab: React.FC<LogsTabProps> = ({ capabilities, onNotify }) => {
  const [, startTransition] = useTransition();

  const [activeCategory, setActiveCategory] = useState<AdminLogCategory>('admin_audit');
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Inspector modal
  const [inspectedLog, setInspectedLog] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await AdminClientService.getLogs({
          category: activeCategory,
          page,
          limit: 25,
          search: search.trim() || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate
            ? new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)).toISOString()
            : undefined,
        });
        if (cancelled) return;
        setLogs((response.logs as Array<Record<string, unknown>>) || []);
        setTotalPages(response.pagination.totalPages || 1);
        setTotalCount(response.pagination.total || 0);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to query system logs.';
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
  }, [activeCategory, page, search, startDate, endDate, refreshTrigger]);

  const handleManualRefresh = () => {
    setLoading(true);
    setRefreshTrigger((v) => v + 1);
  };

  // Handle Search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    startTransition(() => {
      setSearch(val);
      setPage(1);
      setLoading(true);
    });
  };

  // Date Presets
  const setPresetToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setStartDate(today.toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
    setPage(1);
    setLoading(true);
  };

  const setPresetLast7Days = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    setStartDate(d.toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
    setPage(1);
    setLoading(true);
  };

  const setPresetLast30Days = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setStartDate(d.toISOString().slice(0, 10));
    setEndDate(new Date().toISOString().slice(0, 10));
    setPage(1);
    setLoading(true);
  };

  const clearDates = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
    setLoading(true);
  };

  const handleCopyJson = () => {
    if (!inspectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(inspectedLog, null, 2));
    setCopied(true);
    onNotify?.('Log payload copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!capabilities.canViewSystemLogs) {
    return (
      <div className={styles.guardCentering}>
        <div className={styles.guardCard}>
          <div className={styles.guardIconWrapper}>
            <AlertTriangleIcon size={32} color="#EF4444" />
          </div>
          <h2 className={styles.guardTitle}>Permission Restricted</h2>
          <p className={styles.guardBody}>
            Your administrator role does not possess the <code>canViewSystemLogs</code> capability.
          </p>
        </div>
      </div>
    );
  }

  const currentCategoryDef =
    CATEGORIES.find((c) => c.key === activeCategory) || CATEGORIES[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Category Navigation */}
      <div className={styles.titleBar}>
        <div className={styles.titleColumn}>
          <h1 className={styles.pageHeadline}>System & Audit Logs</h1>
          <p className={styles.pageDescription}>{currentCategoryDef.description}</p>
        </div>
        <div className={styles.titleActions}>
          <NeoButton
            variant="secondary"
            size="sm"
            onClick={handleManualRefresh}
            disabled={loading}
            title="Refresh Logs"
          >
            <RefreshIcon size={16} className={loading ? styles.skeletonLoading : undefined} />
            <span>Refresh</span>
          </NeoButton>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className={styles.navPillsBar} style={{ padding: '6px' }}>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              className={`${styles.navPill} ${isActive ? styles.activePill : ''}`}
              onClick={() => {
                setActiveCategory(cat.key);
                setPage(1);
                setLoading(true);
              }}
            >
              <Icon size={16} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter & Date Presets Bar */}
      <div className={styles.toolbarCard}>
        <div className={styles.searchCluster}>
          <SearchIcon size={16} className={styles.searchLensIcon} />
          <input
            type="text"
            className={styles.searchField}
            placeholder={`Search ${currentCategoryDef.label.toLowerCase()} logs...`}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>From:</span>
            <input
              type="date"
              className={styles.filterSelect}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              style={{ width: '140px', padding: '0 8px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>To:</span>
            <input
              type="date"
              className={styles.filterSelect}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              style={{ width: '140px', padding: '0 8px' }}
            />
          </div>

          {/* Quick Date Presets */}
          <div style={{ display: 'inline-flex', gap: '6px' }}>
            <button
              type="button"
              className={styles.tableActionBtn}
              style={{ width: 'auto', padding: '0 10px', fontSize: '0.78rem', fontWeight: 800 }}
              onClick={setPresetToday}
            >
              Today
            </button>
            <button
              type="button"
              className={styles.tableActionBtn}
              style={{ width: 'auto', padding: '0 10px', fontSize: '0.78rem', fontWeight: 800 }}
              onClick={setPresetLast7Days}
            >
              7D
            </button>
            <button
              type="button"
              className={styles.tableActionBtn}
              style={{ width: 'auto', padding: '0 10px', fontSize: '0.78rem', fontWeight: 800 }}
              onClick={setPresetLast30Days}
            >
              30D
            </button>
            {(startDate || endDate) && (
              <button
                type="button"
                className={styles.tableActionBtn}
                style={{ width: 'auto', padding: '0 8px', fontSize: '0.78rem', fontWeight: 800, color: '#EF4444' }}
                onClick={clearDates}
                title="Reset Date Filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            backgroundColor: '#FEF2F2',
            border: '2px solid #EF4444',
            borderRadius: '8px',
            padding: '12px 14px',
            color: '#B91C1C',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangleIcon size={18} color="#EF4444" />
          <span>{error}</span>
        </div>
      )}

      {/* Category-Specific Dynamic Table */}
      <div className={styles.tableEnvelope}>
        <table className={styles.dataTable}>
          <thead>
            {activeCategory === 'admin_audit' && (
              <tr>
                <th>Timestamp</th>
                <th>Administrator</th>
                <th>Action</th>
                <th>Target Entity</th>
                <th>Client IP</th>
                <th style={{ textAlign: 'right' }}>Inspection</th>
              </tr>
            )}
            {activeCategory === 'payments' && (
              <tr>
                <th>Timestamp</th>
                <th>Customer</th>
                <th>Invoice ID</th>
                <th>Amount</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Inspection</th>
              </tr>
            )}
            {activeCategory === 'space_audit' && (
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Space Name / ID</th>
                <th>Target Type</th>
                <th style={{ textAlign: 'right' }}>Inspection</th>
              </tr>
            )}
            {activeCategory === 'ai_usage' && (
              <tr>
                <th>Usage Date</th>
                <th>Explorer User</th>
                <th>Tier</th>
                <th>Messages Handled</th>
                <th>Quota Gauge</th>
                <th style={{ textAlign: 'right' }}>Inspection</th>
              </tr>
            )}
            {activeCategory === 'guest_security' && (
              <tr>
                <th>Provisioned At</th>
                <th>Guest Handle</th>
                <th>Client IP Address</th>
                <th>Session UUID</th>
                <th style={{ textAlign: 'right' }}>Inspection</th>
              </tr>
            )}
            {activeCategory === 'reports' && (
              <tr>
                <th>Timestamp</th>
                <th>Reporter</th>
                <th>Reported User</th>
                <th>Infraction Reason</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Inspection</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px' }}>
                  <div className={styles.skeletonLoading}>Querying audit events...</div>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  No log entries found for this category and filter range.
                </td>
              </tr>
            ) : (
              logs.map((log, index) => {
                const logId = String(log.id || index);
                const createdAt = String(log.created_at || log.provisioned_at || log.usage_date || '');

                return (
                  <tr key={logId}>
                    {/* admin_audit */}
                    {activeCategory === 'admin_audit' && (
                      <>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}
                        </td>
                        <td>
                          <span style={{ fontWeight: 800 }}>
                            {String(
                              (log.admin as Record<string, unknown>)?.username ||
                                log.admin_id ||
                                'System'
                            )}
                          </span>
                        </td>
                        <td>
                          <NeoBadge color="#6D28D9" textColor="#FFFFFF">
                            {String(log.action || 'MUTATION').toUpperCase()}
                          </NeoBadge>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                            {String(log.target_table || 'unknown')}:
                            {String(log.target_id || '').slice(0, 8)}...
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                          {String(log.ip_address || '-')}
                        </td>
                      </>
                    )}

                    {/* payments */}
                    {activeCategory === 'payments' && (
                      <>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}
                        </td>
                        <td>
                          <span style={{ fontWeight: 800 }}>
                            {String(
                              (log.profiles as Record<string, unknown>)?.username ||
                                log.user_id ||
                                'Customer'
                            )}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                          {String(log.stripe_invoice_id || log.id || '-')}
                        </td>
                        <td>
                          <strong>${((Number(log.amount_cents) || 0) / 100).toFixed(2)}</strong>
                        </td>
                        <td>
                          <NeoBadge
                            color={String(log.status) === 'paid' ? '#22C55E' : '#FBBF24'}
                            textColor="#FFFFFF"
                          >
                            {String(log.status || 'unknown').toUpperCase()}
                          </NeoBadge>
                        </td>
                      </>
                    )}

                    {/* space_audit */}
                    {activeCategory === 'space_audit' && (
                      <>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}
                        </td>
                        <td>
                          <span style={{ fontWeight: 800 }}>
                            {String(
                              (log.actor as Record<string, unknown>)?.username ||
                                log.actor_id ||
                                'Actor'
                            )}
                          </span>
                        </td>
                        <td>
                          <NeoBadge color="#3B82F6" textColor="#FFFFFF">
                            {String(log.action || 'ACTION').toUpperCase()}
                          </NeoBadge>
                        </td>
                        <td>
                          {String(
                            (log.space as Record<string, unknown>)?.name ||
                              log.space_id ||
                              'Space'
                          )}
                        </td>
                        <td>{String(log.target_type || '-')}</td>
                      </>
                    )}

                    {/* ai_usage */}
                    {activeCategory === 'ai_usage' && (
                      <>
                        <td style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                          {String(log.usage_date || '')}
                        </td>
                        <td>
                          <span style={{ fontWeight: 800 }}>
                            {String(
                              (log.profiles as Record<string, unknown>)?.username ||
                                log.user_id ||
                                'Explorer'
                            )}
                          </span>
                        </td>
                        <td>
                          <NeoBadge color="var(--primary)" textColor="#FFFFFF">
                            {String(
                              (log.profiles as Record<string, unknown>)?.tier || 'free'
                            ).toUpperCase()}
                          </NeoBadge>
                        </td>
                        <td>
                          <strong>{Number(log.message_count) || 0}</strong> /{' '}
                          <span style={{ color: 'var(--text-muted)' }}>
                            {Number(log.max_daily_messages) || 100}
                          </span>
                        </td>
                        <td>
                          {(() => {
                            const count = Number(log.message_count) || 0;
                            const max = Number(log.max_daily_messages) || 100;
                            const pct = Math.min(100, Math.round((count / max) * 100));
                            return (
                              <div
                                style={{
                                  width: '100px',
                                  height: '8px',
                                  backgroundColor: 'var(--card-inner)',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                  border: '1px solid var(--card-border)',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    backgroundColor: pct > 85 ? '#EF4444' : 'var(--primary)',
                                  }}
                                />
                              </div>
                            );
                          })()}
                        </td>
                      </>
                    )}

                    {/* guest_security */}
                    {activeCategory === 'guest_security' && (
                      <>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}
                        </td>
                        <td>
                          <span style={{ fontWeight: 800 }}>
                            {String(log.guest_username || log.id || 'guest')}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                          {String(log.client_ip || log.ip_address || '-')}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>
                          {String(log.id || '').slice(0, 12)}...
                        </td>
                      </>
                    )}

                    {/* reports */}
                    {activeCategory === 'reports' && (
                      <>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {createdAt ? new Date(createdAt).toLocaleString() : 'N/A'}
                        </td>
                        <td>
                          <span style={{ fontWeight: 800 }}>
                            {String(
                              (log.reporter as Record<string, unknown>)?.username ||
                                log.reporter_id ||
                                'Reporter'
                            )}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 800, color: '#EF4444' }}>
                            {String(
                              (log.reported as Record<string, unknown>)?.username ||
                                log.reported_user_id ||
                                'Target'
                            )}
                          </span>
                        </td>
                        <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {String(log.reason || '-')}
                        </td>
                        <td>
                          <NeoBadge
                            color={
                              String(log.status) === 'pending'
                                ? '#EF4444'
                                : String(log.status) === 'resolved'
                                ? '#22C55E'
                                : '#71717A'
                            }
                            textColor="#FFFFFF"
                          >
                            {String(log.status || 'pending').toUpperCase()}
                          </NeoBadge>
                        </td>
                      </>
                    )}

                    {/* Actions Column */}
                    <td>
                      <div className={styles.actionsCell}>
                        <button
                          type="button"
                          className={styles.tableActionBtn}
                          onClick={() => setInspectedLog(log)}
                          title="Inspect Event Payload"
                        >
                          <EyeIcon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className={styles.paginationBar}>
        <span className={styles.pageInfoText}>
          Showing Page {page} of {totalPages} ({totalCount} total entries)
        </span>
        <div className={styles.pageActionsGroup}>
          <NeoButton
            variant="secondary"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => {
              setPage((p) => Math.max(1, p - 1));
              setLoading(true);
            }}
          >
            <ChevronLeftIcon size={16} />
            <span>Prev</span>
          </NeoButton>
          <NeoButton
            variant="secondary"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => {
              setPage((p) => Math.min(totalPages, p + 1));
              setLoading(true);
            }}
          >
            <span>Next</span>
            <ChevronRightIcon size={16} />
          </NeoButton>
        </div>
      </div>

      {/* =========================================================================
         Modal: JSON & State Diff Inspector
         ========================================================================= */}
      <NeoModal
        isOpen={Boolean(inspectedLog)}
        onClose={() => setInspectedLog(null)}
        title={`Audit Event Inspection: ${currentCategoryDef.label}`}
        maxWidth="680px"
      >
        {inspectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* If log has changes_before and changes_after, render Diff Boxes */}
            {inspectedLog.changes_before && inspectedLog.changes_after ? (
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, display: 'block', marginBottom: '8px' }}>
                  State Mutation Diff (Before / After)
                </span>
                <div className={styles.diffContainer}>
                  <div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#B91C1C' }}>
                      Previous State
                    </span>
                    <div className={`${styles.diffBox} ${styles.diffBefore}`}>
                      {JSON.stringify(inspectedLog.changes_before, null, 2)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>
                      New State
                    </span>
                    <div className={`${styles.diffBox} ${styles.diffAfter}`}>
                      {JSON.stringify(inspectedLog.changes_after, null, 2)}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Complete Raw JSON Event Record */}
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, display: 'block', marginBottom: '6px' }}>
                Full JSON Record
              </span>
              <div className={styles.jsonViewer}>
                {JSON.stringify(inspectedLog, null, 2)}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <NeoButton variant="secondary" onClick={handleCopyJson}>
                {copied ? <CheckIcon size={16} color="#22C55E" /> : <CopyIcon size={16} />}
                <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
              </NeoButton>
              <NeoButton variant="primary" onClick={() => setInspectedLog(null)}>
                Close
              </NeoButton>
            </div>
          </div>
        )}
      </NeoModal>
    </div>
  );
};
