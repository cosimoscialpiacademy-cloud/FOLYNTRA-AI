/** Autenticazione e limiti lato server per le route API. */
import { createClient } from '@supabase/supabase-js';
import { supabaseConfigured } from './ai/server';

export interface Caller {
  id: string;
  authenticated: boolean;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Con Supabase configurato serve un JWT valido; altrimenti l'app è in modalità locale. */
export async function requireCaller(req: Request): Promise<Caller> {
  if (!supabaseConfigured()) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'locale';
    return { id: `anon:${ip}`, authenticated: false };
  }
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Accesso richiesto.');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sessione non valida o scaduta.');
  return { id: data.user.id, authenticated: true };
}

const buckets = new Map<string, number[]>();

/** Limite a finestra scorrevole in memoria (per istanza): sufficiente per uso personale in Fase A. */
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) throw new HttpError(429, 'Troppe richieste: attendi qualche secondo e riprova.');
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
}

export function errorResponse(err: unknown, scope: string): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  console.error(`[${scope}]`, err instanceof Error ? `${err.name}: ${err.message}` : 'errore sconosciuto');
  return Response.json({ error: 'Errore interno. Riprova; se persiste controlla i log del server.' }, { status: 500 });
}
