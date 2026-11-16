import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '../src/app/api/market/route';
import { applyMarketData, marketSignals, summarizeMarket } from '../src/lib/niche/market';
import { emptySignals, evaluateNiche } from '../src/lib/niche/engine';
import { fetchCoverThumb } from '../src/lib/providers/covers';
import { KeepaError, mapProduct, searchTopBooks, type MarketBook } from '../src/lib/providers/keepa';
import type { Niche } from '../src/lib/types';

// Prodotti nel formato descritto da https://keepa.com/api-docs/product-object.html (prezzi in centesimi, rating ×10).
const product = (asin: string, over: Record<string, unknown> = {}, cur: Partial<Record<number, number>> = {}) => {
  const current = Array(18).fill(-1);
  current[1] = 1499; current[3] = 15000; current[16] = 44; current[17] = 320;
  for (const [k, v] of Object.entries(cur)) current[Number(k)] = v as number;
  return { asin, title: `Libro <b>${asin}</b>`, images: [{ variant: 'PT01', l: 'other.jpg' }, { variant: 'MAIN', l: `${asin}-main.jpg`, m: `${asin}-m.jpg` }], numberOfPages: 180, binding: 'Paperback', publicationDate: 20240509, stats: { current }, ...over };
};

describe('Keepa: mappatura dei prodotti', () => {
  it('converte centesimi, rating×10, anno, immagine MAIN e toglie l’HTML dal titolo', () => {
    const b = mapProduct(product('B000000001'))!;
    expect(b).toMatchObject({ asin: 'B000000001', title: 'Libro B000000001', price: 14.99, rating: 4.4, reviews: 320, bsr: 15000, pages: 180, publishedYear: 2024 });
    expect(b.imageUrl).toBe('https://m.media-amazon.com/images/I/B000000001-main.jpg');
  });

  it('scarta i prodotti che non sono libri, e gestisce i valori -1 (non disponibili)', () => {
    expect(mapProduct(product('B000000002', { numberOfPages: -1, binding: 'Garden' }))).toBeNull();
    expect(mapProduct(product('B000000003', { numberOfPages: -1, binding: 'Kindle Edition' }))).not.toBeNull();
    const b = mapProduct(product('B000000004', {}, { 1: -1, 0: -1, 3: -1, 16: -1, 17: -1 }))!;
    expect(b).toMatchObject({ price: null, bsr: null, rating: null, reviews: null });
    expect(mapProduct(product('B000000005', { publicationDate: 2019 }))!.publishedYear).toBe(2019);
    expect(mapProduct(product('B000000006', { publicationDate: 201803 }))!.publishedYear).toBe(2018);
  });
});

describe('Keepa: ricerca', () => {
  const ok = (products: unknown[], init: ResponseInit = {}) => new Response(JSON.stringify({ products, tokensLeft: 88 }), { status: 200, ...init });

  it('chiama l’endpoint documentato col dominio giusto e ordina per Sales Rank', async () => {
    let url = '';
    const fetchImpl = (async (u: string) => { url = u; return ok([product('BAAAAAAAA2', {}, { 3: 90000 }), product('BAAAAAAAA1', {}, { 3: 1200 }), product('BAAAAAAAA3', { numberOfPages: -1, binding: 'Toys' })]); }) as unknown as typeof fetch;
    const r = await searchTopBooks('orto sul balcone', 'amazon.it', { apiKey: 'K3Y', fetchImpl });
    expect(url).toContain('https://api.keepa.com/search?key=K3Y&domain=8&type=product&term=orto%20sul%20balcone');
    expect(url).toContain('stats=90');
    expect(url).toContain('rating=1');
    expect(r.books.map((b) => b.asin)).toEqual(['BAAAAAAAA1', 'BAAAAAAAA2']);
    expect(r.tokensLeft).toBe(88);
  });

  it('errori chiari: chiave non valida, token esauriti, servizio in errore', async () => {
    const f = (status: number) => (async () => new Response('{}', { status })) as unknown as typeof fetch;
    await expect(searchTopBooks('x y', 'amazon.com', { apiKey: 'k', fetchImpl: f(401) })).rejects.toMatchObject({ status: 401 });
    await expect(searchTopBooks('x y', 'amazon.com', { apiKey: 'k', fetchImpl: f(429) })).rejects.toMatchObject({ status: 429, retryable: true });
    await expect(searchTopBooks('x y', 'amazon.com', { apiKey: 'k', fetchImpl: f(500) })).rejects.toBeInstanceOf(KeepaError);
  });
});

