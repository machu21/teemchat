'use client';

import React, { useEffect, useState, useRef } from 'react';
import styles from './MessengerDrawer.module.css';
import { useSocialStore } from '@/stores/social';
import { useSessionStore } from '@/stores/session';
import { DirectMessageService } from '@/lib/services/directMessages';
import { GroupChatService } from '@/lib/services/groupChat';
import { SocialMessageModel } from '@/lib/models/social';
import { PixelAvatar } from '@/components/neo/PixelAvatar';
import { NeoButton } from '@/components/neo/NeoButton';
import { useCallStore } from '@/stores/call';
import { InlineCallPanel } from '@/components/call/InlineCallPanel';

import { removeRealtimeChannel } from '@/lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export function MessengerDrawer() {
  const { session } = useSessionStore();
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

    const callText = isVideo ? '📹 Started a video call' : '📞 Started a voice call';
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
        if (isMounted) setMessages((prev) => [...prev, newMsg]);
      });
    } else {
      GroupChatService.fetchMessages(activeChat.id).then((list) => {
        if (isMounted) setMessages(list);
      });
      sub = GroupChatService.subscribeToGroup(activeChat.id, (newMsg) => {
        if (isMounted) setMessages((prev) => [...prev, newMsg]);
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

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || !activeChat || !session || isSending) return;

    setIsSending(true);
    setInputText('');

    try {
      if (activeChat.type === 'dm') {
        const sent = await DirectMessageService.sendMessage({
          conversationId: activeChat.id,
          senderId: session.id,
          senderName: session.displayName,
          content: text,
        });
        setMessages((prev) => [...prev, sent]);
      } else {
        const sent = await GroupChatService.sendMessage({
          conversationId: activeChat.id,
          senderId: session.id,
          senderName: session.displayName,
          content: text,
        });
        setMessages((prev) => [...prev, sent]);
      }
    } catch (e) {
      console.warn('Error sending message:', e);
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
                ← Back
              </button>
            ) : (
              <span className={styles.drawerTitle}>
                <span>👾</span> Teem Messenger
              </span>
            )}
          </div>
          <button className={styles.closeButton} onClick={closeDrawer} title="Close drawer">
            ✕
          </button>
        </header>

        {/* Active Conversation View */}
        {activeChat ? (
          <div className={styles.activeChatContainer}>
            <div className={styles.activeChatHeader}>
              {activeChat.avatarConfig ? (
                <PixelAvatar config={activeChat.avatarConfig} size={32} />
              ) : (
                <span style={{ fontSize: '1.5rem' }}>{activeChat.icon || '👥'}</span>
              )}
              <div className={styles.chatHeaderInfo}>
                <span className={styles.chatHeaderTitle}>{activeChat.title}</span>
                <span className={styles.chatHeaderStatus}>{activeChat.statusText}</span>
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
                    🟢 In Call • Stage
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.callHeaderBtn}
                      onClick={() => handleStartCall(false)}
                      title="Start Voice Call"
                    >
                      📞
                    </button>
                    <button
                      type="button"
                      className={styles.callHeaderBtn}
                      onClick={() => handleStartCall(true)}
                      title="Start Video Call"
                    >
                      📹
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Embedded Active Call Panel */}
            {isInCallWithThisChat && <InlineCallPanel />}

            {/* Message History */}
            <div className={styles.messagesScrollArea} ref={scrollRef}>
              {messages.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className={styles.emptyIcon}>💬</span>
                  <div className={styles.emptyTitle}>No messages yet</div>
                  <div className={styles.emptySubtitle}>
                    Say hello to start the conversation!
                  </div>
                </div>
              ) : (
                messages.map((m) => {
                  const isMine = m.senderId === session?.id;
                  const isCallEvent =
                    m.content.includes('Started a voice call') ||
                    m.content.includes('Started a video call');

                  if (isCallEvent) {
                    const isVideo = m.content.includes('video');
                    return (
                      <div key={m.id} className={styles.callMessageCard}>
                        <div className={styles.callMessageLeft}>
                          <span className={styles.callMessageIcon}>
                            {isVideo ? '📹' : '📞'}
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
                        <PixelAvatar config={m.senderAvatar} size={28} />
                      )}
                      <div className={styles.messageBubble}>
                        {!isMine && (
                          <span className={styles.messageSender}>{m.senderName}</span>
                        )}
                        <span className={styles.messageContent}>{m.content}</span>
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

            {/* Quick Reactions */}
            <div className={styles.quickReactions}>
              {['👍', '❤️', '🔥', '😂', '🚀', '👋'].map((emoji) => (
                <button
                  key={emoji}
                  className={styles.reactionBtn}
                  onClick={() => handleSendMessage(emoji)}
                >
                  {emoji}
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
                💬 Direct
              </button>
              <button
                className={`${styles.tabBtn} ${
                  activeDrawerTab === 'groups' ? styles.activeTab : ''
                }`}
                onClick={() => setActiveDrawerTab('groups')}
              >
                👥 Squads
              </button>
              <button
                className={`${styles.tabBtn} ${
                  activeDrawerTab === 'friends' ? styles.activeTab : ''
                }`}
                onClick={() => setActiveDrawerTab('friends')}
              >
                🤝 Friends ({friends.filter((f) => f.isOnline).length})
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
                      ➕ New Chat
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
                        <span className={styles.emptyIcon}>✉️</span>
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
                      ➕ Create Squad
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
                            {g.icon || '👾'}
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
                        <span className={styles.emptyIcon}>👥</span>
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
                      ➕ Add Friend
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
                              ? `🟢 In ${friend.currentSpace.name}`
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
