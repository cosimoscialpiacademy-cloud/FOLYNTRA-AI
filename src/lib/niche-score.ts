/** FOLYNTRA AI. Transparent opportunity score; never imply predicted sales. */
export type NicheSignals = {
  demand: number;
  competition: number;
  trend: number;
  unitEconomics: number;
  differentiation: number;
  /** data quality: 0-100; a DEMO-only result must always have 0 */
  evidenceConfidence: number;
  demoOnly?: boolean;
};

function signal(v: number, label: string): number {
  if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`${label} deve essere fra 0 e 100`);
  return v;
}
export function scoreNiche(s: NicheSignals): { score: number; confidence: number; recommendation: string } {
  const d = signal(s.demand, 'domanda');
  const c = signal(s.competition, 'competizione');
  const t = signal(s.trend, 'trend');
  const e = signal(s.unitEconomics, 'economia');
  const u = signal(s.differentiation, 'differenziazione');
  const conf = s.demoOnly ? 0 : signal(s.evidenceConfidence, 'confidenza');
  const score = Math.round(.30*d + .25*(100-c) + .15*t + .20*e + .10*u);
  const recommendation = s.demoOnly
    ? 'Solo dimostrazione: non costituisce ricerca di mercato.'
    : conf < 50
      ? 'Segnali poco affidabili: occorrono dati verificabili prima di investire.'
      : score >= 70
        ? 'Da approfondire con competitor reali e un test editoriale.'
        : 'Valuta differenziazione e domanda prima di procedere.';
  return { score, confidence: conf, recommendation };
}
