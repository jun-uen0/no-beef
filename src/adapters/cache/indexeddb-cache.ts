import type { CachePort } from '../../core/ports';
import type { Verdict } from '../../core/types';

const DB_NAME = 'nobeef';
const STORE_NAME = 'verdicts';
const DB_VERSION = 1;

/**
 * L2 cache backed by plain IndexedDB (no external dependency, per ADR 0002 —
 * verdicts never leave the device). `namespace` is prefixed onto every key so
 * a lexicon or model version bump can invalidate all old entries by simply
 * switching namespaces, without needing a schema migration.
 *
 * get/set never throw: on any IndexedDB failure they resolve to
 * undefined/void so callers (LayeredCache, AnalysisPipeline) degrade
 * gracefully, matching MemoryCache's contract.
 */
export class IndexedDbCache implements CachePort {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly namespace: string = 'v1') {}

  async get(key: string): Promise<Verdict | undefined> {
    try {
      const db = await this.open();
      return await new Promise<Verdict | undefined>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(this.namespacedKey(key));
        request.onsuccess = () => resolve((request.result as Verdict | undefined) ?? undefined);
        request.onerror = () => resolve(undefined);
      });
    } catch {
      return undefined;
    }
  }

  async set(key: string, verdict: Verdict): Promise<void> {
    try {
      const db = await this.open();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(verdict, this.namespacedKey(key));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // Best-effort cache: swallow and let the caller proceed without it.
    }
  }

  private namespacedKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      // Allow a later call to retry opening instead of being stuck on a failure.
      this.dbPromise.catch(() => {
        this.dbPromise = null;
      });
    }
    return this.dbPromise;
  }
}
