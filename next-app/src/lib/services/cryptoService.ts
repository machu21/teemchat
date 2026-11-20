/**
 * Web Crypto API End-to-End Encryption (E2EE) Service for TeemChat.
 *
 * Cryptographic Specifications:
 * - Asymmetric Key Exchange: ECDH (P-256 / prime256v1)
 * - Symmetric Encryption: AES-256-GCM (96-bit random IV, 128-bit auth tag)
 * - Key Derivation: HKDF-SHA-256 for conversation/room keys; PBKDF2-SHA-256 for zero-knowledge key backup
 * - Wire Protocol Envelopes:
 *   - v1 (legacy): e2ee:v1:<iv_b64>:<ciphertext_b64>
 *   - v2 (tagged): e2ee:v2:<mode>:<iv_b64>:<ciphertext_b64>  where mode in ('ecdh' | 'base' | 'grp' | 'spc')
 */

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function sliceArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle =
    typeof window !== 'undefined'
      ? window.crypto?.subtle || globalThis.crypto?.subtle
      : globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not supported in this runtime.');
  }
  return subtle;
}

function getRandomValues(array: Uint8Array): Uint8Array {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(array);
  }
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(array);
  }
  if (typeof Buffer !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cryptoNode = require('crypto');
    const bytes = cryptoNode.randomBytes(array.length);
    array.set(bytes);
    return array;
  }
  throw new Error('No secure random number generator available.');
}

/**
 * PBKDF2-HMAC-SHA256 work factor for key backups. New backups use OWASP's current
 * recommendation (600k) and record it in the stored salt as `p<iterations>:<base64>`;
 * backups written before that carry a bare salt and were made with 100k.
 */
export const PBKDF2_ITERATIONS = 600_000;
export const LEGACY_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 5_000_000;

export function encodeBackupSalt(salt: Uint8Array, iterations: number = PBKDF2_ITERATIONS): string {
  return `p${iterations}:${bufferToBase64(salt)}`;
}

export function decodeBackupSalt(stored: string): { salt: Uint8Array; iterations: number } {
  const match = /^p(\d{1,7}):(.+)$/.exec(stored);
  if (!match) return { salt: base64ToBuffer(stored), iterations: LEGACY_PBKDF2_ITERATIONS };
  const iterations = Number(match[1]);
  if (iterations < LEGACY_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    // Refuse a downgraded or absurd work factor rather than silently trusting it.
    throw new Error('Unsupported key backup format.');
  }
  return { salt: base64ToBuffer(match[2]), iterations };
}

async function derivePbkdf2WrapKey(
  passphraseOrPin: string,
  salt: Uint8Array,
  usage: 'encrypt' | 'decrypt',
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphraseOrPin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: sliceArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    [usage]
  );
}

export interface UserKeyPairExport {
  publicKeySpki: string; // Base64 SPKI
  privateKeyPkcs8: string; // Base64 PKCS8
}

export interface EncryptedBackupPayload {
  encryptedPrivateKey: string;
  salt: string;
  iv: string;
}

export type E2EEMode = 'ecdh' | 'base' | 'grp' | 'spc';

export interface ParsedEnvelope {
  version: 1 | 2;
  mode?: E2EEMode;
  keyVersion?: number;
  ivB64: string;
  cipherB64: string;
}

export const E2EE_WIRE_PREFIX = 'e2ee:v1:';
export const E2EE_V2_PREFIX = 'e2ee:v2:';

const VALID_MODES = new Set<string>(['ecdh', 'base', 'grp', 'spc']);

export class CryptoService {
  /**
   * Generates a new P-256 ECDH keypair and exports public/private keys in Base64.
   */
  static async generateUserKeyPair(): Promise<UserKeyPairExport> {
    const subtle = getSubtleCrypto();
    const keyPair = await subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );

