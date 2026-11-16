/**
 * Stima IA dei segnali di una nicchia. NON sono dati di mercato: sono giudizi qualitativi del modello,
 * salvati con stato «ai_estimate» (affidabilità massima ~30%), fonte e motivazione dichiarate.
 * Non sovrascrivono mai dati osservati, importati o inseriti a mano.
 */
import type { NicheScoreOutput } from '../ai/schemas';
import { callAi, type DoneEvent } from '../client-api';
import { SIGNALS } from './engine';
import type { Metric, Niche, SignalKey } from '../types';
import { nowIso } from '../utils';

const OVERWRITABLE = new Set(['missing', 'ai_estimate']);

export function applyEstimate(niche: Niche, r: NicheScoreOutput['results'][number], model: string, now = nowIso()): Niche {
  const signals = { ...niche.signals };
  const day = now.slice(0, 10);
  for (const s of SIGNALS) {
    if (!OVERWRITABLE.has(signals[s.key].status)) continue;
    const e = r[s.key as SignalKey];
    if (!e || !Number.isFinite(e.value)) continue;
    const metric: Metric = {
      value: Math.max(0, Math.min(100, Math.round(e.value))),
      unit: 'punti 0-100',
      status: 'ai_estimate',
      source: `Stima IA (${model}, ${day}): giudizio qualitativo da conoscenze generali, NON dati di mercato`,
      observedAt: now,
      methodology: e.why,
    };
    signals[s.key] = metric;
  }
  const risks = [...new Set([...niche.risks, ...r.risks.map((x) => x.trim()).filter(Boolean)])].slice(0, 8);
  const note = `Stima IA (${day}): ${r.summary.trim()} Da verificare a mano: ${r.verifyChecklist.map((x) => x.trim()).filter(Boolean).join('; ')}.`;
  const commentary = niche.commentary.includes('Stima IA (') ? niche.commentary.replace(/Stima IA \([\s\S]*$/, note) : [niche.commentary, note].filter(Boolean).join('\n\n');
  return { ...niche, signals, risks, commentary, updatedAt: now };
}

export async function estimateNiches(items: Niche[], opts: { token: string | null; budgetUsd: number; language: string }): Promise<{ updated: Niche[]; done: DoneEvent; skipped: number }> {
  const eligible = items.filter((n) => !n.demoOnly).slice(0, 12);
  if (!eligible.length) throw new Error('Nessuna nicchia valutabile: le nicchie DEMO non si stimano.');
  const done = await callAi(
    {
      task: 'nicheScore',
      input: {
        items: eligible.map((n) => ({ id: n.id, keyword: n.keyword.slice(0, 500), buyerPersona: n.buyerPersona.slice(0, 500), category: n.category.slice(0, 500), marketplace: n.marketplace, secondaryKeywords: n.secondaryKeywords.slice(0, 8).map((k) => k.slice(0, 500)), notes: n.differentiationIdeas.slice(0, 3).join('; ').slice(0, 800) })),
        language: opts.language.slice(0, 500),
      },
      projectId: null,
      spentUsd: 0,
      budgetUsd: opts.budgetUsd,
    },
    { token: opts.token },
  );
  const out = done.data as NicheScoreOutput;
  const byId = new Map(out.results.map((r) => [r.id, r]));
  const model = done.provider === 'mock' ? 'mock' : done.model;
  const updated = eligible.map((n) => (byId.has(n.id) ? applyEstimate(n, byId.get(n.id)!, model) : n));
  return { updated, done, skipped: eligible.filter((n) => !byId.has(n.id)).length };
}
