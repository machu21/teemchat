import { describe, it, expect, beforeEach, vi } from 'vitest';
import { E2EEManager } from '../src/lib/services/e2eeManager';
import { CryptoService, E2EE_V2_PREFIX } from '../src/lib/services/cryptoService';
import { DirectMessageService } from '../src/lib/services/directMessages';
import { E2EEStorage } from '../src/lib/security/e2eeStorage';

const mockSupabaseData: Record<string, unknown> = {};
const mockTableRows: Record<string, Array<Record<string, unknown>>> = {};
let profileFetchCount = 0;

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: (cols?: string) => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === 'profiles' && cols === 'public_key') {
              profileFetchCount += 1;
            }
            return {
              data: mockSupabaseData[`${table}:${val}`] || null,
              error: null,
            };
          },
          order: () => ({
            limit: async () => ({
              data: mockTableRows[`${table}:${val}`] || [],
              error: null,
            }),
          }),
        }),
      }),
      update: (data: unknown) => ({
        eq: (_col: string, val: string) => {
          mockSupabaseData[`${table}:${val}`] = {
            ...((mockSupabaseData[`${table}:${val}`] as Record<string, unknown>) || {}),
            ...(data as Record<string, unknown>),
          };
          return Promise.resolve({ error: null });
        },
      }),
      upsert: async (row: Record<string, unknown>) => {
        const id = (row.user_id || row.id) as string;
        mockSupabaseData[`${table}:${id}`] = row;
        return { error: null };
      },
    }),
    channel: () => ({
      on: () => ({ on: () => ({ subscribe: () => {} }) }),
      subscribe: (cb: (status: string) => void) => {
        cb('SUBSCRIBED');
        return { send: async () => {} };
      },
    }),
    cleanupExistingChannel: () => {},
    removeRealtimeChannel: () => {},
  },
  cleanupExistingChannel: () => {},
  removeRealtimeChannel: () => {},
}));

