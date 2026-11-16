import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '../src/app/api/market/route';
import { BOOKS_NODE, mapSerpResult, parseBoughtLastMonth, searchBestSellers, SerpApiError } from '../src/lib/providers/serpapi';

// Campi come nell'esempio JSON della documentazione ufficiale https://serpapi.com/amazon-search-api
const item = (asin: string, over: Record<string, unknown> = {}) => ({ position: 1, asin, title: `Libro ${asin}`, link_clean: `https://www.amazon.it/dp/${asin}/`, thumbnail: `https://m.media-amazon.com/images/I/${asin}._AC_UL320_.jpg`, rating: 4.4, reviews: 1234, bought_last_month: '1K+ bought in past month', price: '13,99 €', extracted_price: 13.99, ...over });

describe('SerpApi: mappatura', () => {
  it('«acquistati nel mese» in più lingue e formati', () => {
    expect(parseBoughtLastMonth('20K+ bought in past month')).toBe(20000);
    expect(parseBoughtLastMonth('1K+ bought in past month')).toBe(1000);
    expect(parseBoughtLastMonth('Più di 1.000 acquistati nell\'ultimo mese')).toBe(1000);
    expect(parseBoughtLastMonth('100+ bought in past month')).toBe(100);
    expect(parseBoughtLastMonth('1,000+ bought in past month')).toBe(1000);
    expect(parseBoughtLastMonth('1.5K+ bought in past month')).toBe(1500);
    expect(parseBoughtLastMonth(undefined)).toBeNull();
    expect(parseBoughtLastMonth('nessun dato')).toBeNull();
  });

  it('esclude gli sponsorizzati e i risultati incompleti; converte i campi', () => {
    expect(mapSerpResult(item('B000000001', { sponsored: true }))).toBeNull();
    expect(mapSerpResult({ position: 3, title: 'Senza asin' })).toBeNull();
    const b = mapSerpResult(item('B000000002'))!;
    expect(b).toMatchObject({ asin: 'B000000002', price: 13.99, rating: 4.4, reviews: 1234, monthlySold: 1000, bsr: null });
    expect(b.imageUrl).toContain('m.media-amazon.com');
  });

  it('gli identificativi della categoria Libri sono quelli della lista ufficiale SerpApi', () => {
    expect(BOOKS_NODE).toEqual({ 'amazon.com': '283155', 'amazon.co.uk': '266239', 'amazon.de': '186606', 'amazon.fr': '301061', 'amazon.it': '411663031', 'amazon.es': '599364031' });
  });
});

describe('SerpApi: ricerca', () => {
  const ok = (organic: unknown[]) => new Response(JSON.stringify({ search_metadata: { status: 'Success' }, organic_results: organic }), { status: 200 });

  it('chiede i Best Sellers dei soli libri del mercato giusto, mantiene l’ordine e salta gli sponsorizzati', async () => {
    let url = '';
    const fetchImpl = (async (u: string) => { url = u; return ok([item('BSPONS0001', { sponsored: true }), item('BAAAAAAAA1'), item('BAAAAAAAA2'), item('BAAAAAAAA3')]); }) as unknown as typeof fetch;
    const r = await searchBestSellers('orto sul balcone', 'amazon.it', { apiKey: 'K3Y', fetchImpl });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://serpapi.com/search.json');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ engine: 'amazon', k: 'orto sul balcone', amazon_domain: 'amazon.it', rh: 'n:411663031', s: 'exact-aware-popularity-rank', api_key: 'K3Y' });
    expect(r.books.map((b) => b.asin)).toEqual(['BAAAAAAAA1', 'BAAAAAAAA2', 'BAAAAAAAA3']);
  });

  it('errori chiari: chiave, limite, ricerche esaurite; nessun risultato = elenco vuoto', async () => {
    const st = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    await expect(searchBestSellers('x y', 'amazon.com', { apiKey: 'k', fetchImpl: st(401) })).rejects.toMatchObject({ status: 401 });
    await expect(searchBestSellers('x y', 'amazon.com', { apiKey: 'k', fetchImpl: st(429) })).rejects.toMatchObject({ status: 429, retryable: true });
    await expect(searchBestSellers('x y', 'amazon.com', { apiKey: 'k', fetchImpl: st(200, { error: 'Your account has run out of searches.' }) })).rejects.toMatchObject({ status: 429 });
    await expect(searchBestSellers('x y', 'amazon.com', { apiKey: 'k', fetchImpl: st(200, { error: "Amazon hasn't returned any results for this query." }) })).resolves.toEqual({ books: [] });
    await expect(searchBestSellers('x y', 'amazon.com', { apiKey: 'k', fetchImpl: st(200, { error: 'boh' }) })).rejects.toBeInstanceOf(SerpApiError);
  });
});