const book = (over: Partial<MarketBook> = {}): MarketBook => ({ asin: 'B0', title: 't', imageUrl: null, bsr: 20000, price: 14.99, rating: 4.4, reviews: 200, pages: 180, publishedYear: 2024, monthlySold: null, ...over });

describe('dai libri ai segnali della nicchia', () => {
  it('più vendite → più domanda; più recensioni → più competizione; dati marcati «importato» con metodologia', () => {
    const strong = marketSignals([book({ bsr: 3000 }), book({ bsr: 6000 })], 'amazon.com', 'Keepa', '2026-11-16T10:00:00Z');
    const weak = marketSignals([book({ bsr: 900000 }), book({ bsr: 1200000 })], 'amazon.com', 'Keepa', '2026-11-16T10:00:00Z');
    expect(strong.demand!.value!).toBeGreaterThan(weak.demand!.value!);
    const few = marketSignals([book({ reviews: 12 }), book({ reviews: 30 })], 'amazon.com', 'K', 'x');
    const many = marketSignals([book({ reviews: 4000 }), book({ reviews: 9000 })], 'amazon.com', 'K', 'x');
    expect(many.competition!.value!).toBeGreaterThan(few.competition!.value!);
    expect(strong.demand).toMatchObject({ status: 'imported', unit: 'punti 0-100', sampleSize: 2 });
    expect(strong.demand!.methodology).toMatch(/Sales Rank mediano/);
    expect(strong.unitEconomics!.methodology).toMatch(/royalty stimata/);
    expect(strong.trend).toBeUndefined(); // il trend non si ricava da un'istantanea
    expect(strong.differentiation).toBeUndefined();
  });

  it('i mercati più piccoli sono scalati: lo stesso numero di classifica vende meno su amazon.it che su amazon.com', () => {
    const us = marketSignals([book({ bsr: 40000 })], 'amazon.com', 'K', 'x').demand!.value!;
    const it = marketSignals([book({ bsr: 40000 })], 'amazon.it', 'K', 'x').demand!.value!;
    expect(it).toBeLessThan(us);
    // una classifica 10 volte migliore su amazon.it (4.000) equivale a ~40.000 su amazon.com
    expect(marketSignals([book({ bsr: 4000 })], 'amazon.it', 'K', 'x').demand!.value).toBe(us);
  });

  it('riepilogo: mediane e quota di libri con oltre 500 recensioni', () => {
    const s = summarizeMarket([book({ reviews: 100 }), book({ reviews: 600 }), book({ reviews: 900 })]);
    expect(s.medianReviews).toBe(600);
    expect(s.shareOver500Reviews).toBeCloseTo(2 / 3);
  });

  it('applicare i dati: sostituisce mancanti/stime IA ma NON i dati osservati a mano; l’affidabilità sale', () => {
    const n: Niche = { id: 'n', keyword: 'orto', buyerPersona: '', marketplace: 'amazon.it', category: '', status: 'hypothesis', demoOnly: false, signals: emptySignals(), competitors: [{ title: 'Mio concorrente', verified: true }], secondaryKeywords: [], differentiationIdeas: [], risks: [], commentary: '', riskAccepted: false, createdAt: 'x', updatedAt: 'x' };
    n.signals.demand = { value: 11, unit: 'punti 0-100', status: 'observed', source: 'a mano', observedAt: new Date().toISOString() };
    n.signals.trend = { value: 55, unit: 'punti 0-100', status: 'ai_estimate', source: 'IA', observedAt: new Date().toISOString() };
    n.signals.differentiation = { value: 60, unit: 'punti 0-100', status: 'ai_estimate', source: 'IA', observedAt: new Date().toISOString() };
    const books = [book({ asin: 'B1', bsr: 4000 }), book({ asin: 'B2', bsr: 8000 })];
    const out = applyMarketData(n, { books, signals: marketSignals(books, 'amazon.it', 'Keepa', new Date().toISOString()) });
    expect(out.signals.demand).toMatchObject({ value: 11, status: 'observed' });
    expect(out.signals.competition.status).toBe('imported');
    expect(out.signals.unitEconomics.status).toBe('imported');
    expect(out.signals.trend.status).toBe('ai_estimate');
    expect(out.competitors.map((c) => c.asin ?? c.title)).toEqual(['B1', 'B2', 'Mio concorrente']);
    expect(out.competitors[0].verified).toBe(false);
    const ev = evaluateNiche(out);
    expect(ev.coverage).toBe(100);
    expect(ev.confidence).toBeGreaterThan(30); // i dati importati pesano più delle sole stime IA
  });
});

