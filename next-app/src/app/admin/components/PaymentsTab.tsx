'use client';

import React, { useState, useEffect } from 'react';
import {
  AdminClientService,
  AdminSubscriptionItem,
  AdminInvoiceItem,
} from '@/lib/services/adminClient';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoInput } from '@/components/neo/NeoInput';
import { NeoModal } from '@/components/neo/NeoModal';
import styles from '../admin.module.css';
import {
  CreditCardIcon,
  PlusIcon,
  EditIcon,
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  CopyIcon,
  CheckIcon,
  AlertTriangleIcon,
} from './AdminIcons';

export interface PaymentsTabProps {
  capabilities: { canViewPaymentLogs: boolean };
  onNotify?: (msg: string, type: 'success' | 'error') => void;
}

export const PaymentsTab: React.FC<PaymentsTabProps> = ({ capabilities, onNotify }) => {
  const [subView, setSubView] = useState<'subscriptions' | 'invoices'>('subscriptions');

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionItem[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState<string | null>(null);
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');
  const [subPage, setSubPage] = useState(1);
  const [subTotalPages, setSubTotalPages] = useState(1);
  const [subTotal, setSubTotal] = useState(0);
  const [subRefreshTrigger, setSubRefreshTrigger] = useState(0);

  // Edit subscription modal state
  const [editingSub, setEditingSub] = useState<AdminSubscriptionItem | null>(null);
  const [editStatus, setEditStatus] = useState<'active' | 'trialing' | 'past_due' | 'canceled'>('active');
  const [editPlanId, setEditPlanId] = useState('');
  const [editAiUnlimited, setEditAiUnlimited] = useState(false);
  const [editPeriodEnd, setEditPeriodEnd] = useState('');
  const [editCancelAtEnd, setEditCancelAtEnd] = useState(false);
  const [subSaving, setSubSaving] = useState(false);
  const [subModalError, setSubModalError] = useState<string | null>(null);

  // Invoices state
  const [invoices, setInvoices] = useState<AdminInvoiceItem[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);
  const [invStatusFilter, setInvStatusFilter] = useState<string>('all');
  const [invPage, setInvPage] = useState(1);
  const [invTotalPages, setInvTotalPages] = useState(1);
  const [invTotal, setInvTotal] = useState(0);
  const [invRefreshTrigger, setInvRefreshTrigger] = useState(0);

  // Create invoice modal state
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [invUserId, setInvUserId] = useState('');
  const [invAmountDollars, setInvAmountDollars] = useState('');
  const [invCurrency, setInvCurrency] = useState('usd');
  const [invStatus, setInvStatus] = useState<'paid' | 'open' | 'void' | 'uncollectible'>('paid');
  const [invStripeId, setInvStripeId] = useState('');
  const [invPdfUrl, setInvPdfUrl] = useState('');
  const [invSaving, setInvSaving] = useState(false);
  const [invModalError, setInvModalError] = useState<string | null>(null);

  // Copied indicator state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch Subscriptions via Effect
  useEffect(() => {
    if (subView !== 'subscriptions') return;
    let cancelled = false;

    async function loadSubs() {
      try {
        const response = await AdminClientService.getSubscriptions({
          page: subPage,
          limit: 20,
          status: subStatusFilter !== 'all' ? (subStatusFilter as AdminSubscriptionItem['status']) : undefined,
        });
        if (cancelled) return;
        setSubscriptions(response.subscriptions);
        setSubTotalPages(response.pagination.totalPages || 1);
        setSubTotal(response.pagination.total || 0);
        setSubError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to retrieve subscriptions.';
        setSubError(msg);
      } finally {
        if (!cancelled) {
          setSubLoading(false);
        }
      }
    }

    loadSubs();

    return () => {
      cancelled = true;
    };
  }, [subView, subPage, subStatusFilter, subRefreshTrigger]);

  // Fetch Invoices via Effect
  useEffect(() => {
    if (subView !== 'invoices') return;
    let cancelled = false;

    async function loadInvs() {
      try {
        const response = await AdminClientService.getInvoices({
          page: invPage,
          limit: 20,
          status: invStatusFilter !== 'all' ? (invStatusFilter as AdminInvoiceItem['status']) : undefined,
        });
        if (cancelled) return;
        setInvoices(response.invoices);
        setInvTotalPages(response.pagination.totalPages || 1);
        setInvTotal(response.pagination.total || 0);
        setInvError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to retrieve invoices.';
        setInvError(msg);
      } finally {
        if (!cancelled) {
          setInvLoading(false);
        }
      }
    }

    loadInvs();

    return () => {
      cancelled = true;
    };
  }, [subView, invPage, invStatusFilter, invRefreshTrigger]);

  const handleManualSubRefresh = () => {
    setSubLoading(true);
    setSubRefreshTrigger((v) => v + 1);
  };

  const handleManualInvRefresh = () => {
    setInvLoading(true);
    setInvRefreshTrigger((v) => v + 1);
  };

  // Open Edit Subscription Modal
  const openEditSubModal = (sub: AdminSubscriptionItem) => {
    setEditingSub(sub);
    setEditStatus(sub.status);
    setEditPlanId(sub.plan_id);
    setEditAiUnlimited(sub.has_ai_unlimited);
    setEditPeriodEnd(sub.current_period_end ? sub.current_period_end.slice(0, 16) : '');
    setEditCancelAtEnd(sub.cancel_at_period_end);
    setSubModalError(null);
  };

  // Submit Subscription Override
  const handleSubOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    setSubSaving(true);
    setSubModalError(null);
    try {
      await AdminClientService.updateSubscription({
        id: editingSub.id,
        status: editStatus,
        planId: editPlanId.trim() || undefined,
        hasAiUnlimited: editAiUnlimited,
        currentPeriodEnd: editPeriodEnd ? new Date(editPeriodEnd).toISOString() : undefined,
        cancelAtPeriodEnd: editCancelAtEnd,
      });
      setEditingSub(null);
      onNotify?.('Subscription status and profile tier updated successfully', 'success');
      handleManualSubRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to override subscription.';
      setSubModalError(msg);
    } finally {
      setSubSaving(false);
    }
  };

  // Submit Create Invoice
  const handleCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dollars = parseFloat(invAmountDollars);
    if (isNaN(dollars) || dollars < 0) {
      setInvModalError('Please specify a valid dollar amount greater than or equal to 0.');
      return;
    }

    setInvSaving(true);
    setInvModalError(null);
    try {
      await AdminClientService.createInvoice({
        userId: invUserId.trim(),
        amountCents: Math.round(dollars * 100),
        currency: invCurrency.trim() || 'usd',
        status: invStatus,
        stripeInvoiceId: invStripeId.trim() || undefined,
        invoicePdf: invPdfUrl.trim() || undefined,
      });
      setIsCreateInvoiceOpen(false);
      onNotify?.('Manual invoice logged successfully', 'success');
      handleManualInvRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record invoice log.';
      setInvModalError(msg);
    } finally {
      setInvSaving(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getSubStatusBadge = (status: AdminSubscriptionItem['status']) => {
    switch (status) {
      case 'active':
        return <NeoBadge color="#22C55E" textColor="#FFFFFF">ACTIVE</NeoBadge>;
      case 'trialing':
        return <NeoBadge color="#FBBF24" textColor="#18181B">TRIALING</NeoBadge>;
      case 'past_due':
        return <NeoBadge color="#F97316" textColor="#FFFFFF">PAST DUE</NeoBadge>;
      case 'canceled':
        return <NeoBadge color="#EF4444" textColor="#FFFFFF">CANCELED</NeoBadge>;
      default:
        return <NeoBadge color="#71717A" textColor="#FFFFFF">{String(status).toUpperCase()}</NeoBadge>;
    }
  };

  const getInvStatusBadge = (status: AdminInvoiceItem['status']) => {
    switch (status) {
      case 'paid':
        return <NeoBadge color="#22C55E" textColor="#FFFFFF">PAID</NeoBadge>;
      case 'open':
        return <NeoBadge color="#FBBF24" textColor="#18181B">OPEN</NeoBadge>;
      case 'void':
        return <NeoBadge color="#EF4444" textColor="#FFFFFF">VOID</NeoBadge>;
      case 'uncollectible':
        return <NeoBadge color="#71717A" textColor="#FFFFFF">UNCOLLECTIBLE</NeoBadge>;
      default:
        return <NeoBadge color="#71717A" textColor="#FFFFFF">{String(status).toUpperCase()}</NeoBadge>;
    }
  };

  if (!capabilities.canViewPaymentLogs) {
    return (
      <div className={styles.guardCentering}>
        <div className={styles.guardCard}>
          <div className={styles.guardIconWrapper}>
            <AlertTriangleIcon size={32} color="#EF4444" />
          </div>
          <h2 className={styles.guardTitle}>Permission Restricted</h2>
          <p className={styles.guardBody}>
            Your administrator role does not possess the <code>canViewPaymentLogs</code> capability.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title & Sub-View Switcher Bar */}
      <div className={styles.titleBar}>
        <div className={styles.titleColumn}>
          <h1 className={styles.pageHeadline}>Payments & Billing</h1>
          <p className={styles.pageDescription}>
            Audit customer subscription statuses, override plan tiers, and manage invoice logs.
          </p>
        </div>
        <div className={styles.titleActions}>
          <div style={{ display: 'inline-flex', gap: '8px' }}>
            <button
              type="button"
              className={`${styles.navPill} ${subView === 'subscriptions' ? styles.activePill : ''}`}
              onClick={() => {
                setSubView('subscriptions');
                setSubPage(1);
              }}
            >
              <CreditCardIcon size={16} />
              <span>Subscriptions ({subTotal})</span>
            </button>
            <button
              type="button"
              className={`${styles.navPill} ${subView === 'invoices' ? styles.activePill : ''}`}
              onClick={() => {
                setSubView('invoices');
                setInvPage(1);
              }}
            >
              <CreditCardIcon size={16} />
              <span>Invoices ({invTotal})</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
         Sub-view 1: Subscriptions Table
         ========================================================================= */}
      {subView === 'subscriptions' && (
        <>
          <div className={styles.toolbarCard}>
            <div className={styles.filterCluster}>
              <select
                className={styles.filterSelect}
                value={subStatusFilter}
                onChange={(e) => {
                  setSubStatusFilter(e.target.value);
                  setSubPage(1);
                }}
                aria-label="Filter Subscriptions by Status"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="past_due">Past Due</option>
                <option value="canceled">Canceled</option>
              </select>

              <NeoButton
                variant="secondary"
                size="sm"
                onClick={handleManualSubRefresh}
                disabled={subLoading}
                title="Refresh Subscriptions"
              >
                <RefreshIcon size={16} className={subLoading ? styles.skeletonLoading : undefined} />
              </NeoButton>
            </div>
          </div>

          {subError && (
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
              <span>{subError}</span>
            </div>
          )}

          <div className={styles.tableEnvelope}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Subscriber</th>
                  <th>Plan & Entitlements</th>
                  <th>Status</th>
                  <th>Current Period End</th>
                  <th>Auto-Renew</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subLoading && subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px' }}>
                      <div className={styles.skeletonLoading}>Loading subscription ledger...</div>
                    </td>
                  </tr>
                ) : subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No subscriptions found matching query.
                    </td>
                  </tr>
                ) : (
                  subscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <td>
                        <div className={styles.userCell}>
                          <div className={styles.userMetaColumn}>
                            <span className={styles.userDisplayName}>
                              {sub.profiles?.display_name || 'Subscriber'}
                            </span>
                            <span className={styles.userUsername}>
                              @{sub.profiles?.username || sub.user_id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontWeight: 800 }}>{sub.plan_id}</span>
                          {sub.has_ai_unlimited && (
                            <NeoBadge color="#8B5CF6" textColor="#FFFFFF">
                              AI UNLIMITED
                            </NeoBadge>
                          )}
                        </div>
                      </td>
                      <td>{getSubStatusBadge(sub.status)}</td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {sub.current_period_end
                          ? new Date(sub.current_period_end).toLocaleDateString()
                          : 'Indefinite'}
                      </td>
                      <td>
                        {sub.cancel_at_period_end ? (
                          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '0.82rem' }}>
                            Canceling
                          </span>
                        ) : (
                          <span style={{ color: '#22C55E', fontWeight: 700, fontSize: '0.82rem' }}>
                            Active Renew
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {new Date(sub.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className={styles.actionsCell}>
                          <button
                            type="button"
                            className={styles.tableActionBtn}
                            onClick={() => openEditSubModal(sub)}
                            title="Override Subscription"
                          >
                            <EditIcon size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Subscriptions Pagination */}
          <div className={styles.paginationBar}>
            <span className={styles.pageInfoText}>
              Showing Page {subPage} of {subTotalPages} ({subTotal} total subscriptions)
            </span>
            <div className={styles.pageActionsGroup}>
              <NeoButton
                variant="secondary"
                size="sm"
                disabled={subPage <= 1 || subLoading}
                onClick={() => setSubPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeftIcon size={16} />
                <span>Prev</span>
              </NeoButton>
              <NeoButton
                variant="secondary"
                size="sm"
                disabled={subPage >= subTotalPages || subLoading}
                onClick={() => setSubPage((p) => Math.min(subTotalPages, p + 1))}
              >
                <span>Next</span>
                <ChevronRightIcon size={16} />
              </NeoButton>
            </div>
          </div>
        </>
      )}

      {/* =========================================================================
         Sub-view 2: Invoices Table
         ========================================================================= */}
      {subView === 'invoices' && (
        <>
          <div className={styles.toolbarCard}>
            <div className={styles.filterCluster}>
              <select
                className={styles.filterSelect}
                value={invStatusFilter}
                onChange={(e) => {
                  setInvStatusFilter(e.target.value);
                  setInvPage(1);
                }}
                aria-label="Filter Invoices by Status"
              >
                <option value="all">All Statuses</option>
                <option value="paid">Paid</option>
                <option value="open">Open</option>
                <option value="void">Void</option>
                <option value="uncollectible">Uncollectible</option>
              </select>

              <NeoButton
                variant="secondary"
                size="sm"
                onClick={handleManualInvRefresh}
                disabled={invLoading}
                title="Refresh Invoices"
              >
                <RefreshIcon size={16} className={invLoading ? styles.skeletonLoading : undefined} />
              </NeoButton>
            </div>

            <NeoButton
              variant="primary"
              size="sm"
              onClick={() => {
                setInvUserId('');
                setInvAmountDollars('');
                setInvCurrency('usd');
                setInvStatus('paid');
                setInvStripeId('');
                setInvPdfUrl('');
                setInvModalError(null);
                setIsCreateInvoiceOpen(true);
              }}
            >
              <PlusIcon size={16} />
              <span>Record Manual Invoice</span>
            </NeoButton>
          </div>

          {invError && (
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
              <span>{invError}</span>
            </div>
          )}

          <div className={styles.tableEnvelope}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Invoice Reference</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Paid Timestamp</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {invLoading && invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px' }}>
                      <div className={styles.skeletonLoading}>Loading billing records...</div>
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No billing invoices recorded.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 700 }}>
                            {inv.stripe_invoice_id || inv.id.slice(0, 8)}
                          </span>
                          <button
                            type="button"
                            className={styles.tableActionBtn}
                            onClick={() => copyToClipboard(inv.stripe_invoice_id || inv.id, inv.id)}
                            title="Copy Reference"
                          >
                            {copiedId === inv.id ? <CheckIcon size={14} color="#22C55E" /> : <CopyIcon size={14} />}
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className={styles.userMetaColumn}>
                          <span className={styles.userDisplayName}>
                            {inv.profiles?.display_name || 'Customer'}
                          </span>
                          <span className={styles.userUsername}>
                            @{inv.profiles?.username || inv.user_id.slice(0, 8)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong style={{ fontSize: '0.92rem' }}>
                          ${(inv.amount_cents / 100).toFixed(2)}{' '}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {inv.currency.toUpperCase()}
                          </span>
                        </strong>
                      </td>
                      <td>{getInvStatusBadge(inv.status)}</td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {inv.paid_at ? new Date(inv.paid_at).toLocaleString() : 'Unpaid'}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div className={styles.actionsCell}>
                          {inv.invoice_pdf ? (
                            <a
                              href={inv.invoice_pdf}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.tableActionBtn}
                              title="Open External PDF Receipt"
                            >
                              <ExternalLinkIcon size={16} />
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>None</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Invoices Pagination */}
          <div className={styles.paginationBar}>
            <span className={styles.pageInfoText}>
              Showing Page {invPage} of {invTotalPages} ({invTotal} total invoices)
            </span>
            <div className={styles.pageActionsGroup}>
              <NeoButton
                variant="secondary"
                size="sm"
                disabled={invPage <= 1 || invLoading}
                onClick={() => setInvPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeftIcon size={16} />
                <span>Prev</span>
              </NeoButton>
              <NeoButton
                variant="secondary"
                size="sm"
                disabled={invPage >= invTotalPages || invLoading}
                onClick={() => setInvPage((p) => Math.min(invTotalPages, p + 1))}
              >
                <span>Next</span>
                <ChevronRightIcon size={16} />
              </NeoButton>
            </div>
          </div>
        </>
      )}

      {/* =========================================================================
         Modal: Subscription Override
         ========================================================================= */}
      <NeoModal
        isOpen={Boolean(editingSub)}
        onClose={() => setEditingSub(null)}
        title="Override Customer Subscription"
        maxWidth="540px"
      >
        <form onSubmit={handleSubOverrideSubmit} className={styles.formGrid}>
          {subModalError && (
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
              {subModalError}
            </div>
          )}

          <div
            style={{
              padding: '12px',
              backgroundColor: 'var(--card-inner)',
              borderRadius: '8px',
              border: '1.5px solid var(--card-border)',
              fontSize: '0.85rem',
            }}
          >
            <strong>Customer:</strong> {editingSub?.profiles?.display_name} (@
            {editingSub?.profiles?.username}) —{' '}
            <span style={{ fontFamily: 'monospace' }}>{editingSub?.user_id}</span>
          </div>

          <div className={styles.formFieldWrap}>
            <label className={styles.formLabel}>Subscription Status *</label>
            <select
              className={styles.filterSelect}
              value={editStatus}
              onChange={(e) =>
                setEditStatus(e.target.value as 'active' | 'trialing' | 'past_due' | 'canceled')
              }
            >
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          <NeoInput
            label="Plan Identifier"
            value={editPlanId}
            onChange={(e) => setEditPlanId(e.target.value)}
            placeholder="e.g. pro_monthly, ai_unlimited_annual"
          />

          <NeoInput
            label="Current Period End Timestamp"
            type="datetime-local"
            value={editPeriodEnd}
            onChange={(e) => setEditPeriodEnd(e.target.value)}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label className={styles.checkboxOption}>
              <input
                type="checkbox"
                checked={editAiUnlimited}
                onChange={(e) => setEditAiUnlimited(e.target.checked)}
              />
              <span>Grant Unlimited AI Companion Messages</span>
            </label>

            <label className={styles.checkboxOption}>
              <input
                type="checkbox"
                checked={editCancelAtEnd}
                onChange={(e) => setEditCancelAtEnd(e.target.checked)}
              />
              <span>Cancel At End of Current Period</span>
            </label>
          </div>

          {/* Profile Synchronization Notice */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#EFF6FF',
              border: '1.5px solid #3B82F6',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#1E40AF',
              lineHeight: 1.4,
            }}
          >
            <strong>Auto-Sync Notice:</strong> Setting status to <code>active</code> will automatically
            update the user&apos;s profile to <code>tier: &apos;pro&apos;</code> and <code>is_paid: true</code>.
            Setting status to <code>canceled</code> downgrades to <code>tier: &apos;free&apos;</code>.
          </div>

          <div className={styles.modalFooter}>
            <NeoButton variant="secondary" type="button" onClick={() => setEditingSub(null)}>
              Cancel
            </NeoButton>
            <NeoButton variant="primary" type="submit" disabled={subSaving}>
              {subSaving ? 'Applying...' : 'Save Override'}
            </NeoButton>
          </div>
        </form>
      </NeoModal>

      {/* =========================================================================
         Modal: Create Manual Invoice
         ========================================================================= */}
      <NeoModal
        isOpen={isCreateInvoiceOpen}
        onClose={() => setIsCreateInvoiceOpen(false)}
        title="Record Billing Invoice Log"
        maxWidth="540px"
      >
        <form onSubmit={handleCreateInvoiceSubmit} className={styles.formGrid}>
          {invModalError && (
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
              {invModalError}
            </div>
          )}

          <NeoInput
            label="Customer User UUID *"
            required
            value={invUserId}
            onChange={(e) => setInvUserId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />

          <div className={styles.formRow}>
            <NeoInput
              label="Amount ($ USD) *"
              type="number"
              step="0.01"
              min="0"
              required
              value={invAmountDollars}
              onChange={(e) => setInvAmountDollars(e.target.value)}
              placeholder="e.g. 25.00"
            />
            <div className={styles.formFieldWrap}>
              <label className={styles.formLabel}>Status</label>
              <select
                className={styles.filterSelect}
                value={invStatus}
                onChange={(e) =>
                  setInvStatus(e.target.value as 'paid' | 'open' | 'void' | 'uncollectible')
                }
              >
                <option value="paid">Paid</option>
                <option value="open">Open</option>
                <option value="void">Void</option>
                <option value="uncollectible">Uncollectible</option>
              </select>
            </div>
          </div>

          <div className={styles.formRow}>
            <NeoInput
              label="Currency"
              value={invCurrency}
              onChange={(e) => setInvCurrency(e.target.value)}
              placeholder="usd"
            />
            <NeoInput
              label="Stripe Invoice ID (Optional)"
              value={invStripeId}
              onChange={(e) => setInvStripeId(e.target.value)}
              placeholder="in_1ABC..."
            />
          </div>

          <NeoInput
            label="Invoice PDF Receipt URL (Optional)"
            type="url"
            value={invPdfUrl}
            onChange={(e) => setInvPdfUrl(e.target.value)}
            placeholder="https://..."
          />

          <div className={styles.modalFooter}>
            <NeoButton variant="secondary" type="button" onClick={() => setIsCreateInvoiceOpen(false)}>
              Cancel
            </NeoButton>
            <NeoButton variant="primary" type="submit" disabled={invSaving}>
              {invSaving ? 'Recording...' : 'Record Invoice'}
            </NeoButton>
          </div>
        </form>
      </NeoModal>
    </div>
  );
};
