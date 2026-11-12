/**
 * Archivio LOCALE su IndexedDB: i dati restano in questo browser/dispositivo.
 * È la modalità demo/uso personale quando Supabase non è configurato.
 */
import type { CollectionMap, CollectionName } from '../types';
import { COLLECTIONS, Emitter, type DataStore, type ListFilter } from './types';

const DB_NAME = 'folyntra-ai';
const DB_VERSION = 2;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Errore IndexedDB'));
  });
}

export class LocalStore implements DataStore {
  readonly mode = 'locale' as const;
  private emitter = new Emitter();
  private dbPromise: Promise<IDBDatabase> | null = null;
  private channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('folyntra-ai') : null;

  constructor() {
    this.channel?.addEventListener('message', (e) => this.emitter.emit(e.data as CollectionName));
  }

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        for (const c of COLLECTIONS) {
          if (!open.result.objectStoreNames.contains(c)) {
            const os = open.result.createObjectStore(c, { keyPath: 'id' });
            os.createIndex('projectId', 'projectId', { unique: false });
          }
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('IndexedDB non disponibile'));
    });
    return this.dbPromise;
  }

  private changed(c: CollectionName): void {
    this.emitter.emit(c);
    this.channel?.postMessage(c);
  }

  async list<K extends CollectionName>(collection: K, filter?: ListFilter): Promise<CollectionMap[K][]> {
    const os = (await this.db()).transaction(collection, 'readonly').objectStore(collection);
    return filter?.projectId ? req(os.index('projectId').getAll(filter.projectId)) : req(os.getAll());
  }
  async get<K extends CollectionName>(collection: K, id: string): Promise<CollectionMap[K] | null> {
    const os = (await this.db()).transaction(collection, 'readonly').objectStore(collection);
    return (await req(os.get(id))) ?? null;
  }
  async put<K extends CollectionName>(collection: K, doc: CollectionMap[K]): Promise<void> {
    const os = (await this.db()).transaction(collection, 'readwrite').objectStore(collection);
    await req(os.put(doc));
    this.changed(collection);
  }
  async remove<K extends CollectionName>(collection: K, id: string): Promise<void> {
    const os = (await this.db()).transaction(collection, 'readwrite').objectStore(collection);
    await req(os.delete(id));
    this.changed(collection);
  }
  subscribe(listener: (c: CollectionName) => void): () => void {
    return this.emitter.subscribe(listener);
  }
}
