'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import styles from './dashboard.module.css';
import { useSessionStore } from '@/stores/session';
import { useSocialStore } from '@/stores/social';
import { SpaceService } from '@/lib/services/spaces';
import { SpaceModel, spaceTiers } from '@/lib/models/space';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoCard } from '@/components/neo/NeoCard';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { ThemeToggle } from '@/components/neo/ThemeToggle';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import {
  AvatarConfig,
  Gender,
  availableAccessories,
  availableHairStyles,
} from '@/lib/models/avatar';
import { FriendsHubPanel } from '@/components/dashboard/FriendsHubPanel';
import { SpaceTabsFilter, SpaceCategoryTab } from '@/components/dashboard/SpaceTabsFilter';
import { MessengerDrawer } from '@/components/dashboard/MessengerDrawer';
import { FriendRequestModal } from '@/components/dashboard/FriendRequestModal';
import { CreateSquadModal } from '@/components/dashboard/CreateSquadModal';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { CallOverlayContainer } from '@/components/call/CallOverlayContainer';
import { MapSelector } from '@/components/neo/MapSelector';
import { getMapConfig, MapThemeId } from '@/game/map/mapRegistry';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const { session, initSession, signOut, updateProfile } = useSessionStore();
  const { initSocial, cleanupSocial, openDrawer, unreadCount, friends } = useSocialStore();

  const [spaces, setSpaces] = useState<SpaceModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Space filtering & favorites state
  const [activeSpaceTab, setActiveSpaceTab] = useState<SpaceCategoryTab>('all');
  const [spaceSearch, setSpaceSearch] = useState('');
  const [pinnedSpaceIds, setPinnedSpaceIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('teem_pinned_spaces');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [avatarDrawerOpen, setAvatarDrawerOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  // Form states
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceSlug, setNewSpaceSlug] = useState('');
  const [newSpaceTheme, setNewSpaceTheme] = useState<string>('village');
  const [newSpaceCategory, setNewSpaceCategory] = useState<string>('Gaming');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Avatar editor local state
  const [editGender, setEditGender] = useState<Gender>('male');
  const [editSkin, setEditSkin] = useState('#FCD5B5');
  const [editShirt, setEditShirt] = useState('#7C3AED');
  const [editHair, setEditHair] = useState('#37271E');
  const [editHairStyle, setEditHairStyle] = useState<AvatarConfig['hairStyle']>('short');
  const [editAccessory, setEditAccessory] = useState<AvatarConfig['accessory']>('none');
  const [editDisplayName, setEditDisplayName] = useState('');

  const loadSpaces = useCallback(async () => {
    try {
      const data = await SpaceService.getSpaces(session);
      setSpaces(data);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    initSession();
  }, [initSession]);

  const openAvatarEditor = () => {
    if (session) {
      setEditGender(session.gender || session.avatarConfig.gender || 'male');
      setEditSkin(session.avatarConfig.skinColor);
      setEditShirt(session.avatarConfig.shirtColor);
      setEditHair(session.avatarConfig.hairColor);
      setEditHairStyle(session.avatarConfig.hairStyle);
      setEditAccessory(session.avatarConfig.accessory);
      setEditDisplayName(session.displayName);
    }
    setAvatarDrawerOpen(true);
  };

  useEffect(() => {
    if (session) {
      loadSpaces();
      initSocial(session.id, session.displayName, session.avatarConfig);
    }

    return () => {
      cleanupSocial();
    };
  }, [session, loadSpaces, initSocial, cleanupSocial]);

  const togglePinSpace = (spaceId: string) => {
    setPinnedSpaceIds((prev) => {
      const updated = prev.includes(spaceId) ? prev.filter((id) => id !== spaceId) : [...prev, spaceId];
      try {
        localStorage.setItem('teem_pinned_spaces', JSON.stringify(updated));
      } catch (e) {
        // ignore
      }
      return updated;
    });
  };

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      const slug =
        newSpaceSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') ||
        `space-${Date.now().toString().slice(-4)}`;
      const created = await SpaceService.createSpace(
        {
          name: newSpaceName.trim(),
          slug,
          mapTheme: newSpaceTheme,
          category: newSpaceCategory,
        },
        session
      );
      setCreateModalOpen(false);
      setNewSpaceName('');
      setNewSpaceSlug('');
      router.push(`/space/${created.slug || created.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!joinCodeInput.trim()) return;

    setIsSubmitting(true);
    const space = await SpaceService.getSpaceByCodeOrSlug(joinCodeInput.trim());
    setIsSubmitting(false);

    if (space) {
      setJoinModalOpen(false);
      router.push(`/space/${space.slug || space.id}`);
    } else {
      setFormError('Could not find space with that invite code or slug.');
    }
  };

  const handleSaveAvatar = async () => {
    if (!session) return;
    await updateProfile(
      editDisplayName || session.displayName,
      session.status,
      {
        gender: editGender,
        skinColor: editSkin,
        shirtColor: editShirt,
        hairColor: editHair,
        hairStyle: editHairStyle,
        accessory: editAccessory,
      },
      editGender
    );
    setAvatarDrawerOpen(false);
  };

  // Filtered spaces computation
  const filteredSpaces = useMemo(() => {
    return spaces.filter((space) => {
      // 1. Text search
      if (spaceSearch.trim()) {
        const query = spaceSearch.toLowerCase();
        const matchesName = space.name.toLowerCase().includes(query);
        const matchesSlug = space.slug.toLowerCase().includes(query);
        const matchesDesc = (space.description || '').toLowerCase().includes(query);
        if (!matchesName && !matchesSlug && !matchesDesc) return false;
      }

      // 2. Category Tab
      if (activeSpaceTab === 'my') {
        return space.ownerId === session?.id || session?.isGuest;
      }
      if (activeSpaceTab === 'discover') {
        return space.visibility === 'public';
      }
      if (activeSpaceTab === 'favorites') {
        return pinnedSpaceIds.includes(space.id);
      }
      return true;
    });
  }, [spaces, spaceSearch, activeSpaceTab, session, pinnedSpaceIds]);

  const counts = useMemo(() => {
    return {
      all: spaces.length,
      my: spaces.filter((s) => s.ownerId === session?.id || session?.isGuest).length,
      discover: spaces.filter((s) => s.visibility === 'public').length,
      favorites: spaces.filter((s) => pinnedSpaceIds.includes(s.id)).length,
    };
  }, [spaces, session, pinnedSpaceIds]);

  return (
    <div className={styles.page}>
      {/* Top Navbar */}
      <header className={styles.header}>
        <div className={styles.brand} onClick={() => router.push('/')}>
          <span className={styles.logoIcon}>👾</span>
          <span className={styles.logoText}>TeemChat</span>
        </div>

        <div className={styles.userProfile}>
          <ThemeToggle />

          <NotificationBell />

          <NeoButton
            variant="secondary"
            size="sm"
            onClick={() => openDrawer('dms')}
            title="Open Messenger"
            className={styles.headerMessengerBtn}
          >
            💬 Messenger
            {unreadCount > 0 && <span className={styles.floatingBadge}>{unreadCount}</span>}
          </NeoButton>

          {session && (
            <div
              className={styles.avatarPill}
              onClick={openAvatarEditor}
              title="Customize Avatar"
            >
              <PixelAvatar config={session.avatarConfig} size={32} />
              <div className={styles.userInfo}>
                <span className={styles.userName}>{session.displayName}</span>
                <span className={styles.userRole}>
                  {session.isGuest ? 'Guest' : session.tier.toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {session?.isGuest && (
            <NeoButton
              variant="accent"
              size="sm"
              onClick={() => setUpgradeModalOpen(true)}
              className={styles.headerUpgradeBtn}
            >
              ⭐ Upgrade
            </NeoButton>
          )}

          <NeoButton
            variant="ghost"
            size="sm"
            className={styles.headerSignOutBtn}
            title="Sign Out"
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
          >
            <span className={styles.desktopText}>Sign Out</span>
            <span className={styles.mobileText} aria-hidden="true">🚪</span>
          </NeoButton>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={styles.main}>
        {/* Friends & Live Presence Strip */}
        <FriendsHubPanel />

        {/* Space Top Bar */}
        <div className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle}>Virtual Worlds & Spaces</h1>
            <p className={styles.pageSubtitle}>
              Select a world to enter with proximity spatial voice and 2D canvas avatars.
            </p>
          </div>

          <div className={styles.actionButtons}>
            <NeoButton variant="secondary" onClick={() => setJoinModalOpen(true)}>
              🎟️ Join by Code
            </NeoButton>
            <NeoButton variant="primary" onClick={() => setCreateModalOpen(true)}>
              ➕ Create Space
            </NeoButton>
          </div>
        </div>

        {/* Space Filtering Tabs & Search */}
        <SpaceTabsFilter
          activeTab={activeSpaceTab}
          onTabChange={setActiveSpaceTab}
          searchQuery={spaceSearch}
          onSearchChange={setSpaceSearch}
          counts={counts}
        />

        {/* Space Grid */}
        {isLoading ? (
          <div className={styles.loading}>Loading your virtual worlds...</div>
        ) : filteredSpaces.length === 0 ? (
          <div className={styles.loading}>
            No virtual spaces found matching your filter criteria.
          </div>
        ) : (
          <div className={styles.spaceGrid}>
            {filteredSpaces.map((space) => {
              const tierInfo = spaceTiers[space.tier] || spaceTiers.free;
              const isPinned = pinnedSpaceIds.includes(space.id);

              // Find friends in this space for live presence preview
              const friendsInSpace = friends.filter(
                (f) => f.currentSpace?.slug === space.slug || f.currentSpace?.slug === space.id
              );

              const spaceMapConfig = getMapConfig(space.mapTheme);

              return (
                <NeoCard key={space.id} className={styles.spaceCard}>
                  <div className={styles.spaceCardHeader}>
                    <NeoBadge color={tierInfo.badgeColor}>{tierInfo.badgeText}</NeoBadge>
                    <div className={styles.spaceHeaderRight}>
                      <span className={styles.spaceCapacity}>👥 {space.maxCapacity} max</span>
                      <button
                        className={`${styles.pinBtn} ${isPinned ? styles.pinned : ''}`}
                        onClick={() => togglePinSpace(space.id)}
                        title={isPinned ? 'Unpin space' : 'Pin space to favorites'}
                      >
                        {isPinned ? '📌' : '📍'}
                      </button>
                    </div>
                  </div>

                  <h3 className={styles.spaceName}>{space.name}</h3>
                  <p className={styles.spaceDesc}>
                    {space.description || spaceMapConfig.description}
                  </p>

                  <div className={styles.zoneTagRow}>
                    <span className={styles.zoneTag} style={{ borderColor: spaceMapConfig.badgeColor }}>
                      {spaceMapConfig.icon} {spaceMapConfig.name}
                    </span>
                    {spaceMapConfig.zones.slice(0, 2).map((z) => (
                      <span key={z.id} className={styles.zoneTag}>
                        {z.tag}
                      </span>
                    ))}
                  </div>

                  {/* Live Explorers Row */}
                  <div className={styles.liveMembersRow}>
                    <div className={styles.avatarStack}>
                      {friendsInSpace.length > 0 ? (
                        friendsInSpace.slice(0, 3).map((f) => (
                          <div key={f.id} className={styles.avatarStackItem}>
                            <PixelAvatar config={f.avatarConfig} size={22} />
                          </div>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Available to enter
                        </span>
                      )}
                    </div>
                    <span className={styles.liveCountText}>
                      {friendsInSpace.length > 0 ? `🟢 ${friendsInSpace.length} friends here` : '🟢 Open Hub'}
                    </span>
                  </div>

                  <div className={styles.spaceCardFooter}>
                    <span className={styles.joinCodeText}>Code: {space.slug}</span>
                    <NeoButton
                      variant="primary"
                      onClick={() => router.push(`/space/${space.slug || space.id}`)}
                    >
                      Enter World →
                    </NeoButton>
                  </div>
                </NeoCard>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Messenger Quick Button */}
      <button
        className={styles.floatingMessengerBtn}
        onClick={() => openDrawer('dms')}
        title="Open Messenger"
      >
        <span>💬</span>
        <span>Messenger</span>
        {unreadCount > 0 && <span className={styles.floatingBadge}>{unreadCount}</span>}
      </button>

      {/* Slide-out Messenger Drawer */}
      <MessengerDrawer />

      {/* Friends & Search Modal */}
      <FriendRequestModal />

      {/* Squad Creation Modal */}
      <CreateSquadModal />

      {/* Group & DM Call Overlay Container (Stage, Floating Dock, Incoming Ring) */}
      <CallOverlayContainer />

      {/* Create Space Modal */}
      <NeoModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create a New Space"
        maxWidth="620px"
      >
        <form onSubmit={handleCreateSpace} className={styles.modalForm}>
          {formError && <div className={styles.errorAlert}>{formError}</div>}
          <NeoInput
            label="Space Name"
            placeholder="e.g. Pixel Hangout"
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            required
          />
          <NeoInput
            label="Custom Join Code / Slug (Optional)"
            placeholder="e.g. pixel-crew"
            value={newSpaceSlug}
            onChange={(e) => setNewSpaceSlug(e.target.value)}
          />

          <MapSelector
            selectedTheme={newSpaceTheme}
            onSelectTheme={(themeId: MapThemeId, category: string) => {
              setNewSpaceTheme(themeId);
              setNewSpaceCategory(category);
            }}
          />

          <NeoButton type="submit" variant="primary" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Launch Space'}
          </NeoButton>
        </form>
      </NeoModal>

      {/* Join Space Modal */}
      <NeoModal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        title="Join Virtual Space"
      >
        <form onSubmit={handleJoinSpace} className={styles.modalForm}>
          {formError && <div className={styles.errorAlert}>{formError}</div>}
          <NeoInput
            label="Invite Code, Slug, or Link"
            placeholder="e.g. main-hq or paste invite link"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value)}
            required
          />
          <NeoButton type="submit" variant="primary" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Searching...' : 'Enter Space'}
          </NeoButton>
        </form>
      </NeoModal>

      {/* Avatar Customizer Drawer / Modal */}
      <NeoModal
        isOpen={avatarDrawerOpen}
        onClose={() => setAvatarDrawerOpen(false)}
        title="Customize Pixel Avatar"
      >
        <div className={styles.avatarCustomizer}>
          <div className={styles.previewBox}>
            <PixelAvatar
              config={{
                gender: editGender,
                skinColor: editSkin,
                shirtColor: editShirt,
                hairColor: editHair,
                hairStyle: editHairStyle,
                accessory: editAccessory,
              }}
              size={96}
            />
          </div>

          <div className={styles.selectGroup}>
            <label className={styles.label}>Gender</label>
            <div className={styles.genderButtonGroup}>
              <button
                type="button"
                className={`${styles.genderBtn} ${editGender === 'male' ? styles.genderBtnMaleActive : ''}`}
                onClick={() => setEditGender('male')}
              >
                <span>👨 Male</span>
              </button>
              <button
                type="button"
                className={`${styles.genderBtn} ${editGender === 'female' ? styles.genderBtnFemaleActive : ''}`}
                onClick={() => setEditGender('female')}
              >
                <span>👩 Female</span>
              </button>
            </div>
          </div>

          <NeoInput
            label="Display Name"
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.target.value)}
          />

          <div className={styles.colorPickers}>
            <div>
              <label className={styles.label}>Shirt Color</label>
              <input
                type="color"
                value={editShirt}
                onChange={(e) => setEditShirt(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <div>
              <label className={styles.label}>Hair Color</label>
              <input
                type="color"
                value={editHair}
                onChange={(e) => setEditHair(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <div>
              <label className={styles.label}>Skin Tone</label>
              <input
                type="color"
                value={editSkin}
                onChange={(e) => setEditSkin(e.target.value)}
                className={styles.colorInput}
              />
            </div>
          </div>

          <div className={styles.selectGroup}>
            <label className={styles.label}>Hair Style</label>
            <select
              value={editHairStyle}
              onChange={(e) =>
                setEditHairStyle(e.target.value as AvatarConfig['hairStyle'])
              }
              className={styles.select}
            >
              {availableHairStyles.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.selectGroup}>
            <label className={styles.label}>Accessory</label>
            <select
              value={editAccessory}
              onChange={(e) =>
                setEditAccessory(
                  e.target.value as AvatarConfig['accessory']
                )
              }
              className={styles.select}
            >
              {availableAccessories.map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <NeoButton variant="primary" size="lg" onClick={handleSaveAvatar}>
            Save Changes
          </NeoButton>
        </div>
      </NeoModal>

      {/* Upgrade Modal */}
      <NeoModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Upgrade to Paid Account"
      >
        <div className={styles.upgradeCard}>
          <p>Unlock unlimited personal spaces and access to your persistent AI companion.</p>
          <ul className={styles.upgradeList}>
            <li>✨ Unlimited Virtual Spaces</li>
            <li>🤖 Personal AI Companion with RAG vector memory</li>
            <li>👥 Increased Room Capacity up to 250 players</li>
            <li>🎨 Custom Map Decorator & Persistent Furniture</li>
          </ul>
          <NeoButton
            variant="primary"
            size="lg"
            onClick={() => {
              alert('Redirecting to Stripe checkout session...');
            }}
          >
            Upgrade for $9.99 / mo
          </NeoButton>
        </div>
      </NeoModal>
    </div>
  );
}
