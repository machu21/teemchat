'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import styles from './dashboard.module.css';
import { useSessionStore } from '@/stores/session';
import { useSocialStore } from '@/stores/social';
import { SpaceService } from '@/lib/services/spaces';
import { InviteLinkService } from '@/lib/services/invite';
import { SpaceMode, SpaceModel, spaceTiers } from '@/lib/models/space';
import { membershipLabel } from '@/lib/membership';
import { AiAddonCard } from '@/components/billing/AiAddonCard';
import { NeoButton } from '@/components/neo/NeoButton';
import { NeoBadge } from '@/components/neo/NeoBadge';
import { NeoModal } from '@/components/neo/NeoModal';
import { NeoInput } from '@/components/neo/NeoInput';
import { ThemeToggle } from '@/components/neo/ThemeToggle';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import {
  AvatarConfig,
  Gender,
  TopStyle,
  BottomStyle,
  FacialHair,
  availableAccessories,
  availableHairStyles,
  availableTopStyles,
  availableBottomStyles,
  availableFacialHair,
} from '@/lib/models/avatar';
import { FriendsHubPanel } from '@/components/dashboard/FriendsHubPanel';
import { SpaceTabsFilter, SpaceCategoryTab } from '@/components/dashboard/SpaceTabsFilter';
import { MessengerDrawer } from '@/components/dashboard/MessengerDrawer';
import { CompanionPanel } from '@/components/companion/CompanionPanel';
import { BotIcon, GlobeIcon, LockIcon, LogOutIcon } from '@/components/icons/DockIcons';
import { FriendRequestModal } from '@/components/dashboard/FriendRequestModal';
import { CreateSquadModal } from '@/components/dashboard/CreateSquadModal';
import { NotificationBell } from '@/components/dashboard/NotificationBell';
import { CallOverlayContainer } from '@/components/call/CallOverlayContainer';
import { MapSelector } from '@/components/neo/MapSelector';
import { getMapConfig, MapThemeId } from '@/game/map/mapRegistry';
import { TrashIcon } from '@/components/icons/LandingIcons';
import { useRouter } from 'next/navigation';

