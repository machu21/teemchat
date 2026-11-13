'use client';

import React, { useEffect, useState, useRef } from 'react';
import styles from './MessengerDrawer.module.css';
import { useSocialStore } from '@/stores/social';
import { useSessionStore } from '@/stores/session';
import { DirectMessageNotAllowedError, DirectMessageService } from '@/lib/services/directMessages';
import { useSafeText, useSafetyStore } from '@/stores/safety';
import { ReportModal } from '@/components/safety/ReportModal';
import { GroupChatService } from '@/lib/services/groupChat';
import { SocialMessageModel } from '@/lib/models/social';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { NeoButton } from '@/components/neo/NeoButton';
import { useCallStore } from '@/stores/call';
import { InlineCallPanel } from '@/components/call/InlineCallPanel';
import {
  ArrowLeftIcon,
  ChatBubbleIcon,
  CloseIcon,
  PhoneIcon,
  PlusIcon,
  UserCheckIcon,
  UsersIcon,
  VideoIcon,
} from '@/components/icons/DockIcons';

import { removeRealtimeChannel } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AppIcon } from '@/components/icons/AppIcon';
import { toIconName, type IconName } from '@/lib/icons';
import { GamePicker, type GameStartOptions } from '@/components/games/GamePicker';
import { GameOverlay } from '@/components/games/GameOverlay';
import { GameInviteCard } from '@/components/games/GameInviteCard';
import { ChatGameService } from '@/lib/services/chatGames';
import { encodeInvite, parseInvite, type ChatGameRow, type GameKind } from '@/lib/games/types';
import { initialChess } from '@/lib/games/chess';
import { initialDama } from '@/lib/games/dama';
import { initialTtt } from '@/lib/games/tictactoe';

function initialGameState(kind: GameKind): Record<string, unknown> {
  switch (kind) {
    case 'chess':
      return { ...initialChess() };
    case 'dama':
      return { ...initialDama() };
    case 'tictactoe':
      return { ...initialTtt() };
    case 'blockdrop':
      // Both players get the same piece sequence.
      return { seed: Math.floor(Math.random() * 2 ** 31), scores: {} };
  }
}

/** One-tap replies: the button shows an icon, the message is plain text. */
const QUICK_REACTIONS: readonly { icon: IconName; text: string }[] = [
  { icon: 'thumbsUp', text: 'Nice!' },
  { icon: 'heart', text: 'Love it' },
  { icon: 'flame', text: 'Fire!' },
  { icon: 'laugh', text: 'Haha' },
  { icon: 'rocket', text: "Let's go!" },
  { icon: 'hand', text: 'Hi!' },
];

