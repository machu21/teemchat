'use client';

import React, { useState, useEffect } from 'react';
import styles from './FriendRequestModal.module.css';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoButton } from '@/components/neo/NeoButton';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { useSocialStore } from '@/stores/social';
import { useSessionStore } from '@/stores/session';
import { FriendService } from '@/lib/services/friends';

import { AvatarConfig } from '@/lib/models/avatar';

type SearchResultUser = {
  id: string;
  username: string;
  displayName: string;
  avatarConfig: AvatarConfig;
};

export function FriendRequestModal() {
  const { session } = useSessionStore();
  const {
    isSearchModalOpen,
    setSearchModalOpen,
    incomingRequests,
    refreshRequests,
    refreshFriends,
  } = useSocialStore();

  const [activeTab, setActiveTab] = useState<'search' | 'requests'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!searchQuery.trim() || !session) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await FriendService.searchUsers(searchQuery, session.id);
      setSearchResults(results);
      setIsSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, session]);

  const handleSendRequest = async (targetUserId: string) => {
    if (!session) return;
    setStatusMessage('Sending request...');
    const res = await FriendService.sendFriendRequest(session.id, targetUserId);
    if (res.success) {
      setStatusMessage('Friend request sent! 🎉');
      await refreshRequests(session.id);
    } else {
      setStatusMessage(res.message || 'Could not send request.');
    }
  };

  const handleRespond = async (requestId: string, action: 'accept' | 'decline') => {
    if (!session) return;
    setStatusMessage(action === 'accept' ? 'Accepting...' : 'Declining...');
    const ok = await FriendService.respondToRequest(requestId, action);
    if (ok) {
      await Promise.all([
        refreshRequests(session.id),
        refreshFriends(session.id),
      ]);
      setStatusMessage(action === 'accept' ? 'Friend added! 🎉' : 'Request declined.');
    }
  };

  return (
    <NeoModal
      isOpen={isSearchModalOpen}
      onClose={() => {
        setSearchModalOpen(false);
        setStatusMessage('');
      }}
      title="🤝 Friends & Explorers"
    >
      <div className={styles.modalContainer}>
        {/* Modal Tabs */}
        <div className={styles.modalTabs}>
          <button
            className={`${styles.modalTabBtn} ${
              activeTab === 'search' ? styles.activeTab : ''
            }`}
            onClick={() => setActiveTab('search')}
          >
            🔍 Search Explorers
          </button>
          <button
            className={`${styles.modalTabBtn} ${
              activeTab === 'requests' ? styles.activeTab : ''
            }`}
            onClick={() => setActiveTab('requests')}
          >
            Pending Requests
            {incomingRequests.length > 0 && (
              <span className={styles.badge}>{incomingRequests.length}</span>
            )}
          </button>
        </div>

        {statusMessage && <div className={styles.statusNotice}>{statusMessage}</div>}

        {/* Tab 1: Search */}
        {activeTab === 'search' && (
          <div className={styles.searchSection}>
            <input
              className={styles.searchInput}
              placeholder="Search by username or display name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults([]);
              }}
              autoFocus
            />

            {isSearching && (
              <div className={styles.emptyNotice}>Searching the realm...</div>
            )}

            <div className={styles.resultsList}>
              {searchResults.length > 0 ? (
                searchResults.map((user) => (
                  <div key={user.id} className={styles.userCard}>
                    <div className={styles.userInfo}>
                      <PixelAvatar config={user.avatarConfig} size={36} />
                      <div className={styles.userNames}>
                        <span className={styles.displayName}>{user.displayName}</span>
                        <span className={styles.username}>@{user.username}</span>
                      </div>
                    </div>
                    <NeoButton
                      size="sm"
                      variant="primary"
                      onClick={() => handleSendRequest(user.id)}
                    >
                      ➕ Add Friend
                    </NeoButton>
                  </div>
                ))
              ) : (
                !isSearching &&
                searchQuery.trim() && (
                  <div className={styles.emptyNotice}>
                    No explorers found matching &quot;{searchQuery}&quot;.
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Requests */}
        {activeTab === 'requests' && (
          <div className={styles.resultsList}>
            {incomingRequests.length > 0 ? (
              incomingRequests.map((req) => (
                <div key={req.id} className={styles.requestCard}>
                  <div className={styles.userInfo}>
                    {req.sender && (
                      <PixelAvatar config={req.sender.avatarConfig} size={36} />
                    )}
                    <div className={styles.userNames}>
                      <span className={styles.displayName}>
                        {req.sender?.displayName || 'Explorer'}
                      </span>
                      <span className={styles.username}>
                        @{req.sender?.username || 'user'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.requestActions}>
                    <NeoButton
                      size="sm"
                      variant="primary"
                      onClick={() => handleRespond(req.id, 'accept')}
                    >
                      ✓ Accept
                    </NeoButton>
                    <NeoButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRespond(req.id, 'decline')}
                    >
                      ✕
                    </NeoButton>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyNotice}>
                No pending friend requests. When someone adds you, it will appear here!
              </div>
            )}
          </div>
        )}
      </div>
    </NeoModal>
  );
}
