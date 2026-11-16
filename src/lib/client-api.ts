/** Chiamate dal browser alle route server (AI, export, stato). */
import type { AiEvent, AiRequest } from './ai/schemas';
import type { BookBundle } from './types';

export interface ServerStatus {
  access: { required: boolean; valid: boolean };
  ai: { mode: 'anthropic' | 'mock'; model: string; reason: string; maxUsdPerBook: number };
  supabase: boolean;
  renderer: boolean;
  epubcheck: boolean;
  providers: { keepa: boolean; googleTrends: boolean; amazonAds: boolean };
}

export type DoneEvent = Extract<AiEvent, { t: 'done' }>;

export class AiError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Errore ${res.status}`;
  } catch {
    return `Errore ${res.status}`;
  }
}

/** Esegue una richiesta AI in streaming NDJSON e restituisce l'evento finale. */
export async function callAi(req: AiRequest, opts: { token: string | null; signal?: AbortSignal; onDelta?: (text: string) => void }): Promise<DoneEvent> {
  let res: Response;
  try {
    res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(opts.token) }, body: JSON.stringify(req), signal: opts.signal });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new AiError('Connessione al server interrotta.', true);
  }
  if (!res.ok || !res.body) throw new AiError(await errorMessage(res), res.status === 429 || res.status >= 500);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: DoneEvent | null = null;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      throw new AiError('Stream interrotto prima della fine.', true);
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line) as AiEvent;
      if (event.t === 'delta') opts.onDelta?.(event.text);
      else if (event.t === 'error') throw new AiError(event.message, event.retryable);
      else done = event;
    }
  }
  if (!done) throw new AiError('Risposta incompleta dal server.', true);
  return done;
}

export interface ExportResponse {
  blob: Blob;
  fileName: string;
  pageCount: number;
  kdpReady: boolean;
}

export async function callExport(format: 'kit' | 'interior', bundle: BookBundle, token: string | null): Promise<ExportResponse> {
  const res = await fetch('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(token) }, body: JSON.stringify({ format, bundle }) });
  if (!res.ok) throw new Error(await errorMessage(res));
  return {
    blob: await res.blob(),
    fileName: decodeURIComponent(res.headers.get('X-Folyntra-Filename') ?? (format === 'kit' ? 'kdp-kit.zip' : 'manuscript.pdf')),
    pageCount: Number(res.headers.get('X-Folyntra-Pages') ?? '0'),
    kdpReady: res.headers.get('X-Folyntra-Ready') === '1',
  };
}

export async function fetchStatus(token: string | null = null): Promise<ServerStatus> {
  const res = await fetch('/api/status', { cache: 'no-store', headers: authHeaders(token) });
  if (!res.ok) throw new Error('Stato del server non disponibile');
  return (await res.json()) as ServerStatus;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