describe('route /api/market con SerpApi', () => {
  let server: Server;
  let base = '';
  const hits: string[] = [];
  beforeAll(async () => {
    const png = await sharp({ create: { width: 640, height: 960, channels: 3, background: '#335577' } }).png().toBuffer();
    server = createServer((req, res) => {
      hits.push(req.url ?? '');
      if (req.url?.startsWith('/search.json')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        const th = (a: string) => `${base}/img/${a}.jpg`;
        return void res.end(JSON.stringify({ organic_results: [item('BSPONS0001', { sponsored: true, thumbnail: th('SPONS') }), item('BSERP00001', { thumbnail: th('1') }), item('BSERP00002', { thumbnail: th('2') }), item('BSERP00003', { thumbnail: th('3') }), item('BSERP00004', { thumbnail: th('4') })] }));
      }
      if (req.url?.startsWith('/search?')) { res.writeHead(200, { 'content-type': 'application/json' }); return void res.end(JSON.stringify({ products: [] })); }
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(png);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const call = (body: unknown) => POST(new Request('http://x/api/market', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const env = (k: Record<string, string | undefined>) => Object.entries(k).forEach(([a, b]) => (b === undefined ? delete process.env[a] : (process.env[a] = b)));
  const clean = () => env({ KEEPA_API_KEY: undefined, SERPAPI_API_KEY: undefined, MARKET_PROVIDER: undefined, KEEPA_BASE_URL: undefined, SERPAPI_BASE_URL: undefined });

  it('senza nessuna chiave: 503 che spiega entrambe le opzioni', async () => {
    clean();
    const r = await call({ keyword: 'orto sul balcone', marketplace: 'amazon.it' });
    expect(r.status).toBe(503);
    const msg = (await r.json()).error as string;
    expect(msg).toMatch(/SERPAPI_API_KEY/);
    expect(msg).toMatch(/KEEPA_API_KEY/);
  });

  it('solo SerpApi: libri in ordine Best Sellers, sponsorizzati esclusi, 3 copertine scaricate, segnali dai dati, chiave mai nella risposta', async () => {
    clean();
    env({ SERPAPI_API_KEY: 'SEGRETO-SERP-999', SERPAPI_BASE_URL: base });
    hits.length = 0;
    const r = await call({ keyword: 'orto sul balcone', marketplace: 'amazon.it', covers: true });
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain('SEGRETO-SERP-999');
    const j = JSON.parse(text);
    expect(j.provider).toBe('serpapi');
    expect(j.books.map((b: { asin: string }) => b.asin)).toEqual(['BSERP00001', 'BSERP00002', 'BSERP00003', 'BSERP00004']);
    expect(j.covers.map((c: { asin: string }) => c.asin)).toEqual(['BSERP00001', 'BSERP00002', 'BSERP00003']);
    expect(j.covers[0].note).toMatch(/n\.1 nei Best Sellers/);
    expect(j.signals.demand.status).toBe('imported'); // dalla mediana degli acquisti del mese
    expect(j.signals.demand.source).toMatch(/SerpApi/);
    expect(j.signals.competition.status).toBe('imported');
    expect(hits.filter((h) => h.startsWith('/img/'))).toHaveLength(3);
    expect(hits.some((h) => h.includes('rh=n%3A411663031') || h.includes('rh=n:411663031'))).toBe(true);
  });

  it('con entrambe le chiavi usa Keepa, salvo MARKET_PROVIDER=serpapi', async () => {
    clean();
    env({ KEEPA_API_KEY: 'k', KEEPA_BASE_URL: base, SERPAPI_API_KEY: 's', SERPAPI_BASE_URL: base });
    const a = await call({ keyword: 'orto', marketplace: 'amazon.it' });
    expect(a.status).toBe(404); // il finto Keepa risponde con 0 libri: dimostra che è stato chiamato Keepa
    env({ MARKET_PROVIDER: 'serpapi' });
    const b = await call({ keyword: 'orto', marketplace: 'amazon.it' });
    expect(b.status).toBe(200);
    expect((await b.json()).provider).toBe('serpapi');
    clean();
  });
});