const SPACES_PAGE_SIZE = 8;
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default function DashboardPage() {
  const router = useRouter();
  const { session, isLoading: isSessionLoading, initSession, signOut, updateProfile } = useSessionStore();
  const { initSocial, cleanupSocial, openDrawer, isDrawerOpen, unreadCount, friends } = useSocialStore();

  const [spaces, setSpaces] = useState<SpaceModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Space filtering & favorites state
  const [activeSpaceTab, setActiveSpaceTab] = useState<SpaceCategoryTab>('all');
  const [spaceSearch, setSpaceSearch] = useState('');
  const [spacePage, setSpacePage] = useState(1);
  // Guests whose provisioning failed get a non-UUID id and live only in this browser
  const isLocalOnlyGuest = Boolean(session?.isGuest && !UUID_REGEX.test(session.id));
  const [pinnedSpaceIds, setPinnedSpaceIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('teem_pinned_spaces');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [avatarDrawerOpen, setAvatarDrawerOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);

  // Form states
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceSlug, setNewSpaceSlug] = useState('');
  const [newSpaceTheme, setNewSpaceTheme] = useState<string>('village');
  const [newSpaceMode, setNewSpaceMode] = useState<SpaceMode>('social');
  const [newSpaceCategory, setNewSpaceCategory] = useState<string>('Gaming');
  const [newSpaceVisibility, setNewSpaceVisibility] = useState<'public' | 'private'>('public');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [copiedSpaceId, setCopiedSpaceId] = useState<string | null>(null);
  const [spaceToDelete, setSpaceToDelete] = useState<SpaceModel | null>(null);
  const [isDeletingSpace, setIsDeletingSpace] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const openCreateModal = () => {
    setFormError('');
    setCreateModalOpen(true);
  };

  const openJoinModal = () => {
    setFormError('');
    setJoinModalOpen(true);
  };

  const handleCopySpaceLink = async (space: SpaceModel) => {
    // Private spaces only resolve through their random join code, never the slug
    const code =
      space.visibility === 'private' && space.joinCode ? space.joinCode : space.slug || space.id;
    const url = InviteLinkService.generateInviteUrl(code, {
      theme: space.mapTheme,
      name: space.name,
    });
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSpaceId(space.id);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedSpaceId(null), 2000);
    } catch {
      window.prompt('Copy this invite link:', url);
    }
  };

  // Avatar editor local state
  const [editGender, setEditGender] = useState<Gender>('male');
  const [editSkin, setEditSkin] = useState('#ffe2cc');
  const [editShirt, setEditShirt] = useState('#4a86d8');
  const [editHair, setEditHair] = useState('#2b2530');
  const [editHairStyle, setEditHairStyle] = useState<AvatarConfig['hairStyle']>('short');
  const [editAccessory, setEditAccessory] = useState<AvatarConfig['accessory']>('none');
  const [editTopStyle, setEditTopStyle] = useState<TopStyle>('tshirt');
  const [editBottomStyle, setEditBottomStyle] = useState<BottomStyle>('pants');
  const [editBottomColor, setEditBottomColor] = useState('#2c3655');
  const [editShoesColor, setEditShoesColor] = useState('#2b2b33');
  const [editFacialHair, setEditFacialHair] = useState<FacialHair>('none');
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

  // Auth guard: the dashboard requires a signed-in user or a guest session.
  // Sessions live in localStorage, so this has to run client-side after initSession resolves.
  const needsAuthRedirect = !isSessionLoading && !session;
  useEffect(() => {
    if (needsAuthRedirect) router.replace('/');
  }, [needsAuthRedirect, router]);

  const handleSelectGender = (gender: Gender) => {
    setEditGender(gender);
    if (gender === 'female') {
      if (editTopStyle === 'shirt_tie' || editTopStyle === 'polo') setEditTopStyle('blouse');
      if (editFacialHair !== 'none') setEditFacialHair('none');
    }
  };

  const openAvatarEditor = () => {
    if (session) {
      const isFemale = (session.gender || session.avatarConfig.gender) === 'female';
      setEditGender(isFemale ? 'female' : 'male');
      setEditSkin(session.avatarConfig.skinColor || '#ffe2cc');
      setEditShirt(session.avatarConfig.shirtColor || (isFemale ? '#e47aa8' : '#4a86d8'));
      setEditHair(session.avatarConfig.hairColor || (isFemale ? '#5f3c28' : '#2b2530'));
      setEditHairStyle(session.avatarConfig.hairStyle || (isFemale ? 'long' : 'short'));
      setEditAccessory(session.avatarConfig.accessory || 'none');
      setEditTopStyle(session.avatarConfig.topStyle || (isFemale ? 'blouse' : 'tshirt'));
      setEditBottomStyle(session.avatarConfig.bottomStyle || (isFemale ? 'skirt' : 'pants'));
      setEditBottomColor(session.avatarConfig.bottomColor || (isFemale ? '#3f5f8c' : '#2c3655'));
      setEditShoesColor(session.avatarConfig.shoesColor || '#2b2b33');
      setEditFacialHair(session.avatarConfig.facialHair || 'none');
      setEditDisplayName(session.displayName);
    }
    setAvatarDrawerOpen(true);
  };

  // Back from Stripe (?billing=success|cancel): open the account panel so the
  // AI add-on card can show the result.
  const billingReturnHandledRef = useRef(false);
  useEffect(() => {
    if (billingReturnHandledRef.current || !session || session.isGuest) return;
    if (!new URLSearchParams(window.location.search).has('billing')) return;
    const timer = setTimeout(() => {
      billingReturnHandledRef.current = true;
      openAvatarEditor();
    }, 0);
    return () => clearTimeout(timer);
  });

  // Auth events (token refresh, tab refocus) replace the session object for the same user.
  // initSocial only updates presence for an already-connected user, so this is cheap.
  useEffect(() => {
    if (session) {
      loadSpaces();
      initSocial(session.id, session.displayName, session.avatarConfig);
    }
  }, [session, loadSpaces, initSocial]);

  // Tear the social sockets down only when the user changes or the page unmounts;
  // tearing down on every session object change made friends see us leave and rejoin.
  const sessionUserId = session?.id;
  useEffect(() => {
    return () => {
      cleanupSocial();
    };
  }, [sessionUserId, cleanupSocial]);

  const togglePinSpace = (spaceId: string) => {
    setPinnedSpaceIds((prev) => {
      const updated = prev.includes(spaceId) ? prev.filter((id) => id !== spaceId) : [...prev, spaceId];
      try {
        localStorage.setItem('teem_pinned_spaces', JSON.stringify(updated));
      } catch {
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
        newSpaceSlug
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') ||
        `space-${Date.now().toString().slice(-4)}`;
      const created = await SpaceService.createSpace(
        {
          name: newSpaceName.trim(),
          slug,
          mapTheme: newSpaceTheme,
          category: newSpaceCategory,
          visibility: newSpaceVisibility,
          mode: newSpaceMode,
        },
        session
      );
      setCreateModalOpen(false);
      setNewSpaceName('');
      setNewSpaceSlug('');
      setNewSpaceVisibility('public');
      setNewSpaceMode('social');
      router.push(`/space/${created.slug || created.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteModal = (space: SpaceModel) => {
    setDeleteError('');
    setSpaceToDelete(space);
  };

  const handleDeleteSpace = async () => {
    if (!spaceToDelete || !SpaceService.isSpaceOwner(spaceToDelete, session)) return;
    setIsDeletingSpace(true);
    setDeleteError('');
    try {
      const deleted = await SpaceService.deleteSpace(spaceToDelete.id, session);
      if (!deleted) {
        setDeleteError('Could not delete this space. Only the owner can delete it.');
        return;
      }
      const deletedId = spaceToDelete.id;
      setSpaces((prev) => prev.filter((s) => s.id !== deletedId));
      setPinnedSpaceIds((prev) => {
        if (!prev.includes(deletedId)) return prev;
        const updated = prev.filter((id) => id !== deletedId);
        try {
          localStorage.setItem('teem_pinned_spaces', JSON.stringify(updated));
        } catch {
          // ignore
        }
        return updated;
      });
      setSpaceToDelete(null);
    } catch {
      setDeleteError('Could not delete this space. Check your connection and try again.');
    } finally {
      setIsDeletingSpace(false);
    }
  };

  const handleJoinSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!joinCodeInput.trim()) return;

    setIsSubmitting(true);
    const rawInput = joinCodeInput.trim();
    const meta = InviteLinkService.extractInviteMetadata(rawInput);
    const extracted = meta.code || InviteLinkService.extractCode(rawInput) || rawInput;
    let space: SpaceModel | null = null;
    try {
      space = await SpaceService.getSpaceByCodeOrSlug(extracted, {
        theme: meta.theme || undefined,
        name: meta.name || undefined,
      });
    } catch {
      setFormError('Could not look up that space. Check your connection and try again.');
      return;
    } finally {
      setIsSubmitting(false);
    }

    if (space) {
      setJoinModalOpen(false);
      // Non-members can only reach a private space through its invite code; the space
      // page redeems it for membership once the session is ready.
      const targetSlug =
        space.visibility === 'private' ? extracted : space.slug || space.joinCode || space.id;
      const themeParam = space.mapTheme && space.mapTheme !== 'village' ? `?theme=${space.mapTheme}` : '';
      router.push(`/space/${targetSlug}${themeParam}`);
    } else {
      const cleanSlug = extracted.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      if (cleanSlug) {
        setJoinModalOpen(false);
        const themeParam = meta.theme ? `?theme=${meta.theme}` : '';
        router.push(`/space/${cleanSlug}${themeParam}`);
      } else {
        setFormError('Could not find space with that invite code or slug.');
      }
    }
  };

  const handleSaveAvatar = async () => {
    if (!session) return;
    setIsSavingAvatar(true);
    try {
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
          topStyle: editTopStyle,
          bottomStyle: editBottomStyle,
          bottomColor: editBottomColor,
          shoesColor: editShoesColor,
          facialHair: editFacialHair,
        },
        editGender
      );
      setAvatarDrawerOpen(false);
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const hasActiveFilter = spaceSearch.trim() !== '' || activeSpaceTab !== 'all';
  const clearFilters = () => {
    setSpaceSearch('');
    setActiveSpaceTab('all');
    setSpacePage(1);
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

  // Pagination over the filtered list; clamping keeps the page valid when filters shrink the list
  const totalPages = Math.max(1, Math.ceil(filteredSpaces.length / SPACES_PAGE_SIZE));
  const currentPage = Math.min(spacePage, totalPages);
  const pagedSpaces = useMemo(
    () =>
      filteredSpaces.slice((currentPage - 1) * SPACES_PAGE_SIZE, currentPage * SPACES_PAGE_SIZE),
    [filteredSpaces, currentPage]
  );

  const counts = useMemo(() => {
    return {
      all: spaces.length,
      my: spaces.filter((s) => s.ownerId === session?.id || session?.isGuest).length,
      discover: spaces.filter((s) => s.visibility === 'public').length,
      favorites: spaces.filter((s) => pinnedSpaceIds.includes(s.id)).length,
    };
  }, [spaces, session, pinnedSpaceIds]);

  if (!session) {
    return (
      <div className={styles.page}>
        <div className={styles.loading} role="status" aria-busy="true">
          {needsAuthRedirect ? 'Redirecting to sign in…' : 'Loading…'}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Top Navbar */}
      <header className={styles.header}>
        <button type="button" className={styles.brand} onClick={() => router.push('/')} aria-label="TeemChat home">
          <span className={styles.logoIcon} aria-hidden="true">👾</span>
          <span className={styles.logoText}>TeemChat</span>
        </button>

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

          <NeoButton
            variant="secondary"
            size="sm"
            onClick={() => setCompanionOpen((open) => !open)}
            title="AI Companion"
            className={styles.headerMessengerBtn}
            aria-pressed={companionOpen}
          >
            <BotIcon size={18} /> Companion
          </NeoButton>

          {session && (
            <div
              className={styles.avatarPill}
              onClick={openAvatarEditor}
              title="Customize Avatar"
              role="button"
              tabIndex={0}
              aria-label="Customize Avatar"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openAvatarEditor();
                }
              }}
            >
              <PixelAvatar config={session.avatarConfig} size={32} />
              <div className={styles.userInfo}>
                <span className={styles.userName}>{session.displayName}</span>
                <span className={styles.userRole}>
                  {session.isGuest ? `@${session.username}` : membershipLabel(session).toUpperCase()}
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
            variant="secondary"
            size="sm"
            className={styles.headerSignOutBtn}
            title="Sign Out"
            aria-label="Sign Out"
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
          >
            <LogOutIcon size={16} />
            <span className={styles.desktopText}>Sign Out</span>
          </NeoButton>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={styles.main}>
        {isLocalOnlyGuest && (
          <div className={styles.localGuestNotice} role="status">
            ⚠️ Your guest session couldn&apos;t reach the server, so friends and chats are saved on
            this device only. Sign out and join again to get a full guest account.
          </div>
        )}

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
            <NeoButton variant="secondary" onClick={openJoinModal}>
              🎟️ Join by Code
            </NeoButton>
            <NeoButton variant="primary" onClick={openCreateModal}>
              ➕ Create Space
            </NeoButton>
          </div>
        </div>

        {/* Space Filtering Tabs & Search */}
        <SpaceTabsFilter
          activeTab={activeSpaceTab}
          onTabChange={(tab) => {
            setActiveSpaceTab(tab);
            setSpacePage(1);
          }}
          searchQuery={spaceSearch}
          onSearchChange={(q) => {
            setSpaceSearch(q);
            setSpacePage(1);
          }}
          counts={counts}
        />

        {/* Space List */}
        {isLoading ? (
          <div className={styles.spaceList} aria-busy="true" aria-label="Loading your virtual worlds">
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skeletonRow}>
                <div className={styles.skeletonIcon} />
                <div className={styles.skeletonRowText}>
                  <div className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
                  <div className={styles.skeletonLine} />
                </div>
                <div className={`${styles.skeletonLine} ${styles.skeletonButton}`} />
              </div>
            ))}
          </div>
        ) : filteredSpaces.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateIcon} aria-hidden="true">
              {hasActiveFilter ? '🔍' : '🗺️'}
            </span>
            <h2 className={styles.emptyStateTitle}>
              {hasActiveFilter ? 'No spaces match your filters' : 'No spaces yet'}
            </h2>
            <p className={styles.emptyStateText}>
              {hasActiveFilter
                ? 'Try a different search or tab, or clear the filters to see everything.'
                : 'Create your own world or join a friend with an invite code.'}
            </p>
            <div className={styles.emptyStateActions}>
              {hasActiveFilter && (
                <NeoButton variant="ghost" onClick={clearFilters}>
                  Clear Filters
                </NeoButton>
              )}
              <NeoButton variant="secondary" onClick={openJoinModal}>
                🎟️ Join by Code
              </NeoButton>
              <NeoButton variant="primary" onClick={openCreateModal}>
                ➕ Create Space
              </NeoButton>
            </div>
          </div>
        ) : (
          <>
            <ul className={styles.spaceList} aria-label="Virtual worlds">
              {pagedSpaces.map((space) => {
                const tierInfo = spaceTiers[space.tier] || spaceTiers.free;
                const isPinned = pinnedSpaceIds.includes(space.id);

                // Find friends in this space for live presence preview
                const friendsInSpace = friends.filter(
                  (f) => f.currentSpace?.slug === space.slug || f.currentSpace?.slug === space.id
                );

                const spaceMapConfig = getMapConfig(space.mapTheme);

                return (
                  <li key={space.id} className={styles.spaceRow}>
                    <span
                      className={styles.spaceRowIcon}
                      style={{ borderColor: spaceMapConfig.badgeColor }}
                      title={spaceMapConfig.name}
                      aria-hidden="true"
                    >
                      {spaceMapConfig.icon}
                    </span>

                    <div className={styles.spaceRowMain}>
                      <div className={styles.spaceRowTitleLine}>
                        <h3 className={styles.spaceName}>{space.name}</h3>
                        <NeoBadge color={tierInfo.badgeColor}>{tierInfo.badgeText}</NeoBadge>
                        {space.mode === 'zombie' && (
                          <span className={styles.zombieBadge} title="Zombie Survival space">
                            <span aria-hidden="true">🧟</span>
                            Survival
                          </span>
                        )}
                        {space.visibility === 'private' && (
                          <span className={styles.privateBadge} title="Private space: invite only">
                            <LockIcon size={12} strokeWidth={2.5} />
                            Private
                          </span>
                        )}
                      </div>
                      <p className={styles.spaceDesc}>
                        {space.description || spaceMapConfig.description}
                      </p>
                      <div className={styles.spaceRowMeta}>
                        <span>{spaceMapConfig.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>👥 {space.maxCapacity} max</span>
                        <span aria-hidden="true">·</span>
                        {friendsInSpace.length > 0 ? (
                          <span className={styles.liveCountText}>
                            <span className={styles.avatarStack}>
                              {friendsInSpace.slice(0, 3).map((f) => (
                                <span key={f.id} className={styles.avatarStackItem}>
                                  <PixelAvatar config={f.avatarConfig} size={18} />
                                </span>
                              ))}
                            </span>
                            {friendsInSpace.length} friends here
                          </span>
                        ) : (
                          <span>
                            Code:{' '}
                            {space.visibility === 'private' && space.joinCode
                              ? space.joinCode
                              : space.slug}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.spaceRowActions}>
                      <button
                        className={`${styles.pinBtn} ${isPinned ? styles.pinned : ''}`}
                        onClick={() => togglePinSpace(space.id)}
                        title={isPinned ? 'Unpin space' : 'Pin space to favorites'}
                        aria-label={isPinned ? `Unpin ${space.name}` : `Pin ${space.name} to favorites`}
                        aria-pressed={isPinned}
                      >
                        {isPinned ? '📌' : '📍'}
                      </button>
                      <button
                        type="button"
                        className={styles.copyCodeBtn}
                        onClick={() => handleCopySpaceLink(space)}
                        aria-label={`Copy invite link for ${space.name}`}
                      >
                        {copiedSpaceId === space.id ? '✓ Copied' : '📋 Link'}
                      </button>
                      {SpaceService.isSpaceOwner(space, session) && (
                        <button
                          type="button"
                          className={styles.deleteSpaceBtn}
                          onClick={() => openDeleteModal(space)}
                          title="Delete space"
                          aria-label={`Delete ${space.name}`}
                        >
                          <TrashIcon size={16} />
                        </button>
                      )}
                      <NeoButton
                        variant="primary"
                        onClick={() => router.push(`/space/${space.slug || space.id}`)}
                        aria-label={`Enter ${space.name}`}
                      >
                        Enter →
                      </NeoButton>
                    </div>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <nav className={styles.pager} aria-label="Spaces pagination">
                <NeoButton
                  variant="secondary"
                  onClick={() => setSpacePage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  ← Prev
                </NeoButton>
                <span className={styles.pagerStatus} aria-live="polite">
                  Page {currentPage} of {totalPages}
                </span>
                <NeoButton
                  variant="secondary"
                  onClick={() => setSpacePage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next →
                </NeoButton>
              </nav>
            )}
          </>
        )}
      </main>

      {/* Floating Messenger & AI Companion Quick Buttons (hidden when drawer or companion is open) */}
      {!companionOpen && !isDrawerOpen && (
        <div className={styles.floatingActionsDock}>
          <button
            className={styles.floatingCompanionBtn}
            onClick={() => setCompanionOpen(true)}
            title="AI Companion"
            aria-label="Open AI Companion"
          >
            <BotIcon size={22} />
          </button>

          <button
            className={styles.floatingMessengerBtn}
            onClick={() => openDrawer('dms')}
            title="Open Messenger"
            aria-label={unreadCount > 0 ? `Open Messenger (${unreadCount} unread)` : 'Open Messenger'}
          >
            <span aria-hidden="true">💬</span>
            <span>Messenger</span>
            {unreadCount > 0 && <span className={styles.floatingBadge}>{unreadCount}</span>}
          </button>
        </div>
      )}

      {/* AI Companion Chat Panel */}
      <CompanionPanel
        isOpen={companionOpen}
        onClose={() => setCompanionOpen(false)}
        onUpgrade={() => {
          setCompanionOpen(false);
          setUpgradeModalOpen(true);
        }}
      />

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

          <div className={styles.selectGroup}>
            <span className={styles.label} id="space-visibility-label">
              Who can join?
            </span>
            <div
              className={styles.visibilityToggle}
              role="radiogroup"
              aria-labelledby="space-visibility-label"
            >
              {(
                [
                  { value: 'public', label: 'Public', Icon: GlobeIcon },
                  { value: 'private', label: 'Private', Icon: LockIcon },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={newSpaceVisibility === value}
                  className={`${styles.visibilityOption} ${
                    newSpaceVisibility === value ? styles.visibilityOptionActive : ''
                  }`}
                  onClick={() => setNewSpaceVisibility(value)}
                >
                  <Icon size={16} strokeWidth={2.5} />
                  {label}
                </button>
              ))}
            </div>
            <p className={styles.visibilityHint} aria-live="polite">
              {newSpaceVisibility === 'public'
                ? 'Listed in Discover. Anyone can find and join.'
                : 'Hidden from Discover. Only you and people with your invite link can join.'}
            </p>
          </div>

          <div className={styles.selectGroup}>
            <span className={styles.label} id="space-mode-label">
              Space type
            </span>
            <div
              className={styles.visibilityToggle}
              role="radiogroup"
              aria-labelledby="space-mode-label"
            >
              {(
                [
                  { value: 'social', emoji: '🏡', label: 'Hangout' },
                  { value: 'zombie', emoji: '🧟', label: 'Zombie Survival' },
                ] as const
              ).map(({ value, emoji, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={newSpaceMode === value}
                  className={`${styles.visibilityOption} ${
                    newSpaceMode === value ? styles.visibilityOptionActive : ''
                  }`}
                  onClick={() => setNewSpaceMode(value)}
                >
                  <span aria-hidden="true">{emoji}</span>
                  {label}
                </button>
              ))}
            </div>
            <p className={styles.visibilityHint} aria-live="polite">
              {newSpaceMode === 'social'
                ? 'A social space to hang out, chat, and voice call on the map you pick.'
                : 'Survive the horde together. Zombie mode is always on.'}
            </p>
          </div>

          {newSpaceMode === 'zombie' ? (
            <div className={styles.selectGroup}>
              <span className={styles.label}>Map</span>
              <div className={styles.lockedMapCard} aria-label="Map: Zombie City (locked)">
                <span className={styles.lockedMapIcon} aria-hidden="true">
                  🏙️
                </span>
                <span className={styles.lockedMapText}>
                  <span className={styles.lockedMapName}>Zombie City</span>
                  <span className={styles.lockedMapDesc}>
                    Survival spaces always use the overrun city map.
                  </span>
                </span>
                <span className={styles.lockedMapLock} title="Locked for survival spaces">
                  <LockIcon size={16} strokeWidth={2.5} />
                </span>
              </div>
            </div>
          ) : (
            <MapSelector
              selectedTheme={newSpaceTheme}
              onSelectTheme={(themeId: MapThemeId, category: string) => {
                setNewSpaceTheme(themeId);
                setNewSpaceCategory(category);
              }}
            />
          )}

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
                topStyle: editTopStyle,
                bottomStyle: editBottomStyle,
                bottomColor: editBottomColor,
                shoesColor: editShoesColor,
                facialHair: editFacialHair,
              }}
              size={120}
              bustOnly={false}
            />
          </div>

          <div className={styles.selectGroup}>
            <label className={styles.label}>Gender</label>
            <div className={styles.genderButtonGroup}>
              <button
                type="button"
                className={`${styles.genderBtn} ${editGender === 'male' ? styles.genderBtnMaleActive : ''}`}
                onClick={() => handleSelectGender('male')}
              >
                <span>👨 Male</span>
              </button>
              <button
                type="button"
                className={`${styles.genderBtn} ${editGender === 'female' ? styles.genderBtnFemaleActive : ''}`}
                onClick={() => handleSelectGender('female')}
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

          <div className={styles.formRow}>
            <div className={styles.selectGroup}>
              <label className={styles.label} htmlFor="avatar-top">Top / Outfit</label>
              <select
                id="avatar-top"
                value={editTopStyle}
                onChange={(e) => setEditTopStyle(e.target.value as TopStyle)}
                className={styles.select}
              >
                {availableTopStyles.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.selectGroup}>
              <label className={styles.label} htmlFor="avatar-bottom">Bottom Style</label>
              <select
                id="avatar-bottom"
                value={editBottomStyle}
                onChange={(e) => setEditBottomStyle(e.target.value as BottomStyle)}
                className={styles.select}
              >
                {availableBottomStyles.map((b) => (
                  <option key={b} value={b}>
                    {b.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.colorPickers}>
            <div>
              <label className={styles.label} htmlFor="avatar-skin">Skin</label>
              <input
                id="avatar-skin"
                type="color"
                value={editSkin}
                onChange={(e) => setEditSkin(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="avatar-top-color">Top</label>
              <input
                id="avatar-top-color"
                type="color"
                value={editShirt}
                onChange={(e) => setEditShirt(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="avatar-bottom-color">Bottom</label>
              <input
                id="avatar-bottom-color"
                type="color"
                value={editBottomColor}
                onChange={(e) => setEditBottomColor(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="avatar-hair-color">Hair</label>
              <input
                id="avatar-hair-color"
                type="color"
                value={editHair}
                onChange={(e) => setEditHair(e.target.value)}
                className={styles.colorInput}
              />
            </div>
            <div>
              <label className={styles.label} htmlFor="avatar-shoes-color">Shoes</label>
              <input
                id="avatar-shoes-color"
                type="color"
                value={editShoesColor}
                onChange={(e) => setEditShoesColor(e.target.value)}
                className={styles.colorInput}
              />
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.selectGroup}>
              <label className={styles.label} htmlFor="avatar-hair-style">Hair Style</label>
              <select
                id="avatar-hair-style"
                value={editHairStyle}
                onChange={(e) =>
                  setEditHairStyle(e.target.value as AvatarConfig['hairStyle'])
                }
                className={styles.select}
              >
                {availableHairStyles.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.selectGroup}>
              <label className={styles.label} htmlFor="avatar-accessory">Accessory</label>
              <select
                id="avatar-accessory"
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
                    {a.replace('_', ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.selectGroup}>
            <label className={styles.label} htmlFor="avatar-facial-hair">Facial Hair</label>
            <select
                id="avatar-facial-hair"
              value={editFacialHair}
              onChange={(e) => setEditFacialHair(e.target.value as FacialHair)}
              className={styles.select}
            >
              {availableFacialHair.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <NeoButton variant="primary" size="lg" onClick={handleSaveAvatar} disabled={isSavingAvatar}>
            {isSavingAvatar ? 'Saving...' : 'Save Changes'}
          </NeoButton>

          {session && (
            <div className={styles.modalAccountSection}>
              <div className={styles.modalAccountInfo}>
                <span className={styles.modalAccountName}>{session.displayName}</span>
                <span className={styles.modalAccountRole}>
                  {session.isGuest ? `@${session.username} • Guest Session` : membershipLabel(session)}
                </span>
              </div>
              {session.isGuest && (
                <NeoButton
                  variant="accent"
                  size="md"
                  fullWidth
                  onClick={() => {
                    setAvatarDrawerOpen(false);
                    setUpgradeModalOpen(true);
                  }}
                >
                  ⭐ Upgrade Account
                </NeoButton>
              )}
              {!session.isGuest && <AiAddonCard session={session} onPurchased={initSession} />}
              <NeoButton
                variant="danger"
                size="md"
                fullWidth
                onClick={async () => {
                  setAvatarDrawerOpen(false);
                  await signOut();
                  router.push('/');
                }}
                className={styles.modalSignOutBtn}
                title="Sign Out of TeemChat"
              >
                <LogOutIcon size={18} /> Sign Out
              </NeoButton>
            </div>
          )}
        </div>
      </NeoModal>

      {/* Delete Space Confirmation Modal */}
      <NeoModal
        isOpen={spaceToDelete !== null}
        onClose={() => {
          if (!isDeletingSpace) setSpaceToDelete(null);
        }}
        title="Delete Space?"
      >
        <div className={styles.modalForm}>
          {deleteError && <div className={styles.errorAlert}>{deleteError}</div>}
          <p className={styles.deleteConfirmText}>
            <strong>{spaceToDelete?.name}</strong> and everything in it (chat, furniture, settings)
            will be permanently deleted. This can&apos;t be undone.
          </p>
          <div className={styles.deleteConfirmActions}>
            <NeoButton
              variant="ghost"
              onClick={() => setSpaceToDelete(null)}
              disabled={isDeletingSpace}
            >
              Cancel
            </NeoButton>
            <NeoButton variant="danger" onClick={handleDeleteSpace} disabled={isDeletingSpace}>
              {isDeletingSpace ? (
                'Deleting...'
              ) : (
                <span className={styles.deleteBtnLabel}>
                  <TrashIcon size={16} /> Delete Space
                </span>
              )}
            </NeoButton>
          </div>
        </div>
      </NeoModal>

      {/* Upgrade Modal */}
      <NeoModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Upgrade Your Account"
      >
        <div className={styles.upgradeCard}>
          <p>
            Guest sessions are temporary. Create a free account to keep your avatar, friends, and
            spaces. During the beta, every account gets Member features for free:
          </p>
          <ul className={styles.upgradeList}>
            <li>✨ Up to 10 Virtual Spaces</li>
            <li>👥 Rooms of up to 50 players</li>
            <li>🎨 Custom Map Decorator & Persistent Furniture</li>
          </ul>
          <p>The AI Companion (60 messages every 5 hours, with memory) is a paid add-on.</p>
          <NeoButton
            variant="primary"
            size="lg"
            onClick={async () => {
              setUpgradeModalOpen(false);
              await signOut();
              router.push('/?signup=1');
            }}
          >
            Create a Free Account
          </NeoButton>
          <NeoButton variant="secondary" size="lg" disabled title="Payments are not available yet">
            AI Add-on Coming Soon
          </NeoButton>
          <p className={styles.upgradeNote}>
            Creating an account ends this guest session and removes its temporary map.
          </p>
        </div>
      </NeoModal>
    </div>
  );
}
