import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockDb = vi.hoisted(() => {
  const groupKeys: Array<Record<string, unknown>> = [];
  const spaceKeys: Array<Record<string, unknown>> = [];
  const profiles: Record<string, Record<string, unknown>> = {};
  const spaces: Record<string, Record<string, unknown>> = {};
  const spaceMembers: Array<Record<string, unknown>> = [];
  const groupMembers: Array<Record<string, unknown>> = [];
  const reports: Array<Record<string, unknown>> = [];

  const handlers = new Map<string, (env: Record<string, unknown>) => void>();
  let subCb: ((status: string) => void) | null = null;
  const channel = {
    on: vi.fn((type: string, filter: { event: string }, cb: (env: Record<string, unknown>) => void) => {
      handlers.set(`${type}:${filter.event}`, cb);
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      subCb = cb;
      return channel;
    }),
    track: vi.fn().mockResolvedValue('ok'),
    send: vi.fn().mockResolvedValue('ok'),
    presenceState: vi.fn(() => ({})),
  };

  return {
    groupKeys,
    spaceKeys,
    profiles,
    spaces,
    spaceMembers,
    groupMembers,
    reports,
    handlers,
    channel,
    fireSubscribed: () => subCb?.('SUBSCRIBED'),
  };
});

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => mockDb.channel),
    rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    from: (table: string) => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          },
          in: async (_col: string, vals: string[]) => {
            if (table === 'profiles') {
              return { data: vals.map((id) => mockDb.profiles[id]).filter(Boolean), error: null };
            }
            return { data: [], error: null };
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            if (table === 'profiles') {
              return { data: mockDb.profiles[String(filters.id)] || null, error: null };
            }
            if (table === 'spaces') {
              return { data: mockDb.spaces[String(filters.id)] || null, error: null };
            }
            if (table === 'space_members') {
              const row = mockDb.spaceMembers.find(
                (m) => m.space_id === filters.space_id && (!filters.user_id || m.user_id === filters.user_id)
              );
              return { data: row || null, error: null };
            }
            if (table === 'group_encryption_keys') {
              const rows = mockDb.groupKeys
                .filter(
                  (r) =>
                    r.conversation_id === filters.conversation_id &&
                    r.user_id === filters.user_id &&
                    (filters.key_version === undefined || Number(r.key_version ?? 1) === Number(filters.key_version))
                )
                .sort((a, b) => Number(b.key_version ?? 1) - Number(a.key_version ?? 1));
              const row = rows[0];
              return {
                data: row
                  ? {
                      ...row,
                      sender: mockDb.profiles[String(row.sender_id)] || null,
                    }
                  : null,
                error: null,
              };
            }
            if (table === 'space_encryption_keys') {
              const rows = mockDb.spaceKeys
                .filter(
                  (r) =>
                    r.space_id === filters.space_id &&
                    r.user_id === filters.user_id &&
                    (filters.key_version === undefined || Number(r.key_version ?? 1) === Number(filters.key_version))
                )
                .sort((a, b) => Number(b.key_version ?? 1) - Number(a.key_version ?? 1));
              const row = rows[0];
              return {
                data: row
                  ? {
                      ...row,
                      sender: mockDb.profiles[String(row.sender_id)] || null,
                    }
                  : null,
                error: null,
              };
            }
            return { data: null, error: null };
          },
          then: (resolve: (res: { data: unknown[]; error: null }) => void) => {
            if (table === 'space_members') {
              const rows = mockDb.spaceMembers.filter((m) => m.space_id === filters.space_id);
              resolve({ data: rows, error: null });
            } else if (table === 'group_conversation_members') {
              const rows = mockDb.groupMembers.filter((m) => m.conversation_id === filters.conversation_id);
              resolve({ data: rows, error: null });
            } else {
              resolve({ data: [], error: null });
            }
          },
        };
        return chain;
      },
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, val: string) => {
          if (table === 'profiles') {
            mockDb.profiles[val] = { ...(mockDb.profiles[val] || { id: val }), ...patch };
          }
          return Promise.resolve({ error: null });
        },
      }),
      delete: () => {
        const filters: Record<string, unknown> = {};
        const execDelete = () => {
          const removeFrom = (arr: Array<Record<string, unknown>>) => {
            for (let i = arr.length - 1; i >= 0; i--) {
              const row = arr[i];
              const match = Object.entries(filters).every(([k, v]) => row[k] === v);
              if (match) arr.splice(i, 1);
            }
          };
          if (table === 'group_encryption_keys') removeFrom(mockDb.groupKeys);
          else if (table === 'space_encryption_keys') removeFrom(mockDb.spaceKeys);
          else if (table === 'space_members') removeFrom(mockDb.spaceMembers);
          else if (table === 'group_conversation_members') removeFrom(mockDb.groupMembers);
          return { error: null };
        };
        const delChain = {
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return delChain;
          },
          then: (resolve: (res: { error: null }) => void) => {
            resolve(execDelete());
          },
        };
        return delChain;
      },
      upsert: async (rows: Array<Record<string, unknown>> | Record<string, unknown>) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        const applyUpsert = (store: Array<Record<string, unknown>>, idKey: string) => {
          for (const row of arr) {
            const idx = store.findIndex(
              (r) =>
                r[idKey] === row[idKey] &&
                r.user_id === row.user_id &&
                Number(r.key_version ?? 1) === Number(row.key_version ?? 1)
            );
            if (idx >= 0) store[idx] = { ...store[idx], ...row };
            else store.push(row);
          }
        };
        if (table === 'group_encryption_keys') {
          applyUpsert(mockDb.groupKeys, 'conversation_id');
        } else if (table === 'space_encryption_keys') {
          applyUpsert(mockDb.spaceKeys, 'space_id');
        }
        return { error: null };
      },
      insert: async (row: Record<string, unknown>) => {
        if (table === 'user_reports') {
          mockDb.reports.push(row);
        }
        return { error: null };
      },
    }),
  },
  removeRealtimeChannel: vi.fn(),
  cleanupExistingChannel: vi.fn(),
}));

