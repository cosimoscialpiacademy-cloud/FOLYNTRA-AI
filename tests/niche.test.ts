import { describe, expect, it } from 'vitest';
import { parseNicheCsv } from '../src/lib/niche/csv';
import { buildDemoNiches } from '../src/lib/niche/demo';
import { emptySignals, estimateSignalsFromCompetitors, evaluateNiche } from '../src/lib/niche/engine';
import type { Metric, Niche } from '../src/lib/types';
import { readFileSync } from 'node:fs';

let n = 0;
const newId = () => `id-${++n}`;
const NOW = new Date('2026-11-12T00:00:00Z');
const metric = (value: number, status: Metric['status'], observedAt: string | null = '2026-11-01T00:00:00Z'): Metric => ({ value, unit: 'punti 0-100', status, source: 'test', observedAt });
const base = (signals: Niche['signals'], demoOnly = false) => ({ signals, demoOnly, risks: [], competitors: [] });

describe('valutazione nicchie', () => {
  it('applica la formula documentata e separa la confidenza', () => {
    const s = emptySignals();
    s.demand = metric(80, 'observed'); s.competition = metric(40, 'observed'); s.trend = metric(60, 'observed'); s.unitEconomics = metric(70, 'observed'); s.differentiation = metric(80, 'observed');
    const ev = evaluateNiche(base(s), NOW);
    expect(ev.score).toBe(70);
    expect(ev.confidence).toBe(100);
    expect(ev.coverage).toBe(100);
  });
  it('non inventa uno score se mancano segnali', () => {
    const s = emptySignals();
    s.demand = metric(80, 'observed');
    const ev = evaluateNiche(base(s), NOW);
    expect(ev.score).toBeNull();
    expect(ev.missing).toHaveLength(4);
    expect(ev.coverage).toBe(20);
  });
  it('dati DEMO: confidenza sempre 0 e rischio esplicito', () => {
    const demo = buildDemoNiches(newId, NOW.toISOString());
    expect(demo).toHaveLength(2);
    for (const d of demo) {
      const ev = evaluateNiche(d, NOW);
      expect(ev.confidence).toBe(0);
      expect(ev.recommendation).toMatch(/dimostrazione/i);
      expect(ev.topRisks[0]).toMatch(/dimostrazione/i);
    }
    expect(evaluateNiche(demo[0], NOW).score).toBe(60);
  });
  it('stime e dati vecchi abbassano la confidenza', () => {
    const s = emptySignals();
    for (const k of Object.keys(s) as (keyof typeof s)[]) s[k] = metric(50, 'estimated', '2024-01-01T00:00:00Z');
    expect(evaluateNiche(base(s), NOW).confidence).toBe(15);
  });
  it('stima dai concorrenti marcata come stima con metodologia', () => {
    const est = estimateSignalsFromCompetitors([{ title: 'A', bsr: 10000, reviews: 100, verified: true }], 'manuale', NOW.toISOString());
    expect(est.demand?.status).toBe('estimated');
    expect(est.demand?.value).toBe(65);
    expect(est.demand?.methodology).toMatch(/non misura copie/);
    expect(est.competition?.value).toBe(45);
  });
});

describe('import CSV', () => {
  const opts = { fileName: 'x.csv', newId, now: NOW };
  it('legge il file DEMO fornito marcandolo demo', () => {
    const r = parseNicheCsv(readFileSync('data/NICCHIE-DEMO.csv', 'utf8'), opts);
    expect(r.errors).toEqual([]);
    expect(r.niches).toHaveLength(2);
    expect(r.niches.every((x) => x.demoOnly)).toBe(true);
  });
  it('file vuoto, intestazione errata e righe malformate danno errori comprensibili', () => {
    expect(parseNicheCsv('', opts).errors[0].message).toMatch(/vuoto/);
    expect(parseNicheCsv('a,b\n1,2\n', opts).errors[0].message).toMatch(/Intestazione/);
    const r = parseNicheCsv('keyword,marketplace,demand,competition,trend,unitEconomics,differentiation\n"ok",amazon.it,10,20,30,40,50\n\n"bad",amazon.xx,1,2,3,4,5\n"bad2",amazon.de,200,2,3,4,5\n', opts);
    expect(r.niches).toHaveLength(1);
    expect(r.errors.map((e) => e.row)).toEqual([4, 5]);
  });
  it('segnale mancante resta mancante (nessun valore inventato)', () => {
    const r = parseNicheCsv('keyword,marketplace,demand,competition,trend,unitEconomics,differentiation\n"k",it,10,,30,40,50\n', opts);
    expect(r.niches[0].signals.competition.status).toBe('missing');
    expect(r.warnings).toHaveLength(1);
    expect(evaluateNiche(r.niches[0], NOW).score).toBeNull();
  });
  it('formato concorrenti: raggruppa per keyword, scarta ASIN non validi, concorrenti non verificati', () => {
    const r = parseNicheCsv('keyword,marketplace,title,asin,price,reviews,bsr\n"k",amazon.it,"Libro A",B00TEST123,"12,99",100,10000\n"k",amazon.it,"Libro B",xx,9.99,50,20000\n', opts);
    expect(r.kind).toBe('competitors');
    expect(r.niches).toHaveLength(1);
    expect(r.niches[0].competitors).toHaveLength(2);
    expect(r.niches[0].competitors[0].price).toBe(12.99);
    expect(r.niches[0].competitors[1].asin).toBeUndefined();
    expect(r.niches[0].competitors.every((c) => !c.verified)).toBe(true);
    expect(r.niches[0].signals.demand.status).toBe('estimated');
  });
});