export function MessengerDrawer() {
  const { session } = useSessionStore();
  const safeText = useSafeText();
  const blockedIds = useSafetyStore((s) => s.blockedIds);
  const blockUser = useSafetyStore((s) => s.block);
  const unblockUser = useSafetyStore((s) => s.unblock);
  const [reportOpen, setReportOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const {
    friends,
    conversations,
    groups,
    activeChat,
    isDrawerOpen,
    activeDrawerTab,
    closeDrawer,
    setActiveDrawerTab,
    openDirectChat,
    openGroupChat,
    closeActiveChat,
    setSearchModalOpen,
    setCreateSquadModalOpen,
  } = useSocialStore();

  const {
    currentCall,
    status: callStatus,
    startCall,
    joinCall,
    setStageMaximized,
  } = useCallStore();

  const [messages, setMessages] = useState<SocialMessageModel[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Chat mini-games
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const [gameBusy, setGameBusy] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);
  /** The open game, tied to the chat it was opened in. */
  const [openGame, setOpenGame] = useState<{ chatId: string; gameId: string } | null>(null);
  const [gameRows, setGameRows] = useState<Record<string, ChatGameRow>>({});
  const [now] = useState(() => Date.now());
  const activeGameId = openGame && openGame.chatId === activeChat?.id ? openGame.gameId : null;

  const isInCallWithThisChat =
    callStatus === 'connected' &&
    currentCall?.conversationId === activeChat?.id;

  const handleStartCall = async (isVideo: boolean) => {
    if (!activeChat || !session) return;
    await startCall({
      type: activeChat.type,
      conversationId: activeChat.id,
      title: activeChat.title,
      icon: activeChat.icon,
      isVideo,
      user: {
        id: session.id,
        name: session.displayName,
        avatarConfig: session.avatarConfig,
      },
    });

    const callText = isVideo ? 'Started a video call' : 'Started a voice call';
    handleSendMessage(callText);
  };

  const handleJoinCall = async (isVideo: boolean) => {
    if (!activeChat || !session) return;
    await joinCall({
      roomId: `call-${activeChat.type}-${activeChat.id}`,
      type: activeChat.type,
      conversationId: activeChat.id,
      title: activeChat.title,
      icon: activeChat.icon,
      isVideo,
      user: {
        id: session.id,
        name: session.displayName,
        avatarConfig: session.avatarConfig,
      },
    });
  };

  // Load chat messages when activeChat changes
  useEffect(() => {
    if (!activeChat) return;

    let isMounted = true;
    let sub: RealtimeChannel | null = null;

    if (activeChat.type === 'dm') {
      DirectMessageService.fetchMessages(activeChat.id).then((list) => {
        if (isMounted) setMessages(list);
      });
      sub = DirectMessageService.subscribeToConversation(activeChat.id, (newMsg) => {
        if (isMounted) setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
      });
    } else {
      GroupChatService.fetchMessages(activeChat.id).then((list) => {
        if (isMounted) setMessages(list);
      });
      sub = GroupChatService.subscribeToGroup(activeChat.id, (newMsg) => {
        if (isMounted) setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
      });
    }

    return () => {
      isMounted = false;
      if (sub) {
        removeRealtimeChannel(sub);
      }
      setMessages([]);
    };
  }, [activeChat]);

  // Load the state of every game invite shown in this chat.
  useEffect(() => {
    const missing = messages
      .map((m) => parseInvite(m.content)?.gameId)
      .filter((id): id is string => Boolean(id) && !gameRows[id as string]);
    if (missing.length === 0) return;
    let alive = true;
    ChatGameService.loadMany(missing).then((rows) => {
      if (!alive || rows.length === 0) return;
      setGameRows((prev) => {
        const next = { ...prev };
        for (const r of rows) next[r.id] = r;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [messages, gameRows]);

  const rememberGameRow = (row: ChatGameRow) => {
    setGameRows((prev) => (prev[row.id]?.version === row.version && prev[row.id]?.status === row.status ? prev : { ...prev, [row.id]: row }));
  };

  const handleStartGame = async (opts: GameStartOptions) => {
    if (!activeChat || !session || gameBusy) return;
    setGameError(null);
    setGameBusy(true);
    try {
      const row = await ChatGameService.create(activeChat.type, activeChat.id, opts.kind, initialGameState(opts.kind), {
        baseMs: opts.timeControl.baseMs,
        incMs: opts.timeControl.incMs,
      });
      rememberGameRow(row);
      await handleSendMessage(encodeInvite(row.id, opts.kind));
      setGamePickerOpen(false);
      setOpenGame({ chatId: activeChat.id, gameId: row.id });
    } catch (e) {
      setGameError(e instanceof Error ? e.message : 'Could not start the game.');
    } finally {
      setGameBusy(false);
    }
  };

  const nameOfPlayer = (userId: string): string => {
    if (session && userId === session.id) return session.displayName;
    if (activeChat?.type === 'dm' && userId === activeChat.otherUserId) return safeText(activeChat.title);
    const fromMsg = messages.find((m) => m.senderId === userId);
    return fromMsg ? safeText(fromMsg.senderName) : 'Player';
  };

  const avatarOfPlayer = (userId: string) => {
    if (session && userId === session.id) return session.avatarConfig;
    if (activeChat?.type === 'dm' && userId === activeChat.otherUserId) return activeChat.avatarConfig;
    return messages.find((m) => m.senderId === userId && m.senderAvatar)?.senderAvatar;
  };

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const otherUserId = activeChat?.type === 'dm' ? activeChat.otherUserId : undefined;
  const otherBlocked = Boolean(otherUserId && blockedIds.has(otherUserId));

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || !activeChat || !session || isSending) return;

    setIsSending(true);
    setInputText('');
    setSendError(null);

    try {
      if (activeChat.type === 'dm') {
        const sent = await DirectMessageService.sendMessage({
          conversationId: activeChat.id,
          senderId: session.id,
          senderName: session.displayName,
          content: text,
        });
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      } else {
        const sent = await GroupChatService.sendMessage({
          conversationId: activeChat.id,
          senderId: session.id,
          senderName: session.displayName,
          content: text,
        });
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      }
    } catch (e) {
      if (e instanceof DirectMessageNotAllowedError) {
        setSendError(e.message);
        setInputText(text);
      } else {
        console.warn('Error sending message:', e);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      {/* Overlay Backdrop */}
      <div
        className={`${styles.drawerOverlay} ${isDrawerOpen ? styles.open : ''}`}
        onClick={closeDrawer}
      />

      {/* Slide-out Drawer */}
      <aside className={`${styles.drawer} ${isDrawerOpen ? styles.open : ''}`}>
        {/* Header */}
        <header className={styles.drawerHeader}>
          <div className={styles.headerLeft}>
            {activeChat ? (
              <button className={styles.backBtn} onClick={closeActiveChat}>
                <ArrowLeftIcon size={14} strokeWidth={2.5} /> Back
              </button>
            ) : (
              <span className={styles.drawerTitle}>
                <span><AppIcon name="logo" /></span> Teem Messenger
              </span>
            )}
          </div>
          <button className={styles.closeButton} onClick={closeDrawer} title="Close drawer">
            <CloseIcon size={18} strokeWidth={2.5} />
          </button>
        </header>

        {/* Active Conversation View */}
        {activeChat ? (
          <div className={styles.activeChatContainer}>
            <div className={styles.activeChatHeader}>
              {activeChat.avatarConfig ? (
                <PixelAvatar config={activeChat.avatarConfig} size={32} />
              ) : (
                <AppIcon name={toIconName(activeChat.icon, 'users')} size="1.5rem" />
              )}
              <div className={styles.chatHeaderInfo}>
                <span className={styles.chatHeaderTitle}>{safeText(activeChat.title)}</span>
                <span
                  className={`${styles.chatHeaderStatus} ${
                    activeChat.type === 'dm' && !activeChat.isOnline ? styles.chatHeaderStatusOffline : ''
                  }`}
                >
                  {activeChat.statusText}
                </span>
              </div>

              {/* Call Action Buttons in Header */}
              <div className={styles.chatHeaderActions}>
                {isInCallWithThisChat ? (
                  <button
                    type="button"
                    className={styles.inCallHeaderBtn}
                    onClick={() => setStageMaximized(true)}
                    title="Open Full Call Stage"
                  >
                    <span className={styles.liveDot} /> In Call • Stage
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.callHeaderBtn}
                      onClick={() => handleStartCall(false)}
                      title="Start Voice Call"
                      aria-label="Start Voice Call"
                    >
                      <PhoneIcon size={18} />
                    </button>
                    <button
                      type="button"
                      className={styles.callHeaderBtn}
                      onClick={() => handleStartCall(true)}
                      title="Start Video Call"
                      aria-label="Start Video Call"
                    >
                      <VideoIcon size={18} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={styles.callHeaderBtn}
                  onClick={() => {
                    setGameError(null);
                    setGamePickerOpen(true);
                  }}
                  title="Challenge to a game"
                  aria-label="Challenge to a game"
                >
                  <AppIcon name="gamepad" />
                </button>
                {activeChat.type === 'dm' && otherUserId && session && (
                  <>
                    <button
                      type="button"
                      className={styles.callHeaderBtn}
                      onClick={() => setReportOpen(true)}
                      title="Report this player"
                      aria-label="Report this player"
                    >
                      <AppIcon name="flag" />
                    </button>
                    <button
                      type="button"
                      className={styles.callHeaderBtn}
                      onClick={() => {
                        if (otherBlocked) unblockUser(otherUserId).catch(() => {});
                        else blockUser(otherUserId).catch(() => {});
                      }}
                      aria-pressed={otherBlocked}
                      title={otherBlocked ? 'Unblock this player' : 'Block this player'}
                      aria-label={otherBlocked ? 'Unblock this player' : 'Block this player'}
                    >
                      {otherBlocked ? <AppIcon name="checkCircle" /> : <AppIcon name="ban" />}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Embedded Active Call Panel */}
            {isInCallWithThisChat && <InlineCallPanel />}

            {activeGameId && session && (
              <GameOverlay
                key={activeGameId}
                gameId={activeGameId}
                meId={session.id}
                nameOf={nameOfPlayer}
                avatarOf={avatarOfPlayer}
                onClose={() => setOpenGame(null)}
                onRematch={(kind, tc) =>
                  handleStartGame({
                    kind,
                    mode: 'friend',
                    difficulty: 'medium',
                    timeControl: { id: 'rematch', label: '', baseMs: tc.baseMs, incMs: tc.incMs },
                  })
                }
                onRowChange={rememberGameRow}
              />
            )}

            {/* Message History */}
            <div className={styles.messagesScrollArea} ref={scrollRef}>
              {messages.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}><AppIcon name="message" /></span>
                  <div className={styles.emptyTitle}>No messages yet</div>
                  <div className={styles.emptySubtitle}>
                    Say hello to start the conversation!
                  </div>
                </div>
              ) : (
                messages.filter((m) => !blockedIds.has(m.senderId)).map((m) => {
                  const isMine = m.senderId === session?.id;
                  const invite = parseInvite(m.content);
                  if (invite && session) {
                    return (
                      <GameInviteCard
                        key={m.id}
                        kind={invite.kind}
                        row={gameRows[invite.gameId]}
                        senderName={isMine ? 'You' : safeText(m.senderName)}
                        createdAt={m.createdAt}
                        meId={session.id}
                        now={now}
                        onOpen={() => {
                          setOpenGame({ chatId: activeChat.id, gameId: invite.gameId });
                        }}
                      />
                    );
                  }
                  const isCallEvent =
                    m.content.includes('Started a voice call') ||
                    m.content.includes('Started a video call');

                  if (isCallEvent) {
                    const isVideo = m.content.includes('video');
                    return (
                      <div key={m.id} className={styles.callMessageCard}>
                        <div className={styles.callMessageLeft}>
                          <span className={styles.callMessageIcon}>
                            {isVideo ? <VideoIcon size={22} /> : <PhoneIcon size={22} />}
                          </span>
                          <div>
                            <div className={styles.callMessageTitle}>
                              {m.senderName} started a {isVideo ? 'video' : 'voice'} call
                            </div>
                            <div className={styles.callMessageSub}>
                              {new Date(m.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        </div>

                        {!isInCallWithThisChat && (
                          <button
                            type="button"
                            className={styles.callMessageJoinBtn}
                            onClick={() => handleJoinCall(isVideo)}
                          >
                            Join Call
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={`${styles.messageRow} ${isMine ? styles.myMessage : ''}`}
                    >
                      {!isMine && m.senderAvatar && (
                        <span className={styles.messageAvatar}>
                          <PixelAvatar config={m.senderAvatar} size={26} />
                        </span>
                      )}
                      <div className={styles.messageBubble}>
                        {!isMine && (
                          <span className={styles.messageSender}>{safeText(m.senderName)}</span>
                        )}
                        <span className={styles.messageContent}>{isMine ? m.content : safeText(m.content)}</span>
                        <span className={styles.messageTime}>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {sendError && (
              <div className={styles.sendError} role="alert">
                {sendError}
              </div>
            )}


            {/* Quick Reactions */}
            <div className={styles.quickReactions}>
              {QUICK_REACTIONS.map((r) => (
                <button
                  key={r.icon}
                  className={styles.reactionBtn}
                  onClick={() => handleSendMessage(r.text)}
                  aria-label={`Send "${r.text}"`}
                  title={r.text}
                >
                  <AppIcon name={r.icon} />
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <form
              className={styles.chatInputForm}
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <input
                className={styles.chatInputField}
                placeholder="Type a message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
              <NeoButton
                type="submit"
                variant="primary"
                size="sm"
                className={styles.sendBtn}
                disabled={!inputText.trim() || isSending}
              >
                Send
              </NeoButton>
            </form>

            <GamePicker
              isOpen={gamePickerOpen}
              mode="friend"
              busy={gameBusy}
              error={gameError}
              friendLabel={activeChat.type === 'dm' ? safeText(activeChat.title) : 'the group'}
              friendAvailable={!otherBlocked}
              onClose={() => setGamePickerOpen(false)}
              onStart={handleStartGame}
            />

            {activeChat.type === 'dm' && otherUserId && session && (
              <ReportModal
                isOpen={reportOpen}
                onClose={() => setReportOpen(false)}
                reporterId={session.id}
                reportedUserId={otherUserId}
                reportedName={safeText(activeChat.title)}
                onBlock={async () => {
                  await blockUser(otherUserId);
                }}
              />
            )}
          </div>
        ) : (
          /* Conversation & Friends Navigation Tabs */
          <>
            <div className={styles.tabsBar}>
              <button
                className={`${styles.tabBtn} ${
                  activeDrawerTab === 'dms' ? styles.activeTab : ''
                }`}
                onClick={() => setActiveDrawerTab('dms')}
              >
                <ChatBubbleIcon size={16} /> Direct
              </button>
              <button
                className={`${styles.tabBtn} ${
                  activeDrawerTab === 'groups' ? styles.activeTab : ''
                }`}
                onClick={() => setActiveDrawerTab('groups')}
              >
                <UsersIcon size={16} /> Squads
              </button>
              <button
                className={`${styles.tabBtn} ${
                  activeDrawerTab === 'friends' ? styles.activeTab : ''
                }`}
                onClick={() => setActiveDrawerTab('friends')}
              >
                <UserCheckIcon size={16} /> Friends ({friends.filter((f) => f.isOnline).length})
              </button>
            </div>

            <div className={styles.drawerContent}>
              {/* Tab 1: DMs */}
              {activeDrawerTab === 'dms' && (
                <>
                  <div className={styles.actionBanner}>
                    <span className={styles.actionBannerText}>1-on-1 Messages</span>
                    <NeoButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setSearchModalOpen(true)}
                    >
                      <PlusIcon size={14} strokeWidth={2.5} /> New Chat
                    </NeoButton>
                  </div>

                  <div className={styles.conversationList}>
                    {conversations.length > 0 ? (
                      conversations.map((c) => (
                        <div
                          key={c.id}
                          className={styles.convItem}
                          onClick={() =>
                            session &&
                            openDirectChat(
                              {
                                id: c.id,
                                userId: c.otherUser.id,
                                username: c.otherUser.username,
                                displayName: c.otherUser.displayName,
                                avatarConfig: c.otherUser.avatarConfig,
                                isOnline: c.otherUser.isOnline,
                                status: c.otherUser.status,
                                statusMessage: c.otherUser.statusMessage,
                              },
                              session.id
                            )
                          }
                        >
                          <div className={styles.avatarWrapper}>
                            <PixelAvatar config={c.otherUser.avatarConfig} size={36} />
                            {c.otherUser.isOnline && <span className={styles.onlineDot} />}
                          </div>
                          <div className={styles.convDetails}>
                            <div className={styles.convTitleRow}>
                              <span className={styles.convTitle}>
                                {c.otherUser.displayName}
                              </span>
                              <span className={styles.convTime}>
                                {new Date(c.lastMessageAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <span className={styles.convPreview}>{c.lastPreview}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}><AppIcon name="mail" /></span>
                        <div className={styles.emptyTitle}>No conversations yet</div>
                        <div className={styles.emptySubtitle}>
                          Start a chat with one of your friends or search explorers.
                        </div>
                        <NeoButton
                          variant="primary"
                          size="sm"
                          onClick={() => setActiveDrawerTab('friends')}
                        >
                          View Friends
                        </NeoButton>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Tab 2: Squad Groups */}
              {activeDrawerTab === 'groups' && (
                <>
                  <div className={styles.actionBanner}>
                    <span className={styles.actionBannerText}>Squad Channels</span>
                    <NeoButton
                      size="sm"
                      variant="primary"
                      onClick={() => setCreateSquadModalOpen(true)}
                    >
                      <PlusIcon size={14} strokeWidth={2.5} /> Create Squad
                    </NeoButton>
                  </div>

                  <div className={styles.conversationList}>
                    {groups.length > 0 ? (
                      groups.map((g) => (
                        <div
                          key={g.id}
                          className={styles.convItem}
                          onClick={() => openGroupChat(g)}
                        >
                          <div
                            style={{
                              fontSize: '1.6rem',
                              width: '36px',
                              height: '36px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <AppIcon name={toIconName(g.icon)} />
                          </div>
                          <div className={styles.convDetails}>
                            <div className={styles.convTitleRow}>
                              <span className={styles.convTitle}>{g.name}</span>
                              <span className={styles.convTime}>
                                {new Date(g.lastMessageAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <span className={styles.convPreview}>{g.lastPreview}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={styles.emptyState}>
                        <span className={styles.emptyIcon}><AppIcon name="users" /></span>
                        <div className={styles.emptyTitle}>No Squads Joined</div>
                        <div className={styles.emptySubtitle}>
                          Create a squad group with your friends for group chatter!
                        </div>
                        <NeoButton
                          variant="primary"
                          size="sm"
                          onClick={() => setCreateSquadModalOpen(true)}
                        >
                          Create First Squad
                        </NeoButton>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Tab 3: Friends */}
              {activeDrawerTab === 'friends' && (
                <>
                  <div className={styles.actionBanner}>
                    <span className={styles.actionBannerText}>
                      Friends ({friends.length})
                    </span>
                    <NeoButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setSearchModalOpen(true)}
                    >
                      <PlusIcon size={14} strokeWidth={2.5} /> Add Friend
                    </NeoButton>
                  </div>

                  <div className={styles.conversationList}>
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        className={styles.convItem}
                        onClick={() => session && openDirectChat(friend, session.id)}
                      >
                        <div className={styles.avatarWrapper}>
                          <PixelAvatar config={friend.avatarConfig} size={36} />
                          {friend.isOnline && <span className={styles.onlineDot} />}
                        </div>
                        <div className={styles.convDetails}>
                          <div className={styles.convTitleRow}>
                            <span className={styles.convTitle}>{friend.displayName}</span>
                            <span className={styles.convTime}>
                              {friend.isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <span className={styles.convPreview}>
                            {friend.currentSpace
                              ? <><AppIcon name="dotFilled" /> {`In ${friend.currentSpace.name}`}</>
                              : friend.statusMessage || `@${friend.username}`}
                          </span>
                        </div>
                        <NeoButton size="sm" variant="ghost">
                          Chat
                        </NeoButton>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