import { E2EEManager } from '../src/lib/services/e2eeManager';
import { CryptoService, E2EE_V2_PREFIX } from '../src/lib/services/cryptoService';
import { E2EEStorage } from '../src/lib/security/e2eeStorage';
import { WorldSyncService } from '../src/lib/services/worldSync';
import { SafetyService } from '../src/lib/services/safety';

describe('Phase 2 Multi-Party E2EE (Squads, Spaces, WorldSync, Moderation)', () => {
  const ALICE = '11111111-1111-4111-8111-111111111111';
  const BOB = '22222222-2222-4222-8222-222222222222';
  const CHARLIE = '33333333-3333-4333-8333-333333333333';
  const SQUAD_ID = '44444444-4444-4444-8444-444444444444';
  const PRIVATE_SPACE_ID = '55555555-5555-4555-8555-555555555555';
  const PUBLIC_SPACE_ID = '66666666-6666-4666-8666-666666666666';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.groupKeys.length = 0;
    mockDb.spaceKeys.length = 0;
    mockDb.spaceMembers.length = 0;
    mockDb.groupMembers.length = 0;
    mockDb.reports.length = 0;
    mockDb.handlers.clear();
    for (const k of Object.keys(mockDb.profiles)) delete mockDb.profiles[k];
    for (const k of Object.keys(mockDb.spaces)) delete mockDb.spaces[k];

    E2EEManager.resetSession();
    await E2EEStorage.clearKeyPair(ALICE);
    await E2EEStorage.clearKeyPair(BOB);
    await E2EEStorage.clearKeyPair(CHARLIE);
  });

  it('creates and distributes a Squad symmetric room key to all members via pairwise ECDH', async () => {
    const aKeys = await E2EEManager.initUser(ALICE);
    const bKeys = await E2EEManager.initUser(BOB);
    const cKeys = await E2EEManager.initUser(CHARLIE);

    mockDb.profiles[ALICE] = { id: ALICE, public_key: aKeys!.publicKeySpki };
    mockDb.profiles[BOB] = { id: BOB, public_key: bKeys!.publicKeySpki };
    mockDb.profiles[CHARLIE] = { id: CHARLIE, public_key: cKeys!.publicKeySpki };

    // Alice creates the squad and distributes the room key to Alice, Bob, and Charlie
    await E2EEManager.initUser(ALICE);
    await E2EEManager.initGroupKey(SQUAD_ID, [BOB, CHARLIE]);
    expect(mockDb.groupKeys).toHaveLength(3);

    const squadMessage = 'Meet at the campfire at 4pm!';
    const wire = await E2EEManager.encryptGroupMessage(SQUAD_ID, squadMessage);
    expect(wire.startsWith(`${E2EE_V2_PREFIX}grp:`)).toBe(true);
    expect(wire).not.toContain(squadMessage);

    // Bob logs in and unwraps his copy of the squad key
    E2EEManager.resetSession();
    await E2EEManager.initUser(BOB);
    const bobDecrypted = await E2EEManager.decryptGroupMessage(SQUAD_ID, wire);
    expect(bobDecrypted).toBe(squadMessage);

    // Charlie logs in and unwraps his copy of the squad key
    E2EEManager.resetSession();
    await E2EEManager.initUser(CHARLIE);
    const charlieDecrypted = await E2EEManager.decryptGroupMessage(SQUAD_ID, wire);
    expect(charlieDecrypted).toBe(squadMessage);
  });

  it('provisions hybrid room keys for Private Spaces and fast session keys for Public Spaces', async () => {
    const aKeys = await E2EEManager.initUser(ALICE);
    const bKeys = await E2EEManager.initUser(BOB);
    mockDb.profiles[ALICE] = { id: ALICE, public_key: aKeys!.publicKeySpki };
    mockDb.profiles[BOB] = { id: BOB, public_key: bKeys!.publicKeySpki };
    mockDb.spaces[PRIVATE_SPACE_ID] = { id: PRIVATE_SPACE_ID, owner_id: ALICE, visibility: 'private' };
    mockDb.spaceMembers.push({ space_id: PRIVATE_SPACE_ID, user_id: BOB });

    // Owner Alice initializes private space key -> wraps for self + Bob
    await E2EEManager.initUser(ALICE);
    await E2EEManager.initSpaceKey(PRIVATE_SPACE_ID, 'private');
    expect(mockDb.spaceKeys).toHaveLength(2);

    const privateText = 'Private HQ strategy';
    const privateWire = await E2EEManager.encryptSpaceMessage(PRIVATE_SPACE_ID, privateText);
    expect(privateWire.startsWith(`${E2EE_V2_PREFIX}spc:`)).toBe(true);

    // Bob joins private space -> unwraps and decrypts
    E2EEManager.resetSession();
    await E2EEManager.initUser(BOB);
    await E2EEManager.initSpaceKey(PRIVATE_SPACE_ID, 'private');
    expect(await E2EEManager.decryptSpaceText(PRIVATE_SPACE_ID, privateWire)).toBe(privateText);

    // Public space -> zero-handshake fast space key (0 DB rows created in space_encryption_keys)
    await E2EEManager.initSpaceKey(PUBLIC_SPACE_ID, 'public');
    expect(mockDb.spaceKeys).toHaveLength(2);
    const publicWire = await E2EEManager.encryptSpaceMessage(PUBLIC_SPACE_ID, 'Welcome visitors!');
    expect(publicWire.startsWith(`${E2EE_V2_PREFIX}base:`)).toBe(true);
    expect(await E2EEManager.decryptSpaceText(PUBLIC_SPACE_ID, publicWire)).toBe('Welcome visitors!');
  });

  it('encrypts and decrypts WorldSync chat and speech broadcasts when space key is primed', async () => {
    await E2EEManager.initUser(ALICE);
    await E2EEManager.initSpaceKey(PUBLIC_SPACE_ID, 'public');

    const sync = new WorldSyncService({
      spaceId: PUBLIC_SPACE_ID,
      currentUserId: ALICE,
      displayName: 'Alice',
      avatarConfig: {} as never,
    });
    const receivedChat: string[] = [];
    sync.onChatMessage = (m) => receivedChat.push(m.content);

    await sync.connect();
    mockDb.fireSubscribed();
    await Promise.resolve();

    // Register remote peer Bob so speech bubbles attach to him
    mockDb.handlers.get('broadcast:movement')?.({
      payload: { user_id: BOB, client_id: 'bob-tab', display_name: 'Bob', x: 50, y: 50, direction: 'down', is_moving: false },
    });

    // Send encrypted speech bubble & room chat
    sync.broadcastSpeech('Overhead secret!');
    sync.broadcastChatMessage({
      id: 'chat-1',
      roomId: 'general',
      spaceId: PUBLIC_SPACE_ID,
      senderId: ALICE,
      senderName: 'Alice',
      content: 'Room chat secret!',
      createdAt: new Date().toISOString(),
    });

    // Wait for microtask Web Crypto encryption
    await new Promise((r) => setTimeout(r, 30));

    const speechSend = mockDb.channel.send.mock.calls.find(
      (c) => (c[0] as { event: string }).event === 'speech'
    )?.[0] as { payload: { text: string } };
    const chatSend = mockDb.channel.send.mock.calls.find(
      (c) => (c[0] as { event: string }).event === 'chat'
    )?.[0] as { payload: { content: string } };

    expect(CryptoService.isEncrypted(speechSend.payload.text)).toBe(true);
    expect(CryptoService.isEncrypted(chatSend.payload.content)).toBe(true);

    // Incoming encrypted speech and chat decrypt cleanly
    mockDb.handlers.get('broadcast:speech')?.({
      payload: { user_id: BOB, client_id: 'bob-tab', text: speechSend.payload.text },
    });
    mockDb.handlers.get('broadcast:chat')?.({
      payload: {
        id: 'chat-2',
        room_id: 'general',
        space_id: PUBLIC_SPACE_ID,
        sender_id: BOB,
        sender_name: 'Bob',
        content: chatSend.payload.content,
        created_at: new Date().toISOString(),
      },
    });

    await new Promise((r) => setTimeout(r, 30));

    expect(sync.getRemotePlayers().get(BOB)?.speechBubble).toBe('Overhead secret!');
    expect(receivedChat).toContain('Room chat secret!');
  });

  it('attaches up to 5 decrypted context messages to SafetyService.report when provided', async () => {
    const messages = Array.from({ length: 8 }, (_, i) => ({
      senderId: i % 2 === 0 ? ALICE : BOB,
      senderName: i % 2 === 0 ? 'Alice' : 'Bob',
      content: `Message #${i + 1} ${'z'.repeat(600)}`,
      createdAt: new Date(Date.now() + i * 1000).toISOString(),
    }));

    const res = await SafetyService.report({
      reporterId: ALICE,
      reportedUserId: BOB,
      reason: 'harassment',
      details: 'Repeated harassment in DM',
      evidenceSnapshot: messages,
    });

    expect(res.ok).toBe(true);
    expect(mockDb.reports).toHaveLength(1);
    const evidence = mockDb.reports[0].evidence_snapshot as Array<{ content: string }>;
    expect(evidence).toHaveLength(5);
    expect(evidence[0].content.startsWith('Message #4')).toBe(true);
    expect(evidence[4].content).toHaveLength(500);
  });

  it('rotates Private Space key on kick/ban, preserves v1 decryption, and locks evicted peer out of v2', async () => {
    const aKeys = await E2EEManager.initUser(ALICE);
    const bKeys = await E2EEManager.initUser(BOB);
    const cKeys = await E2EEManager.initUser(CHARLIE);

    mockDb.profiles[ALICE] = { id: ALICE, public_key: aKeys!.publicKeySpki };
    mockDb.profiles[BOB] = { id: BOB, public_key: bKeys!.publicKeySpki };
    mockDb.profiles[CHARLIE] = { id: CHARLIE, public_key: cKeys!.publicKeySpki };
    mockDb.spaces[PRIVATE_SPACE_ID] = { id: PRIVATE_SPACE_ID, owner_id: ALICE, visibility: 'private' };
    mockDb.spaceMembers.push(
      { space_id: PRIVATE_SPACE_ID, user_id: BOB },
      { space_id: PRIVATE_SPACE_ID, user_id: CHARLIE }
    );

    await E2EEManager.initUser(ALICE);
    await E2EEManager.initSpaceKey(PRIVATE_SPACE_ID, 'private');
    expect(E2EEManager.getActiveSpaceVersion(PRIVATE_SPACE_ID)).toBe(1);

    const v1Wire = await E2EEManager.encryptSpaceMessage(PRIVATE_SPACE_ID, 'Old secret v1');
    expect(v1Wire.startsWith(`${E2EE_V2_PREFIX}spc:`)).toBe(true);

    // Ban Bob via SafetyService.moderate -> automatically calls E2EEManager.rotateSpaceKey
    const modRes = await SafetyService.moderate({
      spaceId: PRIVATE_SPACE_ID,
      targetUserId: BOB,
      action: 'ban',
      reason: 'Violation',
    });
    expect(modRes.ok).toBe(true);
    expect(E2EEManager.getActiveSpaceVersion(PRIVATE_SPACE_ID)).toBe(2);

    // Bob's key rows should be deleted; only Alice and Charlie should hold v2 keys
    expect(mockDb.spaceKeys.filter((r) => r.user_id === BOB)).toHaveLength(0);
    const v2Rows = mockDb.spaceKeys.filter((r) => Number(r.key_version) === 2);
    expect(v2Rows.map((r) => r.user_id).sort()).toEqual([ALICE, CHARLIE].sort());

    const v2Wire = await E2EEManager.encryptSpaceMessage(PRIVATE_SPACE_ID, 'Post-ban secret v2');
    expect(v2Wire.startsWith(`${E2EE_V2_PREFIX}spc.2:`)).toBe(true);

    // Remaining member Charlie decrypts both historical v1 and rotated v2 messages
    E2EEManager.resetSession();
    await E2EEManager.initUser(CHARLIE);
    await E2EEManager.initSpaceKey(PRIVATE_SPACE_ID, 'private');
    expect(await E2EEManager.decryptSpaceText(PRIVATE_SPACE_ID, v1Wire)).toBe('Old secret v1');
    expect(await E2EEManager.decryptSpaceText(PRIVATE_SPACE_ID, v2Wire)).toBe('Post-ban secret v2');

    // Evicted Bob cannot decrypt v2 message (key unavailable)
    E2EEManager.resetSession();
    await E2EEManager.initUser(BOB);
    const bobAttempt = await E2EEManager.decryptSpaceText(PRIVATE_SPACE_ID, v2Wire);
    expect(bobAttempt).toBe('[Encrypted message (key unavailable)]');
    expect(bobAttempt).not.toBe('Post-ban secret v2');
  });

  it('rotates Squad key from v1 to v2 while keeping historical v1 readable for remaining peers', async () => {
    const aKeys = await E2EEManager.initUser(ALICE);
    const bKeys = await E2EEManager.initUser(BOB);
    const cKeys = await E2EEManager.initUser(CHARLIE);

    mockDb.profiles[ALICE] = { id: ALICE, public_key: aKeys!.publicKeySpki };
    mockDb.profiles[BOB] = { id: BOB, public_key: bKeys!.publicKeySpki };
    mockDb.profiles[CHARLIE] = { id: CHARLIE, public_key: cKeys!.publicKeySpki };
    mockDb.groupMembers.push(
      { conversation_id: SQUAD_ID, user_id: ALICE },
      { conversation_id: SQUAD_ID, user_id: BOB },
      { conversation_id: SQUAD_ID, user_id: CHARLIE }
    );

    await E2EEManager.initUser(ALICE);
    await E2EEManager.initGroupKey(SQUAD_ID, [BOB, CHARLIE]);
    const v1Wire = await E2EEManager.encryptGroupMessage(SQUAD_ID, 'Squad v1 msg');

    const newVersion = await E2EEManager.rotateGroupKey(SQUAD_ID, BOB);
    expect(newVersion).toBe(2);
    expect(mockDb.groupKeys.filter((r) => r.user_id === BOB)).toHaveLength(0);

    const v2Wire = await E2EEManager.encryptGroupMessage(SQUAD_ID, 'Squad v2 msg');
    expect(v2Wire.startsWith(`${E2EE_V2_PREFIX}grp.2:`)).toBe(true);

    // Charlie decrypts both v1 and v2
    E2EEManager.resetSession();
    await E2EEManager.initUser(CHARLIE);
    expect(await E2EEManager.decryptGroupMessage(SQUAD_ID, v1Wire)).toBe('Squad v1 msg');
    expect(await E2EEManager.decryptGroupMessage(SQUAD_ID, v2Wire)).toBe('Squad v2 msg');

    // Bob is locked out of v2
    E2EEManager.resetSession();
    await E2EEManager.initUser(BOB);
    const bobReadV2 = await E2EEManager.decryptGroupMessage(SQUAD_ID, v2Wire);
    expect(bobReadV2).toBe('[Encrypted message (key unavailable)]');
    expect(bobReadV2).not.toBe('Squad v2 msg');
  });

  it('shares Private Space key with authorized late-joining peer only and rejects non-members', async () => {
    const aKeys = await E2EEManager.initUser(ALICE);
    const cKeys = await E2EEManager.initUser(CHARLIE);

    mockDb.profiles[ALICE] = { id: ALICE, public_key: aKeys!.publicKeySpki };
    mockDb.profiles[CHARLIE] = { id: CHARLIE, public_key: cKeys!.publicKeySpki };
    mockDb.spaces[PRIVATE_SPACE_ID] = { id: PRIVATE_SPACE_ID, owner_id: ALICE, visibility: 'private' };

    await E2EEManager.initUser(ALICE);
    await E2EEManager.initSpaceKey(PRIVATE_SPACE_ID, 'private');
    const secretWire = await E2EEManager.encryptSpaceMessage(PRIVATE_SPACE_ID, 'Late join welcome!');

    // Charlie is NOT in space_members yet -> share must refuse
    const denied = await E2EEManager.shareSpaceKeyWithPeer(PRIVATE_SPACE_ID, CHARLIE);
    expect(denied).toBeNull();
    expect(mockDb.spaceKeys.filter((r) => r.user_id === CHARLIE)).toHaveLength(0);

    // Charlie joins via invite (row added to space_members) -> share succeeds
    mockDb.spaceMembers.push({ space_id: PRIVATE_SPACE_ID, user_id: CHARLIE });
    const sharedVersion = await E2EEManager.shareSpaceKeyWithPeer(PRIVATE_SPACE_ID, CHARLIE);
    expect(sharedVersion).toBe(1);
    expect(mockDb.spaceKeys.filter((r) => r.user_id === CHARLIE)).toHaveLength(1);

    // Charlie refreshes his session space key and decrypts Alice's message
    E2EEManager.resetSession();
    await E2EEManager.initUser(CHARLIE);
    const refreshedVersion = await E2EEManager.refreshSpaceKey(PRIVATE_SPACE_ID);
    expect(refreshedVersion).toBe(1);
    expect(await E2EEManager.decryptSpaceText(PRIVATE_SPACE_ID, secretWire)).toBe('Late join welcome!');
  });
});
