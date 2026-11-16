/**
 * Importa i dati di mercato incollati dall'autore (testo copiato da una pagina di Amazon).
 * L'IA estrae SOLO ciò che è scritto nel testo; i segnali sono calcolati con le stesse regole dei dati Keepa.
 * Nessun accesso automatico ad Amazon: l'autore guarda la pagina e copia il testo.
 */
import type { MarketTextOutput } from '../ai/schemas';
import { callAi, type DoneEvent } from '../client-api';
import type { MarketBook } from '../providers/keepa';
import type { Marketplace, Niche } from '../types';
import { nowIso } from '../utils';
import { applyMarketData, marketSignals } from './market';

const orNull = (n: number) => (Number.isFinite(n) && n > 0 ? n : null);

export function booksFromExtraction(out: MarketTextOutput): MarketBook[] {
  return out.books
    .filter((b) => b.title.trim().length > 1)
    .slice(0, 20)
    .map((b, i) => ({
      asin: /^[A-Z0-9]{10}$/i.test(b.asin.trim()) ? b.asin.trim().toUpperCase() : `incollato-${i + 1}`,
      title: b.title.trim().slice(0, 300),
      imageUrl: null,
      bsr: orNull(b.bsr),
      price: orNull(b.price),
      rating: b.rating > 0 && b.rating <= 5 ? b.rating : null,
      reviews: b.reviews >= 0 ? b.reviews : null,
      pages: orNull(b.pages),
      publishedYear: null,
      monthlySold: orNull(b.boughtLastMonth),
    }));
}

export async function extractBooksFromText(text: string, marketplace: Marketplace, language: string, opts: { token: string | null; budgetUsd: number }): Promise<{ books: MarketBook[]; notes: string; done: DoneEvent }> {
  const done = await callAi({ task: 'marketText', input: { text: text.trim().slice(0, 20000), marketplace, language: language.slice(0, 200) }, projectId: null, spentUsd: 0, budgetUsd: opts.budgetUsd }, { token: opts.token });
  const out = done.data as MarketTextOutput;
  return { books: booksFromExtraction(out), notes: out.notes.trim(), done };
}

/** Applica i libri estratti alla nicchia (concorrenti non verificati + segnali «Importato» dichiarati come incollati dall'utente). */
export function applyPasted(niche: Niche, books: MarketBook[]): Niche {
  const now = nowIso();
  const source = `Dati incollati dall'autore da Amazon (${niche.marketplace}, ${now.slice(0, 10)}), estratti con IA: primi ${books.length} libri`;
  return applyMarketData(niche, { books, signals: marketSignals(books, niche.marketplace, source, now) });
}
