/**
 * End-to-End Encryption (E2EE) Manager for TeemChat.
 * Coordinates user cryptographic identity, ECDH pairwise DM keys, hybrid multi-party room keys
 * (Squads & Private Spaces with key rotation + late-join sharing), zero-knowledge backups, and caching.
 */

import { supabase } from '../supabase';
import { CryptoService, E2EEMode, UserKeyPairExport } from './cryptoService';
import { E2EEStorage } from '../security/e2eeStorage';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

interface WrappedRoomKeyRow {
  encrypted_room_key: string;
  key_version: number;
  sender_id: string | null;
  sender?: { public_key?: string | null } | null;
}

interface RoomKeyEntry {
  key: CryptoKey;
  rawB64?: string;
  isFallback: boolean;
}

export class E2EEManager {
  private static currentUserId: string | null = null;
  private static myKeyPair: UserKeyPairExport | null = null;
  private static myPrivateKeyObj: CryptoKey | null = null;
  private static myPublicKeyObj: CryptoKey | null = null;

  // Caches for peer public keys, derived DM keys, and versioned multi-party room keys
  private static peerPublicKeyCache = new Map<string, string>(); // userId -> publicKeySpki
  private static dmEcdhKeyCache = new Map<string, CryptoKey>(); // conversationId -> ECDH CryptoKey
  private static baseKeyCache = new Map<string, CryptoKey>(); // scope:id -> baseline HKDF CryptoKey

  private static groupKeyVersions = new Map<string, Map<number, RoomKeyEntry>>(); // convId -> (ver -> entry)
  private static groupActiveVersion = new Map<string, number>();
  private static spaceKeyVersions = new Map<string, Map<number, RoomKeyEntry>>(); // spaceId -> (ver -> entry)
  private static spaceActiveVersion = new Map<string, number>();
  private static spaceVisibilityCache = new Map<string, string>(); // spaceId -> 'public' | 'private' | ...
  private static sharedSpacePeers = new Set<string>(); // `${spaceId}:v${ver}:${peerId}`

  // In-flight promise deduplication to prevent redundant queries/derivations under concurrency
  private static inFlightInit: { userId: string; promise: Promise<UserKeyPairExport | null> } | null = null;
  private static inFlightPeerFetches = new Map<string, Promise<string | null>>();
  private static inFlightGroupKeyLoads = new Map<string, Promise<RoomKeyEntry | null>>();
  private static inFlightSpaceKeyLoads = new Map<string, Promise<RoomKeyEntry | null>>();

  /**
   * Initializes or loads the cryptographic identity for the authenticated user (deduplicated).
   */
  static async initUser(userId: string): Promise<UserKeyPairExport | null> {
    if (!userId) return null;
    if (this.currentUserId === userId && this.myKeyPair) {
      return this.myKeyPair;
    }
    if (this.inFlightInit && this.inFlightInit.userId === userId) {
      return this.inFlightInit.promise;
    }

    const promise = (async () => {
      if (this.currentUserId !== userId) {
        this.clearRoomAndSessionCaches();
      }
      this.currentUserId = userId;

      try {
        let pair = await E2EEStorage.getKeyPair(userId);
        if (!pair) {
          pair = await CryptoService.generateUserKeyPair();
          await E2EEStorage.saveKeyPair(userId, pair);
        }

        this.myKeyPair = pair;
        this.myPrivateKeyObj = await CryptoService.importPrivateKey(pair.privateKeyPkcs8);
        this.myPublicKeyObj = await CryptoService.importPublicKey(pair.publicKeySpki);

        // Register own key in peer cache too (useful when wrapping room keys for self)
        this.peerPublicKeyCache.set(userId, pair.publicKeySpki);

        if (UUID_REGEX.test(userId)) {
          this.syncPublicKeyToProfile(userId, pair.publicKeySpki).catch((err) => {
            console.warn('[E2EEManager] Non-critical error syncing public key to profile:', err);
          });
        }

        return pair;
      } catch (e) {
        console.warn('[E2EEManager] Failed to initialize E2EE for user:', e);
        return null;
      } finally {
        if (this.inFlightInit?.userId === userId) {
          this.inFlightInit = null;
        }
      }
    })();

    this.inFlightInit = { userId, promise };
    return promise;
  }

  private static clearRoomAndSessionCaches(): void {
    this.dmEcdhKeyCache.clear();
    this.groupKeyVersions.clear();
    this.groupActiveVersion.clear();
    this.spaceKeyVersions.clear();
    this.spaceActiveVersion.clear();
    this.sharedSpacePeers.clear();
  }

