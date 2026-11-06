'use client';

import React, { useEffect, useState } from 'react';
import { AdminClientService, AdminMetricsData } from '@/lib/services/adminClient';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoButton } from '@/components/neo/NeoButton';
import styles from '../admin.module.css';
import {
  UsersIcon,
  TrendingUpIcon,
  CreditCardIcon,
  DollarSignIcon,
  FlagIcon,
  CompassIcon,
  BotIcon,
  RefreshIcon,
  DatabaseIcon,
  FileTextIcon,
  AlertTriangleIcon,
} from './AdminIcons';
import { AdminTabKey, AdminCapabilities } from './AdminNav';

export interface OverviewTabProps {
  capabilities: AdminCapabilities;
  onNavigateTab: (tab: AdminTabKey) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ capabilities, onNavigateTab }) => {
  const [metrics, setMetrics] = useState<AdminMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await AdminClientService.getMetrics();
        if (cancelled) return;
        setMetrics(response.metrics);
        setTimestamp(response.timestamp);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to retrieve administrative metrics.';
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
  }, [refreshTrigger]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshTrigger((v) => v + 1);
  };

  if (loading && !metrics) {
    return (
      <div className={styles.guardCentering}>
        <div className={`${styles.guardCard} ${styles.skeletonLoading}`}>
          <div className={styles.guardIconWrapper}>
            <RefreshIcon size={32} />
          </div>
          <h2 className={styles.guardTitle}>Loading Overview Metrics...</h2>
          <p className={styles.guardBody}>
            Aggregating platform telemetry, active sessions, and financial ledgers.
          </p>
        </div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className={styles.guardCentering}>
        <div className={styles.guardCard}>
          <div className={styles.guardIconWrapper}>
            <AlertTriangleIcon size={32} color="#EF4444" />
          </div>
          <h2 className={styles.guardTitle}>Metrics Retrieval Error</h2>
          <p className={styles.guardBody}>{error}</p>
          <NeoButton variant="primary" onClick={handleRefresh}>
            <RefreshIcon size={16} />
            <span>Retry Loading</span>
          </NeoButton>
        </div>
      </div>
    );
  }

  const m = metrics || {
    totalUsers: 0,
    newUsers24h: 0,
    activeSubscriptions: 0,
    totalRevenueCents: 0,
    pendingReports: 0,
    activeSpaces: 0,
    todayAiMessages: 0,
  };

  const formattedRevenue = `$${(m.totalRevenueCents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className={styles.titleBar}>
        <div className={styles.titleColumn}>
          <h1 className={styles.pageHeadline}>System Overview</h1>
          <p className={styles.pageDescription}>
            Live platform telemetry, engagement figures, and business statistics.
            {timestamp && (
              <span style={{ marginLeft: '8px', opacity: 0.75 }}>
                (Updated: {new Date(timestamp).toLocaleTimeString()})
              </span>
            )}
          </p>
        </div>
        <div className={styles.titleActions}>
          <NeoButton variant="secondary" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshIcon size={16} className={loading ? styles.skeletonLoading : undefined} />
            <span>Refresh Metrics</span>
          </NeoButton>
        </div>
      </div>

      <div className={styles.overviewGrid}>
        {/* 1. Total Users */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeaderRow}>
            <span className={styles.metricTitle}>Total Users</span>
            <div className={styles.metricIconBox}>
              <UsersIcon size={20} />
            </div>
          </div>
          <div className={styles.metricValueRow}>
            <span className={styles.metricNumber}>{m.totalUsers.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.metricFooterText}>Registered explorer accounts</span>
            <NeoBadge color="#3B82F6" textColor="#FFFFFF">ALL USERS</NeoBadge>
          </div>
        </div>

        {/* 2. New Users 24h */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeaderRow}>
            <span className={styles.metricTitle}>New Users (24h)</span>
            <div className={styles.metricIconBox}>
              <TrendingUpIcon size={20} color="#22C55E" />
            </div>
          </div>
          <div className={styles.metricValueRow}>
            <span className={styles.metricNumber}>+{m.newUsers24h.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.metricFooterText}>Joined in past 24 hours</span>
            <NeoBadge color="#22C55E" textColor="#FFFFFF">24H GAIN</NeoBadge>
          </div>
        </div>

        {/* 3. Active Subscriptions */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeaderRow}>
            <span className={styles.metricTitle}>Active Subscriptions</span>
            <div className={styles.metricIconBox}>
              <CreditCardIcon size={20} color="#10B981" />
            </div>
          </div>
          <div className={styles.metricValueRow}>
            <span className={styles.metricNumber}>{m.activeSubscriptions.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.metricFooterText}>Paying pro & enterprise plans</span>
            <NeoBadge color="#10B981" textColor="#FFFFFF">ACTIVE</NeoBadge>
          </div>
        </div>

        {/* 4. Total Revenue */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeaderRow}>
            <span className={styles.metricTitle}>Total Revenue</span>
            <div className={styles.metricIconBox}>
              <DollarSignIcon size={20} color="#F59E0B" />
            </div>
          </div>
          <div className={styles.metricValueRow}>
            <span className={styles.metricNumber}>{formattedRevenue}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.metricFooterText}>Gross processed receipts</span>
            <NeoBadge color="#F59E0B" textColor="#18181B">ALL TIME</NeoBadge>
          </div>
        </div>

        {/* 5. Pending Reports */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeaderRow}>
            <span className={styles.metricTitle}>Pending Reports</span>
            <div className={styles.metricIconBox}>
              <FlagIcon size={20} color={m.pendingReports > 0 ? '#EF4444' : '#22C55E'} />
            </div>
          </div>
          <div className={styles.metricValueRow}>
            <span className={styles.metricNumber}>{m.pendingReports.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.metricFooterText}>Moderation queue</span>
            <NeoBadge
              color={m.pendingReports > 0 ? '#EF4444' : '#22C55E'}
              textColor="#FFFFFF"
            >
              {m.pendingReports > 0 ? 'ATTENTION' : 'CLEAR'}
            </NeoBadge>
          </div>
        </div>

        {/* 6. Active Spaces */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeaderRow}>
            <span className={styles.metricTitle}>Active Spaces</span>
            <div className={styles.metricIconBox}>
              <CompassIcon size={20} color="#6D28D9" />
            </div>
          </div>
          <div className={styles.metricValueRow}>
            <span className={styles.metricNumber}>{m.activeSpaces.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.metricFooterText}>Virtual rooms currently online</span>
            <NeoBadge color="#6D28D9" textColor="#FFFFFF">SPACES</NeoBadge>
          </div>
        </div>

        {/* 7. Today's AI Messages */}
        <div className={styles.metricCard}>
          <div className={styles.metricHeaderRow}>
            <span className={styles.metricTitle}>Today&apos;s AI Messages</span>
            <div className={styles.metricIconBox}>
              <BotIcon size={20} color="#8B5CF6" />
            </div>
          </div>
          <div className={styles.metricValueRow}>
            <span className={styles.metricNumber}>{m.todayAiMessages.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.metricFooterText}>AI companion interactions</span>
            <NeoBadge color="#8B5CF6" textColor="#FFFFFF">AI ASSIST</NeoBadge>
          </div>
        </div>
      </div>

      {/* Quick Navigation Shortcuts */}
      <div className={styles.shortcutsContainer}>
        <h2 className={styles.sectionHeading}>Administrative Shortcuts</h2>
        <div className={styles.shortcutsGrid}>
          {capabilities.canManageUsers && (
            <button
              type="button"
              className={styles.shortcutTile}
              onClick={() => onNavigateTab('users')}
            >
              <UsersIcon size={20} />
              <span>Manage Users & Roles</span>
            </button>
          )}

          {capabilities.canViewPaymentLogs && (
            <button
              type="button"
              className={styles.shortcutTile}
              onClick={() => onNavigateTab('payments')}
            >
              <CreditCardIcon size={20} />
              <span>Inspect Subscriptions & Invoices</span>
            </button>
          )}

          {capabilities.canViewSystemLogs && (
            <button
              type="button"
              className={styles.shortcutTile}
              onClick={() => onNavigateTab('logs')}
            >
              <FileTextIcon size={20} />
              <span>Review System & Audit Logs</span>
            </button>
          )}

          {capabilities.canExecuteCrud && (
            <button
              type="button"
              className={styles.shortcutTile}
              onClick={() => onNavigateTab('crud')}
            >
              <DatabaseIcon size={20} />
              <span>Database CRUD Explorer</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
