'use client';

import React, { useState, useRef, useEffect } from 'react';
import styles from './NotificationBell.module.css';
import { useSocialStore } from '@/stores/social';
import { useSessionStore } from '@/stores/session';
import { FriendService } from '@/lib/services/friends';
import { NeoButton } from '@/components/neo/NeoButton';

export function NotificationBell() {
  const { session } = useSessionStore();
  const {
    incomingRequests,
    refreshRequests,
    refreshFriends,
    openDrawer,
    setSearchModalOpen,
  } = useSocialStore();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const count = incomingRequests.length;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleAccept = async (requestId: string) => {
    if (!session) return;
    await FriendService.respondToRequest(requestId, 'accept');
    await Promise.all([
      refreshRequests(session.id),
      refreshFriends(session.id),
    ]);
  };

  const handleDecline = async (requestId: string) => {
    if (!session) return;
    await FriendService.respondToRequest(requestId, 'decline');
    await refreshRequests(session.id);
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        className={styles.bellBtn}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Notifications"
      >
        🔔
        {count > 0 && <span className={styles.badge}>{count}</span>}
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropHeader}>
            <span>Notifications</span>
            {count > 0 && <span style={{ color: '#EF4444' }}>{count} new</span>}
          </div>

          <div className={styles.dropList}>
            {incomingRequests.length > 0 ? (
              incomingRequests.map((req) => (
                <div key={req.id} className={styles.dropItem}>
                  <div className={styles.dropTextGroup}>
                    <span className={styles.dropTitle}>
                      {req.sender?.displayName || 'Explorer'} sent you a friend request
                    </span>
                    <span className={styles.dropSubtitle}>
                      @{req.sender?.username || 'user'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <NeoButton
                      size="sm"
                      variant="primary"
                      onClick={() => handleAccept(req.id)}
                    >
                      ✓
                    </NeoButton>
                    <NeoButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDecline(req.id)}
                    >
                      ✕
                    </NeoButton>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyDrop}>
                <span>No new notifications</span>
              </div>
            )}
          </div>

          <div className={styles.dropFooter}>
            <NeoButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsOpen(false);
                setSearchModalOpen(true);
              }}
            >
              Manage Friends & Requests →
            </NeoButton>
          </div>
        </div>
      )}
    </div>
  );
}
