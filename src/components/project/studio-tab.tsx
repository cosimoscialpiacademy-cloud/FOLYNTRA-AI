'use client';

import { Download, FileText, ImagePlus, Shuffle, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, Select, Textarea, useToast } from '@/components/ui';
import { callExport, downloadBlob } from '@/lib/client-api';
import { ART_TEMPLATES, COVER_ART, artById, artThumb } from '@/lib/cover-art';
import { COVER_PRESETS } from '@/lib/defaults';
import { forbiddenClaim } from '@/lib/kdp/claims';
import { prepareCoverImage } from '@/lib/image-upload';
import { frontCoverSvg, fullCoverSvg } from '@/lib/export/cover-svg';
import { logActivity } from '@/lib/generation';
import { MIN_PAGES, MIN_PAGES_SPINE_TEXT, TRIM_SIZES, coverGeometry } from '@/lib/kdp/specs';
import { useApp, useStore } from '@/lib/store/context';
import type { CoverArt, CoverBadge, CoverSpec, LayoutSettings, TrimSizeId } from '@/lib/types';
import { cn, wordCount } from '@/lib/utils';
import { CoverAgent } from './cover-agent';
import type { TabProps } from './types';

const hex = (v: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000');

export function StudioTab({ project, chapters, niche, update, goTo }: TabProps) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const [view, setView] = useState<'fronte' | 'completa'>('fronte');
  const [rendering, setRendering] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; blob: Blob; fileName: string } | null>(null);
  const cover = project.cover;
  const layout = project.layout;
  const trim = TRIM_SIZES[layout.trim];
  const coloring = project.kind === 'coloring';
  const drawn = (project.coloring?.pages ?? []).filter((p) => p.svg || p.image).length;
  const written = coloring ? drawn : chapters.filter((c) => wordCount(c.content) > 0).length;

  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadAi, setUploadAi] = useState(false);
  const isArtTemplate = ART_TEMPLATES.includes(cover.template);
  const setCover = (patch: Partial<CoverSpec>) => update({ cover: { ...cover, ...patch } });
  /** Le immagini IA vanno dichiarate a KDP: la dichiarazione passa a «generate» senza che l'utente debba ricordarsene. */
  const withAiDeclaration = (art: CoverArt | null) => (art?.aiGenerated && project.kdp.aiImages === 'none' ? { kdp: { ...project.kdp, aiImages: 'generated' as const } } : {});
  /** Etichette: tre slot fissi (fascia, sigillo, invito). Ogni modifica toglie la conferma «sono vere». */
  const badgeOf = (k: CoverBadge['kind']) => (cover.badges ?? []).find((b) => b.kind === k);
  function setBadge(kind: CoverBadge['kind'], patch: Partial<CoverBadge>) {
    const cur = badgeOf(kind) ?? { kind, text: '', subtext: '' };
    const next = { ...cur, ...patch };
    const others = (cover.badges ?? []).filter((b) => b.kind !== kind);
    const list = next.text.trim() || next.subtext.trim() ? [...others, next] : others;
    const order = { banner: 0, seal: 1, cta: 2 } as const;
    setCover({ badges: list.sort((a, b) => order[a.kind] - order[b.kind]), badgesConfirmed: false });
  }
  function chooseArt(id: string) {
    const item = artById(id);
    if (!item) return;
    const art: CoverArt = { id, dataUrl: null, aiGenerated: true, dim: cover.art?.dim ?? 0.55 };
    update({ cover: { ...cover, art, palette: { ...item.palette }, ...(item.bestTemplate && !ART_TEMPLATES.includes(cover.template) ? { template: item.bestTemplate } : {}) }, ...withAiDeclaration(art) });
  }
  function choosePreset(p: (typeof COVER_PRESETS)[number]) {
    const wantsArt = ART_TEMPLATES.includes(p.template);
    const keep = cover.art && (cover.art.id || cover.art.dataUrl) ? cover.art : null;
    const art: CoverArt | null = wantsArt ? keep ?? (p.art ? { id: p.art, dataUrl: null, aiGenerated: true, dim: 0.55 } : null) : cover.art ?? null;
    const palette = wantsArt && keep?.id ? { ...artById(keep.id)!.palette } : wantsArt && !keep ? { ...p.palette } : { ...p.palette };
    update({ cover: { ...cover, template: p.template, palette, titleFont: p.titleFont, art }, ...(wantsArt ? withAiDeclaration(art) : {}) });
  }
  async function onUpload(file: File | undefined) {
    if (!file) return;
    try {
      const img = await prepareCoverImage(file);
      const art: CoverArt = { id: null, dataUrl: img.dataUrl, aiGenerated: uploadAi, dim: cover.art?.dim ?? 0.55 };
      update({ cover: { ...cover, art, template: ART_TEMPLATES.includes(cover.template) ? cover.template : 'immersiva' }, ...withAiDeclaration(art) });
      toast(img.width < 1300 ? `Immagine caricata (${img.width}×${img.height}px): per la stampa è un po’ piccola, potrebbe risultare morbida.` : `Immagine caricata (${img.width}×${img.height}px).`, img.width < 1300 ? 'info' : 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Caricamento non riuscito.', 'bad');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  // Cambiare formato o tipografia cambia il numero di pagine: il dorso va ricalcolato.
  const setLayout = (patch: Partial<LayoutSettings>, affectsPages = true) => update({ layout: { ...layout, ...patch }, ...(affectsPages ? { pageCount: null } : {}) });

  const geometry = project.pageCount ? coverGeometry(layout.trim, project.pageCount, layout.paper) : null;
  const svg = useMemo(
    () => (view === 'completa' && geometry ? fullCoverSvg(cover, geometry, { guides: true }) : frontCoverSvg(cover, trim.widthIn, trim.heightIn)),
    [view, geometry, cover, trim.widthIn, trim.heightIn],
  );
  const aspect = view === 'completa' && geometry ? geometry.fullWidthIn / geometry.fullHeightIn : trim.widthIn / trim.heightIn;

  async function renderInterior() {
    if (!written) return toast(coloring ? 'Serve almeno un disegno.' : 'Serve almeno un capitolo con testo.', 'bad');
    setRendering(true);
    try {
      const r = await callExport('interior', { project, chapters: coloring ? [] : chapters.filter((c) => wordCount(c.content) > 0) }, await getToken());
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
      <CoverAgent project={project} niche={niche} chapters={chapters} update={update} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card className="order-2 lg:order-1">
          <CardTitle>Copertina</CardTitle>
          <p className="mb-3 text-sm text-slate2">Sei layout originali: tre con immagine a tutta pagina e tre vettoriali. Font open-source, nessuna immagine stock.</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {COVER_PRESETS.map((p) => {
              const selected = cover.template === p.template;
              return (
                <button key={p.template} aria-pressed={selected} onClick={() => choosePreset(p)}
                  className={cn('rounded-lg border p-1.5 text-left transition-shadow sm:p-2', selected ? 'border-cyan shadow-md' : 'border-line hover:shadow')}>
                  <div className="overflow-hidden rounded" style={{ aspectRatio: `${trim.widthIn}/${trim.heightIn}` }} dangerouslySetInnerHTML={{ __html: frontCoverSvg({ ...cover, template: p.template, palette: ART_TEMPLATES.includes(p.template) && !cover.art && p.art ? { ...artById(p.art)!.palette } : cover.art?.id && ART_TEMPLATES.includes(p.template) ? { ...artById(cover.art.id)!.palette } : p.palette, titleFont: p.titleFont, art: ART_TEMPLATES.includes(p.template) ? (cover.art ?? (p.art ? { id: p.art, dataUrl: null, aiGenerated: true, dim: 0.55 } : null)) : cover.art }, trim.widthIn, trim.heightIn) }} />
                  <p className="mt-1.5 text-sm font-semibold text-ink">{p.label}</p>
                  <p className="hidden text-xs text-slate2 sm:block">{p.description}</p>
                </button>
              );
            })}
          </div>

          {isArtTemplate && (
            <div className="mt-4 rounded-xl border border-line bg-card2 p-3 sm:p-4">
              <p className="text-sm font-semibold text-ink">Sfondo della copertina</p>
              <p className="mt-0.5 text-xs text-slate2">Immagini generate con IA (GPT Image 2.6 di OpenAI, tramite Higgsfield). Scegliendone una, la dichiarazione KDP sulle immagini IA passa a «generate». Controlla che il tuo piano consenta l’uso commerciale.</p>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {COVER_ART.map((a) => (
                  <button key={a.id} aria-pressed={cover.art?.id === a.id} aria-label={`Sfondo ${a.name}`} title={`${a.name} — ${a.suits}`} onClick={() => chooseArt(a.id)}
                    className={cn('overflow-hidden rounded-md border-2 transition', cover.art?.id === a.id ? 'border-cyan shadow-[0_0_0_2px_rgba(0,229,255,0.25)]' : 'border-transparent hover:border-line')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={artThumb(a.id)} alt={a.name} loading="lazy" className="aspect-[2/3] w-full object-cover" />
                  </button>
                ))}
              </div>
              {cover.art?.id && <p className="mt-2 text-xs text-slate2">Selezionato: <strong className="text-ink">{artById(cover.art.id)?.name}</strong> · adatto a: {artById(cover.art.id)?.suits}.</p>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium text-ink">Velatura per leggere il testo: {Math.round((cover.art?.dim ?? 0.55) * 100)}%
                  <input type="range" min={0} max={100} value={Math.round((cover.art?.dim ?? 0.55) * 100)} disabled={!cover.art} onChange={(e) => cover.art && setCover({ art: { ...cover.art, dim: Number(e.target.value) / 100 } })} className="accent-cyan" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="size-4" aria-hidden /> Carica la tua immagine</Button>
                <label className="flex items-center gap-2 text-xs text-slate2"><input type="checkbox" className="size-4 accent-cyan" checked={uploadAi} onChange={(e) => setUploadAi(e.target.checked)} /> È stata generata con IA (es. ChatGPT, Midjourney)</label>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onUpload(e.target.files?.[0])} aria-label="Carica immagine di copertina" />
                {cover.art?.dataUrl && <Button variant="ghost" size="sm" onClick={() => setCover({ art: null })}><ImagePlus className="size-4" aria-hidden /> Rimuovi immagine</Button>}
              </div>
              <p className="mt-2 text-xs text-slate2">Per la stampa servono immagini di almeno ~1400×2100 px (6×9 in a ~230 dpi). Se l’immagine è tua, garantisci di averne i diritti.</p>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-line bg-card2 p-3 sm:p-4">
            <p className="text-sm font-semibold text-ink">Etichette sulla copertina: bonus, sigillo e invito</p>
            <p className="mt-0.5 text-xs text-slate2">Come sulle copertine che vendono: una <strong className="text-ink">fascia</strong> con il bonus, un <strong className="text-ink">sigillo</strong> con un numero reale e un breve <strong className="text-ink">invito</strong>. Compaiono con i layout con immagine (Immersiva, Cornice, Vetrina). Scrivi solo cose <strong className="text-ink">vere e presenti nel libro</strong>; Amazon rifiuta classifiche, premi, prezzi, «gratis» e promesse di salute.</p>
            {!isArtTemplate && <Notice tone="warn" className="mt-2">Con questo layout le etichette non vengono stampate: scegli Immersiva, Cornice o Vetrina.</Notice>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Fascia (bonus o contenuto extra)" hint="Max 38 caratteri. Es. «INCLUDES 7-DAY MEAL PLAN»" className="sm:col-span-2">{(id) => <Input id={id} maxLength={38} value={badgeOf('banner')?.text ?? ''} onChange={(e) => setBadge('banner', { text: e.target.value })} />}</Field>
              <Field label="Sigillo: numero" hint="Max 6. Es. «100+» (solo se è vero)">{(id) => <Input id={id} maxLength={6} value={badgeOf('seal')?.text ?? ''} onChange={(e) => setBadge('seal', { text: e.target.value })} />}</Field>
              <Field label="Sigillo: parola" hint="Max 14. Es. «RECIPES»">{(id) => <Input id={id} maxLength={14} value={badgeOf('seal')?.subtext ?? ''} onChange={(e) => setBadge('seal', { subtext: e.target.value })} />}</Field>
              <Field label="Invito all'azione" hint="Max 28. Es. «START COOKING TODAY»" className="sm:col-span-2">{(id) => <Input id={id} maxLength={28} value={badgeOf('cta')?.text ?? ''} onChange={(e) => setBadge('cta', { text: e.target.value })} />}</Field>
            </div>
            {(cover.badges ?? []).map((b) => ({ b, why: forbiddenClaim(`${b.text} ${b.subtext}`) })).filter((x) => x.why).map((x) => (
              <Notice key={x.b.kind} tone="bad" className="mt-2">«{x.b.text}» contiene {x.why}: Amazon può rifiutare la copertina. Riscrivila.</Notice>
            ))}
            {(cover.badges?.length ?? 0) > 0 && (
              <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-cyan" checked={cover.badgesConfirmed === true} onChange={(e) => setCover({ badgesConfirmed: e.target.checked })} /> Confermo che tutto ciò che è scritto nelle etichette è vero ed è presente nel libro (senza questa conferma il kit non risulta «pronto»).</label>
            )}
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
                  <option value="Montserrat">Montserrat (sans moderno, d’impatto)</option>
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
                <input type="color" className="h-11 w-16 cursor-pointer rounded border border-line bg-card p-1" value={hex(cover.palette[k])} onChange={(e) => setCover({ palette: { ...cover.palette, [k]: e.target.value } })} />
              </label>
            ))}
            <Button variant="outline" onClick={() => setCover({ seed: Math.floor(Math.random() * 100000) })}><Shuffle className="size-4" aria-hidden /> Varia il motivo grafico</Button>
          </div>
        </Card>

        <div className="order-1 lg:order-2">
          <Card className="lg:sticky lg:top-28">
            <div className="mb-3 flex gap-1 rounded-lg bg-white/5 p-1" role="group" aria-label="Vista copertina">
              {(['fronte', 'completa'] as const).map((v) => (
                <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={cn('min-h-9 flex-1 rounded-md px-2 text-sm font-medium', view === v ? 'bg-card text-ink shadow-sm' : 'text-slate2')}>
                  {v === 'fronte' ? 'Fronte / eBook' : 'Retro + dorso + fronte'}
                </button>
              ))}
            </div>
            {view === 'completa' && !geometry ? (
              <Notice tone="warn">Il dorso dipende dalle pagine reali del PDF interno. Genera prima l’anteprima dell’interno qui sotto: non viene mostrato un dorso “stimato”.</Notice>
            ) : (
              <div className="mx-auto overflow-hidden rounded shadow-lg ring-1 ring-white/10" style={{ aspectRatio: String(aspect), maxWidth: view === 'fronte' ? '18rem' : '100%' }} data-testid="cover-preview" dangerouslySetInnerHTML={{ __html: svg }} />
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
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-cyan" checked={layout.runningHeaders} onChange={(e) => setLayout({ runningHeaders: e.target.checked }, false)} /> Intestazioni: titolo del libro sulle pagine pari, capitolo sulle dispari</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-cyan" checked={layout.bleed} onChange={(e) => setLayout({ bleed: e.target.checked })} /> Interno con abbondanza (solo se hai elementi al vivo)</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-cyan" checked={layout.readerAiNotice} onChange={(e) => setLayout({ readerAiNotice: e.target.checked }, false)} /> Avviso al lettore sull’uso dell’IA nella pagina del copyright</label>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate2">{coloring ? 'Un disegno a tutta pagina sempre a destra, pagina bianca dietro (il pennarello non trasparisce sul disegno dopo), frontespizio, pagina «appartiene a», numerazione e indice dei disegni con i numeri di pagina reali.' : 'Margini a specchio con gabbia adeguata al numero di pagine, capitoli sempre su pagina destra, numerazione, indice con i numeri di pagina reali, riquadri e tabelle. Font incorporati nel PDF.'}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="gold" onClick={() => void renderInterior()} loading={rendering} disabled={status?.renderer === false}><FileText className="size-4" aria-hidden /> {rendering ? 'Impaginazione in corso…' : 'Genera anteprima PDF interno'}</Button>
          {pdf && <Button variant="outline" onClick={() => downloadBlob(pdf.blob, pdf.fileName)}><Download className="size-4" aria-hidden /> Scarica PDF</Button>}
          {project.pageCount && <Badge tone={project.pageCount >= MIN_PAGES ? 'ok' : 'bad'}>{project.pageCount} pagine{project.pageCount < MIN_PAGES ? ` · minimo KDP ${MIN_PAGES}` : ''}</Badge>}
        </div>
        {status?.renderer === false && <Notice tone="bad" className="mt-3">Renderer PDF non disponibile su questo server: manca Chromium (variabile CHROMIUM_EXECUTABLE_PATH).</Notice>}
        {!coloring && written < chapters.length && <p className="mt-2 text-xs text-warn">{chapters.length - written} capitoli sono ancora vuoti: l’anteprima include solo quelli scritti.</p>}
        {pdf && <iframe title="Anteprima PDF interno" src={pdf.url} className="mt-4 hidden h-[36rem] w-full rounded-lg border border-line md:block" />}
        {pdf && <p className="mt-2 text-xs text-slate2 md:hidden">Su telefono apri il PDF con “Scarica PDF”.</p>}
      </Card>

      <div className="flex justify-end"><Button size="lg" onClick={() => goTo('kit')}>Avanti: KDP Kit</Button></div>
    </div>
  );
}
