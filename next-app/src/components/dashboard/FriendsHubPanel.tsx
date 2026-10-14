'use client';

import React from 'react';
import styles from './FriendsHubPanel.module.css';
import { useSocialStore } from '@/stores/social';
import { useSessionStore } from '@/stores/session';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { NeoButton } from '@/components/neo/NeoButton';
import { useRouter } from 'next/navigation';

export function FriendsHubPanel() {
  const router = useRouter();
  const { session } = useSessionStore();
  const {
    friends,
    openDirectChat,
    openDrawer,
    setSearchModalOpen,
  } = useSocialStore();

  const onlineCount = friends.filter((f) => f.isOnline).length;

  return (
    <section className={styles.friendsPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.titleArea}>
          <h2 className={styles.panelTitle}>🤝 Explorer Friends</h2>
          <span className={styles.onlineBadge}>
            <span className={styles.pulseDot} />
            {onlineCount} Online
          </span>
        </div>

        <div className={styles.headerActions}>
          <NeoButton
            variant="secondary"
            size="sm"
            onClick={() => setSearchModalOpen(true)}
          >
            ➕ Add Friend
          </NeoButton>
          <NeoButton
            variant="primary"
            size="sm"
            onClick={() => openDrawer('dms')}
          >
            💬 Open Messenger
          </NeoButton>
        </div>
      </div>

      <div className={styles.friendsGrid}>
        {friends.length > 0 ? (
          friends.map((friend) => (
            <div key={friend.id} className={styles.friendCard}>
              <div className={styles.friendInfo}>
                <div className={styles.avatarWrap}>
                  <PixelAvatar config={friend.avatarConfig} size={36} />
                  {friend.isOnline && <span className={styles.onlineIndicator} />}
                </div>
                <div className={styles.textGroup}>
                  <span className={styles.friendName}>{friend.displayName}</span>
                  <span className={styles.statusSnippet}>
                    {friend.currentSpace ? (
                      <span className={styles.spaceBadge}>
                        🟢 In {friend.currentSpace.name}
                      </span>
                    ) : (
                      friend.statusMessage || (friend.isOnline ? 'Online' : 'Offline')
                    )}
                  </span>
                </div>
              </div>

              <div className={styles.cardActions}>
                {friend.currentSpace && (
                  <NeoButton
                    size="sm"
                    variant="primary"
                    className={styles.teleportBtn}
                    onClick={() => router.push(`/space/${friend.currentSpace!.slug}`)}
                    title={`Teleport to ${friend.currentSpace.name}`}
                  >
                    🚀 Teleport
                  </NeoButton>
                )}
                <NeoButton
                  size="sm"
                  variant="ghost"
                  onClick={() => session && openDirectChat(friend, session.id)}
                  title="Direct Message"
                >
                  💬
                </NeoButton>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyFriends}>
            <span>No friends added yet. Connect with explorers to hang out!</span>
            <NeoButton
              size="sm"
              variant="secondary"
              onClick={() => setSearchModalOpen(true)}
            >
              Search Explorers
            </NeoButton>
          </div>
        )}
      </div>
    </section>
  );
}
