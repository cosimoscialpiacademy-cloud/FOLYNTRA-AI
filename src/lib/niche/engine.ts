/**
 * NICHE INTELLIGENCE (docs/03): score trasparente + confidenza separata.
 * Lo score è un indicatore comparativo, NON una probabilità di vendita.
 */
import { scoreNiche } from '../niche-score';
import type { Competitor, EvidenceStatus, Metric, Niche, SignalKey } from '../types';

export const SIGNALS: { key: SignalKey; label: string; weight: number; inverted: boolean; help: string }[] = [
  { key: 'demand', label: 'Domanda', weight: 0.3, inverted: false, help: 'Segnali comparabili di ricerca/acquisto, con fonte e data.' },
  { key: 'competition', label: 'Competizione', weight: 0.25, inverted: true, help: 'Più è alta, più il punteggio scende. Pochi concorrenti senza domanda non sono un’opportunità.' },
  { key: 'trend', label: 'Trend', weight: 0.15, inverted: false, help: 'Stabilità o crescita reale su 12–24 mesi; stagionalità.' },
  { key: 'unitEconomics', label: 'Economia', weight: 0.2, inverted: false, help: 'Prezzo, costo stampa, royalty stimata, costi Ads/AI/lavoro.' },
  { key: 'differentiation', label: 'Differenziazione', weight: 0.1, inverted: false, help: 'Originalità possibile rispetto ai libri analizzati; rischi di accuratezza.' },
];

export const STATUS_LABEL: Record<EvidenceStatus, string> = {
  observed: 'Osservato',
  estimated: 'Stimato',
  imported: 'Importato',
  demo: 'DEMO',
  missing: 'Dato non disponibile',
};

/** Peso di affidabilità per provenienza: una stima vale meno di un dato osservato. */
const STATUS_QUALITY: Record<EvidenceStatus, number> = { observed: 1, imported: 0.8, estimated: 0.5, demo: 0, missing: 0 };

export function missingMetric(): Metric {
  return { value: null, unit: 'punti 0-100', status: 'missing', source: '', observedAt: null };
}

export function emptySignals(): Record<SignalKey, Metric> {
  return {
    demand: missingMetric(),
    competition: missingMetric(),
    trend: missingMetric(),
    unitEconomics: missingMetric(),
    differentiation: missingMetric(),
  };
}

function freshness(observedAt: string | null, now: Date): number {
  if (!observedAt) return 0.4;
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return 0.4;
  const days = (now.getTime() - t) / 86_400_000;
  if (days <= 90) return 1;
  if (days <= 180) return 0.8;
  if (days <= 365) return 0.55;
  return 0.3;
}

export interface NicheEvaluation {
  /** null quando mancano segnali: nessun numero "credibile" inventato. */
  score: number | null;
  confidence: number;
  coverage: number;
  recommendation: string;
  missing: SignalKey[];
  breakdown: { key: SignalKey; label: string; value: number | null; weight: number; contribution: number | null; status: EvidenceStatus; source: string; observedAt: string | null }[];
  topRisks: string[];
}

/**
 * Confidenza = media, sui 5 segnali, di (qualità provenienza × freschezza).
 * Un segnale mancante vale 0. Dati esclusivamente DEMO → confidenza 0.
 */
