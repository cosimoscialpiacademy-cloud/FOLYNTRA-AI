import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiRequest } from '../src/lib/ai/schemas';
import { aiConfig, runAi } from '../src/lib/ai/server';
import { computeCost } from '../src/lib/ai/pricing';
import { chapterIdempotencyKey, generateChapter, recoverInterruptedJobs } from '../src/lib/generation';
import { MemoryStore } from '../src/lib/store/memory';
import { sampleBundle } from './fixtures';

const ENV = ['ANTHROPIC_API_KEY', 'ENABLE_EXTERNAL_PAID_APIS', 'ALLOW_UNAUTHENTICATED_AI', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'MAX_AI_SPEND_CENTS_PER_BOOK'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.unstubAllGlobals(); });

/** Instrada fetch('/api/ai') sul vero livello server (provider mock), senza rete. */
function stubApi(opts: { failFirst?: number; fatal?: boolean } = {}) {
  let calls = 0;
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    calls += 1;
    if (opts.fatal) return new Response(JSON.stringify({ error: 'Richiesta non valida' }), { status: 400 });
    if (calls <= (opts.failFirst ?? 0)) return new Response(JSON.stringify({ error: 'temporaneo' }), { status: 503 });
    const req = AiRequest.parse(JSON.parse(init.body));
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        for await (const e of runAi(req, new AbortController().signal)) c.enqueue(enc.encode(JSON.stringify(e) + '\n'));
        c.close();
      },
    });
    return new Response(stream, { status: 200 });
  });
  return () => calls;
}

async function setup() {
  const store = new MemoryStore();
  const b = sampleBundle({ chapters: 5 });
  await store.put('projects', b.project);
  for (const c of b.chapters) await store.put('chapters', { ...c, content: '', status: 'draft', generatedBy: 'none' });
  return { store, project: b.project, chapters: b.chapters };
}

describe('configurazione AI', () => {
  it('senza chiave: mock dichiarato', () => {
    expect(aiConfig().mode).toBe('mock');
  });
  it('chiave presente ma senza consenso alla spesa: resta mock', () => {
    process.env.ANTHROPIC_API_KEY = 'chiave-finta-di-test';
    expect(aiConfig()).toMatchObject({ mode: 'mock' });
    expect(aiConfig().reason).toMatch(/ENABLE_EXTERNAL_PAID_APIS/);
    process.env.ENABLE_EXTERNAL_PAID_APIS = 'true';
    expect(aiConfig().mode).toBe('mock');
    expect(aiConfig().reason).toMatch(/ALLOW_UNAUTHENTICATED_AI/);
    process.env.ALLOW_UNAUTHENTICATED_AI = 'true';
    expect(aiConfig()).toMatchObject({ mode: 'anthropic', model: 'claude-opus-5-5', maxUsdPerBook: 20 });
  });
  it('calcolo costi dal listino', () => {
    expect(computeCost('claude-opus-5-5', 1_000_000, 1_000_000).costUsd).toBe(24);
    expect(computeCost('modello-sconosciuto', 1000, 1000).priceKnown).toBe(false);
  });
});

describe('job di scrittura', () => {
  it('genera, salva testo/versione/costo e non duplica con la stessa chiave', async () => {
    const { store, project, chapters } = await setup();
    const calls = stubApi();
    const signal = new AbortController().signal;
    const r1 = await generateChapter({ store, project, niche: null, chapterId: chapters[0].id, token: null, signal });
    expect(r1.outcome).toBe('generated');
    const saved1 = await store.get('chapters', chapters[0].id);
    expect(saved1?.status).toBe('generated');
    expect(saved1?.generatedBy).toBe('mock');
    expect(saved1?.aiGenerated).toBe(false);
    expect(saved1?.content).toContain('TESTO DEMO (mock)');

    const r2 = await generateChapter({ store, project, niche: null, chapterId: chapters[0].id, token: null, signal });
    expect(r2.outcome).toBe('skipped');
    expect(calls()).toBe(1);
    expect(await store.list('jobs')).toHaveLength(1);
    expect((await store.list('jobs'))[0]).toMatchObject({ status: 'succeeded', attempts: 1, idempotencyKey: chapterIdempotencyKey(saved1!) });
    expect(await store.list('revisions')).toHaveLength(1);
    expect((await store.list('costs'))[0]).toMatchObject({ provider: 'mock', costUsd: 0 });
  });

  it('riprova gli errori temporanei e poi riesce', async () => {
    const { store, project, chapters } = await setup();
    const calls = stubApi({ failFirst: 1 });
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 500 });
    const r = await generateChapter({ store, project, niche: null, chapterId: chapters[1].id, token: null, signal: new AbortController().signal });
    vi.useRealTimers();
    expect(r.outcome).toBe('generated');
    expect(calls()).toBe(2);
    expect((await store.list('jobs'))[0].attempts).toBe(2);
  });

  it('errore definitivo: job fallito, capitolo torna in bozza, nessun costo', async () => {
    const { store, project, chapters } = await setup();
    stubApi({ fatal: true });
    const r = await generateChapter({ store, project, niche: null, chapterId: chapters[2].id, token: null, signal: new AbortController().signal });
    expect(r.outcome).toBe('failed');
    expect((await store.get('chapters', chapters[2].id))?.status).toBe('draft');
    expect((await store.list('jobs'))[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(await store.list('costs')).toHaveLength(0);
  });

  it('capitolo bloccato: mai rigenerato', async () => {
    const { store, project, chapters } = await setup();
    const calls = stubApi();
    await store.put('chapters', { ...chapters[3], content: 'Testo mio.', status: 'locked', generatedBy: 'human' });
    const r = await generateChapter({ store, project, niche: null, chapterId: chapters[3].id, token: null, signal: new AbortController().signal, force: true });
    expect(r.outcome).toBe('skipped');
    expect(calls()).toBe(0);
    expect((await store.get('chapters', chapters[3].id))?.content).toBe('Testo mio.');
  });

  it('job rimasti in corso dopo una chiusura vengono recuperati senza perdere il testo', async () => {
    const { store, project, chapters } = await setup();
    await store.put('chapters', { ...chapters[4], content: 'Testo parziale salvato', status: 'generating' });
    await store.put('jobs', { id: 'j1', projectId: project.id, chapterId: chapters[4].id, jobType: 'chapter', status: 'running', progress: 40, idempotencyKey: 'k', attempts: 1, errorPublic: null, createdAt: 'x', updatedAt: 'x' });
    expect(await recoverInterruptedJobs(store, project.id)).toBe(1);
    expect((await store.get('jobs', 'j1'))?.status).toBe('failed');
    expect(await store.get('chapters', chapters[4].id)).toMatchObject({ status: 'draft', content: 'Testo parziale salvato' });
  });
});