describe('copertine e route /api/market con finto Keepa', () => {
  let server: Server;
  let png: Buffer;
  let base = '';
  const hits: string[] = [];
  beforeAll(async () => {
    png = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#445566' } }).png().toBuffer();
    server = createServer((req, res) => {
      hits.push(req.url ?? '');
      if (req.url?.startsWith('/search')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return void res.end(JSON.stringify({ tokensLeft: 77, products: [product('BIMG000001', {}, { 3: 500 }), product('BIMG000002', {}, { 3: 900 }), product('BIMG000003', {}, { 3: 1500 }), product('BIMG000004', {}, { 3: 2500 })] }));
      }
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('riduce una copertina scaricata a un JPEG leggero', async () => {
    const t = await fetchCoverThumb(`${base}/img.png`);
    expect(t!.mediaType).toBe('image/jpeg');
    expect(t!.data.length).toBeLessThanOrEqual(200_000);
    const meta = await sharp(Buffer.from(t!.data, 'base64')).metadata();
    expect(meta.width).toBeLessThanOrEqual(480);
    expect(await fetchCoverThumb('http://esempio.invalid/x.jpg')).toBeNull(); // http non locale: rifiutato
  });

  const call = (body: unknown) => POST(new Request('http://x/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const env = (k: Record<string, string | undefined>) => Object.entries(k).forEach(([a, b]) => (b === undefined ? delete process.env[a] : (process.env[a] = b)));

  it('senza KEEPA_API_KEY risponde 503 con istruzioni, senza chiamare nessuno', async () => {
    env({ KEEPA_API_KEY: undefined, KEEPA_BASE_URL: base });
    hits.length = 0;
    const r = await call({ keyword: 'orto sul balcone', marketplace: 'amazon.it' });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/KEEPA_API_KEY/);
    expect(hits).toHaveLength(0);
  });

  it('con la chiave: libri, segnali e le 3 copertine migliori già ridotte, tokensLeft; la chiave non esce mai nella risposta', async () => {
    env({ KEEPA_API_KEY: 'SEGRETO-KEEPA-123', KEEPA_BASE_URL: base, AMAZON_IMAGE_BASE: `${base}/img/` });
    hits.length = 0;
    const r = await call({ keyword: 'orto sul balcone', marketplace: 'amazon.it', covers: true });
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain('SEGRETO-KEEPA-123');
    const j = JSON.parse(text);
    expect(j.books).toHaveLength(4);
    expect(j.signals.demand.status).toBe('imported');
    expect(j.covers).toHaveLength(3);
    expect(j.covers.map((c: { asin: string }) => c.asin)).toEqual(['BIMG000001', 'BIMG000002', 'BIMG000003']);
    expect(j.covers[0].note).toMatch(/n\.1 per Sales Rank/);
    expect(j.covers[0].data.length).toBeGreaterThan(100);
    expect(j.tokensLeft).toBe(77);
    expect(hits.filter((h) => h.startsWith('/img/'))).toHaveLength(3); // solo le 3 copertine, nessun altro scaricamento
    env({ KEEPA_API_KEY: undefined, KEEPA_BASE_URL: undefined, AMAZON_IMAGE_BASE: undefined });
  });

  it('richiesta non valida → 400', async () => {
    env({ KEEPA_API_KEY: 'k', KEEPA_BASE_URL: base });
    expect((await call({ keyword: 'x', marketplace: 'amazon.it' })).status).toBe(400);
    expect((await call({ keyword: 'orto', marketplace: 'amazon.jp' })).status).toBe(400);
    env({ KEEPA_API_KEY: undefined, KEEPA_BASE_URL: undefined });
  });
});
