'use client';

import JSZip from 'jszip';
import { CheckCircle2, CircleAlert, CircleDashed, Download, ExternalLink, PackageCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, Select, Textarea, useToast } from '@/components/ui';
import { callExport, downloadBlob } from '@/lib/client-api';
import { logActivity } from '@/lib/generation';
import { ebookRoyalty, priceLadder } from '@/lib/kdp/royalty';
import { MARKETPLACES } from '@/lib/kdp/specs';
import { useApp, useLive, useStore } from '@/lib/store/context';
import type { ExportFile, ExportRecord, KdpMeta, PublishState, QaCheck } from '@/lib/types';
import { formatBytes, formatDateTime, formatMoney, nowIso, uid } from '@/lib/utils';
import type { TabProps } from './types';

const AI_OPTIONS = [
  { value: 'none', label: 'Nessun contenuto generato da IA' },
  { value: 'assisted', label: 'IA solo come assistenza (editing, idee)' },
  { value: 'generated', label: 'Contenuto GENERATO da IA' },
] as const;

const PUBLISH: { value: PublishState; label: string }[] = [
  { value: 'non_pronto', label: 'Non pronto' },
  { value: 'pacchetto_pronto', label: 'Pacchetto pronto' },
  { value: 'inviato_dall_utente', label: 'Inviato a KDP da me' },
  { value: 'pubblicato_e_verificato', label: 'Pubblicato e verificato da me' },
];

function CheckIcon({ c }: { c: QaCheck }) {
  if (c.result === 'ok') return <CheckCircle2 className="size-4.5 shrink-0 text-ok" aria-label="Superato" />;
  if (c.result === 'non_eseguito') return <CircleDashed className="size-4.5 shrink-0 text-slate2" aria-label="Non eseguito" />;
  return c.severity === 'critico' ? <XCircle className="size-4.5 shrink-0 text-bad" aria-label="Fallito (critico)" /> : <CircleAlert className="size-4.5 shrink-0 text-warn" aria-label="Avviso" />;
}

