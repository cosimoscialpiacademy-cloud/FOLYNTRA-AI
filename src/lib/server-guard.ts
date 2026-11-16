/** Autenticazione e limiti lato server per le route API. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { accessCodeConfigured, supabaseConfigured } from './ai/server';

export interface Caller {
  id: string;
  authenticated: boolean;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** IP del client: l'ultimo valore di x-forwarded-for è quello aggiunto dal proxy di fiducia (i precedenti sono falsificabili). */
export function clientIp(req: Request): string {
  const parts = req.headers.get('x-forwarded-for')?.split(',').map((p) => p.trim()).filter(Boolean);
  return parts?.at(-1) || 'locale';
}

function sha(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

export interface AccessState {
  /** true se il server richiede un codice di accesso (APP_ACCESS_CODE impostato, senza Supabase). */
  required: boolean;
  valid: boolean;
}

/** Controlla il codice di accesso inviato come Bearer. I tentativi errati sono limitati per IP. */
export function checkAccessCode(req: Request): AccessState {
  if (supabaseConfigured() || !accessCodeConfigured()) return { required: false, valid: true };
  const sent = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!sent) return { required: true, valid: false };
  const ok = timingSafeEqual(sha(sent), sha(process.env.APP_ACCESS_CODE!.trim()));
  if (!ok) rateLimit(`badcode:${clientIp(req)}`, 8, 10 * 60_000);
  return { required: true, valid: ok };
}

/** Con Supabase configurato serve un JWT valido; altrimenti codice di accesso (se impostato) o modalità locale. */
export async function requireCaller(req: Request): Promise<Caller> {
  if (!supabaseConfigured()) {
    const access = checkAccessCode(req);
    if (access.required && !access.valid) throw new HttpError(401, 'Codice di accesso mancante o errato.');
    return { id: `anon:${clientIp(req)}`, authenticated: access.required };
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
