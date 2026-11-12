/**
 * Nicchie DEMO (data/NICCHIE-DEMO.json). SOLO dimostrazione dell'interfaccia:
 * non sono analisi di mercato né stime di vendita. Confidenza sempre 0.
 */
import demo from '../../../data/NICCHIE-DEMO.json';
import { emptySignals } from './engine';
import type { Metric, Niche, SignalKey } from '../types';

export const DEMO_NOTICE = 'Questi dati servono solo a provare l’interfaccia: non indicano domanda reale.';

export function buildDemoNiches(newId: () => string, now: string): Niche[] {
  return demo.niches.map((n) => {
    const signals = emptySignals();
    const set = (k: SignalKey, value: number) => {
      const m: Metric = { value, unit: 'punti 0-100', status: 'demo', source: 'Dataset dimostrativo FOLYNTRA (fittizio)', observedAt: null };
      signals[k] = m;
    };
    set('demand', n.demand);
    set('competition', n.competition);
    set('trend', n.trend);
    set('unitEconomics', n.unitEconomics);
    set('differentiation', n.differentiation);
    return {
      id: newId(), keyword: n.keyword, buyerPersona: n.buyer, marketplace: 'amazon.it', category: 'Categoria fittizia (DEMO)',
      status: 'researched', demoOnly: true, signals, competitors: [], secondaryKeywords: [], differentiationIdeas: [],
      risks: [], commentary: demo.READ_ME, riskAccepted: false, createdAt: now, updatedAt: now,
    } satisfies Niche;
  });
}