  private static async syncPublicKeyToProfile(userId: string, publicKeySpki: string): Promise<void> {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('public_key')
        .eq('id', userId)
        .maybeSingle();

      if (!data || data.public_key !== publicKeySpki) {
        await supabase
          .from('profiles')
          .update({ public_key: publicKeySpki })
          .eq('id', userId);
      }
    } catch (err) {
      console.warn('[E2EEManager] Profile public key sync failed:', err);
    }
  }

  static getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  static getMyPublicKey(): string | null {
    return this.myKeyPair?.publicKeySpki || null;
  }

  static async getMyFingerprint(): Promise<string | null> {
    if (!this.myKeyPair?.publicKeySpki) return null;
    return CryptoService.computeFingerprint(this.myKeyPair.publicKeySpki);
  }

  static async getPeerFingerprint(peerUserId: string): Promise<string | null> {
    const pub = await this.getPeerPublicKey(peerUserId);
    if (!pub) return null;
    return CryptoService.computeFingerprint(pub);
  }

  static registerPeerPublicKey(peerUserId: string, publicKeySpki: string): void {
    if (peerUserId && publicKeySpki) {
      this.peerPublicKeyCache.set(peerUserId, publicKeySpki);
    }
  }

  /**
   * Retrieves a peer's public key from cache or Supabase profiles (with in-flight deduplication).
   */
  static async getPeerPublicKey(peerUserId: string): Promise<string | null> {
    if (!peerUserId) return null;
    if (this.peerPublicKeyCache.has(peerUserId)) {
      return this.peerPublicKeyCache.get(peerUserId) || null;
    }
    if (!UUID_REGEX.test(peerUserId)) {
      return null;
    }
    const pending = this.inFlightPeerFetches.get(peerUserId);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('public_key')
          .eq('id', peerUserId)
          .maybeSingle();

        if (error || !data?.public_key) {
          return null;
        }

        this.peerPublicKeyCache.set(peerUserId, data.public_key);
        return data.public_key;
      } catch (err) {
        console.warn('[E2EEManager] Error fetching peer public key:', err);
        return null;
      } finally {
        this.inFlightPeerFetches.delete(peerUserId);
      }
    })();

    this.inFlightPeerFetches.set(peerUserId, promise);
    return promise;
  }

  private static async getBaselineKey(scope: 'dm' | 'grp' | 'spc', id: string): Promise<CryptoKey | null> {
    const cacheKey = `${scope}:${id}`;
    if (this.baseKeyCache.has(cacheKey)) {
      return this.baseKeyCache.get(cacheKey) || null;
    }
    try {
      const saltMap = {
        dm: 'teemchat-dm-baseline-v1',
        grp: 'teemchat-grp-baseline-v1',
        spc: 'teemchat-space-v2',
      };
      const secretPrefix = {
        dm: `teemchat-dm-secret-${id}`,
        grp: `teemchat-grp-secret-${id}`,
        spc: `teemchat-space-pub-${id}`,
      };
      const key = await CryptoService.deriveDeterministicKey(
        secretPrefix[scope],
        saltMap[scope],
        `${scope}:${id}`
      );
      this.baseKeyCache.set(cacheKey, key);
      return key;
    } catch (e) {
      console.warn('[E2EEManager] Baseline key derivation failed:', e);
      return null;
    }
  }

  private static async getOrCreateDMEcdhKey(
    conversationId: string,
    peerUserId: string
  ): Promise<CryptoKey | null> {
    if (!conversationId || !peerUserId) return null;
    if (this.dmEcdhKeyCache.has(conversationId)) {
      return this.dmEcdhKeyCache.get(conversationId) || null;
    }

    if (!this.myPrivateKeyObj && this.currentUserId) {
      await this.initUser(this.currentUserId);
    }
    if (!this.myPrivateKeyObj) return null;

    const peerPublicKeySpki = await this.getPeerPublicKey(peerUserId);
    if (!peerPublicKeySpki) return null;

    try {
      const peerPublicKeyObj = await CryptoService.importPublicKey(peerPublicKeySpki);
      const sessionKey = await CryptoService.derivePairwiseKey(
        this.myPrivateKeyObj,
        peerPublicKeyObj,
        `dm:${conversationId}`
      );
      this.dmEcdhKeyCache.set(conversationId, sessionKey);
      return sessionKey;
    } catch (err) {
      console.warn('[E2EEManager] ECDH derivation failed for DM session:', err);
      return null;
    }
  }

  /**
   * Resolves the highest-available session key for a 1-on-1 DM.
   */
  static async getOrCreateDMSessionKey(
    conversationId: string,
    peerUserId: string
  ): Promise<CryptoKey | null> {
    const ecdh = await this.getOrCreateDMEcdhKey(conversationId, peerUserId);
    if (ecdh) return ecdh;
    return this.getBaselineKey('dm', conversationId);
  }

  static async getDMEncryptionMode(peerUserId: string): Promise<'ecdh' | 'baseline'> {
    const pub = await this.getPeerPublicKey(peerUserId);
    return pub && this.myPrivateKeyObj ? 'ecdh' : 'baseline';
  }

  /**
   * Encrypts outgoing text for a 1-on-1 direct conversation using tagged v2 envelopes.
   */
  static async encryptDM(params: {
    conversationId: string;
    peerUserId: string;
    content: string;
  }): Promise<string> {
    const { conversationId, peerUserId, content } = params;
    const ecdhKey = await this.getOrCreateDMEcdhKey(conversationId, peerUserId);
    if (ecdhKey) {
      return CryptoService.encryptText(content, ecdhKey, 'ecdh');
    }
    const baseKey = await this.getBaselineKey('dm', conversationId);
    if (!baseKey) return content;
    return CryptoService.encryptText(content, baseKey, 'base');
  }

  /**
   * Decrypts incoming or fetched content for a direct conversation.
   * Uses the v2 mode tag to select the exact key directly (no trial-and-error double decrypt).
   */
  static async decryptDM(params: {
    conversationId: string;
    peerUserId: string;
    content: string;
  }): Promise<string> {
    const { conversationId, peerUserId, content } = params;
    const parsed = CryptoService.parseEnvelope(content);
    if (!parsed) return content;

    if (parsed.version === 2) {
      if (parsed.mode === 'base') {
        const baseKey = await this.getBaselineKey('dm', conversationId);
        return baseKey ? CryptoService.decryptText(content, baseKey) : '[Encrypted message (key unavailable)]';
      }
      const ecdhKey = await this.getOrCreateDMEcdhKey(conversationId, peerUserId);
      return ecdhKey ? CryptoService.decryptText(content, ecdhKey) : '[Encrypted message (key unavailable)]';
    }

    // Legacy v1 compatibility (v1 did not include a mode tag)
    const ecdhKey = await this.getOrCreateDMEcdhKey(conversationId, peerUserId);
    if (ecdhKey) {
      const attempt = await CryptoService.decryptText(content, ecdhKey);
      if (!attempt.includes('could not be decrypted')) {
        return attempt;
      }
    }
    const baseKey = await this.getBaselineKey('dm', conversationId);
    if (baseKey) {
      return CryptoService.decryptText(content, baseKey);
    }
    return '[Encrypted message (key unavailable)]';
  }

  // ===========================================================================
  // Shared Versioned Room-Key Helpers (Squads & Private Spaces)
  // ===========================================================================

  private static setRoomKeyCache(
    versionsStore: Map<string, Map<number, RoomKeyEntry>>,
    activeStore: Map<string, number>,
    targetId: string,
    version: number,
    entry: RoomKeyEntry
  ): void {
    let verMap = versionsStore.get(targetId);
    if (!verMap) {
      verMap = new Map<number, RoomKeyEntry>();
      versionsStore.set(targetId, verMap);
    }
    verMap.set(version, entry);
    const currentActive = activeStore.get(targetId) ?? 0;
    if (!entry.isFallback || currentActive === 0) {
      if (version >= currentActive || !verMap.get(currentActive) || verMap.get(currentActive)?.isFallback) {
        activeStore.set(targetId, version);
      }
    }
  }

  private static getRoomKeyEntry(
    versionsStore: Map<string, Map<number, RoomKeyEntry>>,
    activeStore: Map<string, number>,
    targetId: string,
    targetVersion?: number
  ): { version: number; entry: RoomKeyEntry } | null {
    const verMap = versionsStore.get(targetId);
    if (!verMap) return null;
    const version = targetVersion ?? activeStore.get(targetId) ?? 1;
    const entry = verMap.get(version);
    return entry ? { version, entry } : null;
  }

  private static async distributeRoomKeyToPeers(params: {
    table: 'group_encryption_keys' | 'space_encryption_keys';
    idColumn: 'conversation_id' | 'space_id';
    targetId: string;
    roomKeyRawB64: string;
    memberIds: string[];
    keyVersion: number;
  }): Promise<void> {
    const { table, idColumn, targetId, roomKeyRawB64, memberIds, keyVersion } = params;
    if (!this.currentUserId || !this.myPrivateKeyObj || !UUID_REGEX.test(targetId)) return;

    const uniqueIds = Array.from(new Set(memberIds)).filter((id) => UUID_REGEX.test(id));
    if (uniqueIds.length === 0) return;

    // Batch fetch public keys for members not yet cached
    const missingIds = uniqueIds.filter((id) => !this.peerPublicKeyCache.has(id));
    if (missingIds.length > 0) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, public_key')
          .in('id', missingIds);
        for (const p of (data || []) as Array<{ id: string; public_key?: string | null }>) {
          if (p.public_key) this.peerPublicKeyCache.set(p.id, p.public_key);
        }
      } catch {}
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const memberId of uniqueIds) {
      const pubSpki = this.peerPublicKeyCache.get(memberId);
      if (!pubSpki) continue;
      try {
        const peerPub = await CryptoService.importPublicKey(pubSpki);
        const wrapped = await CryptoService.wrapRoomKeyForPeer(
          roomKeyRawB64,
          this.myPrivateKeyObj,
          peerPub,
          `${table}:${targetId}:v${keyVersion}`
        );
        rows.push({
          [idColumn]: targetId,
          user_id: memberId,
          sender_id: this.currentUserId,
          encrypted_room_key: wrapped,
          key_version: keyVersion,
        });
      } catch (e) {
        console.warn(`[E2EEManager] Failed wrapping ${table} key for ${memberId}:`, e);
      }
    }

    if (rows.length > 0) {
      try {
        await supabase.from(table).upsert(rows, {
          onConflict: `${idColumn},user_id,key_version`,
        });
      } catch (e) {
        console.warn(`[E2EEManager] Failed persisting ${table} rows:`, e);
      }
    }
  }

  private static async fetchAndUnwrapRoomKey(params: {
    table: 'group_encryption_keys' | 'space_encryption_keys';
    idColumn: 'conversation_id' | 'space_id';
    targetId: string;
    targetVersion?: number;
  }): Promise<{ version: number; entry: RoomKeyEntry } | null> {
    const { table, idColumn, targetId, targetVersion } = params;
    if (!this.currentUserId || !UUID_REGEX.test(targetId)) return null;
    if (!this.myPrivateKeyObj) {
      await this.initUser(this.currentUserId);
    }
    if (!this.myPrivateKeyObj) return null;

    try {
      let query = supabase
        .from(table)
        .select('encrypted_room_key, key_version, sender_id, sender:sender_id(public_key)')
        .eq(idColumn, targetId)
        .eq('user_id', this.currentUserId);

      if (typeof targetVersion === 'number') {
        query = query.eq('key_version', targetVersion);
      } else {
        query = query.order('key_version', { ascending: false }).limit(1);
      }

      const { data } = await query.maybeSingle();
      const row = data as WrappedRoomKeyRow | null;
      const senderPub =
        row?.sender?.public_key || (row?.sender_id ? await this.getPeerPublicKey(row.sender_id) : null);

      if (row?.encrypted_room_key && senderPub && this.myPrivateKeyObj) {
        const peerPubObj = await CryptoService.importPublicKey(senderPub);
        const { key, rawB64 } = await CryptoService.unwrapRoomKeyRawFromPeer(
          row.encrypted_room_key,
          this.myPrivateKeyObj,
          peerPubObj,
          `${table}:${targetId}:v${row.key_version}`
        );
        return {
          version: row.key_version || 1,
          entry: { key, rawB64, isFallback: false },
        };
      }
    } catch (e) {
      console.warn(`[E2EEManager] Error loading ${table} key:`, e);
    }
    return null;
  }

  private static async rotateRoomKey(params: {
    table: 'group_encryption_keys' | 'space_encryption_keys';
    idColumn: 'conversation_id' | 'space_id';
    membersTable: 'group_conversation_members' | 'space_members';
    targetId: string;
    versionsStore: Map<string, Map<number, RoomKeyEntry>>;
    activeStore: Map<string, number>;
    excludedUserId?: string;
  }): Promise<number | null> {
    const { table, idColumn, membersTable, targetId, versionsStore, activeStore, excludedUserId } = params;
    if (!targetId || !UUID_REGEX.test(targetId) || !this.currentUserId) return null;
    if (typeof supabase?.from !== 'function') return null;

    try {
      if (!this.myPrivateKeyObj) {
        await this.initUser(this.currentUserId);
      }

      let dbMaxVersion = activeStore.get(targetId) ?? 0;
      try {
        const { data: latestRow } = await supabase
          .from(table)
          .select('key_version')
          .eq(idColumn, targetId)
          .order('key_version', { ascending: false })
          .limit(1)
          .maybeSingle();
        const ver = (latestRow as { key_version?: number } | null)?.key_version;
        if (typeof ver === 'number' && ver > dbMaxVersion) {
          dbMaxVersion = ver;
        }
      } catch {}

      const nextVersion = Math.max(1, dbMaxVersion + 1);
      const roomKey = await CryptoService.generateRoomKey();
      const rawB64 = await CryptoService.exportRoomKeyRaw(roomKey);
      const operationalKey = await CryptoService.importRoomKeyRaw(rawB64);

      this.setRoomKeyCache(versionsStore, activeStore, targetId, nextVersion, {
        key: operationalKey,
        rawB64,
        isFallback: false,
      });

      const { data: memberRows } = await supabase
        .from(membersTable)
        .select('user_id')
        .eq(idColumn, targetId);

      const remainingMembers = Array.from(
        new Set([
          this.currentUserId,
          ...((memberRows || []) as Array<{ user_id: string }>).map((m) => m.user_id),
        ])
      ).filter((id) => id !== excludedUserId);

      await this.distributeRoomKeyToPeers({
        table,
        idColumn,
        targetId,
        roomKeyRawB64: rawB64,
        memberIds: remainingMembers,
        keyVersion: nextVersion,
      });

      if (excludedUserId && UUID_REGEX.test(excludedUserId)) {
        try {
          await supabase
            .from(table)
            .delete()
            .eq(idColumn, targetId)
            .eq('user_id', excludedUserId);
        } catch {}
      }

      return nextVersion;
    } catch (e) {
      console.warn(`[E2EEManager] Failed rotating ${table} key:`, e);
      return null;
    }
  }

  // ===========================================================================
  // Phase 2: Multi-Party Squad (Group) Room-Key Distribution & Rotation
  // ===========================================================================

  /**
   * Creates and distributes a symmetric AES-256-GCM key for a newly created Squad.
   */
  static async initGroupKey(conversationId: string, memberIds: string[]): Promise<CryptoKey | null> {
    if (!conversationId) return null;
    if (!UUID_REGEX.test(conversationId)) {
      return this.getBaselineKey('grp', conversationId);
    }

    if (!this.myPrivateKeyObj && this.currentUserId) {
      await this.initUser(this.currentUserId);
    }

    try {
      const roomKey = await CryptoService.generateRoomKey();
      const rawB64 = await CryptoService.exportRoomKeyRaw(roomKey);
      const operationalKey = await CryptoService.importRoomKeyRaw(rawB64);
      this.setRoomKeyCache(this.groupKeyVersions, this.groupActiveVersion, conversationId, 1, {
        key: operationalKey,
        rawB64,
        isFallback: false,
      });

      const allMembers = this.currentUserId ? [this.currentUserId, ...memberIds] : memberIds;
      await this.distributeRoomKeyToPeers({
        table: 'group_encryption_keys',
        idColumn: 'conversation_id',
        targetId: conversationId,
        roomKeyRawB64: rawB64,
        memberIds: allMembers,
        keyVersion: 1,
      });

      return operationalKey;
    } catch (e) {
      console.warn('[E2EEManager] Failed creating group key, falling back to baseline:', e);
      return this.getBaselineKey('grp', conversationId);
    }
  }

  /**
   * Rotates a Squad's symmetric key (e.g., after removing a member) and revokes the excluded user's wrapped keys.
   */
  static async rotateGroupKey(conversationId: string, excludedUserId?: string): Promise<number | null> {
    return this.rotateRoomKey({
      table: 'group_encryption_keys',
      idColumn: 'conversation_id',
      membersTable: 'group_conversation_members',
      targetId: conversationId,
      versionsStore: this.groupKeyVersions,
      activeStore: this.groupActiveVersion,
      excludedUserId,
    });
  }

  /**
   * Loads the current user's unwrapped symmetric group key (with version resolution & in-flight deduplication).
   */
  static async getOrLoadGroupKey(
    conversationId: string,
    targetVersion?: number
  ): Promise<{ key: CryptoKey | null; mode: E2EEMode; keyVersion: number }> {
    if (!conversationId) return { key: null, mode: 'base', keyVersion: 1 };

    const cached = this.getRoomKeyEntry(
      this.groupKeyVersions,
      this.groupActiveVersion,
      conversationId,
      targetVersion
    );
    if (cached && !cached.entry.isFallback) {
      return { key: cached.entry.key, mode: 'grp', keyVersion: cached.version };
    }

    if (UUID_REGEX.test(conversationId) && this.currentUserId) {
      const dedupeKey = `${conversationId}:v${targetVersion ?? 'latest'}`;
      let loadPromise = this.inFlightGroupKeyLoads.get(dedupeKey);
      if (!loadPromise) {
        loadPromise = (async () => {
          try {
            const loaded = await this.fetchAndUnwrapRoomKey({
              table: 'group_encryption_keys',
              idColumn: 'conversation_id',
              targetId: conversationId,
              targetVersion,
            });
            if (loaded) {
              this.setRoomKeyCache(
                this.groupKeyVersions,
                this.groupActiveVersion,
                conversationId,
                loaded.version,
                loaded.entry
              );
              return loaded.entry;
            }
          } finally {
            this.inFlightGroupKeyLoads.delete(dedupeKey);
          }
          return null;
        })();
        this.inFlightGroupKeyLoads.set(dedupeKey, loadPromise);
      }

      const entry = await loadPromise;
      if (entry) {
        const ver = targetVersion ?? this.groupActiveVersion.get(conversationId) ?? 1;
        return { key: entry.key, mode: 'grp', keyVersion: ver };
      }
    }

    const base = await this.getBaselineKey('grp', conversationId);
    return { key: base, mode: 'base', keyVersion: 1 };
  }

  static async encryptGroupMessage(conversationId: string, plainText: string): Promise<string> {
    const { key, mode, keyVersion } = await this.getOrLoadGroupKey(conversationId);
    if (!key) return plainText;
    return CryptoService.encryptText(plainText, key, mode, keyVersion);
  }

  static async decryptGroupMessage(conversationId: string, content: string): Promise<string> {
    const parsed = CryptoService.parseEnvelope(content);
    if (!parsed) return content;

    if (parsed.version === 2 && parsed.mode === 'base') {
      const base = await this.getBaselineKey('grp', conversationId);
      return base ? CryptoService.decryptText(content, base) : '[Encrypted message (key unavailable)]';
    }

    const { key, mode } = await this.getOrLoadGroupKey(conversationId, parsed.keyVersion);
    if (parsed.mode === 'grp' && mode === 'base') {
      return '[Encrypted message (key unavailable)]';
    }
    return key ? CryptoService.decryptText(content, key) : '[Encrypted message (key unavailable)]';
  }

  // ===========================================================================
  // Phase 2: Virtual World Space Chat, Key Rotation & Late-Join Sharing
  // ===========================================================================

  /**
   * Initializes and caches the room key for a Space.
   * - Private persisted spaces use Hybrid Room-Key distribution (`space_encryption_keys`).
   * - Public / guest-temporary spaces derive a zero-handshake space key so drop-in visitors never block on offline owners.
   */
  static async initSpaceKey(spaceId: string, visibility = 'public'): Promise<CryptoKey | null> {
    if (!spaceId) return null;
    this.spaceVisibilityCache.set(spaceId, visibility);

    const existing = this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId);
    if (existing && (!existing.entry.isFallback || visibility !== 'private')) {
      return existing.entry.key;
    }

    const dedupeKey = `${spaceId}:init`;
    const existingPromise = this.inFlightSpaceKeyLoads.get(dedupeKey);
    if (existingPromise) {
      const res = await existingPromise;
      return res?.key ?? null;
    }

    const promise: Promise<RoomKeyEntry | null> = (async () => {
      try {
        // Fast zero-handshake key for public or non-UUID temporary spaces
        if (visibility !== 'private' || !UUID_REGEX.test(spaceId) || !this.currentUserId) {
          const pubKey = await this.getBaselineKey('spc', spaceId);
          if (pubKey) {
            const entry: RoomKeyEntry = { key: pubKey, isFallback: true };
            this.setRoomKeyCache(this.spaceKeyVersions, this.spaceActiveVersion, spaceId, 1, entry);
            return entry;
          }
          return null;
        }

        if (!this.myPrivateKeyObj) {
          await this.initUser(this.currentUserId);
        }

        // 1. Try loading my latest wrapped key for this private space
        const loaded = await this.fetchAndUnwrapRoomKey({
          table: 'space_encryption_keys',
          idColumn: 'space_id',
          targetId: spaceId,
        });
        if (loaded) {
          this.setRoomKeyCache(
            this.spaceKeyVersions,
            this.spaceActiveVersion,
            spaceId,
            loaded.version,
            loaded.entry
          );
          return loaded.entry;
        }

        // 2. If owner is entering and no keys exist yet, provision the space key for all current members
        const { data: spaceMeta } = await supabase
          .from('spaces')
          .select('owner_id')
          .eq('id', spaceId)
          .maybeSingle();

        if (spaceMeta?.owner_id === this.currentUserId) {
          const { data: members } = await supabase
            .from('space_members')
            .select('user_id')
            .eq('space_id', spaceId);
          const memberIds = Array.from(
            new Set([
              this.currentUserId,
              ...((members || []) as Array<{ user_id: string }>).map((m) => m.user_id),
            ])
          );

          const generated = await CryptoService.generateRoomKey();
          const rawB64 = await CryptoService.exportRoomKeyRaw(generated);
          const operational = await CryptoService.importRoomKeyRaw(rawB64);
          const entry: RoomKeyEntry = { key: operational, rawB64, isFallback: false };
          this.setRoomKeyCache(this.spaceKeyVersions, this.spaceActiveVersion, spaceId, 1, entry);

          await this.distributeRoomKeyToPeers({
            table: 'space_encryption_keys',
            idColumn: 'space_id',
            targetId: spaceId,
            roomKeyRawB64: rawB64,
            memberIds,
            keyVersion: 1,
          });
          return entry;
        }

        // 3. Transitional fallback if an invited member enters before key distribution completes
        const fallback = await this.getBaselineKey('spc', spaceId);
        if (fallback) {
          const entry: RoomKeyEntry = { key: fallback, isFallback: true };
          this.setRoomKeyCache(this.spaceKeyVersions, this.spaceActiveVersion, spaceId, 1, entry);
          return entry;
        }
        return null;
      } catch (e) {
        console.warn('[E2EEManager] Error initializing space key, using baseline:', e);
        const fallback = await this.getBaselineKey('spc', spaceId);
        if (fallback) {
          const entry: RoomKeyEntry = { key: fallback, isFallback: true };
          this.setRoomKeyCache(this.spaceKeyVersions, this.spaceActiveVersion, spaceId, 1, entry);
          return entry;
        }
        return null;
      } finally {
        this.inFlightSpaceKeyLoads.delete(dedupeKey);
      }
    })();

    this.inFlightSpaceKeyLoads.set(dedupeKey, promise);
    const res = await promise;
    return res?.key ?? null;
  }

  /**
   * Rotates a Private Space's encryption key (e.g., on member kick/ban) so evicted users cannot read new messages.
   */
  static async rotateSpaceKey(spaceId: string, excludedUserId?: string): Promise<number | null> {
    if (!spaceId || !UUID_REGEX.test(spaceId) || !this.currentUserId) return null;
    if (typeof supabase?.from !== 'function') return null;

    let visibility = this.spaceVisibilityCache.get(spaceId);
    if (!visibility) {
      try {
        const { data } = await supabase.from('spaces').select('visibility').eq('id', spaceId).maybeSingle();
        visibility = (data as { visibility?: string } | null)?.visibility || 'public';
        this.spaceVisibilityCache.set(spaceId, visibility);
      } catch {
        return null;
      }
    }
    if (visibility !== 'private') return null;

    const nextVersion = await this.rotateRoomKey({
      table: 'space_encryption_keys',
      idColumn: 'space_id',
      membersTable: 'space_members',
      targetId: spaceId,
      versionsStore: this.spaceKeyVersions,
      activeStore: this.spaceActiveVersion,
      excludedUserId,
    });

    if (nextVersion !== null) {
      for (const key of Array.from(this.sharedSpacePeers)) {
        if (key.startsWith(`${spaceId}:`)) this.sharedSpacePeers.delete(key);
      }
    }
    return nextVersion;
  }

  /**
   * Reloads the latest wrapped Space key from Supabase (called after receiving a key-rotation or late-join share notice).
   */
  static async refreshSpaceKey(spaceId: string): Promise<number | null> {
    if (!spaceId || !UUID_REGEX.test(spaceId) || !this.currentUserId) return null;
    const loaded = await this.fetchAndUnwrapRoomKey({
      table: 'space_encryption_keys',
      idColumn: 'space_id',
      targetId: spaceId,
    });
    if (!loaded) return null;
    this.setRoomKeyCache(
      this.spaceKeyVersions,
      this.spaceActiveVersion,
      spaceId,
      loaded.version,
      loaded.entry
    );
    return loaded.version;
  }

  /**
   * Shares the active Private Space room key with an authorized late-joining member when online.
   * Verifies `space_members` / `spaces.owner_id` membership before wrapping the key.
   */
  static async shareSpaceKeyWithPeer(spaceId: string, peerUserId: string): Promise<number | null> {
    if (
      !spaceId ||
      !peerUserId ||
      peerUserId === this.currentUserId ||
      !UUID_REGEX.test(spaceId) ||
      !UUID_REGEX.test(peerUserId) ||
      !this.currentUserId ||
      !this.myPrivateKeyObj
    ) {
      return null;
    }
    if (this.spaceVisibilityCache.get(spaceId) !== 'private') return null;

    const active = this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId);
    if (!active || active.entry.isFallback || !active.entry.rawB64) return null;

    const shareKey = `${spaceId}:v${active.version}:${peerUserId}`;
    if (this.sharedSpacePeers.has(shareKey)) return null;

    try {
      const [{ data: memberRow }, { data: spaceRow }] = await Promise.all([
        supabase
          .from('space_members')
          .select('user_id')
          .eq('space_id', spaceId)
          .eq('user_id', peerUserId)
          .maybeSingle(),
        supabase.from('spaces').select('owner_id').eq('id', spaceId).maybeSingle(),
      ]);

      const isAuthorized =
        Boolean((memberRow as { user_id?: string } | null)?.user_id) ||
        (spaceRow as { owner_id?: string } | null)?.owner_id === peerUserId;
      if (!isAuthorized) return null;

      this.sharedSpacePeers.add(shareKey);
      await this.distributeRoomKeyToPeers({
        table: 'space_encryption_keys',
        idColumn: 'space_id',
        targetId: spaceId,
        roomKeyRawB64: active.entry.rawB64,
        memberIds: [peerUserId],
        keyVersion: active.version,
      });
      return active.version;
    } catch (e) {
      this.sharedSpacePeers.delete(shareKey);
      console.warn('[E2EEManager] Failed sharing space key with peer:', e);
      return null;
    }
  }

  static hasSpaceKey(spaceId: string): boolean {
    return this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId) !== null;
  }

  static getActiveSpaceVersion(spaceId: string): number {
    return this.spaceActiveVersion.get(spaceId) ?? 1;
  }

  static getSpaceEncryptionMode(spaceId: string): 'spc' | 'baseline' {
    const active = this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId);
    if (active) return active.entry.isFallback ? 'baseline' : 'spc';
    return this.spaceVisibilityCache.get(spaceId) === 'private' ? 'spc' : 'baseline';
  }

  /**
   * Fast O(1) encryption for WorldSync broadcasts and room messages using ONLY the cached Space key.
   * Returns plaintext untouched if the space key has not been initialized (keeps WorldSync tests & 60fps loop zero-blocking).
   */
  static async encryptSpaceTextIfReady(spaceId: string, plainText: string): Promise<string> {
    const active = this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId);
    if (!active) return plainText;
    const mode: E2EEMode = active.entry.isFallback ? 'base' : 'spc';
    return CryptoService.encryptText(plainText, active.entry.key, mode, active.version);
  }

  static async encryptSpaceMessage(spaceId: string, plainText: string): Promise<string> {
    let active = this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId);
    if (!active) {
      await this.initSpaceKey(spaceId, this.spaceVisibilityCache.get(spaceId) || 'public');
      active = this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId);
    }
    if (!active) return plainText;
    const mode: E2EEMode = active.entry.isFallback ? 'base' : 'spc';
    return CryptoService.encryptText(plainText, active.entry.key, mode, active.version);
  }

  static async decryptSpaceText(spaceId: string, content: string): Promise<string> {
    const parsed = CryptoService.parseEnvelope(content);
    if (!parsed) return content;

    if (parsed.version === 2 && parsed.mode === 'base') {
      const pubKey = await this.getBaselineKey('spc', spaceId);
      return pubKey ? CryptoService.decryptText(content, pubKey) : '[Encrypted message (key unavailable)]';
    }

    const targetVer = parsed.keyVersion ?? 1;
    let found = this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId, targetVer);

    if (!found || found.entry.isFallback) {
      if (UUID_REGEX.test(spaceId) && this.currentUserId) {
        const loaded = await this.fetchAndUnwrapRoomKey({
          table: 'space_encryption_keys',
          idColumn: 'space_id',
          targetId: spaceId,
          targetVersion: targetVer,
        });
        if (loaded) {
          this.setRoomKeyCache(
            this.spaceKeyVersions,
            this.spaceActiveVersion,
            spaceId,
            loaded.version,
            loaded.entry
          );
          found = loaded;
        }
      }
      if (!found) {
        await this.initSpaceKey(spaceId, this.spaceVisibilityCache.get(spaceId) || 'public');
        found = this.getRoomKeyEntry(this.spaceKeyVersions, this.spaceActiveVersion, spaceId, targetVer);
      }
    }

    return found ? CryptoService.decryptText(content, found.entry.key) : '[Encrypted message (key unavailable)]';
  }

  // ===========================================================================
  // Zero-Knowledge Cloud Key Backup & Multi-Device Restore
  // ===========================================================================

  static async hasCloudBackup(userId: string): Promise<boolean> {
    if (!userId || !UUID_REGEX.test(userId)) return false;
    try {
      const { data, error } = await supabase
        .from('user_crypto_backups')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      return !error && Boolean(data?.user_id);
    } catch {
      return false;
    }
  }

  static async backupPrivateKey(passphraseOrPin: string): Promise<boolean> {
    if (!this.currentUserId || !this.myKeyPair) return false;

    try {
      const wrapped = await CryptoService.wrapPrivateKey(this.myKeyPair.privateKeyPkcs8, passphraseOrPin);

      const { error } = await supabase.from('user_crypto_backups').upsert({
        user_id: this.currentUserId,
        public_key: this.myKeyPair.publicKeySpki,
        encrypted_private_key: wrapped.encryptedPrivateKey,
        key_salt: wrapped.salt,
        key_iv: wrapped.iv,
        updated_at: new Date().toISOString(),
      });

      return !error;
    } catch (e) {
      console.warn('[E2EEManager] Failed to backup private key:', e);
      return false;
    }
  }

  static async restorePrivateKey(userId: string, passphraseOrPin: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_crypto_backups')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) return false;

      const restoredPkcs8 = await CryptoService.unwrapPrivateKey(
        {
          encryptedPrivateKey: data.encrypted_private_key,
          salt: data.key_salt,
          iv: data.key_iv,
        },
        passphraseOrPin
      );

      const pair: UserKeyPairExport = {
        publicKeySpki: data.public_key,
        privateKeyPkcs8: restoredPkcs8,
      };

      await E2EEStorage.saveKeyPair(userId, pair);
      this.currentUserId = userId;
      this.myKeyPair = pair;
      this.myPrivateKeyObj = await CryptoService.importPrivateKey(restoredPkcs8);
      this.myPublicKeyObj = await CryptoService.importPublicKey(data.public_key);
      this.peerPublicKeyCache.set(userId, data.public_key);
      this.clearRoomAndSessionCaches();

      return true;
    } catch (e) {
      console.warn('[E2EEManager] Failed to restore private key with passphrase:', e);
      return false;
    }
  }

  /**
   * Password auth lifecycle helper: restores an existing backup on a new device,
   * or creates a backup if none exists yet. Never throws.
   */
  static async syncPasswordBackup(userId: string, password: string): Promise<void> {
    if (!userId || !password || !UUID_REGEX.test(userId)) return;
    try {
      const localPair = await E2EEStorage.getKeyPair(userId);
      const backupExists = await this.hasCloudBackup(userId);
      if (!localPair && backupExists) {
        const ok = await this.restorePrivateKey(userId, password);
        if (ok) return;
      }
      await this.initUser(userId);
      if (!backupExists) {
        await this.backupPrivateKey(password);
      }
    } catch (e) {
      console.warn('[E2EEManager] Non-critical password backup sync notice:', e);
    }
  }

  static resetSession(): void {
    this.currentUserId = null;
    this.myKeyPair = null;
    this.myPrivateKeyObj = null;
    this.myPublicKeyObj = null;
    this.inFlightInit = null;
    this.peerPublicKeyCache.clear();
    this.baseKeyCache.clear();
    this.spaceVisibilityCache.clear();
    this.inFlightPeerFetches.clear();
    this.inFlightGroupKeyLoads.clear();
    this.inFlightSpaceKeyLoads.clear();
    this.clearRoomAndSessionCaches();
  }
}
