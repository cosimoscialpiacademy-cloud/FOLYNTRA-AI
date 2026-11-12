'use client';

import { Download, FileText, Shuffle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, Select, Textarea, useToast } from '@/components/ui';
import { callExport, downloadBlob } from '@/lib/client-api';
import { COVER_PRESETS } from '@/lib/defaults';
import { frontCoverSvg, fullCoverSvg } from '@/lib/export/cover-svg';
import { logActivity } from '@/lib/generation';
import { MIN_PAGES, MIN_PAGES_SPINE_TEXT, TRIM_SIZES, coverGeometry } from '@/lib/kdp/specs';
import { useApp, useStore } from '@/lib/store/context';
import type { CoverSpec, LayoutSettings, TrimSizeId } from '@/lib/types';
import { cn, wordCount } from '@/lib/utils';
import type { TabProps } from './types';

const hex = (v: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000');

export function StudioTab({ project, chapters, update, goTo }: TabProps) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const [view, setView] = useState<'fronte' | 'completa'>('fronte');
  const [rendering, setRendering] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; blob: Blob; fileName: string } | null>(null);
  const cover = project.cover;
  const layout = project.layout;
  const trim = TRIM_SIZES[layout.trim];
  const written = chapters.filter((c) => wordCount(c.content) > 0).length;

  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  const setCover = (patch: Partial<CoverSpec>) => update({ cover: { ...cover, ...patch } });
  // Cambiare formato o tipografia cambia il numero di pagine: il dorso va ricalcolato.
  const setLayout = (patch: Partial<LayoutSettings>, affectsPages = true) => update({ layout: { ...layout, ...patch }, ...(affectsPages ? { pageCount: null } : {}) });

  const geometry = project.pageCount ? coverGeometry(layout.trim, project.pageCount, layout.paper) : null;
  const svg = useMemo(
    () => (view === 'completa' && geometry ? fullCoverSvg(cover, geometry, { guides: true }) : frontCoverSvg(cover, trim.widthIn, trim.heightIn)),
    [view, geometry, cover, trim.widthIn, trim.heightIn],
  );
  const aspect = view === 'completa' && geometry ? geometry.fullWidthIn / geometry.fullHeightIn : trim.widthIn / trim.heightIn;

  async function renderInterior() {
    if (!written) return toast('Serve almeno un capitolo con testo.', 'bad');
    setRendering(true);
    try {
      const r = await callExport('interior', { project, chapters: chapters.filter((c) => wordCount(c.content) > 0) }, await getToken());
      setPdf({ url: URL.createObjectURL(r.blob), blob: r.blob, fileName: r.fileName });
      update({ pageCount: r.pageCount });
      await logActivity(store, project.id, `Anteprima PDF interno generata: ${r.pageCount} pagine reali (${layout.trim}).`);
      toast(`PDF interno pronto: ${r.pageCount} pagine. Dorso ricalcolato.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Rendering non riuscito.', 'bad');
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card className="order-2 lg:order-1">
          <CardTitle>Copertina</CardTitle>
          <p className="mb-3 text-sm text-slate2">Tre proposte originali disegnate dal software (grafica vettoriale, nessuna immagine stock, font open-source). Scegline una e personalizzala.</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {COVER_PRESETS.map((p) => {
              const selected = cover.template === p.template;
              return (
                <button key={p.template} aria-pressed={selected} onClick={() => setCover({ template: p.template, palette: { ...p.palette }, titleFont: p.titleFont })}
                  className={cn('rounded-lg border p-1.5 text-left transition-shadow sm:p-2', selected ? 'border-gold shadow-md' : 'border-line hover:shadow')}>
                  <div className="overflow-hidden rounded" style={{ aspectRatio: `${trim.widthIn}/${trim.heightIn}` }} dangerouslySetInnerHTML={{ __html: frontCoverSvg({ ...cover, template: p.template, palette: p.palette, titleFont: p.titleFont }, trim.widthIn, trim.heightIn) }} />
                  <p className="mt-1.5 text-sm font-semibold text-midnight">{p.label}</p>
                  <p className="hidden text-xs text-slate2 sm:block">{p.description}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Titolo in copertina" className="sm:col-span-2">{(id) => <Input id={id} value={cover.title} onChange={(e) => setCover({ title: e.target.value })} />}</Field>
            <Field label="Sottotitolo" className="sm:col-span-2">{(id) => <Input id={id} value={cover.subtitle} onChange={(e) => setCover({ subtitle: e.target.value })} />}</Field>
            <Field label="Autore">{(id) => <Input id={id} value={cover.author} onChange={(e) => setCover({ author: e.target.value })} />}</Field>
            <Field label="Font del titolo">
              {(id) => (
                <Select id={id} value={cover.titleFont} onChange={(e) => setCover({ titleFont: e.target.value as CoverSpec['titleFont'] })}>
                  <option value="Playfair Display">Playfair Display (serif elegante)</option>
                  <option value="EB Garamond">EB Garamond (serif classico)</option>
                  <option value="Oswald">Oswald (condensato moderno)</option>
                </Select>
              )}
            </Field>
            <Field label="Frase di richiamo" hint="In alto sul retro (e in basso sul fronte nel template Editoriale)." className="sm:col-span-2">{(id) => <Input id={id} value={cover.tagline} onChange={(e) => setCover({ tagline: e.target.value })} />}</Field>
            <Field label="Testo del retro" hint="Paragrafi separati da una riga vuota. L’area in basso a destra resta libera per il codice a barre di KDP." className="sm:col-span-2">{(id) => <Textarea id={id} rows={5} maxLength={3000} value={cover.backText} onChange={(e) => setCover({ backText: e.target.value })} />}</Field>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            {(['background', 'accent', 'text'] as const).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-sm font-medium text-ink">
                {{ background: 'Fondo', accent: 'Accento', text: 'Testo' }[k]}
                <input type="color" className="h-11 w-16 cursor-pointer rounded border border-line bg-white p-1" value={hex(cover.palette[k])} onChange={(e) => setCover({ palette: { ...cover.palette, [k]: e.target.value } })} />
              </label>
            ))}
            <Button variant="outline" onClick={() => setCover({ seed: Math.floor(Math.random() * 100000) })}><Shuffle className="size-4" aria-hidden /> Varia il motivo grafico</Button>
          </div>
          <p className="mt-3 text-xs text-slate2">Immagini caricate dall’utente e immagini generate da IA non sono ancora disponibili: nessun provider di immagini è collegato.</p>
        </Card>

        <div className="order-1 lg:order-2">
          <Card className="lg:sticky lg:top-28">
            <div className="mb-3 flex gap-1 rounded-lg bg-black/5 p-1" role="group" aria-label="Vista copertina">
              {(['fronte', 'completa'] as const).map((v) => (
                <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={cn('min-h-9 flex-1 rounded-md px-2 text-sm font-medium', view === v ? 'bg-white text-midnight shadow-sm' : 'text-slate2')}>
                  {v === 'fronte' ? 'Fronte / eBook' : 'Retro + dorso + fronte'}
                </button>
              ))}
            </div>
            {view === 'completa' && !geometry ? (
              <Notice tone="warn">Il dorso dipende dalle pagine reali del PDF interno. Genera prima l’anteprima dell’interno qui sotto: non viene mostrato un dorso “stimato”.</Notice>
            ) : (
              <div className="mx-auto overflow-hidden rounded shadow-lg ring-1 ring-black/10" style={{ aspectRatio: String(aspect), maxWidth: view === 'fronte' ? '18rem' : '100%' }} data-testid="cover-preview" dangerouslySetInnerHTML={{ __html: svg }} />
            )}
            {geometry ? (
              <ul className="mt-3 space-y-1 text-xs text-slate2">
                <li>Pagine reali: <strong className="text-ink">{geometry.pageCount}</strong> · carta {layout.paper === 'cream' ? 'crema' : 'bianca'}</li>
                <li>Dorso: <strong className="text-ink">{geometry.spineIn} in</strong> ({(geometry.spineIn * 25.4).toFixed(2)} mm){!geometry.spineTextAllowed && ` · senza testo sotto le ${MIN_PAGES_SPINE_TEXT} pagine`}</li>
                <li>File completo: {geometry.fullWidthIn} × {geometry.fullHeightIn} in, abbondanza 0,125 in</li>
                {view === 'completa' && <li>Guide (solo anteprima): rosso = rifilo e pieghe, verde = area codice a barre.</li>}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate2">Numero di pagine non ancora calcolato.</p>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardTitle>Impaginazione interna</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Formato (rifilo)">{(id) => <Select id={id} value={layout.trim} onChange={(e) => setLayout({ trim: e.target.value as TrimSizeId })}>{Object.entries(TRIM_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>}</Field>
          <Field label="Carta" hint="Cambia lo spessore del dorso.">{(id) => <Select id={id} value={layout.paper} onChange={(e) => setLayout({ paper: e.target.value as LayoutSettings['paper'] }, false)}><option value="cream">Crema</option><option value="white">Bianca</option></Select>}</Field>
          <Field label="Font del testo">{(id) => <Select id={id} value={layout.bodyFont} onChange={(e) => setLayout({ bodyFont: e.target.value as LayoutSettings['bodyFont'] })}><option value="EB Garamond">EB Garamond (serif)</option><option value="Inter">Inter (sans-serif)</option></Select>}</Field>
          <Field label="Corpo (pt)">{(id) => <Input id={id} type="number" min={9} max={14} step={0.5} value={layout.fontSizePt} onChange={(e) => setLayout({ fontSizePt: Math.max(8, Math.min(16, Number(e.target.value) || 11)) })} />}</Field>
          <Field label="Interlinea">{(id) => <Input id={id} type="number" min={1.2} max={1.8} step={0.05} value={layout.lineHeight} onChange={(e) => setLayout({ lineHeight: Math.max(1.1, Math.min(2, Number(e.target.value) || 1.45)) })} />}</Field>
          <div className="flex flex-col justify-end gap-2 text-sm sm:col-span-2 lg:col-span-3">
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#8a6a2b]" checked={layout.runningHeaders} onChange={(e) => setLayout({ runningHeaders: e.target.checked }, false)} /> Intestazioni: titolo del libro sulle pagine pari, capitolo sulle dispari</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#8a6a2b]" checked={layout.bleed} onChange={(e) => setLayout({ bleed: e.target.checked })} /> Interno con abbondanza (solo se hai elementi al vivo)</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#8a6a2b]" checked={layout.readerAiNotice} onChange={(e) => setLayout({ readerAiNotice: e.target.checked }, false)} /> Avviso al lettore sull’uso dell’IA nella pagina del copyright</label>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate2">Margini a specchio con gabbia adeguata al numero di pagine, capitoli sempre su pagina destra, numerazione, indice con i numeri di pagina reali, riquadri e tabelle. Font incorporati nel PDF.</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="gold" onClick={() => void renderInterior()} loading={rendering} disabled={status?.renderer === false}><FileText className="size-4" aria-hidden /> {rendering ? 'Impaginazione in corso…' : 'Genera anteprima PDF interno'}</Button>
          {pdf && <Button variant="outline" onClick={() => downloadBlob(pdf.blob, pdf.fileName)}><Download className="size-4" aria-hidden /> Scarica PDF</Button>}
          {project.pageCount && <Badge tone={project.pageCount >= MIN_PAGES ? 'ok' : 'bad'}>{project.pageCount} pagine{project.pageCount < MIN_PAGES ? ` · minimo KDP ${MIN_PAGES}` : ''}</Badge>}
        </div>
        {status?.renderer === false && <Notice tone="bad" className="mt-3">Renderer PDF non disponibile su questo server: manca Chromium (variabile CHROMIUM_EXECUTABLE_PATH).</Notice>}
        {written < chapters.length && <p className="mt-2 text-xs text-warn">{chapters.length - written} capitoli sono ancora vuoti: l’anteprima include solo quelli scritti.</p>}
        {pdf && <iframe title="Anteprima PDF interno" src={pdf.url} className="mt-4 hidden h-[36rem] w-full rounded-lg border border-line md:block" />}
        {pdf && <p className="mt-2 text-xs text-slate2 md:hidden">Su telefono apri il PDF con “Scarica PDF”.</p>}
      </Card>

      <div className="flex justify-end"><Button size="lg" onClick={() => goTo('kit')}>Avanti: KDP Kit</Button></div>
    </div>
  );
}
