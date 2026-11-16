'use client';

import { Download, FlaskConical, Lightbulb, Plus, Sparkles, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { NicheDetail } from '@/components/niche/niche-detail';
import { PageHeader } from '@/components/shell';
import { Badge, Button, Card, CardTitle, Empty, Field, Input, Notice, Select, useToast } from '@/components/ui';
import type { BrainstormOutput } from '@/lib/ai/schemas';
import { callAi, downloadBlob } from '@/lib/client-api';
import { logActivity, recordCost } from '@/lib/generation';
import { MARKETPLACES } from '@/lib/kdp/specs';
import { CSV_TEMPLATE_COMPETITORS, CSV_TEMPLATE_SIGNALS, MAX_CSV_BYTES, parseNicheCsv, type CsvImportResult } from '@/lib/niche/csv';
import { estimateNiches } from '@/lib/niche/ai-estimate';
import { DEMO_NOTICE, buildDemoNiches } from '@/lib/niche/demo';
import { SIGNALS, emptySignals, evaluateNiche, summarizeCompetitors } from '@/lib/niche/engine';
import { useApp, useLive, useStore } from '@/lib/store/context';
import type { Marketplace, Niche } from '@/lib/types';
import { formatDate, nowIso, uid } from '@/lib/utils';

function newNiche(keyword: string, marketplace: Marketplace, patch: Partial<Niche> = {}): Niche {
  const now = nowIso();
  return {
    id: uid(), keyword, buyerPersona: '', marketplace, category: '', status: 'hypothesis', demoOnly: false, signals: emptySignals(), competitors: [],
    secondaryKeywords: [], differentiationIdeas: [], risks: [], commentary: '', riskAccepted: false, createdAt: now, updatedAt: now, ...patch,
  };
}

export default function NichesPage() {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const niches = useLive('niches');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [form, setForm] = useState({ theme: '', audience: '', category: '', marketplace: 'amazon.it' as Marketplace });
  const [brainstorming, setBrainstorming] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const sorted = [...niches.data].sort((a, b) => (evaluateNiche(b).score ?? -1) - (evaluateNiche(a).score ?? -1) || b.createdAt.localeCompare(a.createdAt));
  const selected = sorted.find((n) => n.id === selectedId) ?? null;
  const compared = sorted.filter((n) => compare.includes(n.id));
  const hasDemo = sorted.some((n) => n.demoOnly);
  const noScore = sorted.filter((n) => !n.demoOnly && evaluateNiche(n).score === null);

  function open(id: string) {
    setSelectedId(id);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function loadDemo() {
    const existing = new Set(niches.data.filter((n) => n.demoOnly).map((n) => n.keyword));
    const fresh = buildDemoNiches(uid, nowIso()).filter((n) => !existing.has(n.keyword));
    for (const n of fresh) await store.put('niches', n);
    toast(fresh.length ? `${fresh.length} nicchie DEMO caricate: non indicano domanda reale.` : 'Le nicchie DEMO sono già presenti.', 'info');
  }

  async function brainstorm() {
    if (form.theme.trim().length < 2) return toast('Scrivi un tema da esplorare.', 'bad');
    setBrainstorming(true);
    try {
      const m = MARKETPLACES[form.marketplace];
      const done = await callAi(
        { task: 'brainstorm', input: { theme: form.theme.trim(), audience: form.audience.trim(), marketplace: form.marketplace, language: m.language, category: form.category.trim() }, projectId: null, spentUsd: 0, budgetUsd: status?.ai.maxUsdPerBook ?? 20 },
        { token: await getToken() },
      );
      const out = done.data as BrainstormOutput;
      const created: Niche[] = [];
      for (const idea of out.ideas.slice(0, 20)) {
        const n = newNiche(idea.keyword, form.marketplace, {
          buyerPersona: idea.buyerPersona, category: form.category.trim(), secondaryKeywords: idea.secondaryKeywords.slice(0, 6), differentiationIdeas: idea.differentiators, risks: idea.risks,
          commentary: `${done.provider === 'mock' ? 'Ipotesi generata dal mock dichiarato' : `Ipotesi generata da ${done.model}`}. Bisogno ipotizzato: ${idea.unmetNeed}`,
        });
        await store.put('niches', n);
        created.push(n);
      }
      await recordCost(store, null, `Brainstorming nicchie: ${form.theme.trim()}`, done);
      await logActivity(store, null, `${out.ideas.length} ipotesi di nicchia generate per «${form.theme.trim()}» (${done.provider === 'mock' ? 'mock' : done.model}).`);
      toast(`${out.ideas.length} ipotesi create.${done.provider === 'mock' ? ' Sono idee senza dati: aggiungi evidenze reali.' : ' Ora le valuto con la stima IA…'}`, 'ok');
      if (done.provider !== 'mock') await runEstimate(created, true);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Brainstorming non riuscito.', 'bad');
    } finally {
      setBrainstorming(false);
    }
  }

  /** Stima IA dei cinque segnali (dichiarata come stima, affidabilità bassa). 12 nicchie per chiamata. */
  async function runEstimate(list: Niche[], quiet = false) {
    const todo = list.filter((n) => !n.demoOnly && evaluateNiche(n).score === null);
    if (!todo.length) return quiet ? undefined : toast('Tutte le nicchie hanno già un punteggio (o sono DEMO).', 'info');
    setEstimating(true);
    try {
      const token = await getToken();
      let ok = 0;
      for (let i = 0; i < todo.length; i += 12) {
        const { updated, done } = await estimateNiches(todo.slice(i, i + 12), { token, budgetUsd: status?.ai.maxUsdPerBook ?? 20, language: MARKETPLACES[todo[i].marketplace].language });
        for (const n of updated) await store.put('niches', n);
        await recordCost(store, null, `Stima IA nicchie (${updated.length})`, done);
        ok += updated.length;
      }
      await logActivity(store, null, `Stima IA di ${ok} nicchie: giudizi qualitativi, non dati di mercato.`);
      toast(`${ok} nicchie valutate con la stima IA. Affidabilità bassa: verifica su Amazon o importa dati reali.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Stima IA non riuscita.', 'bad');
    } finally {
      setEstimating(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      setImportResult({ kind: 'unknown', niches: [], errors: [{ row: 0, message: `File troppo grande (massimo ${MAX_CSV_BYTES / 1000} kB).` }], warnings: [], rowsRead: 0 });
      return;
    }
    const result = parseNicheCsv(await file.text(), { fileName: file.name, newId: uid });
    for (const n of result.niches) await store.put('niches', n);
    setImportResult(result);
    if (result.niches.length) await logActivity(store, null, `Import CSV «${file.name}»: ${result.niches.length} nicchie, ${result.errors.length} righe scartate.`);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function addManual() {
    if (form.theme.trim().length < 2) return toast('Scrivi la keyword della nicchia nel campo “Tema”.', 'bad');
    const n = newNiche(form.theme.trim(), form.marketplace, { buyerPersona: form.audience.trim(), category: form.category.trim() });
    await store.put('niches', n);
    open(n.id);
  }

  return (
    <>
      <PageHeader title="Niche Intelligence" subtitle="Punto di partenza obbligato: ipotesi, dati con provenienza, punteggio spiegato e affidabilità separata. Nessun numero di mercato viene inventato." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>1 · Esplora</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mercato">
              {(id) => (
                <Select id={id} value={form.marketplace} onChange={(e) => setForm({ ...form, marketplace: e.target.value as Marketplace })}>
                  {Object.entries(MARKETPLACES).map(([k, v]) => <option key={k} value={k}>{v.label} · {v.language}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Categoria di interesse">{(id) => <Input id={id} value={form.category} placeholder="Es. Casa e giardino" onChange={(e) => setForm({ ...form, category: e.target.value })} />}</Field>
            <Field label="Tema o keyword" className="sm:col-span-2">{(id) => <Input id={id} value={form.theme} placeholder="Es. manutenzione domestica" onChange={(e) => setForm({ ...form, theme: e.target.value })} />}</Field>
            <Field label="Pubblico (facoltativo)" className="sm:col-span-2">{(id) => <Input id={id} value={form.audience} placeholder="Es. chi vive in affitto e non ha esperienza" onChange={(e) => setForm({ ...form, audience: e.target.value })} />}</Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void brainstorm()} loading={brainstorming}><Lightbulb className="size-4" aria-hidden /> Genera ipotesi di nicchia</Button>
            <Button variant="outline" onClick={() => void addManual()}><Plus className="size-4" aria-hidden /> Aggiungi a mano</Button>
          </div>
          <p className="mt-2 text-xs text-slate2">
            Il brainstorming produce solo IPOTESI senza numeri{status?.ai.mode === 'mock' ? ' (ora è attivo il mock dichiarato: idee generiche, costo zero)' : ''}. Volumi di ricerca, vendite e BSR vanno aggiunti da fonti reali.
          </p>
        </Card>

        <Card>
          <CardTitle>2 · Porta i dati</CardTitle>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" id="csv-file" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" aria-hidden /> Importa CSV</Button>
            <Button variant="outline" onClick={() => void loadDemo()}><FlaskConical className="size-4" aria-hidden /> Carica nicchie DEMO</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button className="inline-flex items-center gap-1 font-medium text-cyan hover:underline" onClick={() => downloadBlob(new Blob([CSV_TEMPLATE_SIGNALS], { type: 'text/csv' }), 'modello-segnali.csv')}><Download className="size-3.5" aria-hidden /> Modello CSV segnali</button>
            <button className="inline-flex items-center gap-1 font-medium text-cyan hover:underline" onClick={() => downloadBlob(new Blob([CSV_TEMPLATE_COMPETITORS], { type: 'text/csv' }), 'modello-concorrenti.csv')}><Download className="size-3.5" aria-hidden /> Modello CSV concorrenti</button>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate2">
            <li>• Keepa: {status?.providers.keepa ? 'chiave presente, adapter previsto in Fase B (non ancora attivo).' : 'non configurato (Fase B, richiede abbonamento).'}</li>
            <li>• Google Trends API: accesso alpha limitato; usa l’import manuale.</li>
            <li>• Nessuno scraping di Amazon: i dati li porti tu, con fonte e data.</li>
          </ul>
          {importResult && (
            <div className="mt-3 space-y-2" data-testid="import-result">
              <Notice tone={importResult.niches.length ? 'ok' : 'bad'}>
                {importResult.niches.length ? `${importResult.niches.length} nicchie importate da ${importResult.rowsRead} righe (${importResult.kind === 'competitors' ? 'formato concorrenti' : 'formato segnali'}).` : 'Nessuna nicchia importata.'} I dati già presenti non sono stati modificati.
              </Notice>
              {importResult.errors.length > 0 && (
                <Notice tone="bad">
                  <p className="font-semibold">Righe scartate ({importResult.errors.length})</p>
                  <ul className="mt-1 list-disc pl-5">{importResult.errors.slice(0, 8).map((e, i) => <li key={i}>{e.row ? `Riga ${e.row}: ` : ''}{e.message}</li>)}</ul>
                </Notice>
              )}
              {importResult.warnings.length > 0 && (
                <Notice tone="warn">
                  <p className="font-semibold">Avvisi ({importResult.warnings.length})</p>
                  <ul className="mt-1 list-disc pl-5">{importResult.warnings.slice(0, 6).map((e, i) => <li key={i}>Riga {e.row}: {e.message}</li>)}</ul>
                </Notice>
              )}
            </div>
          )}
        </Card>
      </div>

      {hasDemo && <Notice tone="demo" className="mt-4"><strong>DEMO.</strong> {DEMO_NOTICE} Affidabilità sempre 0%.</Notice>}

      <Card className="mt-4">
        <CardTitle action={<div className="flex flex-wrap gap-2">{noScore.length > 0 && <Button variant="gold" size="sm" loading={estimating} disabled={brainstorming || status?.ai.mode === 'mock'} title={status?.ai.mode === 'mock' ? 'Serve l’AI collegata' : undefined} onClick={() => void runEstimate(sorted)}><Sparkles className="size-4" aria-hidden /> Stima IA ({noScore.length} senza punteggio)</Button>}{compare.length > 0 && <Button variant="ghost" size="sm" onClick={() => setCompare([])}>Azzera confronto ({compare.length})</Button>}</div>}>3 · Valuta e confronta</CardTitle>
        {niches.loading ? (
          <p className="text-sm text-slate2">Caricamento…</p>
        ) : sorted.length === 0 ? (
          <Empty title="Nessuna nicchia">Genera ipotesi, importa un CSV oppure carica le nicchie DEMO per provare l’interfaccia.</Empty>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate2">
                <tr><th className="px-1 py-2">Confronta</th><th className="px-1">Nicchia</th><th className="px-1">Opportunità</th><th className="px-1">Affidabilità</th><th className="px-1">Copertura</th><th className="px-1">Mercato</th><th className="px-1" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((n) => {
                  const ev = evaluateNiche(n);
                  return (
                    <tr key={n.id} className={n.id === selectedId ? 'bg-cyan/10' : undefined}>
                      <td className="px-1 py-2">
                        <input type="checkbox" className="size-4 accent-cyan" aria-label={`Confronta ${n.keyword}`} checked={compare.includes(n.id)} disabled={!compare.includes(n.id) && compare.length >= 3}
                          onChange={(e) => setCompare((c) => (e.target.checked ? [...c, n.id] : c.filter((x) => x !== n.id)))} />
                      </td>
                      <td className="px-1">
                        <button className="text-left font-medium text-ink hover:underline" onClick={() => open(n.id)}>{n.keyword}</button>
                        <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                          {n.demoOnly && <Badge tone="demo">DEMO</Badge>}
                          {n.status === 'hypothesis' && <Badge tone="warn">IPOTESI</Badge>}
                          {n.status === 'selected' && <Badge tone="ok">Selezionata</Badge>}
                        </span>
                      </td>
                      <td className="px-1 font-display text-lg font-bold text-ink">{ev.score ?? <span className="font-sans text-xs font-normal text-slate2">dato non disponibile</span>}{ev.aiBased && <Badge tone="warn" className="ml-1.5 align-middle font-sans">Stima IA</Badge>}</td>
                      <td className="px-1">{ev.confidence}%</td>
                      <td className="px-1">{ev.coverage}%</td>
                      <td className="px-1 text-xs text-slate2">{n.marketplace}</td>
                      <td className="px-1 text-right"><Button variant="outline" size="sm" onClick={() => open(n.id)}>Apri</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sorted.some((n) => evaluateNiche(n).aiBased) && <p className="mt-3 text-xs text-slate2"><strong className="text-warn">Stima IA:</strong> giudizio qualitativo del modello su conoscenze generali, <strong>non dati di mercato</strong>. L’affidabilità resta bassa (max ~30%) finché non aggiungi dati reali: apri la nicchia, inserisci i concorrenti osservati su Amazon oppure importa un CSV (Keepa, Helium 10, Publisher Rocket…).</p>}
      </Card>

      {compared.length >= 2 && (
        <Card className="mt-4 animate-rise">
          <CardTitle>Confronto affiancato</CardTitle>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead><tr><th className="w-40 px-1 py-2 text-xs uppercase tracking-wider text-slate2">Campo</th>{compared.map((n) => <th key={n.id} className="px-1 font-medium text-ink">{n.keyword} {n.demoOnly && <Badge tone="demo">DEMO</Badge>}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {([
                  ['Chi compra', (n: Niche) => n.buyerPersona || 'n/d'],
                  ['Mercato · data dati', (n: Niche) => `${n.marketplace} · ${formatDate(Object.values(n.signals).map((s) => s.observedAt).filter(Boolean).sort().at(-1) ?? null)}`],
                  ...SIGNALS.map((s) => [s.label, (n: Niche) => (n.signals[s.key].value === null ? 'dato non disponibile' : `${n.signals[s.key].value} (${n.signals[s.key].status})`)] as const),
                  ['Recensioni concorrenti (mediana)', (n: Niche) => { const s = summarizeCompetitors(n.competitors); return s.medianReviews === null ? 'n/d' : `${s.medianReviews} su ${s.count} libri`; }],
                  ['Prezzo tipico (mediana)', (n: Niche) => summarizeCompetitors(n.competitors).medianPrice ?? 'n/d'],
                  ['Opportunità 0–100', (n: Niche) => evaluateNiche(n).score ?? 'n/d'],
                  ['Affidabilità / copertura', (n: Niche) => `${evaluateNiche(n).confidence}% / ${evaluateNiche(n).coverage}%`],
                  ['Rischi', (n: Niche) => evaluateNiche(n).topRisks.join(' ') || '—'],
                ] as [string, (n: Niche) => string | number][]).map(([label, fn]) => (
                  <tr key={label}><td className="px-1 py-2 text-xs font-semibold text-slate2">{label}</td>{compared.map((n) => <td key={n.id} className="px-1 align-top">{fn(n)}</td>)}</tr>
                ))}
                <tr><td className="px-1 py-2 text-xs font-semibold text-slate2">Prossimo passo</td>{compared.map((n) => <td key={n.id} className="px-1"><Button variant="outline" size="sm" onClick={() => open(n.id)}>Apri e crea brief</Button></td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate2">Opportunità = score di selezione, non probabilità di guadagno. Uno score alto con affidabilità bassa non è una validazione.</p>
        </Card>
      )}

      <div ref={detailRef} className="mt-4 scroll-mt-20">
        {selected && <NicheDetail key={selected.id} niche={selected} onDeleted={() => setSelectedId(null)} />}
      </div>
    </>
  );
}
