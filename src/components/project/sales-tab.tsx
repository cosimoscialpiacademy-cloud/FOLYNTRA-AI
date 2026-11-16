'use client';

import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Badge, Button, Card, CardTitle, Empty, Field, Input, Notice, Select, Textarea, useDebouncedSave, useToast } from '@/components/ui';
import { ADS_TEMPLATE, KDP_TEMPLATE, MAX_REPORT_BYTES, parseAdsReport, parseKdpRoyalties, type ReportIssue } from '@/lib/ads/import';
import { adMargin, breakEven, buildAdPlan, groupRows, planToCsv, summarizeSales, totals } from '@/lib/ads/metrics';
import { downloadBlob } from '@/lib/client-api';
import { logActivity } from '@/lib/generation';
import { paperbackRoyalty } from '@/lib/kdp/royalty';
import { MARKETPLACES } from '@/lib/kdp/specs';
import { useLive, useStore } from '@/lib/store/context';
import type { AdPlan, Currency, MatchType } from '@/lib/types';
import { formatDate, formatMoney, nowIso, slugify, uid } from '@/lib/utils';
import type { TabProps } from './types';

const MATCH: Record<MatchType, string> = { exact: 'Esatta', phrase: 'Frase', broad: 'Generica' };
const nd = 'n/d';
const money = (v: number | null, c: Currency) => (v === null ? nd : formatMoney(v, c));
const pct = (v: number | null) => (v === null ? nd : `${v.toLocaleString('it-IT')}%`);
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

function Issues({ errors }: { errors: ReportIssue[] }) {
  if (!errors.length) return null;
  return (
    <Notice tone="bad" className="mt-3">
      <p className="font-semibold">Righe scartate o file non riconosciuto ({errors.length})</p>
      <ul className="mt-1 list-disc pl-5">{errors.slice(0, 6).map((e, i) => <li key={i}>{e.row ? `Riga ${e.row}: ` : ''}{e.message}</li>)}</ul>
    </Notice>
  );
}

