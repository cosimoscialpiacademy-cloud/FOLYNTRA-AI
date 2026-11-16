/**
 * SerpApi — Amazon Search API (servizio di terzi che legge la ricerca Amazon; piano gratuito limitato).
 * Documentazione: https://serpapi.com/amazon-search-api (campi e identificativi delle categorie verificati sul testo della
 * documentazione il 16/11/2026). NON ancora provato con una chiave reale. Solo server: la chiave non arriva mai al browser.
 * Nota: è un servizio di terzi che legge Amazon al posto nostro; l'uso è una scelta dell'autore (vedi docs/PROSSIMI-PASSI.md).
 */
import type { Marketplace } from '../types';
import { KeepaError, type MarketBook } from './keepa';

/** Nodo della categoria «Libri» per ogni mercato (lista ufficiale SerpApi «Amazon Category Nodes»). */
export const BOOKS_NODE: Record<Marketplace, string> = { 'amazon.com': '283155', 'amazon.co.uk': '266239', 'amazon.de': '186606', 'amazon.fr': '301061', 'amazon.it': '411663031', 'amazon.es': '599364031' };

export class SerpApiError extends KeepaError {}

export interface SerpOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  limit?: number;
}

interface RawResult {
  position?: number;
  asin?: string;
  sponsored?: boolean;
  title?: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
  bought_last_month?: string;
  extracted_price?: number;
}

/** «20K+ bought in past month», «Più di 1.000 acquistati nell'ultimo mese», «100+ …» → numero (a fasce: è il minimo dichiarato). */
export function parseBoughtLastMonth(text: string | undefined): number | null {
  if (!text) return null;
  const m = /(\d[\d.,]*)\s*([KkMm])?/.exec(text);
  if (!m) return null;
  let raw = m[1];
  let n: number;
  if (m[2]) {
    n = parseFloat(raw.replace(',', '.')) * (m[2].toLowerCase() === 'k' ? 1_000 : 1_000_000);
  } else {
    raw = raw.replace(/[.,](?=\d{3}(\D|$))/g, '');
    n = parseFloat(raw.replace(',', '.'));
  }
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function mapSerpResult(r: RawResult): MarketBook | null {
  if (r.sponsored === true) return null; // i risultati sponsorizzati non sono posizionamento organico
  if (!r.asin || !r.title) return null;
  return {
    asin: r.asin,
    title: r.title.replace(/\s+/g, ' ').trim(),
    imageUrl: r.thumbnail ?? null,
    bsr: null, // la ricerca restituisce già l'ordine «Best Sellers»: la posizione è il segnale
    price: typeof r.extracted_price === 'number' && r.extracted_price > 0 ? r.extracted_price : null,
    rating: typeof r.rating === 'number' && r.rating > 0 ? r.rating : null,
    // Amazon non mostra stelle né recensioni quando non ce ne sono: un libro così ha 0 recensioni (non «dato mancante»).
    reviews: typeof r.reviews === 'number' && r.reviews >= 0 ? r.reviews : r.rating === undefined ? 0 : null,
    pages: null,
    publishedYear: null,
    monthlySold: parseBoughtLastMonth(r.bought_last_month),
  };
}

/** Libri in testa alla classifica «Best Sellers» per la keyword, nella categoria Libri del mercato (1 ricerca = 1 credito SerpApi). */
export async function searchBestSellers(keyword: string, marketplace: Marketplace, opts: SerpOptions): Promise<{ books: MarketBook[] }> {
  const base = opts.baseUrl ?? 'https://serpapi.com';
  const f = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({ engine: 'amazon', k: keyword.trim(), amazon_domain: marketplace, rh: `n:${BOOKS_NODE[marketplace]}`, s: 'exact-aware-popularity-rank', api_key: opts.apiKey });
  let res: Response;
  try {
    res = await f(`${base}/search.json?${params.toString()}`, { signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new SerpApiError('SerpApi non raggiungibile o troppo lento: riprova.', 504, true);
  }
  if (res.status === 401 || res.status === 403) throw new SerpApiError('Chiave SerpApi non valida.', 401);
  if (res.status === 429) throw new SerpApiError('Limite di ricerche SerpApi raggiunto: attendi o passa a un piano superiore.', 429, true);
  let json: { error?: string; organic_results?: RawResult[] };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new SerpApiError(`SerpApi ha risposto in modo non valido (${res.status}).`, 502, res.status >= 500);
  }
  if (json.error) {
    if (/run out of searches|plan|limit/i.test(json.error)) throw new SerpApiError('Ricerche SerpApi esaurite per questo periodo.', 429);
    if (/hasn't returned any results|no results/i.test(json.error)) return { books: [] };
    throw new SerpApiError('SerpApi ha rifiutato la richiesta (controlla la chiave e la keyword).', 502);
  }
  if (!res.ok) throw new SerpApiError(`SerpApi ha risposto con errore ${res.status}.`, 502, res.status >= 500);
  const books = (json.organic_results ?? []).map(mapSerpResult).filter((b): b is MarketBook => b !== null);
  return { books: books.slice(0, opts.limit ?? 10) };
}
