/**
 * Client-side secure key storage for TeemChat E2EE.
 * Uses IndexedDB when available, with safe fallback to localStorage for restricted environments.
 */

import { UserKeyPairExport } from '../services/cryptoService';

const DB_NAME = 'teemchat_e2ee_db';
const DB_VERSION = 1;
const STORE_NAME = 'key_pairs';

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class E2EEStorage {
  private static memoryCache = new Map<string, UserKeyPairExport>();

  static async saveKeyPair(userId: string, keyPair: UserKeyPairExport): Promise<void> {
    this.memoryCache.set(userId, keyPair);

    // Try IndexedDB first
    try {
      const db = await openIndexedDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put({ userId, ...keyPair, savedAt: Date.now() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return;
    } catch {
      // Fallback to localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem(`teem_e2ee_${userId}`, JSON.stringify(keyPair));
        } catch (err) {
          console.warn('[E2EEStorage] LocalStorage fallback failed:', err);
        }
      }
    }
  }

  static async getKeyPair(userId: string): Promise<UserKeyPairExport | null> {
    if (this.memoryCache.has(userId)) {
      return this.memoryCache.get(userId) || null;
    }

    // Try IndexedDB first
    try {
      const db = await openIndexedDb();
      const res = await new Promise<UserKeyPairExport | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(userId);
        req.onsuccess = () => {
          if (req.result) {
            resolve({
              publicKeySpki: req.result.publicKeySpki,
              privateKeyPkcs8: req.result.privateKeyPkcs8,
            });
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });

      if (res) {
        this.memoryCache.set(userId, res);
        return res;
      }
    } catch {
      // Fallback to localStorage
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(`teem_e2ee_${userId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.publicKeySpki && parsed.privateKeyPkcs8) {
            this.memoryCache.set(userId, parsed);
            return parsed;
          }
        }
      } catch (err) {
        console.warn('[E2EEStorage] Error reading from localStorage fallback:', err);
      }
    }

    return null;
  }

  static async clearKeyPair(userId: string): Promise<void> {
    this.memoryCache.delete(userId);

    try {
      const db = await openIndexedDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(userId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Fallback
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(`teem_e2ee_${userId}`);
      } catch {}
    }
  }
}

