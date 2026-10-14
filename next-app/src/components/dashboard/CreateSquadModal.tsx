'use client';

import React, { useState } from 'react';
import styles from './CreateSquadModal.module.css';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoInput } from '@/components/neo/NeoInput';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { useSocialStore } from '@/stores/social';
import { useSessionStore } from '@/stores/session';
import { GroupChatService } from '@/lib/services/groupChat';

const SQUAD_ICONS = ['👾', '🚀', '🎮', '🌲', '🍕', '⚔️', '⛺', '🔮', '🐱'];

export function CreateSquadModal() {
  const { session } = useSessionStore();
  const {
    friends,
    isCreateSquadModalOpen,
    setCreateSquadModalOpen,
    refreshGroups,
    openGroupChat,
  } = useSocialStore();

  const [squadName, setSquadName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('👾');
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleFriend = (id: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!squadName.trim() || !session || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await GroupChatService.createGroup({
        name: squadName.trim(),
        icon: selectedIcon,
        creatorId: session.id,
        memberIds: selectedFriendIds,
      });

      if (created) {
        await refreshGroups(session.id);
        setCreateSquadModalOpen(false);
        setSquadName('');
        setSelectedFriendIds([]);
        openGroupChat(created);
      }
    } catch (err) {
      console.warn('Error creating squad:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NeoModal
      isOpen={isCreateSquadModalOpen}
      onClose={() => setCreateSquadModalOpen(false)}
      title="👥 Form a Squad Group"
    >
      <form onSubmit={handleCreate} className={styles.squadForm}>
        <NeoInput
          label="Squad Name"
          placeholder="e.g. Pixel Raiders, Late Night Chill..."
          value={squadName}
          onChange={(e) => setSquadName(e.target.value)}
          required
        />

        <div className={styles.iconPickerRow}>
          <label className={styles.label}>Squad Icon</label>
          <div className={styles.iconGrid}>
            {SQUAD_ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                className={`${styles.iconBtn} ${
                  selectedIcon === icon ? styles.selectedIcon : ''
                }`}
                onClick={() => setSelectedIcon(icon)}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.iconPickerRow}>
          <label className={styles.label}>
            Invite Friends ({selectedFriendIds.length} selected)
          </label>
          <div className={styles.friendsSelector}>
            {friends.map((friend) => {
              const isChecked = selectedFriendIds.includes(friend.userId);
              return (
                <div
                  key={friend.id}
                  className={styles.friendCheckItem}
                  onClick={() => toggleFriend(friend.userId)}
                >
                  <div className={styles.friendLabel}>
                    <PixelAvatar config={friend.avatarConfig} size={28} />
                    <span className={styles.friendName}>{friend.displayName}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleFriend(friend.userId)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <NeoButton
          type="submit"
          variant="primary"
          size="lg"
          disabled={!squadName.trim() || isSubmitting}
        >
          {isSubmitting ? 'Launching Squad...' : '🚀 Launch Squad'}
        </NeoButton>
      </form>
    </NeoModal>
  );
}
