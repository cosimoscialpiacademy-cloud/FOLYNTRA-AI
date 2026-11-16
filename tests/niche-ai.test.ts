import { describe, expect, it } from 'vitest';
import { AiRequest, type NicheScoreOutput } from '../src/lib/ai/schemas';
import { runAi } from '../src/lib/ai/server';
import { applyEstimate } from '../src/lib/niche/ai-estimate';
import { emptySignals, evaluateNiche } from '../src/lib/niche/engine';
import type { Niche } from '../src/lib/types';

const NOW = '2026-11-16T10:00:00.000Z';
const niche = (over: Partial<Niche> = {}): Niche => ({
  id: 'n1', keyword: 'orto sul balcone', buyerPersona: 'chi vive in appartamento', marketplace: 'amazon.it', category: 'Casa e giardino', status: 'hypothesis', demoOnly: false,
  signals: emptySignals(), competitors: [], secondaryKeywords: [], differentiationIdeas: [], risks: [], commentary: '', riskAccepted: false, createdAt: NOW, updatedAt: NOW, ...over,
});
const result = (over: Partial<NicheScoreOutput['results'][number]> = {}): NicheScoreOutput['results'][number] => ({
  id: 'n1', demand: { value: 70, why: 'bisogno diffuso' }, competition: { value: 55, why: 'molti titoli' }, trend: { value: 60, why: 'stagionale' }, unitEconomics: { value: 50, why: 'margine medio' }, differentiation: { value: 65, why: 'angolo possibile' },
  risks: ['servono fonti per i consigli di salute delle piante'], verifyChecklist: ['guarda i primi 10 risultati', 'controlla i prezzi'], summary: 'Nicchia plausibile ma da verificare.', ...over,
});

describe('stima IA delle nicchie', () => {
  it('riempie i 5 segnali: punteggio calcolato, copertura 100%, affidabilità bassa e dichiarata', () => {
    const before = evaluateNiche(niche());
    expect(before.score).toBeNull();
    expect(before.coverage).toBe(0);
    const n = applyEstimate(niche(), result(), 'claude-opus-5-5', NOW);
    const ev = evaluateNiche(n, new Date(NOW));
    expect(ev.score).toBe(Math.round(0.3 * 70 + 0.25 * (100 - 55) + 0.15 * 60 + 0.2 * 50 + 0.1 * 65));
    expect(ev.coverage).toBe(100);
    expect(ev.confidence).toBeLessThanOrEqual(30);
    expect(ev.aiBased).toBe(true);
    expect(ev.recommendation).toMatch(/poco affidabili/);
    expect(n.signals.demand).toMatchObject({ status: 'ai_estimate', value: 70 });
    expect(n.signals.demand.source).toMatch(/NON dati di mercato/);
    expect(n.signals.demand.methodology).toBe('bisogno diffuso');
    expect(n.commentary).toMatch(/Stima IA/);
    expect(n.risks).toContain('servono fonti per i consigli di salute delle piante');
  });

  it('non sovrascrive mai dati osservati, importati o inseriti a mano', () => {
    const base = niche();
    base.signals.demand = { value: 20, unit: 'punti 0-100', status: 'observed', source: 'rilevazione manuale', observedAt: NOW };
    base.signals.trend = { value: 30, unit: 'punti 0-100', status: 'imported', source: 'CSV', observedAt: NOW };
    base.signals.competition = { value: 80, unit: 'punti 0-100', status: 'estimated', source: 'mia stima', observedAt: NOW };
    const n = applyEstimate(base, result(), 'm', NOW);
    expect(n.signals.demand).toMatchObject({ value: 20, status: 'observed' });
    expect(n.signals.trend).toMatchObject({ value: 30, status: 'imported' });
    expect(n.signals.competition).toMatchObject({ value: 80, status: 'estimated' });
    expect(n.signals.unitEconomics.status).toBe('ai_estimate');
  });

  it('valori fuori scala vengono limitati a 0-100 e rieseguire la stima aggiorna senza duplicare il commento', () => {
    let n = applyEstimate(niche(), result({ demand: { value: 140, why: 'x' }, trend: { value: -5, why: 'y' } }), 'm', NOW);
    expect(n.signals.demand.value).toBe(100);
    expect(n.signals.trend.value).toBe(0);
    n = applyEstimate(n, result({ summary: 'Seconda valutazione.' }), 'm', NOW);
    expect(n.commentary.match(/Stima IA \(/g)).toHaveLength(1);
    expect(n.commentary).toMatch(/Seconda valutazione/);
  });

  it('una nicchia DEMO resta DEMO: affidabilità 0%', () => {
    const d = niche({ demoOnly: true });
    expect(evaluateNiche(applyEstimate(d, result(), 'm', NOW)).confidence).toBe(0);
  });

  it('con il mock la stima NON inventa valutazioni: errore chiaro e nessun dato', async () => {
    const req = AiRequest.parse({ task: 'nicheScore', input: { items: [{ id: 'n1', keyword: 'orto', buyerPersona: '', category: '', marketplace: 'amazon.it', secondaryKeywords: [], notes: '' }], language: 'italiano' }, projectId: null, spentUsd: 0, budgetUsd: 5 });
    const ev = [];
    for await (const e of runAi(req, new AbortController().signal)) ev.push(e);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ t: 'error', retryable: false });
    expect((ev[0] as { message: string }).message).toMatch(/non inventa valutazioni di mercato/);
  });
});
