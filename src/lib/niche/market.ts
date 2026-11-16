/**
 * Dai libri trovati su Amazon (via Keepa) ai segnali della nicchia. Funzioni pure.
 * ATTENZIONE: il Sales Rank è un indicatore indiretto di vendite, non un guadagno: le soglie sono euristiche dichiarate,
 * pensate per il confronto tra nicchie, non per prevedere vendite. Le metodologie sono scritte nei segnali stessi.
 */
import { paperbackRoyalty } from '../kdp/royalty';
import type { Marketplace, Metric, SignalKey } from '../types';
import type { MarketBook } from '../providers/keepa';

/** Fattore che rende comparabili le classifiche dei mercati più piccoli con quelle di amazon.com (euristica). */
const RANK_SCALE: Record<Marketplace, number> = { 'amazon.com': 1, 'amazon.co.uk': 0.35, 'amazon.de': 0.3, 'amazon.fr': 0.15, 'amazon.it': 0.1, 'amazon.es': 0.1 };

function median(v: number[]): number | null {
  const a = v.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Interpolazione lineare su una tabella (x crescente → y). */
function curve(x: number, pts: [number, number][]): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

export interface MarketSummary {
  count: number;
  medianBsr: number | null;
  medianReviews: number | null;
  shareOver500Reviews: number | null;
  medianPrice: number | null;
  medianPages: number | null;
}

export function summarizeMarket(books: MarketBook[]): MarketSummary {
  const num = (f: (b: MarketBook) => number | null) => books.map(f).filter((n): n is number => n !== null);
  const reviews = num((b) => b.reviews);
  return {
    count: books.length,
    medianBsr: median(num((b) => b.bsr)),
    medianReviews: median(reviews),
    shareOver500Reviews: reviews.length ? reviews.filter((r) => r > 500).length / reviews.length : null,
    medianPrice: median(num((b) => b.price)),
    medianPages: median(num((b) => b.pages)),
  };
}

/** Segnali ricavabili dai dati: domanda, competizione, economia. Trend e differenziazione restano alla stima IA o all'utente. */
export function marketSignals(books: MarketBook[], marketplace: Marketplace, source: string, observedAt: string): Partial<Record<SignalKey, Metric>> {
  const s = summarizeMarket(books);
  const out: Partial<Record<SignalKey, Metric>> = {};
  const metric = (value: number, methodology: string): Metric => ({ value: clamp(value), unit: 'punti 0-100', status: 'imported', source, observedAt, sampleSize: s.count, methodology });

  const sold = books.map((b) => b.monthlySold).filter((n): n is number => n !== null);
  if (s.medianBsr === null && sold.length) {
    const top = median(sold) as number;
    const v = curve(Math.log10(Math.max(1, top)), [[1.0, 22], [2.0, 50], [3.0, 78], [3.7, 93]]);
    out.demand = metric(v, `Mediana degli «acquistati nell'ultimo mese» dichiarati da Amazon su ${sold.length} libri = ${Math.round(top).toLocaleString('it-IT')} (Amazon li indica a fasce, es. «100+»; non tutti i libri lo mostrano).`);
  }
  if (s.medianBsr !== null) {
    const equiv = s.medianBsr / RANK_SCALE[marketplace]; // classifica «equivalente amazon.com»
    const v = curve(Math.log10(Math.max(1, equiv)), [[3.7, 95], [4.3, 82], [4.7, 68], [5.0, 55], [5.5, 35], [6.0, 15]]);
    out.demand = metric(v, `Sales Rank mediano dei primi ${s.count} risultati = ${Math.round(s.medianBsr).toLocaleString('it-IT')} (indicatore indiretto di vendite; soglie euristiche, scala mercato ×${RANK_SCALE[marketplace]}).`);
  }
  if (s.medianReviews !== null) {
    const v = curve(Math.log10(Math.max(1, s.medianReviews)), [[0.7, 15], [1.5, 30], [2.0, 48], [2.5, 68], [3.0, 85], [3.5, 95]]);
    const share = s.shareOver500Reviews === null ? '' : ` ${Math.round(s.shareOver500Reviews * 100)}% dei libri ha più di 500 recensioni.`;
    out.competition = metric(v, `Recensioni mediane dei primi ${s.count} risultati = ${Math.round(s.medianReviews).toLocaleString('it-IT')}: più recensioni = barriera d'ingresso più alta.${share}`);
  }
  if (s.medianPrice !== null) {
    const pages = s.medianPages ?? 150;
    try {
      const r = paperbackRoyalty({ listPrice: s.medianPrice, marketplace, pageCount: Math.max(24, Math.round(pages)) });
      const ratio = s.medianPrice > 0 ? r.royalty / s.medianPrice : 0;
      out.unitEconomics = metric(curve(ratio, [[0, 0], [0.1, 25], [0.25, 55], [0.4, 80], [0.5, 95]]), `Prezzo mediano ${s.medianPrice.toFixed(2)} e ~${Math.round(pages)} pagine → royalty stimata ${r.royalty.toFixed(2)} per copia cartacea (${Math.round(ratio * 100)}% del prezzo; costo di stampa ${r.printingCostVerified ? 'verificato' : 'indicativo'}), prima di Ads e imposte.`);
    } catch {
      /* prezzo non valido: segnale omesso */
    }
  }
  return out;
}

/** Applica i dati reali (Keepa) a una nicchia: sostituisce segnali mancanti, stimati dall'IA o già importati; non tocca dati osservati o stimati a mano. */
export function applyMarketData(niche: import('../types').Niche, data: { books: MarketBook[]; signals: Partial<Record<SignalKey, Metric>> }): import('../types').Niche {
  const replaceable = new Set(['missing', 'ai_estimate', 'imported']);
  const signals = { ...niche.signals };
  for (const [key, metric] of Object.entries(data.signals) as [SignalKey, Metric][]) {
    if (replaceable.has(signals[key].status)) signals[key] = metric;
  }
  const keepaAsins = new Set(data.books.map((b) => b.asin));
  const manual = niche.competitors.filter((c) => !c.asin || !keepaAsins.has(c.asin));
  const fromKeepa = data.books.map((b) => ({
    title: b.title, asin: b.asin, ...(b.price !== null ? { price: b.price } : {}), ...(b.reviews !== null ? { reviews: b.reviews } : {}), ...(b.rating !== null ? { rating: b.rating } : {}),
    ...(b.bsr !== null ? { bsr: b.bsr } : {}), ...(b.pages !== null ? { pages: b.pages } : {}), ...(b.publishedYear !== null ? { publishedAt: `${b.publishedYear}-01-01T00:00:00.000Z` } : {}), verified: false,
  }));
  return { ...niche, signals, competitors: [...fromKeepa, ...manual].slice(0, 30), updatedAt: new Date().toISOString() };
}
