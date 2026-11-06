'use client';

import React from 'react';
import Link from 'next/link';
import { useThemeStore } from '@/stores/theme';
import styles from '../admin.module.css';
import {
  MonitorIcon,
  UsersIcon,
  CreditCardIcon,
  FileTextIcon,
  DatabaseIcon,
  SunIcon,
  MoonIcon,
  ShieldIcon,
  ArrowLeftIcon,
  RefreshIcon,
  AdminIconProps,
} from './AdminIcons';

export type AdminTabKey = 'overview' | 'users' | 'payments' | 'logs' | 'crud';

export interface AdminCapabilities {
  canManageUsers: boolean;
  canViewPaymentLogs: boolean;
  canViewSystemLogs: boolean;
  canExecuteCrud: boolean;
  canAssignSuperadmin: boolean;
}

export interface AdminProfileSummary {
  id: string;
  email: string;
  username: string;
  displayName: string;
  systemRole: string;
  isMachineKey: boolean;
}

export interface AdminNavProps {
  activeTab: AdminTabKey;
  onSelectTab: (tab: AdminTabKey) => void;
  admin: AdminProfileSummary;
  capabilities: AdminCapabilities;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

interface TabDefinition {
  key: AdminTabKey;
  label: string;
  icon: React.ComponentType<AdminIconProps>;
  requiredCapability?: keyof AdminCapabilities;
}

export const ADMIN_TABS: TabDefinition[] = [
  { key: 'overview', label: 'Overview', icon: MonitorIcon },
  { key: 'users', label: 'Users', icon: UsersIcon, requiredCapability: 'canManageUsers' },
  { key: 'payments', label: 'Payments', icon: CreditCardIcon, requiredCapability: 'canViewPaymentLogs' },
  { key: 'logs', label: 'Logs', icon: FileTextIcon, requiredCapability: 'canViewSystemLogs' },
  { key: 'crud', label: 'CRUD Explorer', icon: DatabaseIcon, requiredCapability: 'canExecuteCrud' },
];

export const AdminNav: React.FC<AdminNavProps> = ({
  activeTab,
  onSelectTab,
  admin,
  capabilities,
  onRefresh,
  isRefreshing = false,
}) => {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const isSuperadmin = admin.systemRole === 'superadmin';

  return (
    <>
      <header className={styles.headerShell}>
        <div className={styles.brandCluster}>
          <div className={styles.brandLogoWrap}>
            <ShieldIcon size={24} color="#FFFFFF" />
          </div>
          <div className={styles.brandTextGroup}>
            <span className={styles.brandHeading}>TeemChat Admin</span>
            <span className={styles.brandSubheading}>
              {admin.isMachineKey ? 'DEVELOPER KEY SESSION' : 'SECURE CONSOLE'}
            </span>
          </div>
        </div>

        <div className={styles.headerActions}>
          {onRefresh && (
            <button
              type="button"
              className={styles.themeToggleBtn}
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh Data"
              aria-label="Refresh Data"
            >
              <RefreshIcon
                size={18}
                className={isRefreshing ? styles.skeletonLoading : undefined}
              />
            </button>
          )}

          <button
            type="button"
            className={styles.themeToggleBtn}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>

          <div className={styles.adminIdentityBadge}>
            <span>{admin.displayName || admin.username}</span>
            <span
              className={`${styles.identityRolePill} ${
                isSuperadmin ? styles.roleSuperadmin : styles.roleAdmin
              }`}
            >
              {isSuperadmin ? 'Superadmin' : 'Admin'}
            </span>
          </div>

          <Link href="/dashboard" className={styles.exitButton} title="Exit to User Dashboard">
            <ArrowLeftIcon size={16} />
            <span>Back to App</span>
          </Link>
        </div>
      </header>

      <nav className={styles.navPillsBar} aria-label="Admin Navigation Tabs">
        {ADMIN_TABS.map((tab) => {
          const Icon = tab.icon;
          const isEnabled = !tab.requiredCapability || Boolean(capabilities[tab.requiredCapability]);
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              className={`${styles.navPill} ${isActive ? styles.activePill : ''}`}
              disabled={!isEnabled}
              onClick={() => isEnabled && onSelectTab(tab.key)}
              title={isEnabled ? tab.label : `Access restricted: Missing ${tab.requiredCapability}`}
            >
              <Icon size={16} color="currentColor" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