export function evaluateNiche(niche: Pick<Niche, 'signals' | 'demoOnly' | 'risks' | 'competitors'>, now = new Date()): NicheEvaluation {
  const breakdown = SIGNALS.map((s) => {
    const m = niche.signals[s.key];
    const value = m.status === 'missing' ? null : m.value;
    const effective = value === null ? null : s.inverted ? 100 - value : value;
    return {
      key: s.key,
      label: s.label,
      value,
      weight: s.weight,
      contribution: effective === null ? null : Math.round(effective * s.weight * 10) / 10,
      status: m.status,
      source: m.source,
      observedAt: m.observedAt,
    };
  });
  const missing = breakdown.filter((b) => b.value === null).map((b) => b.key);
  const coverage = Math.round(((SIGNALS.length - missing.length) / SIGNALS.length) * 100);
  const rawConfidence = niche.demoOnly
    ? 0
    : Math.round((SIGNALS.reduce((acc, s) => acc + STATUS_QUALITY[niche.signals[s.key].status] * freshness(niche.signals[s.key].observedAt, now), 0) / SIGNALS.length) * 100);

  let score: number | null = null;
  let recommendation = 'Dati insufficienti: completa i segnali mancanti con dati verificabili prima di valutare.';
  if (missing.length === 0) {
    const r = scoreNiche({
      demand: niche.signals.demand.value as number,
      competition: niche.signals.competition.value as number,
      trend: niche.signals.trend.value as number,
      unitEconomics: niche.signals.unitEconomics.value as number,
      differentiation: niche.signals.differentiation.value as number,
      evidenceConfidence: rawConfidence,
      demoOnly: niche.demoOnly,
    });
    score = r.score;
    recommendation = r.recommendation;
  }

  const risks = [...niche.risks];
  if (niche.demoOnly) risks.unshift('Dati di sola dimostrazione: nessuna evidenza di domanda reale.');
  if (missing.length) risks.push(`Segnali mancanti: ${missing.map((k) => SIGNALS.find((s) => s.key === k)?.label).join(', ')}.`);
  if (!niche.demoOnly && rawConfidence < 50) risks.push('Affidabilità bassa: fonti stimate, datate o incomplete.');
  if (niche.competitors.length === 0) risks.push('Nessun concorrente osservato: la competizione non è documentata.');
  else if (niche.competitors.some((c) => !c.verified)) risks.push('Alcuni concorrenti non sono verificati.');

  return { score, confidence: rawConfidence, coverage, recommendation, missing, breakdown, topRisks: risks.slice(0, 3) };
}

function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export interface CompetitorSummary {
  count: number;
  medianReviews: number | null;
  medianPrice: number | null;
  medianBsr: number | null;
  medianRating: number | null;
}

export function summarizeCompetitors(list: Competitor[]): CompetitorSummary {
  const pick = (f: (c: Competitor) => number | undefined) => median(list.map(f).filter((n): n is number => typeof n === 'number'));
  return {
    count: list.length,
    medianReviews: pick((c) => c.reviews),
    medianPrice: pick((c) => c.price),
    medianBsr: pick((c) => c.bsr),
    medianRating: pick((c) => c.rating),
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Stima i segnali Domanda e Competizione dai concorrenti caricati dall'utente.
 * Sono STIME dichiarate (status 'estimated') con metodologia esplicita:
 * il BSR è un indicatore relativo e non viene convertito in copie vendute.
 */
export function estimateSignalsFromCompetitors(list: Competitor[], source: string, observedAt: string): Partial<Record<SignalKey, Metric>> {
  const s = summarizeCompetitors(list);
  const out: Partial<Record<SignalKey, Metric>> = {};
  if (s.medianBsr !== null) {
    // Scala logaritmica: BSR 1.000 ≈ 85, 10.000 ≈ 65, 100.000 ≈ 45, 1.000.000 ≈ 25.
    const value = clamp(145 - 20 * Math.log10(Math.max(1, s.medianBsr)));
    out.demand = {
      value, unit: 'punti 0-100', status: 'estimated', source, observedAt, sampleSize: list.filter((c) => c.bsr).length,
      methodology: 'Indice relativo da BSR mediano dei concorrenti (scala logaritmica). Il BSR non misura copie vendute.',
    };
  }
  if (s.medianReviews !== null) {
    // 0 recensioni ≈ 5, 100 ≈ 45, 1.000 ≈ 65, 10.000 ≈ 85.
    const value = clamp(5 + 20 * Math.log10(1 + s.medianReviews));
    out.competition = {
      value, unit: 'punti 0-100', status: 'estimated', source, observedAt, sampleSize: list.filter((c) => c.reviews !== undefined).length,
      methodology: 'Indice relativo dalla mediana delle recensioni dei concorrenti (scala logaritmica).',
    };
  }
  return out;
}
