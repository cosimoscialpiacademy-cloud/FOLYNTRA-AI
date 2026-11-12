'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, Select, Textarea, useDebouncedSave, useToast } from '@/components/ui';
import { createProject } from '@/lib/defaults';
import { logActivity } from '@/lib/generation';
import { paperbackRoyalty } from '@/lib/kdp/royalty';
import { MARKETPLACES } from '@/lib/kdp/specs';
import { DEMO_NOTICE } from '@/lib/niche/demo';
import { SIGNALS, STATUS_LABEL, emptySignals, estimateSignalsFromCompetitors, evaluateNiche, summarizeCompetitors } from '@/lib/niche/engine';
import { useStore } from '@/lib/store/context';
import type { Competitor, EvidenceStatus, Marketplace, Niche, SignalKey } from '@/lib/types';
import { simulateProfit } from '@/lib/unit-economics';
import { formatDate, formatMoney, nowIso, uid } from '@/lib/utils';

export function ScoreDial({ score, size = 84 }: { score: number | null; size?: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={score === null ? 'Punteggio non calcolabile' : `Opportunità ${score} su 100`}>
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e3ddd0" strokeWidth="7" />
        {score !== null && <circle cx="40" cy="40" r={r} fill="none" stroke="#D7B574" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-serif text-2xl font-bold text-midnight">{score ?? 'n/d'}</span>
      </div>
    </div>
  );
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const numOrUndef = (s: string) => (s.trim() === '' || !Number.isFinite(Number(s.replace(',', '.'))) ? undefined : Number(s.replace(',', '.')));

export function NicheDetail({ niche, onDeleted }: { niche: Niche; onDeleted: () => void }) {
  const store = useStore();
  const toast = useToast();
  const router = useRouter();
  const [draft, setDraft] = useState(niche);
  const save = useCallback(async (n: Niche) => store.put('niches', { ...n, updatedAt: nowIso() }), [store]);
  const { dirty } = useDebouncedSave(draft, save);
  const ev = evaluateNiche(draft);
  const m = MARKETPLACES[draft.marketplace];
  const summary = summarizeCompetitors(draft.competitors);
  const set = (patch: Partial<Niche>) => setDraft((d) => ({ ...d, ...patch }));

  /* --- concorrenti --- */
  const [comp, setComp] = useState({ title: '', asin: '', price: '', reviews: '', rating: '', bsr: '', pages: '', verified: false });
  function addCompetitor() {
    if (!comp.title.trim()) return toast('Inserisci almeno il titolo del concorrente.', 'bad');
    const asin = comp.asin.trim().toUpperCase();
    if (asin && !/^[A-Z0-9]{10}$/.test(asin)) return toast('ASIN non valido: 10 caratteri alfanumerici, oppure lascia vuoto.', 'bad');
    const c: Competitor = { title: comp.title.trim(), verified: comp.verified, asin: asin || undefined, price: numOrUndef(comp.price), reviews: numOrUndef(comp.reviews), rating: numOrUndef(comp.rating), bsr: numOrUndef(comp.bsr), pages: numOrUndef(comp.pages) };
    set({ competitors: [...draft.competitors, c] });
    setComp({ title: '', asin: '', price: '', reviews: '', rating: '', bsr: '', pages: '', verified: false });
  }
  function estimateFromCompetitors() {
    const est = estimateSignalsFromCompetitors(draft.competitors, 'Concorrenti inseriti manualmente', nowIso());
    if (!Object.keys(est).length) return toast('Servono BSR o recensioni di almeno un concorrente.', 'bad');
    set({ signals: { ...draft.signals, ...est }, demoOnly: false });
    toast('Domanda/competizione stimate dai concorrenti: sono stime, non misure.', 'ok');
  }

  /* --- segnali --- */
  function setSignal(key: SignalKey, patch: { value?: string; status?: EvidenceStatus; source?: string; observedAt?: string }) {
    const cur = draft.signals[key];
    let next = { ...cur };
    if (patch.value !== undefined) {
      const n = numOrUndef(patch.value);
      if (n === undefined) next = { ...next, value: null, status: 'missing' };
      else next = { ...next, value: Math.max(0, Math.min(100, Math.round(n))), status: cur.status === 'missing' || cur.status === 'demo' ? 'estimated' : cur.status };
    }
    if (patch.status) next.status = patch.status;
    if (patch.source !== undefined) next.source = patch.source;
    if (patch.observedAt !== undefined) next.observedAt = patch.observedAt ? new Date(patch.observedAt).toISOString() : null;
    set({ signals: { ...draft.signals, [key]: next } });
  }

  /* --- scenario economico --- */
  const [eco, setEco] = useState({ price: m.currency === 'GBP' ? '10.99' : '12.99', pages: '150', print: '', conservative: '15', optimistic: '60', ads: '0', ai: '0', other: '0' });
  const price = numOrUndef(eco.price) ?? 0, pages = Math.max(24, Math.round(numOrUndef(eco.pages) ?? 150));
  const royalty = paperbackRoyalty({ listPrice: price, marketplace: draft.marketplace, pageCount: pages, printingCostOverride: numOrUndef(eco.print) });
  const scenarios = [['Zero vendite', 0], ['Conservativo', numOrUndef(eco.conservative) ?? 0], ['Ottimistico', numOrUndef(eco.optimistic) ?? 0]] as const;

  /* --- crea libro --- */
  const [projectName, setProjectName] = useState(niche.keyword);
  const [risk, setRisk] = useState(niche.riskAccepted);
  const [creating, setCreating] = useState(false);
  async function createBook() {
    if (!projectName.trim()) return toast('Dai un nome al progetto.', 'bad');
    setCreating(true);
    try {
      const now = nowIso();
      const selected: Niche = { ...draft, status: 'selected', riskAccepted: true, updatedAt: now };
      await store.put('niches', selected);
      const project = createProject({ id: uid(), name: projectName.trim(), niche: selected, now });
      await store.put('projects', project);
      await logActivity(store, project.id, `Progetto «${project.name}» creato dalla nicchia «${selected.keyword}»${selected.demoOnly ? ' (dati DEMO)' : ''}.`);
      router.push(`/progetti/${project.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Creazione non riuscita.', 'bad');
      setCreating(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Eliminare la nicchia «${draft.keyword}»?`)) return;
    await store.remove('niches', draft.id);
    onDeleted();
  }

  return (
    <div className="animate-rise space-y-4">
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <ScoreDial score={ev.score} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-xl font-bold text-midnight">{draft.keyword}</h2>
              {draft.demoOnly && <Badge tone="demo">DEMO</Badge>}
              {draft.status === 'hypothesis' && <Badge tone="warn">IPOTESI</Badge>}
              {draft.status === 'selected' && <Badge tone="ok">Selezionata</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate2">Opportunità 0–100: indicatore comparativo, NON probabilità di vendita.</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <Badge tone={ev.confidence >= 50 ? 'ok' : 'warn'}>Affidabilità {ev.confidence}%</Badge>
              <Badge>Copertura dati {ev.coverage}%</Badge>
              <Badge>{m.label}</Badge>
            </div>
            <p className="mt-2 text-sm font-medium text-ink">{ev.recommendation}</p>
          </div>
          <span className="text-xs text-slate2" aria-live="polite">{dirty ? 'Salvataggio…' : 'Salvato'}</span>
        </div>
        {draft.demoOnly && (
          <Notice tone="demo" className="mt-3">
            {DEMO_NOTICE}{' '}
            <button className="font-semibold underline" onClick={() => set({ demoOnly: false, signals: emptySignals(), status: 'hypothesis', category: '', commentary: '' })}>
              Azzera i valori demo e inserisci dati reali
            </button>
          </Notice>
        )}
        {ev.topRisks.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate2">Rischi principali</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink">{ev.topRisks.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Segnali e provenienza</CardTitle>
        <p className="mb-3 text-sm text-slate2">Opportunità = 0,30·Domanda + 0,25·(100 − Competizione) + 0,15·Trend + 0,20·Economia + 0,10·Differenziazione. Lascia vuoto ciò che non sai: non viene inventato alcun numero.</p>
        <div className="space-y-3">
          {SIGNALS.map((s) => {
            const metric = draft.signals[s.key];
            const b = ev.breakdown.find((x) => x.key === s.key)!;
            return (
              <div key={s.key} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-midnight">{s.label} <span className="text-xs font-normal text-slate2">peso {Math.round(s.weight * 100)}%{s.inverted ? ' · invertito' : ''}</span></p>
                  <Badge tone={metric.status === 'demo' ? 'demo' : metric.status === 'missing' ? 'bad' : metric.status === 'observed' ? 'ok' : 'gold'}>{STATUS_LABEL[metric.status]}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate2">{s.help}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-[6rem_9rem_1fr_10rem]">
                  <Field label="Valore 0–100">{(id) => <Input id={id} inputMode="numeric" disabled={draft.demoOnly} value={metric.value ?? ''} placeholder="n/d" onChange={(e) => setSignal(s.key, { value: e.target.value })} />}</Field>
                  <Field label="Tipo di dato">
                    {(id) => (
                      <Select id={id} disabled={draft.demoOnly || metric.status === 'missing'} value={metric.status} onChange={(e) => setSignal(s.key, { status: e.target.value as EvidenceStatus })}>
                        {metric.status === 'missing' && <option value="missing">Mancante</option>}
                        {metric.status === 'demo' && <option value="demo">DEMO</option>}
                        <option value="observed">Osservato</option>
                        <option value="estimated">Stimato</option>
                        <option value="imported">Importato</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Fonte">{(id) => <Input id={id} disabled={draft.demoOnly} value={metric.source} placeholder="Es. rilevazione manuale su Amazon.it" onChange={(e) => setSignal(s.key, { source: e.target.value })} />}</Field>
                  <Field label="Data osservazione">{(id) => <Input id={id} type="date" disabled={draft.demoOnly} value={metric.observedAt ? metric.observedAt.slice(0, 10) : ''} onChange={(e) => setSignal(s.key, { observedAt: e.target.value })} />}</Field>
                </div>
                {metric.methodology && <p className="mt-2 text-xs text-slate2">Metodologia: {metric.methodology}</p>}
                <p className="mt-1 text-xs text-slate2">Contributo al punteggio: {b.contribution === null ? 'DATO NON DISPONIBILE' : `${b.contribution} punti`}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardTitle action={<Button variant="outline" size="sm" onClick={estimateFromCompetitors} disabled={!draft.competitors.length}>Stima domanda e competizione</Button>}>Concorrenti osservati</CardTitle>
        <p className="mb-3 text-sm text-slate2">Inserisci solo libri che hai visto davvero. Il BSR è un indicatore relativo: non viene convertito in copie vendute. Nessuno scraping automatico.</p>
        {draft.competitors.length === 0 ? (
          <p className="text-sm text-slate2">Nessun concorrente inserito: la competizione non è documentata.</p>
        ) : (
          <>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate2"><tr><th className="px-1 py-1.5">Titolo</th><th className="px-1">Prezzo</th><th className="px-1">Recensioni</th><th className="px-1">Voto</th><th className="px-1">BSR</th><th className="px-1">Stato</th><th /></tr></thead>
                <tbody className="divide-y divide-line">
                  {draft.competitors.map((c, i) => (
                    <tr key={`${c.title}-${i}`}>
                      <td className="px-1 py-1.5">{c.title}{c.asin && <span className="ml-1 text-xs text-slate2">{c.asin}</span>}</td>
                      <td className="px-1">{c.price !== undefined ? formatMoney(c.price, m.currency) : 'n/d'}</td>
                      <td className="px-1">{c.reviews ?? 'n/d'}</td>
                      <td className="px-1">{c.rating ?? 'n/d'}</td>
                      <td className="px-1">{c.bsr?.toLocaleString('it-IT') ?? 'n/d'}</td>
                      <td className="px-1">{c.verified ? <Badge tone="ok">verificato</Badge> : <Badge tone="warn">non verificato</Badge>}</td>
                      <td className="px-1 text-right"><button aria-label={`Rimuovi ${c.title}`} className="p-1 text-slate2 hover:text-bad" onClick={() => set({ competitors: draft.competitors.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate2">Campione: {summary.count} · mediana recensioni {summary.medianReviews ?? 'n/d'} · mediana prezzo {summary.medianPrice !== null ? formatMoney(summary.medianPrice, m.currency) : 'n/d'} · mediana BSR {summary.medianBsr?.toLocaleString('it-IT') ?? 'n/d'}</p>
          </>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <Field label="Titolo" className="sm:col-span-2">{(id) => <Input id={id} value={comp.title} onChange={(e) => setComp({ ...comp, title: e.target.value })} />}</Field>
          <Field label="ASIN (facoltativo)">{(id) => <Input id={id} value={comp.asin} onChange={(e) => setComp({ ...comp, asin: e.target.value })} />}</Field>
          <Field label={`Prezzo (${m.currency})`}>{(id) => <Input id={id} inputMode="decimal" value={comp.price} onChange={(e) => setComp({ ...comp, price: e.target.value })} />}</Field>
          <Field label="Recensioni">{(id) => <Input id={id} inputMode="numeric" value={comp.reviews} onChange={(e) => setComp({ ...comp, reviews: e.target.value })} />}</Field>
          <Field label="Voto medio">{(id) => <Input id={id} inputMode="decimal" value={comp.rating} onChange={(e) => setComp({ ...comp, rating: e.target.value })} />}</Field>
          <Field label="BSR">{(id) => <Input id={id} inputMode="numeric" value={comp.bsr} onChange={(e) => setComp({ ...comp, bsr: e.target.value })} />}</Field>
          <Field label="Pagine">{(id) => <Input id={id} inputMode="numeric" value={comp.pages} onChange={(e) => setComp({ ...comp, pages: e.target.value })} />}</Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[#8a6a2b]" checked={comp.verified} onChange={(e) => setComp({ ...comp, verified: e.target.checked })} /> L’ho verificato di persona sulla pagina prodotto</label>
          <Button variant="outline" onClick={addCompetitor}><Plus className="size-4" aria-hidden /> Aggiungi concorrente</Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Posizionamento editoriale</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Keyword principale">{(id) => <Input id={id} value={draft.keyword} onChange={(e) => set({ keyword: e.target.value })} />}</Field>
          <Field label="Categoria">{(id) => <Input id={id} value={draft.category} disabled={draft.demoOnly} onChange={(e) => set({ category: e.target.value })} />}</Field>
          <Field label="Chi compra e perché" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={draft.buyerPersona} onChange={(e) => set({ buyerPersona: e.target.value })} />}</Field>
          <Field label="Keyword secondarie" hint="Una per riga (fino a 6: diventano le parole chiave KDP).">{(id) => <Textarea id={id} rows={4} value={draft.secondaryKeywords.join('\n')} onChange={(e) => set({ secondaryKeywords: e.target.value.split('\n') })} onBlur={() => set({ secondaryKeywords: lines(draft.secondaryKeywords.join('\n')) })} />}</Field>
          <Field label="Idee di differenziazione" hint="Una per riga: confluiscono nella proposta unica del brief.">{(id) => <Textarea id={id} rows={4} value={draft.differentiationIdeas.join('\n')} onChange={(e) => set({ differentiationIdeas: e.target.value.split('\n') })} onBlur={() => set({ differentiationIdeas: lines(draft.differentiationIdeas.join('\n')) })} />}</Field>
          <Field label="Note di rischio" hint="Una per riga: marchi, temi salute/legale/finanza, competenze richieste." className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} value={draft.risks.join('\n')} onChange={(e) => set({ risks: e.target.value.split('\n') })} onBlur={() => set({ risks: lines(draft.risks.join('\n')) })} />}</Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Scenari economici <Badge tone="warn" className="ml-1 align-middle">IPOTETICI</Badge></CardTitle>
        <p className="mb-3 text-sm text-slate2">Le copie al mese le decidi tu: non sono previsioni. Con zero vendite il risultato è negativo.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label={`Prezzo cartaceo (${m.currency})`}>{(id) => <Input id={id} inputMode="decimal" value={eco.price} onChange={(e) => setEco({ ...eco, price: e.target.value })} />}</Field>
          <Field label="Pagine previste">{(id) => <Input id={id} inputMode="numeric" value={eco.pages} onChange={(e) => setEco({ ...eco, pages: e.target.value })} />}</Field>
          <Field label="Costo stampa" hint={`Vuoto = stima ${formatMoney(royalty.printingCost, m.currency)}`}>{(id) => <Input id={id} inputMode="decimal" value={eco.print} onChange={(e) => setEco({ ...eco, print: e.target.value })} />}</Field>
          <Field label="Spesa Ads / mese">{(id) => <Input id={id} inputMode="decimal" value={eco.ads} onChange={(e) => setEco({ ...eco, ads: e.target.value })} />}</Field>
          <Field label="Copie/mese conservativo">{(id) => <Input id={id} inputMode="numeric" value={eco.conservative} onChange={(e) => setEco({ ...eco, conservative: e.target.value })} />}</Field>
          <Field label="Copie/mese ottimistico">{(id) => <Input id={id} inputMode="numeric" value={eco.optimistic} onChange={(e) => setEco({ ...eco, optimistic: e.target.value })} />}</Field>
          <Field label="Costi AI / mese">{(id) => <Input id={id} inputMode="decimal" value={eco.ai} onChange={(e) => setEco({ ...eco, ai: e.target.value })} />}</Field>
          <Field label="Altri costi / mese">{(id) => <Input id={id} inputMode="decimal" value={eco.other} onChange={(e) => setEco({ ...eco, other: e.target.value })} />}</Field>
        </div>
        <p className="mt-3 text-sm text-ink">
          Royalty stimata per copia: <strong>{formatMoney(royalty.royalty, m.currency)}</strong> (aliquota {Math.round(royalty.rate * 100)}% sul prezzo al netto IVA {formatMoney(royalty.netPrice, m.currency)}, meno stampa {formatMoney(royalty.printingCost, m.currency)}).
          {!royalty.printingCostVerified && <span className="text-warn"> Costo stampa indicativo: verificalo sul calcolatore KDP.</span>}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {scenarios.map(([label, units]) => {
            const r = simulateProfit({ hypotheticalUnits: Math.max(0, units), royaltyPerSale: royalty.royalty, adSpend: Math.max(0, numOrUndef(eco.ads) ?? 0), aiSpend: Math.max(0, numOrUndef(eco.ai) ?? 0), otherCosts: Math.max(0, numOrUndef(eco.other) ?? 0) });
            return (
              <div key={label} className="rounded-lg border border-line p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate2">{label} · {units} copie/mese</p>
                <p className={`mt-1 font-serif text-xl font-bold ${r.netBeforeTax < 0 ? 'text-bad' : 'text-midnight'}`}>{formatMoney(r.netBeforeTax, m.currency)}</p>
                <p className="text-xs text-slate2">ricavi {formatMoney(r.revenue, m.currency)} − costi {formatMoney(r.costs, m.currency)}, prima delle imposte</p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="border-gold/60">
        <CardTitle>Crea il libro in questa nicchia</CardTitle>
        <p className="mb-3 text-sm text-slate2">Keyword, pubblico, differenziazione e categoria confluiscono automaticamente nel brief editoriale.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Nome del progetto / titolo di lavoro">{(id) => <Input id={id} value={projectName} onChange={(e) => setProjectName(e.target.value)} />}</Field>
          <Button variant="gold" size="lg" disabled={!risk} loading={creating} onClick={() => void createBook()}>Crea il libro</Button>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#8a6a2b]" checked={risk} onChange={(e) => setRisk(e.target.checked)} />
          <span>
            Accetto il rischio: lo score non garantisce vendite.
            {draft.demoOnly ? ' Questa nicchia usa dati DEMO senza alcun valore di mercato.' : ev.confidence < 50 ? ' L’affidabilità dei dati è bassa.' : ''}
          </span>
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-slate2">
          <span>Creata il {formatDate(draft.createdAt)} · {m.label}</span>
          <Select aria-label="Mercato della nicchia" className="w-auto min-w-48" value={draft.marketplace} onChange={(e) => set({ marketplace: e.target.value as Marketplace })}>
            {Object.entries(MARKETPLACES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Button variant="danger" size="sm" onClick={() => void remove()}><Trash2 className="size-4" aria-hidden /> Elimina nicchia</Button>
        </div>
      </Card>
    </div>
  );
}
