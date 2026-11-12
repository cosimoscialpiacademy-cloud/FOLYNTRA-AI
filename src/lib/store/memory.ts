import type { CollectionMap, CollectionName } from '../types';
import { Emitter, projectIdOf, type DataStore, type ListFilter } from './types';

/** Archivio in memoria: usato nei test e come ripiego se IndexedDB non è disponibile. */
export class MemoryStore implements DataStore {
  readonly mode = 'locale' as const;
  private data = new Map<string, unknown>();
  private emitter = new Emitter();

  async list<K extends CollectionName>(collection: K, filter?: ListFilter): Promise<CollectionMap[K][]> {
    const out: CollectionMap[K][] = [];
    for (const [key, value] of this.data) {
      if (!key.startsWith(`${collection}:`)) continue;
      if (filter?.projectId && projectIdOf(value) !== filter.projectId) continue;
      out.push(structuredClone(value) as CollectionMap[K]);
    }
    return out;
  }
  async get<K extends CollectionName>(collection: K, id: string): Promise<CollectionMap[K] | null> {
    const v = this.data.get(`${collection}:${id}`);
    return v ? (structuredClone(v) as CollectionMap[K]) : null;
  }
  async put<K extends CollectionName>(collection: K, doc: CollectionMap[K]): Promise<void> {
    this.data.set(`${collection}:${doc.id}`, structuredClone(doc));
    this.emitter.emit(collection);
  }
  async remove<K extends CollectionName>(collection: K, id: string): Promise<void> {
    this.data.delete(`${collection}:${id}`);
    this.emitter.emit(collection);
  }
  subscribe(listener: (c: CollectionName) => void): () => void {
    return this.emitter.subscribe(listener);
  }
}
