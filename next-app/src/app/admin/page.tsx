'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useThemeStore } from '@/stores/theme';
import {
  AdminClientService,
  AdminApiError,
  AdminUserIdentity,
  AdminCapabilities,
} from '@/lib/services/adminClient';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoInput } from '@/components/neo/NeoInput';
import styles from './admin.module.css';
import {
  LockIcon,
  ShieldIcon,
  RefreshIcon,
  KeyIcon,
  ArrowLeftIcon,
  CheckIcon,
  AlertTriangleIcon,
} from './components/AdminIcons';
import { AdminNav, AdminTabKey } from './components/AdminNav';
import { OverviewTab } from './components/OverviewTab';
import { UsersTab } from './components/UsersTab';
import { PaymentsTab } from './components/PaymentsTab';
import { LogsTab } from './components/LogsTab';
import { CrudTab } from './components/CrudTab';

type AuthState =
  | { status: 'CHECKING' }
  | { status: 'UNAUTHENTICATED'; error: string }
  | { status: 'FORBIDDEN'; error: string; admin?: AdminUserIdentity }
  | { status: 'AUTHORIZED'; admin: AdminUserIdentity; capabilities: AdminCapabilities };

interface ToastNotice {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export default function AdminPage() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'CHECKING' });
  const [activeTab, setActiveTab] = useState<AdminTabKey>('overview');
  const [devKeyInput, setDevKeyInput] = useState('');
  const [showKeyAccordion, setShowKeyAccordion] = useState(false);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Initialize theme
  useEffect(() => {
    useThemeStore.getState().initTheme();
  }, []);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Primary verification lifecycle (asynchronous execution inside effect)
  useEffect(() => {
    let cancelled = false;

    async function verify() {
      try {
        const result = await AdminClientService.verifyAuth();
        if (cancelled) return;
        if (result.verified && result.admin && result.capabilities) {
          setAuthState({
            status: 'AUTHORIZED',
            admin: result.admin,
            capabilities: result.capabilities,
          });
        } else {
          setAuthState({
            status: 'UNAUTHENTICATED',
            error: 'Authentication failed. Please verify credentials.',
          });
        }
      } catch (err: unknown) {
        if (cancelled) return;
        if (err instanceof AdminApiError) {
          if (err.isForbidden) {
            setAuthState({
              status: 'FORBIDDEN',
              error: err.message || 'Insufficient administrative privileges.',
            });
          } else {
            setAuthState({
              status: 'UNAUTHENTICATED',
              error: err.message || 'Authentication required.',
            });
          }
        } else {
          const msg = err instanceof Error ? err.message : 'Authentication verification failed.';
          setAuthState({
            status: 'UNAUTHENTICATED',
            error: msg,
          });
        }
      }
    }

    verify();

    return () => {
      cancelled = true;
    };
  }, [reloadTrigger]);

  const triggerRecheck = () => {
    setAuthState({ status: 'CHECKING' });
    setReloadTrigger((v) => v + 1);
  };

  // Apply dev API key
  const handleApplyDevKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!devKeyInput.trim()) return;
    AdminClientService.setDevApiKey(devKeyInput.trim());
    addToast('Developer key configured. Re-verifying session...', 'success');
    triggerRecheck();
  };

  const handleClearDevKey = () => {
    AdminClientService.setDevApiKey(null);
    setDevKeyInput('');
    addToast('Developer key cleared.', 'success');
    triggerRecheck();
  };

  // State 1: Checking
  if (authState.status === 'CHECKING') {
    return (
      <div className={styles.adminPage}>
        <div className={styles.guardCentering}>
          <div className={`${styles.guardCard} ${styles.skeletonLoading}`}>
            <div className={styles.guardIconWrapper}>
              <RefreshIcon size={32} />
            </div>
            <h2 className={styles.guardTitle}>Verifying Admin Credentials...</h2>
            <p className={styles.guardBody}>
              Validating cryptographic session token and role claims against the administrative guard.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // State 2: Unauthenticated (401)
  if (authState.status === 'UNAUTHENTICATED') {
    return (
      <div className={styles.adminPage}>
        <div className={styles.guardCentering}>
          <div className={styles.guardCard}>
            <div className={styles.guardIconWrapper}>
              <LockIcon size={32} color="var(--primary)" />
            </div>
            <h2 className={styles.guardTitle}>Authentication Required</h2>
            <p className={styles.guardBody}>
              You must be signed in with an administrator account to access the administration dashboard.
            </p>
            <div style={{ fontSize: '0.82rem', color: '#EF4444', fontWeight: 700 }}>
              {authState.error}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <Link href="/">
                <NeoButton variant="primary">Sign In to TeemChat</NeoButton>
              </Link>
              <NeoButton variant="secondary" onClick={triggerRecheck}>
                <RefreshIcon size={16} />
                <span>Retry</span>
              </NeoButton>
            </div>

            {/* Developer Machine Key Entry Accordion */}
            <div className={styles.apiKeyAccordion}>
              <button
                type="button"
                onClick={() => setShowKeyAccordion((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <KeyIcon size={14} />
                <span>{showKeyAccordion ? 'Hide Machine API Key Input' : 'Use Developer Admin Key'}</span>
              </button>

              {showKeyAccordion && (
                <form onSubmit={handleApplyDevKey} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <NeoInput
                    label="X-Admin-Api-Key"
                    type="password"
                    value={devKeyInput}
                    onChange={(e) => setDevKeyInput(e.target.value)}
                    placeholder="Enter secret key..."
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <NeoButton variant="primary" size="sm" type="submit">
                      Authenticate with Key
                    </NeoButton>
                    {AdminClientService.getDevApiKey() && (
                      <NeoButton variant="secondary" size="sm" type="button" onClick={handleClearDevKey}>
                        Clear Key
                      </NeoButton>
                    )}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // State 3: Forbidden (403)
  if (authState.status === 'FORBIDDEN') {
    return (
      <div className={styles.adminPage}>
        <div className={styles.guardCentering}>
          <div className={styles.guardCard}>
            <div className={styles.guardIconWrapper}>
              <ShieldIcon size={32} color="#EF4444" />
            </div>
            <h2 className={styles.guardTitle}>Access Forbidden</h2>
            <p className={styles.guardBody}>
              Your account does not possess sufficient administrative permissions to access the control portal.
            </p>
            <div style={{ fontSize: '0.82rem', color: '#EF4444', fontWeight: 700 }}>
              {authState.error}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <Link href="/dashboard">
                <NeoButton variant="primary">
                  <ArrowLeftIcon size={16} />
                  <span>Return to Dashboard</span>
                </NeoButton>
              </Link>
              <NeoButton variant="secondary" onClick={triggerRecheck}>
                <RefreshIcon size={16} />
                <span>Re-verify</span>
              </NeoButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // State 4: Authorized
  const { admin, capabilities } = authState;

  return (
    <div className={styles.adminPage}>
      {/* Toast Notification Overlay */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              style={{
                backgroundColor: t.type === 'success' ? '#22C55E' : '#EF4444',
                color: '#FFFFFF',
                padding: '12px 18px',
                borderRadius: '8px',
                border: '2px solid #18181B',
                boxShadow: '3px 3px 0px #18181B',
                fontWeight: 800,
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {t.type === 'success' ? <CheckIcon size={16} /> : <AlertTriangleIcon size={16} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top Header & Capability-Gated Nav */}
      <AdminNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        admin={admin}
        capabilities={capabilities}
        onRefresh={triggerRecheck}
      />

      {/* Main Tab Container */}
      <main className={styles.mainLayout}>
        {activeTab === 'overview' && (
          <OverviewTab capabilities={capabilities} onNavigateTab={setActiveTab} />
        )}

        {activeTab === 'users' && (
          <UsersTab
            capabilities={capabilities}
            currentAdminId={admin.id}
            isSuperadmin={admin.systemRole === 'superadmin'}
            onNotify={addToast}
          />
        )}

        {activeTab === 'payments' && (
          <PaymentsTab capabilities={capabilities} onNotify={addToast} />
        )}

        {activeTab === 'logs' && (
          <LogsTab capabilities={capabilities} onNotify={addToast} />
        )}

        {activeTab === 'crud' && (
          <CrudTab capabilities={capabilities} onNotify={addToast} />
        )}
      </main>
    </div>
  );
}