function PlanEditor({ initial, currency, listPrice, royalty, royaltyKnown }: { initial: AdPlan; currency: Currency; listPrice: number; royalty: number; royaltyKnown: boolean }) {
  const store = useStore();
  const toast = useToast();
  const [plan, setPlan] = useState(initial);
  const save = useCallback(async (p: AdPlan) => store.put('adPlans', { ...p, updatedAt: nowIso() }), [store]);
  useDebouncedSave(plan, save);
  const set = (patch: Partial<AdPlan>) => setPlan((p) => ({ ...p, ...patch }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<ReportIssue[]>([]);
  const [by, setBy] = useState<'campaign' | 'target'>('campaign');

  const be = breakEven({ listPrice, royaltyPerSale: royalty, assumedCvrPct: plan.assumedCvrPct, dailyBudget: plan.dailyBudget, defaultBid: plan.defaultBid });
  const t = totals(plan.reportRows);
  const margin = adMargin(t, royalty);
  const kwCount = plan.groups.reduce((n, g) => n + g.keywords.length, 0);

  async function onReport(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_REPORT_BYTES) return setErrors([{ row: 0, message: 'File troppo grande.' }]);
    const r = parseAdsReport(await file.text());
    setErrors(r.errors);
    if (r.rows.length) {
      set({ reportRows: r.rows, reportFileName: file.name, reportImportedAt: nowIso() });
      await logActivity(store, plan.projectId, `Report Ads «${file.name}» importato: ${r.rows.length} righe.`);
      toast(`${r.rows.length} righe importate dal report.`, 'ok');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      <Card>
        <CardTitle action={<Badge tone={plan.status === 'manual_ready' ? 'ok' : 'neutral'}>{plan.status === 'manual_ready' ? 'Pronto per l’inserimento manuale' : 'In pianificazione'}</Badge>}>Piano Sponsored Products</CardTitle>
        <Notice>Pianificazione pronta: avvio campagne manuale finché Amazon Ads API non è autorizzata. FOLYNTRA non crea campagne e non spende budget.</Notice>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={`Budget giornaliero (${currency})`}>{(id) => <Input id={id} type="number" min={0} step={1} value={plan.dailyBudget} onChange={(e) => set({ dailyBudget: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
          <Field label={`Offerta predefinita (${currency})`}>{(id) => <Input id={id} type="number" min={0} step={0.05} value={plan.defaultBid} onChange={(e) => set({ defaultBid: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
          <Field label="Conversione ipotizzata (%)" hint="Clic che diventano ordini: è una tua ipotesi.">{(id) => <Input id={id} type="number" min={0} max={100} step={0.5} value={plan.assumedCvrPct} onChange={(e) => set({ assumedCvrPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />}</Field>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate2">ACOS di pareggio</p><p className="mt-1 font-display text-xl font-bold text-ink">{pct(be.breakEvenAcosPct)}</p><p className="text-xs text-slate2">royalty {formatMoney(royalty, currency)} ÷ prezzo {formatMoney(listPrice, currency)}</p></div>
          <div className="rounded-lg border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate2">CPC massimo sostenibile</p><p className="mt-1 font-display text-xl font-bold text-ink">{money(be.maxCpc, currency)}</p><p className="text-xs text-slate2">alla conversione ipotizzata del {plan.assumedCvrPct}%</p></div>
          <div className="rounded-lg border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate2">Clic al giorno acquistabili</p><p className="mt-1 font-display text-xl font-bold text-ink">{be.clicksPerDay ?? nd}</p><p className="text-xs text-slate2">un clic non garantisce un acquisto</p></div>
        </div>
        {!royaltyKnown && <p className="mt-2 text-xs text-warn">Royalty calcolata su 150 pagine ipotetiche: genera il PDF interno per usare le pagine reali.</p>}
        {be.maxCpc !== null && plan.defaultBid > be.maxCpc && <Notice tone="warn" className="mt-3">L’offerta predefinita supera il CPC massimo sostenibile: con queste ipotesi ogni vendita da Ads sarebbe in perdita.</Notice>}

        <h3 className="mt-5 text-sm font-semibold text-ink">Gruppi di keyword ({kwCount})</h3>
        <ul className="mt-2 space-y-3">
          {plan.groups.map((g, i) => {
            const setG = (patch: Partial<typeof g>) => set({ groups: plan.groups.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <li key={i} className="rounded-lg border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem_7rem_auto]">
                  <Input aria-label={`Nome gruppo ${i + 1}`} value={g.name} onChange={(e) => setG({ name: e.target.value })} />
                  <Select aria-label={`Corrispondenza gruppo ${i + 1}`} value={g.matchType} onChange={(e) => setG({ matchType: e.target.value as MatchType })}>{Object.entries(MATCH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  <Input aria-label={`Offerta gruppo ${i + 1}`} type="number" min={0} step={0.05} value={g.bid} onChange={(e) => setG({ bid: Math.max(0, Number(e.target.value) || 0) })} />
                  <button aria-label={`Rimuovi gruppo ${i + 1}`} className="justify-self-end p-2 text-slate2 hover:text-bad" onClick={() => set({ groups: plan.groups.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden /></button>
                </div>
                <Textarea aria-label={`Keyword del gruppo ${i + 1}`} className="mt-2" rows={3} placeholder="Una keyword per riga" value={g.keywords.join('\n')} onChange={(e) => setG({ keywords: e.target.value.split('\n') })} onBlur={() => setG({ keywords: lines(g.keywords.join('\n')) })} />
              </li>
            );
          })}
        </ul>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => set({ groups: [...plan.groups, { name: `Gruppo ${plan.groups.length + 1}`, matchType: 'exact', keywords: [], bid: plan.defaultBid }] })}><Plus className="size-4" aria-hidden /> Aggiungi gruppo</Button>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Keyword negative" hint="Una per riga.">{(id) => <Textarea id={id} rows={4} value={plan.negatives.join('\n')} onChange={(e) => set({ negatives: e.target.value.split('\n') })} onBlur={() => set({ negatives: lines(plan.negatives.join('\n')) })} />}</Field>
          <Field label="Target ASIN" hint="Solo ASIN che hai verificato tu sulla pagina prodotto (arrivano dai concorrenti “verificati” della nicchia). Nessuna raccolta automatica.">{(id) => <Textarea id={id} rows={4} value={plan.asinTargets.join('\n')} onChange={(e) => set({ asinTargets: e.target.value.split('\n') })} onBlur={() => set({ asinTargets: lines(plan.asinTargets.join('\n')).map((a) => a.toUpperCase()).filter((a) => /^[A-Z0-9]{10}$/.test(a)) })} />}</Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadBlob(new Blob([planToCsv(plan)], { type: 'text/csv' }), `piano-ads-${slugify(initial.projectId).slice(0, 8)}.csv`)}><Download className="size-4" aria-hidden /> Scarica piano (CSV)</Button>
          <Button variant={plan.status === 'manual_ready' ? 'outline' : 'primary'} disabled={!kwCount} onClick={() => set({ status: plan.status === 'manual_ready' ? 'planning' : 'manual_ready' })}>{plan.status === 'manual_ready' ? 'Riporta in pianificazione' : 'Segna come pronto per l’inserimento manuale'}</Button>
        </div>
        <p className="mt-2 text-xs text-slate2">Il CSV è un promemoria leggibile da ricopiare nella console Amazon Ads: non è il formato di caricamento massivo.</p>
      </Card>

      <Card>
        <CardTitle>Risultati delle campagne (dal tuo report)</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} id="ads-report-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onReport(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" aria-hidden /> Importa report Ads (CSV)</Button>
          <button className="inline-flex items-center gap-1 text-sm font-medium text-cyan hover:underline" onClick={() => downloadBlob(new Blob([ADS_TEMPLATE], { type: 'text/csv' }), 'modello-report-ads.csv')}><Download className="size-3.5" aria-hidden /> Modello colonne</button>
          {plan.reportRows.length > 0 && <Button variant="ghost" size="sm" onClick={() => set({ reportRows: [], reportFileName: null, reportImportedAt: null })}>Rimuovi report</Button>}
        </div>
        <Issues errors={errors} />
        {plan.reportRows.length === 0 ? (
          <p className="mt-3 text-sm text-slate2">Nessun report importato: nessuna performance viene mostrata. Scarica il report Sponsored Products dalla console Amazon Ads e caricalo qui.</p>
        ) : (
          <div className="mt-3" data-testid="ads-results">
            <p className="text-xs text-slate2">Fonte: {plan.reportFileName} · importato il {formatDate(plan.reportImportedAt)} · {plan.reportRows.length} righe</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([['Spesa', money(t.spend, currency)], ['Vendite attribuite', money(t.sales, currency)], ['ACOS', pct(t.acosPct)], ['ROAS', t.roas === null ? nd : t.roas.toLocaleString('it-IT')], ['Impressioni', t.impressions.toLocaleString('it-IT')], ['Clic', t.clicks.toLocaleString('it-IT')], ['CPC medio', money(t.cpc, currency)], ['Ordini', t.orders.toLocaleString('it-IT')]] as const).map(([l, v]) => (
                <div key={l} className="rounded-lg border border-line p-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate2">{l}</p><p className="mt-1 font-display text-lg font-bold text-ink">{v}</p></div>
              ))}
            </div>
            <Notice tone={margin.margin < 0 ? 'bad' : 'ok'} className="mt-3">
              Margine stimato dalle Ads: <strong>{formatMoney(margin.margin, currency)}</strong> = {t.orders} ordini × royalty stimata {formatMoney(royalty, currency)} ({formatMoney(margin.estimatedRoyalties, currency)}) − spesa {formatMoney(t.spend, currency)}.
              {be.breakEvenAcosPct !== null && t.acosPct !== null && ` ACOS ${t.acosPct}% contro pareggio ${be.breakEvenAcosPct}%.`} Le “vendite attribuite” sono a prezzo di listino, non royalty.
            </Notice>
            <div className="mt-3 flex gap-1 rounded-lg bg-white/5 p-1 sm:w-80" role="group" aria-label="Raggruppa per">
              {(['campaign', 'target'] as const).map((k) => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)} className={`min-h-9 flex-1 rounded-md px-2 text-sm font-medium ${by === k ? 'bg-card text-ink shadow-sm' : 'text-slate2'}`}>{k === 'campaign' ? 'Per campagna' : 'Per keyword / target'}</button>)}
            </div>
            <div className="-mx-1 mt-2 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate2"><tr><th className="px-1 py-1.5">{by === 'campaign' ? 'Campagna' : 'Target'}</th><th className="px-1">Clic</th><th className="px-1">Spesa</th><th className="px-1">Vendite</th><th className="px-1">Ordini</th><th className="px-1">ACOS</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {groupRows(plan.reportRows, by).slice(0, 30).map((g) => (
                    <tr key={g.key}><td className="px-1 py-1.5">{g.key}</td><td className="px-1">{g.totals.clicks}</td><td className="px-1">{money(g.totals.spend, currency)}</td><td className="px-1">{money(g.totals.sales, currency)}</td><td className="px-1">{g.totals.orders}</td>
                      <td className={`px-1 font-semibold ${be.breakEvenAcosPct !== null && g.totals.acosPct !== null && g.totals.acosPct > be.breakEvenAcosPct ? 'text-bad' : 'text-ink'}`}>{g.totals.acosPct === null ? (g.totals.spend > 0 ? 'nessuna vendita' : nd) : `${g.totals.acosPct}%`}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

export function SalesTab({ project, niche }: TabProps) {
  const store = useStore();
  const toast = useToast();
  const plans = useLive('adPlans', project.id);
  const sales = useLive('sales', project.id);
  const costs = useLive('costs', project.id);
  const m = MARKETPLACES[project.marketplace];
  const royaltyKnown = Boolean(project.pageCount);
  const royalty = paperbackRoyalty({ listPrice: project.kdp.listPricePaperback, marketplace: project.marketplace, pageCount: project.pageCount ?? 150 }).royalty;
  const plan = plans.data[0] ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<ReportIssue[]>([]);
  const summary = summarizeSales(sales.data);
  const adSpend = plan ? totals(plan.reportRows).spend : 0;
  const aiSpend = costs.data.reduce((n, c) => n + c.costUsd, 0);

  async function createPlan() {
    await store.put('adPlans', buildAdPlan({ id: uid(), project, niche, now: nowIso() }));
    await logActivity(store, project.id, 'Piano Ads creato (bozza manuale).');
  }

  async function onRoyalties(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_REPORT_BYTES) return setErrors([{ row: 0, message: 'File troppo grande.' }]);
    const r = parseKdpRoyalties(await file.text(), { projectId: project.id, newId: uid, defaultCurrency: m.currency });
    setErrors(r.errors);
    for (const e of r.entries) await store.put('sales', e);
    if (r.entries.length) {
      await logActivity(store, project.id, `Report royalties «${file.name}» importato: ${r.entries.length} righe.`);
      toast(`${r.entries.length} righe di royalties importate.`, 'ok');
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function clearSales() {
    if (!window.confirm('Eliminare tutte le righe di royalties importate per questo libro?')) return;
    for (const e of sales.data) await store.remove('sales', e.id);
  }

  return (
    <div className="space-y-4">
      {plans.loading ? (
        <p className="text-sm text-slate2">Caricamento…</p>
      ) : plan ? (
        <PlanEditor key={plan.id} initial={plan} currency={m.currency} listPrice={project.kdp.listPricePaperback} royalty={royalty} royaltyKnown={royaltyKnown} />
      ) : (
        <Empty title="Nessun piano Ads">
          <p>Crea una bozza di campagna Sponsored Products dalle parole chiave del libro: gruppi per corrispondenza, negative, offerte e budget. Resta un piano da inserire a mano nella console Amazon Ads.</p>
          <Button variant="gold" className="mt-3" onClick={() => void createPlan()}>Crea piano Ads</Button>
        </Empty>
      )}

      <Card>
        <CardTitle>Royalties KDP (dai tuoi report)</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} id="royalties-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onRoyalties(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" aria-hidden /> Importa royalties (CSV)</Button>
          <button className="inline-flex items-center gap-1 text-sm font-medium text-cyan hover:underline" onClick={() => downloadBlob(new Blob([KDP_TEMPLATE], { type: 'text/csv' }), 'modello-royalties.csv')}><Download className="size-3.5" aria-hidden /> Modello colonne</button>
          {sales.data.length > 0 && <Button variant="ghost" size="sm" onClick={() => void clearSales()}>Elimina righe importate</Button>}
        </div>
        <p className="mt-2 text-xs text-slate2">KDP esporta i report in Excel: salva il foglio delle royalties come CSV e caricalo. Ogni import aggiunge righe: non caricare due volte lo stesso periodo.</p>
        <Issues errors={errors} />
        {sales.data.length === 0 ? (
          <p className="mt-3 text-sm text-slate2">Nessuna royalty importata: nessun guadagno viene mostrato o stimato qui.</p>
        ) : (
          <div className="mt-3" data-testid="royalties-results">
            <p className="text-xs text-slate2">{sales.data.length} righe · dal {formatDate(summary.from)} al {formatDate(summary.to)} · {summary.units.toLocaleString('it-IT')} copie</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {summary.byCurrency.map((c) => {
                const sameCurrency = c.currency === m.currency;
                return (
                  <div key={c.currency} className="rounded-lg border border-line p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate2">Royalties reali · {c.currency}</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink">{c.royalty.toLocaleString('it-IT', { minimumFractionDigits: 2 })} {c.currency}</p>
                    <p className="text-xs text-slate2">{c.units} copie{sameCurrency && plan?.reportRows.length ? ` · dopo Ads: ${(c.royalty - adSpend).toLocaleString('it-IT', { minimumFractionDigits: 2 })} ${c.currency}` : ''}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-slate2">Margine “dopo Ads” = royalties reali − spesa del report Ads importato (stessa valuta, periodi da far coincidere a tua cura). Costi AI registrati per questo libro: {formatMoney(aiSpend, 'USD')} (valuta diversa, non sottratti). Prima delle imposte.</p>
            <div className="-mx-1 mt-3 overflow-x-auto">
              <table className="w-full min-w-[24rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate2"><tr><th className="px-1 py-1.5">Mercato</th><th className="px-1">Copie</th><th className="px-1">Royalties</th></tr></thead>
                <tbody className="divide-y divide-line">{summary.byMarketplace.map((r) => <tr key={`${r.marketplace}${r.currency}`}><td className="px-1 py-1.5">{r.marketplace}</td><td className="px-1">{r.units}</td><td className="px-1">{r.royalty.toLocaleString('it-IT', { minimumFractionDigits: 2 })} {r.currency}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
