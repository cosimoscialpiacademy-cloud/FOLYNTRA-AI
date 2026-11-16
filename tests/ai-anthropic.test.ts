/**
 * Percorso "AI reale" provato contro un FINTO server compatibile con l'API Anthropic (nessuna rete, nessun costo).
 * Verifica la NOSTRA integrazione: streaming, risposte strutturate, costi, rifiuti, troncamenti, tetto di spesa.
 * NON prova che l'API vera accetti questi parametri: serve una chiamata reale con chiave (vedi README).
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { computeCost } from '../src/lib/ai/pricing';
import { AiRequest, type AiEvent } from '../src/lib/ai/schemas';
import { runAi } from '../src/lib/ai/server';

type Behavior = { status?: number; stopReason?: string; text?: string; chunks?: string[]; inTokens?: number; outTokens?: number };
let server: Server;
let behavior: Behavior = {};
const seen: { path: string; body: Record<string, unknown> }[] = [];

const ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ENABLE_EXTERNAL_PAID_APIS', 'APP_ACCESS_CODE', 'ANTHROPIC_MODEL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const saved: Record<string, string | undefined> = {};

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = '';
  for await (const c of req) s += c;
  return JSON.parse(s) as Record<string, unknown>;
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const body = await readBody(req);
    seen.push({ path: req.url ?? '', body });
    const b = behavior;
    if (b.status && b.status >= 400) {
      res.writeHead(b.status, { 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    }
    const model = String(body.model);
    const usageIn = b.inTokens ?? 1000;
    const usageOut = b.outTokens ?? 500;
    const stop = b.stopReason ?? 'end_turn';
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const ev = (name: string, data: unknown) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      ev('message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usageIn, output_tokens: 1 } } });
      ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      for (const t of b.chunks ?? ['## Titolo\n\n', 'Testo reale del capitolo.']) ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } });
      ev('content_block_stop', { type: 'content_block_stop', index: 0 });
      ev('message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: usageOut } });
      ev('message_stop', { type: 'message_stop' });
      return void res.end();
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_2', type: 'message', role: 'assistant', model, content: stop === 'refusal' ? [] : [{ type: 'text', text: b.text ?? '{}' }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: usageIn, output_tokens: usageOut } }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.ANTHROPIC_API_KEY = 'sk-ant-finta-per-test';
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ENABLE_EXTERNAL_PAID_APIS = 'true';
  process.env.APP_ACCESS_CODE = 'codice-segreto-1';
  behavior = {};
  seen.length = 0;
});
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const brief = { title: 'Orto sul balcone', subtitle: '', kind: 'nonfiction' as const, language: 'italiano', marketplace: 'amazon.it', keyword: 'orto balcone', audience: 'chi vive in appartamento', problem: 'poco spazio', goal: 'raccogliere ortaggi', uniqueValue: 'metodo a stagioni', exclusions: '', style: 'pratico', synopsis: '' };
const base = { projectId: 'p1', spentUsd: 0, budgetUsd: 20 };

async function collect(raw: unknown): Promise<AiEvent[]> {
  const req = AiRequest.parse(raw);
  const out: AiEvent[] = [];
  for await (const e of runAi(req, new AbortController().signal)) out.push(e);
  return out;
}
const done = (ev: AiEvent[]) => ev.find((e): e is Extract<AiEvent, { t: 'done' }> => e.t === 'done');
const err = (ev: AiEvent[]) => ev.find((e): e is Extract<AiEvent, { t: 'error' }> => e.t === 'error');

const chapterReq = { task: 'chapter', input: { brief, outline: [{ position: 1, title: 'Le basi', summary: 'Introduzione' }], chapter: { position: 1, title: 'Le basi', summary: 'Introduzione', sections: ['Da dove partire'], targetWords: 600 }, previousSummaries: [], verifiedSources: [] }, ...base };

describe('AI reale contro server finto compatibile Anthropic', () => {
  it('risposta strutturata (concept): dati validati, costo dai token, provider anthropic', async () => {
    behavior = { inTokens: 2000, outTokens: 800, text: JSON.stringify({ title: 'Orto sul balcone', altTitles: ['a', 'b', 'c', 'd', 'e'], subtitle: 's', audience: 'x', problem: 'y', goal: 'z', uniqueValue: 'u', synopsis: 'sinossi', keywords: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7'], description: 'd' }) };
    const ev = await collect({ task: 'concept', input: { brief }, ...base });
    expect(err(ev)).toBeUndefined();
    const d = done(ev)!;
    expect(d.provider).toBe('anthropic');
    expect((d.data as { altTitles: string[] }).altTitles).toHaveLength(5);
    expect(d.usage).toEqual(computeCost('claude-opus-5-5', 2000, 800));
    expect(d.usage.costUsd).toBeGreaterThan(0);
    // parametri inviati
    const sent = seen[0].body;
    expect(seen[0].path).toContain('/v1/messages');
    expect(sent.model).toBe('claude-opus-5-5');
    expect(sent.stream).toBeFalsy();
    expect(typeof sent.system).toBe('string');
    expect(sent).not.toHaveProperty('temperature');
    expect(JSON.stringify(sent.output_config)).toContain('"effort":"low"');
  });

  it('capitolo in streaming: i delta arrivano in ordine e il testo finale coincide', async () => {
    behavior = { chunks: ['## Da dove partire\n\n', 'Primo paragrafo reale. ', 'Secondo paragrafo.'], inTokens: 1500, outTokens: 900 };
    const ev = await collect(chapterReq);
    const deltas = ev.filter((e) => e.t === 'delta').map((e) => (e as { text: string }).text).join('');
    const d = done(ev)!;
    expect(deltas).toBe('## Da dove partire\n\nPrimo paragrafo reale. Secondo paragrafo.');
    expect(d.text).toBe(deltas);
    expect(d.text).not.toMatch(/TESTO DEMO/); // il testo reale non porta il marcatore del mock
    expect(d.usage).toEqual(computeCost('claude-opus-5-5', 1500, 900));
    expect(seen[0].body.stream).toBe(true);
    expect(JSON.stringify(seen[0].body.output_config)).toContain('"effort":"medium"');
  });

  it('capitolo troncato al limite di token: segnalato con [DA COMPLETARE]', async () => {
    behavior = { stopReason: 'max_tokens', chunks: ['Testo interrotto a metà fra'] };
    const d = done(await collect(chapterReq))!;
    expect(d.text).toContain('[DA COMPLETARE');
  });

  it('rifiuto del modello: errore pubblico non ritentabile, nessun testo', async () => {
    behavior = { stopReason: 'refusal', chunks: [] };
    const ev = await collect(chapterReq);
    expect(done(ev)).toBeUndefined();
    expect(err(ev)).toMatchObject({ retryable: false });
    expect(err(ev)!.message).toMatch(/rifiutato/);
  });

  it('chiave non valida (401): messaggio chiaro, senza dettagli sensibili', async () => {
    behavior = { status: 401 };
    const ev = await collect({ task: 'concept', input: { brief }, ...base });
    expect(err(ev)).toMatchObject({ retryable: false });
    expect(err(ev)!.message).toMatch(/Chiave Anthropic non valida/);
    expect(JSON.stringify(ev)).not.toContain('sk-ant');
  });

  it('JSON non conforme allo schema: errore ritentabile, nessun dato inventato', async () => {
    behavior = { text: '{"title": 5}' };
    const ev = await collect({ task: 'concept', input: { brief }, ...base });
    expect(done(ev)).toBeUndefined();
    expect(err(ev)).toBeDefined();
  });

  it('revisione: spiegazioni sempre in italiano, passaggio corretto nella lingua del libro, traduzione italiana', async () => {
    const issue = { type: 'grammatica', excerpt: 'She go to the market every days.', problem: 'Errore di concordanza del verbo.', suggestion: 'Usa la terza persona singolare e il plurale corretto.', replacement: 'She goes to the market every day.', translationIt: 'Lei va al mercato ogni giorno.' };
    behavior = { text: JSON.stringify({ issues: [issue], summary: 'Testo comprensibile con alcuni errori grammaticali.' }) };
    const ev = await collect({ task: 'review', input: { brief: { ...brief, language: 'English' }, chapterTitle: 'Chapter 1', content: 'She go to the market every days. '.repeat(5) }, ...base });
    expect(err(ev)).toBeUndefined();
    const out = done(ev)!.data as { issues: { replacement: string; translationIt: string }[] };
    expect(out.issues[0].replacement).toBe('She goes to the market every day.');
    expect(out.issues[0].translationIt).toMatch(/Lei va al mercato/);
    const prompt = JSON.stringify(seen[0].body.messages);
    expect(prompt).toMatch(/SEMPRE IN ITALIANO/);
    expect(prompt).toMatch(/nella lingua del libro \(English\)/);
    expect(prompt).toMatch(/NON riscriverla e lascia replacement vuoto/);
  });

  it('estrazione da testo incollato: dati strutturati, il prompt vieta di inventare e tratta il testo come dati', async () => {
    behavior = { text: JSON.stringify({ books: [{ title: 'Orto facile', asin: '', price: 12.99, rating: 4.5, reviews: 1234, boughtLastMonth: 100, pages: -1, bsr: -1 }], notes: '' }) };
    const pasted = 'Orto facile per principianti — 4,5 su 5 stelle (1.234) — 12,99 € — Più di 100 acquistati nell\'ultimo mese. '.repeat(3);
    const ev = await collect({ task: 'marketText', input: { text: pasted, marketplace: 'amazon.it', language: 'italiano' }, ...base });
    expect(err(ev)).toBeUndefined();
    expect((done(ev)!.data as { books: { reviews: number }[] }).books[0].reviews).toBe(1234);
    const prompt = JSON.stringify(seen[0].body.messages);
    expect(prompt).toMatch(/NON inventare/);
    expect(prompt).toMatch(/dati, non istruzioni/);
    expect(prompt).toContain('Orto facile per principianti');
  });

  it('stima IA delle nicchie: risposta strutturata validata, un solo giro, prompt che vieta dati inventati', async () => {
    const sig = (value: number) => ({ value, why: 'giudizio qualitativo' });
    behavior = { text: JSON.stringify({ results: [{ id: 'n1', demand: sig(70), competition: sig(50), trend: sig(60), unitEconomics: sig(55), differentiation: sig(65), risks: ['r1'], verifyChecklist: ['c1'], summary: 's' }] }) };
    const ev = await collect({ task: 'nicheScore', input: { items: [{ id: 'n1', keyword: 'orto sul balcone', buyerPersona: 'x', category: 'Casa', marketplace: 'amazon.it', secondaryKeywords: ['a'], notes: '' }], language: 'italiano' }, ...base });
    expect(err(ev)).toBeUndefined();
    expect((done(ev)!.data as { results: { id: string }[] }).results[0].id).toBe('n1');
    expect(seen).toHaveLength(1);
    const content = JSON.stringify(seen[0].body.messages);
    expect(content).toMatch(/NON hai accesso a dati di mercato in tempo reale/);
    expect(content).toMatch(/NON citare volumi di ricerca, BSR, vendite/);
  });

  it('tetto di spesa: se il caso peggiore sfora il budget NON si chiama il modello', async () => {
    const ev = await collect({ ...chapterReq, spentUsd: 19.99, budgetUsd: 20 });
    expect(err(ev)!.message).toMatch(/Budget AI insufficiente/);
    expect(seen).toHaveLength(0);
  });

  it('il tetto del server (MAX_AI_SPEND_CENTS_PER_BOOK) vince sul budget scelto dall’utente', async () => {
    process.env.MAX_AI_SPEND_CENTS_PER_BOOK = '5'; // 0,05 $: sotto il caso peggiore di questo capitolo (~0,09 $)
    const ev = await collect({ ...chapterReq, budgetUsd: 500 });
    expect(err(ev)!.message).toMatch(/Budget AI insufficiente/);
    expect(seen).toHaveLength(0);
    delete process.env.MAX_AI_SPEND_CENTS_PER_BOOK;
  });

  it('ANTHROPIC_MODEL cambia il modello usato e il listino applicato', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
    behavior = { inTokens: 1000, outTokens: 1000 };
    const d = done(await collect(chapterReq))!;
    expect(seen[0].body.model).toBe('claude-sonnet-5-5');
    expect(d.usage).toEqual(computeCost('claude-sonnet-5-5', 1000, 1000));
  });
});