export function KitTab({ project, chapters, update }: TabProps) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const exports = useLive('exports', project.id);
  const [busy, setBusy] = useState(false);
  const [zip, setZip] = useState<{ blob: Blob; fileName: string } | null>(null);
  const kdp = project.kdp;
  const m = MARKETPLACES[project.marketplace];
  const setKdp = (patch: Partial<KdpMeta>) => update({ kdp: { ...kdp, ...patch } });
  const last = [...exports.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] as ExportRecord | undefined;
  const anyAi = chapters.some((c) => c.aiGenerated);
  const keywords = [...kdp.keywords, ...Array(7).fill('')].slice(0, 7) as string[];
  const categories = [...kdp.categories, ...Array(3).fill('')].slice(0, 3) as string[];
  const pages = project.pageCount;
  const ladder = pages ? priceLadder(project.marketplace, pages, kdp.listPricePaperback) : null;
  const ebook = ebookRoyalty({ listPrice: kdp.listPriceEbook, marketplace: project.marketplace });

  async function exportKit() {
    if (!chapters.length) return toast('Serve almeno un capitolo.', 'bad');
    setBusy(true);
    try {
      const r = await callExport('kit', { project, chapters }, await getToken());
      const archive = await JSZip.loadAsync(await r.blob.arrayBuffer());
      const qa = JSON.parse(await archive.file('qa-report.json')!.async('string')) as { kdpReady: boolean; checks: QaCheck[] };
      const manifest = JSON.parse(await archive.file('manifest.json')!.async('string')) as { files: ExportFile[] };
      const record: ExportRecord = { id: uid(), projectId: project.id, createdAt: nowIso(), pageCount: r.pageCount, kdpReady: qa.kdpReady, files: manifest.files, checks: qa.checks };
      await store.put('exports', record);
      setZip({ blob: r.blob, fileName: r.fileName });
      update({
        pageCount: r.pageCount,
        status: qa.kdpReady ? (project.status === 'published_by_user' ? project.status : 'export_ready') : 'review',
        kdp: { ...kdp, publishState: qa.kdpReady ? (kdp.publishState === 'non_pronto' ? 'pacchetto_pronto' : kdp.publishState) : 'non_pronto' },
      });
      await logActivity(store, project.id, `Kit KDP esportato: ${manifest.files.length + 1} file, ${r.pageCount} pagine, stato ${qa.kdpReady ? 'PRONTO' : 'BOZZA'}.`);
      downloadBlob(r.blob, r.fileName);
      toast(qa.kdpReady ? 'Pacchetto pronto per il caricamento manuale.' : 'ZIP esportato come BOZZA: ci sono controlli critici da risolvere.', qa.kdpReady ? 'ok' : 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Esportazione non riuscita.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function downloadOne(name: string) {
    if (!zip) return;
    const f = (await JSZip.loadAsync(await zip.blob.arrayBuffer())).file(name);
    if (f) downloadBlob(await f.async('blob'), name.split('/').pop() ?? name);
  }

  const failed = last?.checks.filter((c) => c.severity === 'critico' && c.result !== 'ok') ?? [];
  return (
    <div className="space-y-4">
      <Notice>File preparati per upload manuale. Amazon verifica e approva la pubblicazione: FOLYNTRA non pubblica al posto tuo (non esiste un’API pubblica KDP).</Notice>

      <Card>
        <CardTitle>Metadati per KDP</CardTitle>
        <Field label="Descrizione del libro" hint={`${kdp.description.length}/4000 caratteri. Puoi usare **grassetto**, *corsivo* ed elenchi: viene convertita nell’HTML ammesso da KDP.`}>
          {(id) => <Textarea id={id} rows={6} maxLength={4000} value={kdp.description} onChange={(e) => setKdp({ description: e.target.value })} />}
        </Field>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-medium text-ink">7 parole chiave</legend>
            <p className="mb-2 text-xs text-slate2">Pertinenti e non fuorvianti: niente marchi, nomi di altri autori o promesse.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {keywords.map((k, i) => <Input key={i} aria-label={`Parola chiave ${i + 1}`} placeholder={`Parola chiave ${i + 1}`} value={k} onChange={(e) => setKdp({ keywords: keywords.map((x, j) => (j === i ? e.target.value : x)) })} />)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Fino a 3 categorie</legend>
            <p className="mb-2 text-xs text-slate2">Scrivile come le sceglierai nell’albero categorie di KDP.</p>
            <div className="grid gap-2">
              {categories.map((c, i) => <Input key={i} aria-label={`Categoria ${i + 1}`} placeholder={`Categoria ${i + 1}`} value={c} onChange={(e) => setKdp({ categories: categories.map((x, j) => (j === i ? e.target.value : x)) })} />)}
            </div>
          </fieldset>
        </div>
      </Card>

      <Card>
        <CardTitle>Prezzo e royalty <Badge tone="warn" className="ml-1 align-middle">SIMULAZIONE</Badge></CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Prezzo cartaceo (${m.currency})`}>{(id) => <Input id={id} type="number" min={0} step={0.5} value={kdp.listPricePaperback} onChange={(e) => setKdp({ listPricePaperback: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
          <Field label={`Prezzo eBook (${m.currency})`}>{(id) => <Input id={id} type="number" min={0} step={0.5} value={kdp.listPriceEbook} onChange={(e) => setKdp({ listPriceEbook: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
        </div>
        {ladder ? (
          <div className="mt-3 -mx-1 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate2"><tr><th className="px-1 py-1.5">Prezzo</th><th className="px-1">Aliquota</th><th className="px-1">Costo stampa</th><th className="px-1">Royalty / copia</th></tr></thead>
              <tbody className="divide-y divide-line">
                {ladder.map((r) => (
                  <tr key={r.listPrice}><td className="px-1 py-1.5">{formatMoney(r.listPrice, m.currency)}</td><td className="px-1">{Math.round(r.rate * 100)}%</td><td className="px-1">{formatMoney(r.printingCost, m.currency)}</td><td className={`px-1 font-semibold ${r.royalty < 0 ? 'text-bad' : 'text-midnight'}`}>{formatMoney(r.royalty, m.currency)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate2">Calcolata su {pages} pagine reali, B/N, al netto IVA {Math.round(m.vatBooks * 1000) / 10}%. {!ladder[0].printingCostVerified && <span className="text-warn">Costo stampa indicativo per {m.currency}: verificalo sul calcolatore KDP. </span>}eBook: {formatMoney(ebook.royalty, m.currency)} a copia ({Math.round(ebook.rate * 100)}%). {ebook.note}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate2">La royalty del cartaceo dipende dalle pagine reali: genera l’anteprima PDF o esporta il kit.</p>
        )}
      </Card>

      <Card>
        <CardTitle>Dichiarazioni</CardTitle>
        <p className="mb-3 text-sm text-slate2">Il contenuto generato da IA deve essere dichiarato a KDP e controllato da te.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {([['aiText', 'Testo'], ['aiImages', 'Immagini (cover inclusa)'], ['aiTranslation', 'Traduzioni']] as const).map(([key, label]) => (
            <Field key={key} label={label}>{(id) => <Select id={id} value={kdp[key]} onChange={(e) => setKdp({ [key]: e.target.value } as Partial<KdpMeta>)}>{AI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>
          ))}
        </div>
        {anyAi && kdp.aiText === 'none' && <Notice tone="bad" className="mt-3">Ci sono capitoli generati da IA: la dichiarazione “Testo” non può essere “nessun contenuto”. <button className="font-semibold underline" onClick={() => setKdp({ aiText: 'generated' })}>Imposta “generato da IA”</button></Notice>}
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-[#8a6a2b]" checked={kdp.rightsConfirmed} onChange={(e) => setKdp({ rightsConfirmed: e.target.checked })} /> Confermo di detenere i diritti sul contenuto e che testi, font e grafiche sono originali o regolarmente licenziati.</label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-[#8a6a2b]" checked={kdp.humanReviewConfirmed} onChange={(e) => setKdp({ humanReviewConfirmed: e.target.checked })} /> Confermo di aver riletto e corretto personalmente l’intero libro (fatti, fonti, qualità).</label>
        </div>
      </Card>

      <Card className="border-gold/60">
        <CardTitle>Esporta il KDP Publish Kit</CardTitle>
        <p className="mb-3 text-sm text-slate2">Un clic crea lo ZIP: manuscript.pdf, cover-print.pdf (dorso dalle pagine reali), cover-ebook.jpg, ebook.epub, editable.docx, bonus, metadati, descrizione HTML, simulazione royalty, dichiarazione IA, diritti, checklist, guida al caricamento, report QA e manifest SHA-256.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="gold" size="lg" loading={busy} disabled={status?.renderer === false} onClick={() => void exportKit()}><PackageCheck className="size-5" aria-hidden /> {busy ? 'Creazione dei file in corso…' : 'Esporta ZIP KDP'}</Button>
          {zip && <Button variant="outline" onClick={() => downloadBlob(zip.blob, zip.fileName)}><Download className="size-4" aria-hidden /> Scarica di nuovo lo ZIP</Button>}
        </div>
        {status?.renderer === false && <Notice tone="bad" className="mt-3">Renderer PDF non disponibile su questo server: manca Chromium (variabile CHROMIUM_EXECUTABLE_PATH).</Notice>}

        {last && (
          <div className="mt-5 border-t border-line pt-4" data-testid="export-result">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif text-lg font-bold text-midnight">Ultima esportazione</h3>
              {last.kdpReady ? <Badge tone="ok">PRONTO PER IL CARICAMENTO MANUALE</Badge> : <Badge tone="bad">BOZZA — NON PRONTO PER KDP</Badge>}
              <span className="text-xs text-slate2">{formatDateTime(last.createdAt)} · {last.pageCount} pagine</span>
            </div>
            {failed.length > 0 && <Notice tone="bad" className="mt-3">Lo stato “KDP pronto” è bloccato da {failed.length} controlli critici. Risolvili e riesporta.</Notice>}
            <ul className="mt-3 space-y-2">
              {last.checks.map((c) => (
                <li key={c.id} className="flex gap-2 text-sm">
                  <CheckIcon c={c} />
                  <span className="min-w-0"><span className="font-medium text-ink">{c.label}</span>{c.severity === 'critico' && c.result !== 'ok' && <Badge tone="bad" className="ml-1.5">critico</Badge>}<span className="block text-xs text-slate2">{c.detail}</span></span>
                </li>
              ))}
            </ul>
            <h4 className="mt-4 text-sm font-semibold text-midnight">File nel pacchetto</h4>
            <ul className="mt-1 divide-y divide-line">
              {last.files.map((f) => (
                <li key={f.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
                  <span className="min-w-0 break-all font-medium text-ink">{f.name}</span>
                  <span className="flex items-center gap-2 text-xs text-slate2">
                    {formatBytes(f.bytes)} · <span title={f.sha256}>sha256 {f.sha256.slice(0, 10)}…</span>
                    {zip && <button className="font-medium text-golddeep hover:underline" onClick={() => void downloadOne(f.name)}>scarica</button>}
                  </span>
                </li>
              ))}
            </ul>
            {!zip && <p className="mt-2 text-xs text-slate2">I file non sono conservati sul server: riesporta per scaricarli di nuovo.</p>}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Pubblicazione (manuale, sul tuo account KDP)</CardTitle>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Stato dichiarato da te" hint="FOLYNTRA non può sapere se il libro è online: questo stato lo aggiorni tu.">
            {(id) => (
              <Select id={id} value={kdp.publishState} onChange={(e) => { const v = e.target.value as PublishState; update({ kdp: { ...kdp, publishState: v }, status: v === 'pubblicato_e_verificato' ? 'published_by_user' : last?.kdpReady ? 'export_ready' : project.status === 'published_by_user' ? 'review' : project.status }); }}>
                {PUBLISH.map((p) => <option key={p.value} value={p.value} disabled={p.value !== 'non_pronto' && !last?.kdpReady}>{p.label}</option>)}
              </Select>
            )}
          </Field>
          <a href="https://kdp.amazon.com/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium hover:bg-ivory">Apri KDP (sito ufficiale) <ExternalLink className="size-4" aria-hidden /></a>
        </div>
        {!last?.kdpReady && <p className="mt-2 text-xs text-slate2">Gli stati successivi si sbloccano solo dopo un’esportazione con tutti i controlli critici superati.</p>}
        <p className="mt-2 text-xs text-slate2">Promemoria: KDP limita il numero di nuovi titoli per formato a settimana; controlla la policy aggiornata prima di inviare.</p>
      </Card>
    </div>
  );
}