describe('Direct Messages E2EE Integration', () => {
  const ALICE_ID = '00000000-0000-4000-8000-000000000001';
  const BOB_ID = '00000000-0000-4000-8000-000000000002';
  const CONVERSATION_ID = 'conv-alice-bob-01';

  beforeEach(async () => {
    E2EEManager.resetSession();
    profileFetchCount = 0;
    for (const k of Object.keys(mockSupabaseData)) delete mockSupabaseData[k];
    for (const k of Object.keys(mockTableRows)) delete mockTableRows[k];
    await E2EEStorage.clearKeyPair(ALICE_ID);
    await E2EEStorage.clearKeyPair(BOB_ID);
  });

  it('generates cryptographic identity and key fingerprint on initialization', async () => {
    const aliceKeys = await E2EEManager.initUser(ALICE_ID);
    expect(aliceKeys).toBeDefined();
    expect(aliceKeys?.publicKeySpki).toBeDefined();

    const myPub = E2EEManager.getMyPublicKey();
    expect(myPub).toBe(aliceKeys?.publicKeySpki);

    const fingerprint = await E2EEManager.getMyFingerprint();
    expect(fingerprint).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('encrypts and decrypts 1-on-1 direct messages symmetrically with v2 ecdh tag', async () => {
    const aliceKeys = await E2EEManager.initUser(ALICE_ID);
    const bobKeys = await E2EEManager.initUser(BOB_ID);

    E2EEManager.registerPeerPublicKey(ALICE_ID, aliceKeys!.publicKeySpki);
    E2EEManager.registerPeerPublicKey(BOB_ID, bobKeys!.publicKeySpki);

    await E2EEManager.initUser(ALICE_ID);
    expect(await E2EEManager.getDMEncryptionMode(BOB_ID)).toBe('ecdh');

    const plaintext = 'Hey Bob, let us play chess! teem:game:chess:session42';
    const wireEncrypted = await E2EEManager.encryptDM({
      conversationId: CONVERSATION_ID,
      peerUserId: BOB_ID,
      content: plaintext,
    });

    expect(wireEncrypted.startsWith(`${E2EE_V2_PREFIX}ecdh:`)).toBe(true);
    expect(CryptoService.isEncrypted(wireEncrypted)).toBe(true);
    expect(wireEncrypted).not.toContain(plaintext);

    await E2EEManager.initUser(BOB_ID);
    const decryptedForBob = await E2EEManager.decryptDM({
      conversationId: CONVERSATION_ID,
      peerUserId: ALICE_ID,
      content: wireEncrypted,
    });

    expect(decryptedForBob).toBe(plaintext);

    const replyText = 'Challenge accepted!';
    const wireReply = await E2EEManager.encryptDM({
      conversationId: CONVERSATION_ID,
      peerUserId: ALICE_ID,
      content: replyText,
    });

    await E2EEManager.initUser(ALICE_ID);
    const decryptedForAlice = await E2EEManager.decryptDM({
      conversationId: CONVERSATION_ID,
      peerUserId: BOB_ID,
      content: wireReply,
    });

    expect(decryptedForAlice).toBe(replyText);
  });

  it('tags transitional baseline fallback as v2:base and still reads legacy v1 & plaintext', async () => {
    await E2EEManager.initUser(ALICE_ID);
    const legacyPeerId = '00000000-0000-4000-8000-999999999999';

    expect(await E2EEManager.getDMEncryptionMode(legacyPeerId)).toBe('baseline');

    const plainMessage = 'Hello legacy user!';
    const result = await E2EEManager.encryptDM({
      conversationId: 'conv-legacy',
      peerUserId: legacyPeerId,
      content: plainMessage,
    });

    expect(CryptoService.isEncrypted(result)).toBe(true);
    expect(result.startsWith(`${E2EE_V2_PREFIX}base:`)).toBe(true);

    const decrypted = await E2EEManager.decryptDM({
      conversationId: 'conv-legacy',
      peerUserId: legacyPeerId,
      content: result,
    });
    expect(decrypted).toBe(plainMessage);

    const legacyPlain = 'Old message from before E2EE was deployed';
    expect(
      await E2EEManager.decryptDM({
        conversationId: 'conv-legacy',
        peerUserId: legacyPeerId,
        content: legacyPlain,
      })
    ).toBe(legacyPlain);
  });

  it('deduplicates concurrent peer public key fetches to a single query', async () => {
    await E2EEManager.initUser(ALICE_ID);
    await Promise.resolve();
    profileFetchCount = 0;

    const targetPeer = '00000000-0000-4000-8000-000000000009';
    const bobKeys = await CryptoService.generateUserKeyPair();
    mockSupabaseData[`profiles:${targetPeer}`] = { id: targetPeer, public_key: bobKeys.publicKeySpki };

    const results = await Promise.all([
      E2EEManager.getPeerPublicKey(targetPeer),
      E2EEManager.getPeerPublicKey(targetPeer),
      E2EEManager.getPeerPublicKey(targetPeer),
      E2EEManager.getPeerPublicKey(targetPeer),
    ]);

    expect(results.every((r) => r === bobKeys.publicKeySpki)).toBe(true);
    expect(profileFetchCount).toBe(1);
  });

  it('resolves the right peer in DirectMessageService.fetchMessages even when peerUserId is omitted', async () => {
    const aliceKeys = await E2EEManager.initUser(ALICE_ID);
    const bobKeys = await E2EEManager.initUser(BOB_ID);

    mockSupabaseData[`profiles:${ALICE_ID}`] = { id: ALICE_ID, public_key: aliceKeys!.publicKeySpki };
    mockSupabaseData[`profiles:${BOB_ID}`] = { id: BOB_ID, public_key: bobKeys!.publicKeySpki };
    mockSupabaseData[`buddy_conversations:${CONVERSATION_ID}`] = {
      id: CONVERSATION_ID,
      user_one: ALICE_ID,
      user_two: BOB_ID,
    };

    // Bob sends an encrypted DM to Alice
    await E2EEManager.initUser(BOB_ID);
    E2EEManager.registerPeerPublicKey(ALICE_ID, aliceKeys!.publicKeySpki);
    const cipherFromBob = await E2EEManager.encryptDM({
      conversationId: CONVERSATION_ID,
      peerUserId: ALICE_ID,
      content: 'Peer resolution works!',
    });

    mockTableRows[`direct_messages:${CONVERSATION_ID}`] = [
      {
        id: 'dm-row-1',
        conversation_id: CONVERSATION_ID,
        sender_id: BOB_ID,
        content: cipherFromBob,
        created_at: new Date().toISOString(),
        sender: { display_name: 'Bob' },
      },
    ];

    // Alice (who is userOne!) fetches without passing peerUserId explicitly
    await E2EEManager.initUser(ALICE_ID);
    E2EEManager.registerPeerPublicKey(BOB_ID, bobKeys!.publicKeySpki);

    const fetched = await DirectMessageService.fetchMessages(CONVERSATION_ID);
    expect(fetched).toHaveLength(1);
    expect(fetched[0].content).toBe('Peer resolution works!');
  });

  it('syncs and restores password-backed keys automatically on a new device', async () => {
    const password = 'super-secure-password';
    await E2EEManager.syncPasswordBackup(ALICE_ID, password);
    expect(await E2EEManager.hasCloudBackup(ALICE_ID)).toBe(true);

    const bobKeys = await E2EEManager.initUser(BOB_ID);
    E2EEManager.registerPeerPublicKey(BOB_ID, bobKeys!.publicKeySpki);

    const secret = 'Confidential roadmap document link: https://teemchat.com/doc';
    const wireMsg = await E2EEManager.encryptDM({
      conversationId: CONVERSATION_ID,
      peerUserId: ALICE_ID,
      content: secret,
    });

    // Simulate new device (local storage cleared)
    E2EEManager.resetSession();
    await E2EEStorage.clearKeyPair(ALICE_ID);

    await E2EEManager.syncPasswordBackup(ALICE_ID, password);
    E2EEManager.registerPeerPublicKey(BOB_ID, bobKeys!.publicKeySpki);

    const decryptedOnNewDevice = await E2EEManager.decryptDM({
      conversationId: CONVERSATION_ID,
      peerUserId: BOB_ID,
      content: wireMsg,
    });
    expect(decryptedOnNewDevice).toBe(secret);
  });
});
