/**
 * Amazon Sponsored Products: pianificatore MANUALE e metriche.
 * Nessuna campagna viene creata o avviata da FOLYNTRA: il collegamento all'API
 * Amazon Ads è previsto solo dopo approvazione e consenso OAuth (docs/05 §11).
 */
import type { AdGroup, AdPlan, AdReportRow, Niche, Project, SaleEntry } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;
const uniq = (list: string[]) => [...new Set(list.map((k) => k.trim().toLowerCase()).filter(Boolean))];

export const DEFAULT_NEGATIVES = ['gratis', 'pdf', 'usato', 'download'];

/** Proposta iniziale dai dati del progetto: tutto modificabile dall'utente. */
export function buildAdPlan(input: { id: string; project: Project; niche: Niche | null; now: string }): AdPlan {
  const { project, niche } = input;
  const keywords = uniq([...project.kdp.keywords, niche?.keyword ?? '', ...(niche?.secondaryKeywords ?? [])]).slice(0, 20);
  const defaultBid = 0.35;
  const group = (name: string, matchType: AdGroup['matchType'], factor: number, kws: string[]): AdGroup => ({ name, matchType, keywords: kws, bid: round2(defaultBid * factor) });
  return {
    id: input.id,
    projectId: project.id,
    status: 'planning',
    dailyBudget: 5,
    defaultBid,
    assumedCvrPct: 8,
    groups: [
      group('Esatta — keyword principali', 'exact', 1, keywords.slice(0, 7)),
      group('Frase — varianti', 'phrase', 0.85, keywords),
      group('Generica — scoperta', 'broad', 0.7, keywords.slice(0, 5)),
    ],
    negatives: [...DEFAULT_NEGATIVES],
    // Solo ASIN inseriti e verificati dall'utente nella scheda nicchia: nessuna raccolta automatica.
    asinTargets: uniq((niche?.competitors ?? []).filter((c) => c.verified && c.asin).map((c) => c.asin as string)).map((a) => a.toUpperCase()),
    reportRows: [],
    reportFileName: null,
    reportImportedAt: null,
    updatedAt: input.now,
  };
}

export interface AdTotals {
  impressions: number;
  clicks: number;
  spend: number;
  sales: number;
  orders: number;
  /** null = non calcolabile (divisione per zero): mai mostrato come 0. */
  ctrPct: number | null;
  cpc: number | null;
  cvrPct: number | null;
  acosPct: number | null;
  roas: number | null;
}

export function totals(rows: AdReportRow[]): AdTotals {
  const sum = (f: (r: AdReportRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const impressions = sum((r) => r.impressions), clicks = sum((r) => r.clicks), spend = round2(sum((r) => r.spend)), sales = round2(sum((r) => r.sales)), orders = sum((r) => r.orders);
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  const pct = (v: number | null) => (v === null ? null : round2(v * 100));
  const cpc = div(spend, clicks), roas = div(sales, spend);
  return { impressions, clicks, spend, sales, orders, ctrPct: pct(div(clicks, impressions)), cpc: cpc === null ? null : round2(cpc), cvrPct: pct(div(orders, clicks)), acosPct: pct(div(spend, sales)), roas: roas === null ? null : round2(roas) };
}

/** Raggruppa le righe per campagna o per target, ordinate per spesa. */
export function groupRows(rows: AdReportRow[], by: 'campaign' | 'target'): { key: string; totals: AdTotals }[] {
  const map = new Map<string, AdReportRow[]>();
  for (const r of rows) map.set(r[by] || '(senza nome)', [...(map.get(r[by] || '(senza nome)') ?? []), r]);
  return [...map].map(([key, list]) => ({ key, totals: totals(list) })).sort((a, b) => b.totals.spend - a.totals.spend);
}

export interface BreakEven {
  /** ACOS oltre il quale ogni vendita da Ads è in perdita: royalty ÷ prezzo. */
  breakEvenAcosPct: number | null;
  /** CPC massimo sostenibile al tasso di conversione IPOTIZZATO. */
  maxCpc: number | null;
  /** Clic al giorno acquistabili con il budget all'offerta predefinita. */
  clicksPerDay: number | null;
}

export function breakEven(input: { listPrice: number; royaltyPerSale: number; assumedCvrPct: number; dailyBudget: number; defaultBid: number }): BreakEven {
  const { listPrice, royaltyPerSale, assumedCvrPct, dailyBudget, defaultBid } = input;
  const ok = listPrice > 0 && royaltyPerSale > 0;
  return {
    breakEvenAcosPct: ok ? round2((royaltyPerSale / listPrice) * 100) : null,
    maxCpc: ok && assumedCvrPct > 0 ? round2(royaltyPerSale * (assumedCvrPct / 100)) : null,
    clicksPerDay: defaultBid > 0 ? Math.floor(dailyBudget / defaultBid) : null,
  };
}

/**
 * Margine dalle Ads: gli ordini del report × royalty stimata − spesa.
 * È una STIMA (la royalty per copia è simulata), distinta dalle royalty reali importate.
 */
export function adMargin(t: AdTotals, royaltyPerSale: number): { estimatedRoyalties: number; margin: number } {
  const estimatedRoyalties = round2(t.orders * royaltyPerSale);
  return { estimatedRoyalties, margin: round2(estimatedRoyalties - t.spend) };
}

export interface SalesSummary {
  units: number;
  byCurrency: { currency: string; royalty: number; units: number }[];
  byMarketplace: { marketplace: string; currency: string; royalty: number; units: number }[];
  from: string | null;
  to: string | null;
}

export function summarizeSales(entries: SaleEntry[]): SalesSummary {
  const cur = new Map<string, { royalty: number; units: number }>();
  const mk = new Map<string, { marketplace: string; currency: string; royalty: number; units: number }>();
  for (const e of entries) {
    const c = cur.get(e.currency) ?? { royalty: 0, units: 0 };
    cur.set(e.currency, { royalty: c.royalty + e.royalty, units: c.units + e.units });
    const k = `${e.marketplace}|${e.currency}`;
    const m = mk.get(k) ?? { marketplace: e.marketplace, currency: e.currency, royalty: 0, units: 0 };
    mk.set(k, { ...m, royalty: m.royalty + e.royalty, units: m.units + e.units });
  }
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  return {
    units: entries.reduce((n, e) => n + e.units, 0),
    byCurrency: [...cur].map(([currency, v]) => ({ currency, royalty: round2(v.royalty), units: v.units })),
    byMarketplace: [...mk.values()].map((v) => ({ ...v, royalty: round2(v.royalty) })).sort((a, b) => b.royalty - a.royalty),
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
  };
}

/** Piano in CSV leggibile, da ricopiare a mano nella console Amazon Ads (non è il formato "bulk"). */
export function planToCsv(plan: AdPlan): string {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['tipo', 'gruppo', 'corrispondenza', 'valore', 'offerta'].join(',')];
  for (const g of plan.groups) for (const k of g.keywords) lines.push(['keyword', g.name, g.matchType, k, g.bid].map(cell).join(','));
  for (const n of plan.negatives) lines.push(['negativa', '', 'negative exact', n, ''].map(cell).join(','));
  for (const a of plan.asinTargets) lines.push(['asin', 'Target prodotto', '', a, plan.defaultBid].map(cell).join(','));
  lines.push(['budget_giornaliero', '', '', plan.dailyBudget, ''].map(cell).join(','));
  return lines.join('\n') + '\n';
}
