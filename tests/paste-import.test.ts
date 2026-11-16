import { describe, expect, it } from 'vitest';
import { AiRequest, type MarketTextOutput } from '../src/lib/ai/schemas';
import { runAi } from '../src/lib/ai/server';
import { applyPasted, booksFromExtraction } from '../src/lib/niche/paste-import';
import { marketSignals } from '../src/lib/niche/market';
import { emptySignals, evaluateNiche } from '../src/lib/niche/engine';
import type { Niche } from '../src/lib/types';

const out = (books: Partial<MarketTextOutput['books'][number]>[]): MarketTextOutput => ({
  books: books.map((b) => ({ title: 'Titolo', asin: '', price: -1, rating: -1, reviews: -1, boughtLastMonth: -1, pages: -1, bsr: -1, ...b })),
  notes: '',
});
const niche = (): Niche => ({ id: 'n', keyword: 'orto sul balcone', buyerPersona: '', marketplace: 'amazon.it', category: '', status: 'hypothesis', demoOnly: false, signals: emptySignals(), competitors: [], secondaryKeywords: [], differentiationIdeas: [], risks: [], commentary: '', riskAccepted: false, createdAt: 'x', updatedAt: 'x' });

describe('dati incollati da Amazon', () => {
  it('converte i valori «non presente» (-1, vuoto) in null e valida l’ASIN', () => {
    const books = booksFromExtraction(out([{ title: 'Orto facile', asin: 'b0abc12345', price: 12.99, rating: 4.5, reviews: 1234, boughtLastMonth: 100 }, { title: '  ' }, { title: 'Senza dati', asin: 'xx' }]));
    expect(books).toHaveLength(2);
    expect(books[0]).toMatchObject({ asin: 'B0ABC12345', price: 12.99, rating: 4.5, reviews: 1234, monthlySold: 100, bsr: null, pages: null });
    expect(books[1]).toMatchObject({ asin: 'incollato-2', price: null, rating: null, reviews: null, monthlySold: null });
  });

  it('senza classifica, la domanda si ricava dagli «acquistati nell’ultimo mese» e cresce con essi', () => {
    const mk = (n: number) => booksFromExtraction(out([{ title: 'Libro uno', boughtLastMonth: n, reviews: 100, price: 14 }, { title: 'Libro due', boughtLastMonth: n, reviews: 100, price: 14 }]));
    const low = marketSignals(mk(50), 'amazon.it', 's', 'x').demand!;
    const high = marketSignals(mk(2000), 'amazon.it', 's', 'x').demand!;
    expect(high.value!).toBeGreaterThan(low.value!);
    expect(low.methodology).toMatch(/acquistati nell'ultimo mese/);
    expect(marketSignals(booksFromExtraction(out([{ title: 'Libro uno', reviews: 10, price: 10 }])), 'amazon.it', 's', 'x').demand).toBeUndefined(); // nessun dato di domanda → nessun numero inventato
  });

  it('applicare: concorrenti non verificati e segnali «Importato» con fonte «incollati dall’autore»; l’affidabilità sale', () => {
    const books = booksFromExtraction(out([{ title: 'Libro uno', asin: 'B000000001', price: 12, reviews: 800, boughtLastMonth: 500, rating: 4.4 }, { title: 'Libro due', price: 15, reviews: 90, boughtLastMonth: 100, rating: 4.1 }]));
    const n = applyPasted(niche(), books);
    expect(n.competitors).toHaveLength(2);
    expect(n.competitors.every((c) => c.verified === false)).toBe(true);
    expect(n.signals.demand.status).toBe('imported');
    expect(n.signals.demand.source).toMatch(/incollati dall'autore/);
    expect(n.signals.competition.status).toBe('imported');
    expect(n.signals.trend.status).toBe('missing'); // il trend non si ricava: resta mancante
    expect(evaluateNiche(n).score).toBeNull(); // mancano ancora trend e differenziazione
  });

  it('con il mock l’estrazione NON inventa dati: errore chiaro', async () => {
    const req = AiRequest.parse({ task: 'marketText', input: { text: 'x'.repeat(60), marketplace: 'amazon.it', language: 'italiano' }, projectId: null, spentUsd: 0, budgetUsd: 5 });
    const ev = [];
    for await (const e of runAi(req, new AbortController().signal)) ev.push(e);
    expect(ev[0]).toMatchObject({ t: 'error', retryable: false });
    expect((ev[0] as { message: string }).message).toMatch(/non inventa dati di mercato/);
  });
});
