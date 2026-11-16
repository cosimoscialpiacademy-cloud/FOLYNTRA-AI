/**
 * Keepa API (servizio a pagamento con API ufficiale): ricerca per keyword e dati di mercato di Amazon.
 * Documentazione: https://keepa.com/api-docs/product-search.html — formato verificato sul testo della documentazione (16/11/2026);
 * NON ancora provato con una chiave reale. Solo server: la chiave (KEEPA_API_KEY) non arriva mai al browser.
 * Nessuno scraping: si leggono solo i dati che Keepa fornisce via API.
 */
import type { Marketplace } from '../types';

export const KEEPA_DOMAIN: Record<Marketplace, number> = { 'amazon.com': 1, 'amazon.co.uk': 2, 'amazon.de': 3, 'amazon.fr': 4, 'amazon.it': 8, 'amazon.es': 9 };

export interface MarketBook {
  asin: string;
  title: string;
  imageUrl: string | null;
  /** Sales Rank attuale nella categoria principale (più basso = vende di più). */
  bsr: number | null;
  /** Prezzo attuale (unità di valuta, non centesimi). */
  price: number | null;
  rating: number | null;
  reviews: number | null;
  pages: number | null;
  publishedYear: number | null;
  /** «Acquistato nell'ultimo mese» dichiarato da Amazon (a fasce): spesso assente. */
  monthlySold: number | null;
}

export class KeepaError extends Error {
  constructor(message: string, readonly status: number, readonly retryable = false) {
    super(message);
  }
}

export interface KeepaOptions {
  apiKey: string;
  baseUrl?: string;
  imageBase?: string;
  fetchImpl?: typeof fetch;
  /** Quanti libri tenere (ordinati per Sales Rank). */
  limit?: number;
}

const IDX = { AMAZON: 0, NEW: 1, SALES: 3, RATING: 16, COUNT_REVIEWS: 17 } as const;
const BOOK_BINDING = /paperback|hardcover|kindle|copertina|brossura|taschenbuch|gebunden|broch|reli[eé]|tapa/i;
const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const pos = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

interface RawProduct {
  asin?: string;
  title?: string;
  images?: { l?: string; m?: string; variant?: string }[];
  numberOfPages?: number;
  binding?: string | null;
  publicationDate?: number;
  monthlySold?: number;
  stats?: { current?: number[] };
}

export function mapProduct(p: RawProduct, imageBase = 'https://m.media-amazon.com/images/I/'): MarketBook | null {
  if (!p.asin || !p.title) return null;
  // La ricerca Amazon restituisce anche prodotti che non sono libri: si tengono solo quelli con pagine o rilegatura da libro.
  if (!(typeof p.numberOfPages === 'number' && p.numberOfPages > 0) && !BOOK_BINDING.test(p.binding ?? '')) return null;
  const cur = p.stats?.current ?? [];
  const main = p.images?.find((i) => i.variant === 'MAIN') ?? p.images?.[0];
  const file = main?.l || main?.m;
  const priceCents = pos(cur[IDX.NEW]) ?? pos(cur[IDX.AMAZON]);
  const rating = typeof cur[IDX.RATING] === 'number' && cur[IDX.RATING] >= 0 ? cur[IDX.RATING] / 10 : null;
  const reviews = typeof cur[IDX.COUNT_REVIEWS] === 'number' && cur[IDX.COUNT_REVIEWS] >= 0 ? cur[IDX.COUNT_REVIEWS] : null;
  const d = pos(p.publicationDate); // YYYY, YYYYMM o YYYYMMDD
  const year = d === null ? null : d >= 10_000_000 ? Math.floor(d / 10_000) : d >= 100_000 ? Math.floor(d / 100) : d;
  return {
    asin: p.asin,
    title: stripHtml(p.title),
    imageUrl: file ? `${imageBase}${file}` : null,
    bsr: pos(cur[IDX.SALES]),
    price: priceCents ? Math.round(priceCents) / 100 : null,
    rating,
    reviews,
    pages: pos(p.numberOfPages),
    publishedYear: year && year > 1900 && year < 2100 ? year : null,
    monthlySold: pos(p.monthlySold),
  };
}

/** Cerca la keyword su Amazon (via Keepa) e restituisce i libri trovati, dal miglior Sales Rank. Costo: ~10-15 token Keepa. */
export async function searchTopBooks(keyword: string, marketplace: Marketplace, opts: KeepaOptions): Promise<{ books: MarketBook[]; tokensLeft: number | null }> {
  const base = opts.baseUrl ?? 'https://api.keepa.com';
  const f = opts.fetchImpl ?? fetch;
  const url = `${base}/search?key=${encodeURIComponent(opts.apiKey)}&domain=${KEEPA_DOMAIN[marketplace]}&type=product&term=${encodeURIComponent(keyword.trim())}&stats=90&rating=1`;
  let res: Response;
  try {
    res = await f(url, { signal: AbortSignal.timeout(45_000) });
  } catch {
    throw new KeepaError('Keepa non raggiungibile o troppo lento: riprova.', 504, true);
  }
  if (res.status === 401 || res.status === 403) throw new KeepaError('Chiave Keepa non valida o scaduta.', 401);
  if (res.status === 429) throw new KeepaError('Token Keepa esauriti: attendi il ricarico o passa a un piano superiore.', 429, true);
  if (!res.ok) throw new KeepaError(`Keepa ha risposto con errore ${res.status}.`, 502, res.status >= 500);
  const json = (await res.json()) as { products?: RawProduct[]; tokensLeft?: number; error?: { message?: string } };
  if (json.error) throw new KeepaError('Keepa ha rifiutato la richiesta (controlla chiave e token).', 502);
  const books = (json.products ?? []).map((p) => mapProduct(p, opts.imageBase)).filter((b): b is MarketBook => b !== null);
  books.sort((a, b) => (a.bsr ?? Number.MAX_SAFE_INTEGER) - (b.bsr ?? Number.MAX_SAFE_INTEGER));
  return { books: books.slice(0, opts.limit ?? 10), tokensLeft: typeof json.tokensLeft === 'number' ? json.tokensLeft : null };
}
