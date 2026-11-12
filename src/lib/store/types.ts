import type { CollectionMap, CollectionName } from '../types';

export interface ListFilter {
  projectId?: string;
}

/** Archivio dati dell'app: stessa interfaccia per modalità locale e Supabase. */
export interface DataStore {
  readonly mode: 'locale' | 'supabase';
  list<K extends CollectionName>(collection: K, filter?: ListFilter): Promise<CollectionMap[K][]>;
  get<K extends CollectionName>(collection: K, id: string): Promise<CollectionMap[K] | null>;
  put<K extends CollectionName>(collection: K, doc: CollectionMap[K]): Promise<void>;
  remove<K extends CollectionName>(collection: K, id: string): Promise<void>;
  /** Notifica i cambiamenti (per collezione) alle viste aperte. */
  subscribe(listener: (collection: CollectionName) => void): () => void;
}

export const COLLECTIONS: CollectionName[] = ['niches', 'projects', 'chapters', 'revisions', 'jobs', 'costs', 'exports', 'activity'];

export class Emitter {
  private listeners = new Set<(c: CollectionName) => void>();
  subscribe(listener: (c: CollectionName) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(c: CollectionName): void {
    for (const l of this.listeners) l(c);
  }
}

export function projectIdOf(doc: unknown): string | null {
  const d = doc as { projectId?: string | null };
  return typeof d.projectId === 'string' ? d.projectId : null;
}