    const publicSpki = await subtle.exportKey('spki', keyPair.publicKey);
    const privatePkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      publicKeySpki: bufferToBase64(publicSpki),
      privateKeyPkcs8: bufferToBase64(privatePkcs8),
    };
  }

  /**
   * Imports a Base64 SPKI public key into a CryptoKey.
   */
  static async importPublicKey(spkiBase64: string): Promise<CryptoKey> {
    const subtle = getSubtleCrypto();
    const buffer = base64ToBuffer(spkiBase64);
    return subtle.importKey(
      'spki',
      sliceArrayBuffer(buffer),
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      []
    );
  }

  /**
   * Imports a Base64 PKCS8 private key into a CryptoKey.
   */
  static async importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
    const subtle = getSubtleCrypto();
    const buffer = base64ToBuffer(pkcs8Base64);
    return subtle.importKey(
      'pkcs8',
      sliceArrayBuffer(buffer),
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      false,
      ['deriveKey', 'deriveBits']
    );
  }

  /**
   * Generates a random 256-bit AES-GCM symmetric key for multi-party room/squad encryption.
   */
  static async generateRoomKey(): Promise<CryptoKey> {
    const subtle = getSubtleCrypto();
    return subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Exports a symmetric AES-256-GCM room key as Base64 raw bytes.
   */
  static async exportRoomKeyRaw(key: CryptoKey): Promise<string> {
    const subtle = getSubtleCrypto();
    const raw = await subtle.exportKey('raw', key);
    return bufferToBase64(raw);
  }

  /**
   * Imports a Base64 raw symmetric AES-256-GCM room key as a non-extractable CryptoKey.
   */
  static async importRoomKeyRaw(rawBase64: string): Promise<CryptoKey> {
    const subtle = getSubtleCrypto();
    const buffer = base64ToBuffer(rawBase64);
    return subtle.importKey(
      'raw',
      sliceArrayBuffer(buffer),
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Derives a deterministic AES-256-GCM key via HKDF-SHA-256 from secret material and context salt/info.
   */
  static async deriveDeterministicKey(
    secretMaterial: string,
    salt: string,
    info = 'teemchat-aes-256-gcm-v1',
    usages: Array<'encrypt' | 'decrypt'> = ['encrypt', 'decrypt']
  ): Promise<CryptoKey> {
    const subtle = getSubtleCrypto();
    const baseKey = await subtle.importKey(
      'raw',
      new TextEncoder().encode(secretMaterial),
      'HKDF',
      false,
      ['deriveKey']
    );

    return subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(salt),
        info: new TextEncoder().encode(info),
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      usages
    );
  }

  /**
   * Derives an authenticated AES-256-GCM symmetric session key from local private key and peer's public key.
   */
  static async derivePairwiseKey(
    myPrivateKey: CryptoKey,
    peerPublicKey: CryptoKey,
    contextId = 'teemchat-dm'
  ): Promise<CryptoKey> {
    const subtle = getSubtleCrypto();

    const sharedBits = await subtle.deriveBits(
      {
        name: 'ECDH',
        public: peerPublicKey,
      },
      myPrivateKey,
      256
    );

    const masterKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

    return subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(contextId),
        info: new TextEncoder().encode('teemchat-aes-256-gcm-v1'),
      },
      masterKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Wraps a symmetric room key (Base64 raw) for a specific peer using pairwise ECDH.
   */
  static async wrapRoomKeyForPeer(
    roomKeyRawB64: string,
    myPrivateKey: CryptoKey,
    peerPublicKey: CryptoKey,
    contextId: string
  ): Promise<string> {
    const wrapKey = await this.derivePairwiseKey(myPrivateKey, peerPublicKey, contextId);
    return this.encryptText(roomKeyRawB64, wrapKey, 'ecdh');
  }

  /**
   * Unwraps a symmetric room key received from a peer via pairwise ECDH and returns both key and raw Base64.
   */
  static async unwrapRoomKeyRawFromPeer(
    wrappedPayload: string,
    myPrivateKey: CryptoKey,
    senderPublicKey: CryptoKey,
    contextId: string
  ): Promise<{ key: CryptoKey; rawB64: string }> {
    const wrapKey = await this.derivePairwiseKey(myPrivateKey, senderPublicKey, contextId);
    const roomKeyRawB64 = await this.decryptText(wrappedPayload, wrapKey);
    if (!roomKeyRawB64 || roomKeyRawB64.includes('could not be decrypted')) {
      throw new Error('Could not unwrap room encryption key.');
    }
    const key = await this.importRoomKeyRaw(roomKeyRawB64);
    return { key, rawB64: roomKeyRawB64 };
  }

  /**
   * Unwraps a symmetric room key received from a peer via pairwise ECDH.
   */
  static async unwrapRoomKeyFromPeer(
    wrappedPayload: string,
    myPrivateKey: CryptoKey,
    senderPublicKey: CryptoKey,
    contextId: string
  ): Promise<CryptoKey> {
    const { key } = await this.unwrapRoomKeyRawFromPeer(wrappedPayload, myPrivateKey, senderPublicKey, contextId);
    return key;
  }

  /**
   * Parses a v1 or v2 E2EE wire envelope. Returns null if the string is plaintext.
   */
  static parseEnvelope(content: string): ParsedEnvelope | null {
    if (typeof content !== 'string') return null;

    if (content.startsWith(E2EE_V2_PREFIX)) {
      const rest = content.slice(E2EE_V2_PREFIX.length);
      const firstColon = rest.indexOf(':');
      if (firstColon === -1) return null;
      const modeToken = rest.slice(0, firstColon);
      const dotIdx = modeToken.indexOf('.');
      const mode = dotIdx === -1 ? modeToken : modeToken.slice(0, dotIdx);
      if (!VALID_MODES.has(mode)) return null;

      let keyVersion = 1;
      if (dotIdx !== -1) {
        const parsedVer = Number(modeToken.slice(dotIdx + 1));
        if (!Number.isInteger(parsedVer) || parsedVer < 1) return null;
        keyVersion = parsedVer;
      }

      const tail = rest.slice(firstColon + 1);
      const secondColon = tail.indexOf(':');
      if (secondColon === -1) return null;
      return {
        version: 2,
        mode: mode as E2EEMode,
        keyVersion,
        ivB64: tail.slice(0, secondColon),
        cipherB64: tail.slice(secondColon + 1),
      };
    }

    if (content.startsWith(E2EE_WIRE_PREFIX)) {
      const rest = content.slice(E2EE_WIRE_PREFIX.length);
      const colonIdx = rest.indexOf(':');
      if (colonIdx === -1) return null;
      return {
        version: 1,
        ivB64: rest.slice(0, colonIdx),
        cipherB64: rest.slice(colonIdx + 1),
      };
    }

    return null;
  }

  /**
   * Checks whether a message content string is packaged inside an E2EE envelope (v1 or v2).
   */
  static isEncrypted(content: string): boolean {
    return this.parseEnvelope(content) !== null;
  }

  /**
   * Encrypts plaintext using AES-256-GCM and returns a wire envelope string.
   * When `mode` is provided, emits `e2ee:v2:<mode>[.<version>]:<iv>:<ct>`; otherwise emits `e2ee:v1:<iv>:<ct>`.
   */
  static async encryptText(
    plainText: string,
    aesKey: CryptoKey,
    mode?: E2EEMode,
    keyVersion?: number
  ): Promise<string> {
    const subtle = getSubtleCrypto();
    const iv = getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);

    const ciphertextBuffer = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: sliceArrayBuffer(iv),
      },
      aesKey,
      encoded
    );

    const ivB64 = bufferToBase64(iv);
    const cipherB64 = bufferToBase64(ciphertextBuffer);

    if (!mode) {
      return `${E2EE_WIRE_PREFIX}${ivB64}:${cipherB64}`;
    }
    const modeTag = keyVersion && keyVersion > 1 ? `${mode}.${keyVersion}` : mode;
    return `${E2EE_V2_PREFIX}${modeTag}:${ivB64}:${cipherB64}`;
  }

  /**
   * Decrypts an E2EE wire envelope string (v1 or v2).
   * If the content is not encrypted (e.g. legacy plaintext), returns it untouched.
   */
  static async decryptText(envelopeOrPlain: string, aesKey: CryptoKey): Promise<string> {
    const parsed = this.parseEnvelope(envelopeOrPlain);
    if (!parsed) {
      return envelopeOrPlain;
    }

    try {
      const subtle = getSubtleCrypto();
      const iv = base64ToBuffer(parsed.ivB64);
      const cipher = base64ToBuffer(parsed.cipherB64);

      const decrypted = await subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: sliceArrayBuffer(iv),
        },
        aesKey,
        sliceArrayBuffer(cipher)
      );

      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.warn('[E2EE] Decryption failed (invalid key or tampered ciphertext):', e);
      return '[Encrypted message could not be decrypted]';
    }
  }

  /**
   * Zero-Knowledge Key Backup: Wraps a private key string with a key derived from password/PIN using PBKDF2.
   */
  static async wrapPrivateKey(
    privateKeyPkcs8: string,
    passphraseOrPin: string
  ): Promise<EncryptedBackupPayload> {
    const subtle = getSubtleCrypto();
    const salt = getRandomValues(new Uint8Array(16));
    const iv = getRandomValues(new Uint8Array(12));
    const wrapKey = await derivePbkdf2WrapKey(passphraseOrPin, salt, 'encrypt');

    const cipher = await subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: sliceArrayBuffer(iv),
      },
      wrapKey,
      new TextEncoder().encode(privateKeyPkcs8)
    );

    return {
      encryptedPrivateKey: bufferToBase64(cipher),
      salt: encodeBackupSalt(salt),
      iv: bufferToBase64(iv),
    };
  }

  /**
   * Zero-Knowledge Key Restore: Unwraps a backed-up private key using the user's password/PIN.
   */
  static async unwrapPrivateKey(
    backup: EncryptedBackupPayload,
    passphraseOrPin: string
  ): Promise<string> {
    const subtle = getSubtleCrypto();
    const { salt, iterations } = decodeBackupSalt(backup.salt);
    const iv = base64ToBuffer(backup.iv);
    const cipher = base64ToBuffer(backup.encryptedPrivateKey);
    const wrapKey = await derivePbkdf2WrapKey(passphraseOrPin, salt, 'decrypt', iterations);

    const decrypted = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: sliceArrayBuffer(iv),
      },
      wrapKey,
      sliceArrayBuffer(cipher)
    );

    return new TextDecoder().decode(decrypted);
  }

  /**
   * Computes a user-friendly public key fingerprint string (e.g. for safety verification).
   */
  static async computeFingerprint(publicKeySpki: string): Promise<string> {
    const subtle = getSubtleCrypto();
    const buffer = base64ToBuffer(publicKeySpki);
    const hash = await subtle.digest('SHA-256', sliceArrayBuffer(buffer));
    const hex = Array.from(new Uint8Array(hash))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');

    // Format into 4-character blocks: XXXX-XXXX-XXXX-XXXX
    return hex.match(/.{1,4}/g)?.join('-') || hex;
  }
}
