import { describe, it, expect } from 'vitest';
import {
  CryptoService,
  bufferToBase64,
  base64ToBuffer,
  E2EE_WIRE_PREFIX,
  E2EE_V2_PREFIX,
} from '../src/lib/services/cryptoService';

describe('CryptoService (E2EE Web Crypto API)', () => {
  it('converts buffers to base64 and back losslessly', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64, 32, 16]);
    const b64 = bufferToBase64(original);
    const roundtrip = base64ToBuffer(b64);
    expect(Array.from(roundtrip)).toEqual(Array.from(original));
  });

  it('generates a valid ECDH P-256 keypair', async () => {
    const keyPair = await CryptoService.generateUserKeyPair();
    expect(keyPair.publicKeySpki).toBeDefined();
    expect(keyPair.privateKeyPkcs8).toBeDefined();
    expect(keyPair.publicKeySpki.length).toBeGreaterThan(40);
    expect(keyPair.privateKeyPkcs8.length).toBeGreaterThan(40);

    const importedPub = await CryptoService.importPublicKey(keyPair.publicKeySpki);
    const importedPriv = await CryptoService.importPrivateKey(keyPair.privateKeyPkcs8);
    expect(importedPub.type).toBe('public');
    expect(importedPriv.type).toBe('private');
  });

  it('derives symmetric AES-256-GCM keys symmetrically between Alice and Bob', async () => {
    const alice = await CryptoService.generateUserKeyPair();
    const bob = await CryptoService.generateUserKeyPair();

    const alicePriv = await CryptoService.importPrivateKey(alice.privateKeyPkcs8);
    const alicePub = await CryptoService.importPublicKey(alice.publicKeySpki);

    const bobPriv = await CryptoService.importPrivateKey(bob.privateKeyPkcs8);
    const bobPub = await CryptoService.importPublicKey(bob.publicKeySpki);

    const conversationId = 'conv-12345';
    // Alice derives key for talking to Bob
    const aliceSessionKey = await CryptoService.derivePairwiseKey(alicePriv, bobPub, conversationId);
    // Bob derives key for talking to Alice
    const bobSessionKey = await CryptoService.derivePairwiseKey(bobPriv, alicePub, conversationId);

    // Alice encrypts a message
    const message = 'Hello Bob! This is top secret 🤫🚀';
    const encrypted = await CryptoService.encryptText(message, aliceSessionKey);

    expect(CryptoService.isEncrypted(encrypted)).toBe(true);
    expect(encrypted.startsWith(E2EE_WIRE_PREFIX)).toBe(true);
    expect(encrypted).not.toContain(message);

    // Bob decrypts the message
    const decrypted = await CryptoService.decryptText(encrypted, bobSessionKey);
    expect(decrypted).toBe(message);

    // Bob replies to Alice
    const reply = 'Received loud and clear, Alice! teem:game:chess:xyz789';
    const encryptedReply = await CryptoService.encryptText(reply, bobSessionKey);
    const decryptedReply = await CryptoService.decryptText(encryptedReply, aliceSessionKey);
    expect(decryptedReply).toBe(reply);
  });

  it('generates distinct IVs for identical messages', async () => {
    const alice = await CryptoService.generateUserKeyPair();
    const bob = await CryptoService.generateUserKeyPair();
    const alicePriv = await CryptoService.importPrivateKey(alice.privateKeyPkcs8);
    const bobPub = await CryptoService.importPublicKey(bob.publicKeySpki);
    const key = await CryptoService.derivePairwiseKey(alicePriv, bobPub);

    const msg = 'Identical message content';
    const enc1 = await CryptoService.encryptText(msg, key);
    const enc2 = await CryptoService.encryptText(msg, key);

    expect(enc1).not.toBe(enc2); // Different random IV each time
    expect(await CryptoService.decryptText(enc1, key)).toBe(msg);
    expect(await CryptoService.decryptText(enc2, key)).toBe(msg);
  });

  it('transparently returns unencrypted legacy messages untouched', async () => {
    const alice = await CryptoService.generateUserKeyPair();
    const bob = await CryptoService.generateUserKeyPair();
    const alicePriv = await CryptoService.importPrivateKey(alice.privateKeyPkcs8);
    const bobPub = await CryptoService.importPublicKey(bob.publicKeySpki);
    const key = await CryptoService.derivePairwiseKey(alicePriv, bobPub);

    const legacyMessage = 'This is an older plaintext message from before E2EE was deployed.';
    const result = await CryptoService.decryptText(legacyMessage, key);
    expect(result).toBe(legacyMessage);
  });

  it('handles corrupted or tampered ciphertext gracefully without crashing', async () => {
    const alice = await CryptoService.generateUserKeyPair();
    const bob = await CryptoService.generateUserKeyPair();
    const alicePriv = await CryptoService.importPrivateKey(alice.privateKeyPkcs8);
    const bobPub = await CryptoService.importPublicKey(bob.publicKeySpki);
    const key = await CryptoService.derivePairwiseKey(alicePriv, bobPub);

    const valid = await CryptoService.encryptText('Secret data', key);
    // Tamper with the ciphertext portion
    const parts = valid.split(':');
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:ZmFrZWNpcGhlcnRleHRkYXRh`;

    const result = await CryptoService.decryptText(tampered, key);
    expect(result).toContain('could not be decrypted');
  });

  it('wraps and unwraps private keys with password-derived PBKDF2 key', async () => {
    const keyPair = await CryptoService.generateUserKeyPair();
    const pin = '849201';

    const backup = await CryptoService.wrapPrivateKey(keyPair.privateKeyPkcs8, pin);
    expect(backup.encryptedPrivateKey).toBeDefined();
    expect(backup.salt).toBeDefined();
    expect(backup.iv).toBeDefined();

    // Unwrap with the correct PIN
    const restored = await CryptoService.unwrapPrivateKey(backup, pin);
    expect(restored).toBe(keyPair.privateKeyPkcs8);

    // Unwrap with wrong PIN fails
    await expect(CryptoService.unwrapPrivateKey(backup, '000000')).rejects.toThrow();
  });

  it('computes a consistent and formatted public key fingerprint', async () => {
    const keyPair = await CryptoService.generateUserKeyPair();
    const fingerprint1 = await CryptoService.computeFingerprint(keyPair.publicKeySpki);
    const fingerprint2 = await CryptoService.computeFingerprint(keyPair.publicKeySpki);

    expect(fingerprint1).toBe(fingerprint2);
    expect(fingerprint1).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('supports tagged v2 envelopes and parses both v1 and v2 cleanly', async () => {
    const key = await CryptoService.generateRoomKey();
    const v1 = await CryptoService.encryptText('Legacy v1 msg', key);
    const v2 = await CryptoService.encryptText('Tagged v2 msg', key, 'grp');

    expect(v1.startsWith(E2EE_WIRE_PREFIX)).toBe(true);
    expect(v2.startsWith(`${E2EE_V2_PREFIX}grp:`)).toBe(true);

    expect(CryptoService.parseEnvelope(v1)?.version).toBe(1);
    expect(CryptoService.parseEnvelope(v2)?.version).toBe(2);
    expect(CryptoService.parseEnvelope(v2)?.mode).toBe('grp');
    expect(CryptoService.parseEnvelope('plain text')).toBeNull();

    expect(await CryptoService.decryptText(v1, key)).toBe('Legacy v1 msg');
    expect(await CryptoService.decryptText(v2, key)).toBe('Tagged v2 msg');
  });

  it('wraps and unwraps symmetric room keys across peers via pairwise ECDH', async () => {
    const alice = await CryptoService.generateUserKeyPair();
    const bob = await CryptoService.generateUserKeyPair();

    const alicePriv = await CryptoService.importPrivateKey(alice.privateKeyPkcs8);
    const alicePub = await CryptoService.importPublicKey(alice.publicKeySpki);
    const bobPriv = await CryptoService.importPrivateKey(bob.privateKeyPkcs8);
    const bobPub = await CryptoService.importPublicKey(bob.publicKeySpki);

    const roomKey = await CryptoService.generateRoomKey();
    const roomKeyRaw = await CryptoService.exportRoomKeyRaw(roomKey);

    // Alice wraps the symmetric room key for Bob
    const wrappedForBob = await CryptoService.wrapRoomKeyForPeer(roomKeyRaw, alicePriv, bobPub, 'grp:squad-1:v1');
    expect(wrappedForBob).not.toContain(roomKeyRaw);

    // Bob unwraps using his private key and Alice's public key
    const bobRoomKey = await CryptoService.unwrapRoomKeyFromPeer(wrappedForBob, bobPriv, alicePub, 'grp:squad-1:v1');

    const secret = 'Squad coordinates: X=42, Y=99';
    const cipher = await CryptoService.encryptText(secret, roomKey, 'grp');
    const decrypted = await CryptoService.decryptText(cipher, bobRoomKey);
    expect(decrypted).toBe(secret);
  });

  it('parses versioned v2 envelopes, rejects invalid key versions, and unwraps raw room keys', async () => {
    const alice = await CryptoService.generateUserKeyPair();
    const bob = await CryptoService.generateUserKeyPair();
    const alicePriv = await CryptoService.importPrivateKey(alice.privateKeyPkcs8);
    const alicePub = await CryptoService.importPublicKey(alice.publicKeySpki);
    const bobPriv = await CryptoService.importPrivateKey(bob.privateKeyPkcs8);
    const bobPub = await CryptoService.importPublicKey(bob.publicKeySpki);

    const roomKey = await CryptoService.generateRoomKey();
    const roomKeyRaw = await CryptoService.exportRoomKeyRaw(roomKey);

    const spcWire = await CryptoService.encryptText('Space v2 msg', roomKey, 'spc', 2);
    expect(spcWire.startsWith(`${E2EE_V2_PREFIX}spc.2:`)).toBe(true);
    const parsedSpc = CryptoService.parseEnvelope(spcWire);
    expect(parsedSpc?.version).toBe(2);
    expect(parsedSpc?.mode).toBe('spc');
    expect(parsedSpc?.keyVersion).toBe(2);
    expect(await CryptoService.decryptText(spcWire, roomKey)).toBe('Space v2 msg');

    const grpWire = await CryptoService.encryptText('Squad v3 msg', roomKey, 'grp', 3);
    expect(grpWire.startsWith(`${E2EE_V2_PREFIX}grp.3:`)).toBe(true);
    const parsedGrp = CryptoService.parseEnvelope(grpWire);
    expect(parsedGrp?.mode).toBe('grp');
    expect(parsedGrp?.keyVersion).toBe(3);

    expect(CryptoService.parseEnvelope(`${E2EE_V2_PREFIX}spc.0:iv:ct`)).toBeNull();
    expect(CryptoService.parseEnvelope(`${E2EE_V2_PREFIX}spc.abc:iv:ct`)).toBeNull();

    const wrapped = await CryptoService.wrapRoomKeyForPeer(roomKeyRaw, alicePriv, bobPub, 'spc:room-1:v2');
    const unwrapped = await CryptoService.unwrapRoomKeyRawFromPeer(wrapped, bobPriv, alicePub, 'spc:room-1:v2');
    expect(unwrapped.rawB64).toBe(roomKeyRaw);
    expect(await CryptoService.decryptText(spcWire, unwrapped.key)).toBe('Space v2 msg');
  });
});

