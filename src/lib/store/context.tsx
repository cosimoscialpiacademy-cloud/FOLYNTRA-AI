'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchStatus, type ServerStatus } from '../client-api';
import type { CollectionMap, CollectionName } from '../types';
import { LocalStore } from './local';
import { MemoryStore } from './memory';
import { SupabaseStore } from './supabase';
import type { DataStore } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON);
const ACCESS_KEY = 'folyntra.access-code';

interface AppContext {
  store: DataStore | null;
  mode: 'locale' | 'supabase';
  /** In modalità Supabase: null finché l'utente non accede. */
  userEmail: string | null;
  authReady: boolean;
  status: ServerStatus | null;
  getToken(): Promise<string | null>;
  /** Modalità senza Supabase: verifica e ricorda il codice di accesso del server. Restituisce false se errato. */
  unlock(code: string): Promise<boolean>;
  lock(): void;
  signIn(email: string, password: string): Promise<string | null>;
  signUp(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AppContext | null>(null);

let supabaseSingleton: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  supabaseSingleton ??= createClient(SUPABASE_URL, SUPABASE_ANON);
  return supabaseSingleton;
}

function createLocalStore(): DataStore {
  try {
    if (typeof indexedDB !== 'undefined') return new LocalStore();
  } catch {
    /* ripiego sotto */
  }
  return new MemoryStore();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<DataStore | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const accessCode = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    try {
      accessCode.current = window.localStorage.getItem(ACCESS_KEY);
    } catch {
      accessCode.current = null; // storage bloccato: il codice andrà reinserito a ogni visita
    }
    fetchStatus(accessCode.current).then((s) => active && setStatus(s)).catch(() => undefined);
    if (!SUPABASE_ENABLED) {
      queueMicrotask(() => {
        if (!active) return;
        setStore(createLocalStore());
        setAuthReady(true);
      });
      return () => { active = false; };
    }
    const client = supabase();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserEmail(session?.user.email ?? null);
      setStore(session ? new SupabaseStore(client, session.user.id) : null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const getToken = useCallback(async () => {
    if (!SUPABASE_ENABLED) return accessCode.current;
    return (await supabase().auth.getSession()).data.session?.access_token ?? null;
  }, []);
  const unlock = useCallback(async (code: string) => {
    const s = await fetchStatus(code.trim());
    setStatus(s);
    if (!s.access.valid) return false;
    accessCode.current = code.trim();
    try {
      window.localStorage.setItem(ACCESS_KEY, code.trim());
    } catch {
      /* non persistente: va bene */
    }
    return true;
  }, []);
  const lock = useCallback(() => {
    accessCode.current = null;
    try {
      window.localStorage.removeItem(ACCESS_KEY);
    } catch {
      /* niente da fare */
    }
    fetchStatus(null).then(setStatus).catch(() => undefined);
  }, []);
  const signIn = useCallback(async (email: string, password: string) => (await supabase().auth.signInWithPassword({ email, password })).error?.message ?? null, []);
  const signUp = useCallback(async (email: string, password: string) => (await supabase().auth.signUp({ email, password })).error?.message ?? null, []);
  const signOut = useCallback(async () => {
    if (SUPABASE_ENABLED) await supabase().auth.signOut();
  }, []);

  const value = useMemo<AppContext>(
    () => ({ store, mode: SUPABASE_ENABLED ? 'supabase' : 'locale', userEmail, authReady, status, getToken, unlock, lock, signIn, signUp, signOut }),
    [store, userEmail, authReady, status, getToken, unlock, lock, signIn, signUp, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider mancante');
  return v;
}

/** Store garantito: da usare solo sotto <AuthGate>. */
export function useStore(): DataStore {
  const { store } = useApp();
  if (!store) throw new Error('Archivio non disponibile');
  return store;
}

/** Elenco reattivo di una collezione (si aggiorna a ogni scrittura). */
export function useLive<K extends CollectionName>(collection: K, projectId?: string): { data: CollectionMap[K][]; loading: boolean; error: string | null } {
  const store = useStore();
  const [state, setState] = useState<{ data: CollectionMap[K][]; loading: boolean; error: string | null }>({ data: [], loading: true, error: null });
  const seq = useRef(0);
  useEffect(() => {
    let active = true;
    const load = () => {
      const n = ++seq.current;
      store
        .list(collection, projectId ? { projectId } : undefined)
        .then((data) => active && n === seq.current && setState({ data, loading: false, error: null }))
        .catch((e: unknown) => active && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Errore di lettura' })));
    };
    load();
    const off = store.subscribe((c) => c === collection && load());
    return () => {
      active = false;
      off();
    };
  }, [store, collection, projectId]);
  return state;
}
