'use client';
/* eslint-disable @next/next/no-img-element */

import { ArrowDown, ArrowUp, Copy, ImagePlus, Loader2, Plus, Sparkles, Square, Trash2, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, Select, useToast } from '@/components/ui';
import type { ColoringPageOutput, ColoringPlanOutput } from '@/lib/ai/schemas';
import { callAi } from '@/lib/client-api';
import { LineArtError, sanitizeLineArt, svgDataUrl } from '@/lib/coloring/svg';
import { mandalaSvg } from '@/lib/coloring/mandala';
import { defaultColoring } from '@/lib/defaults';
import { briefContext, logActivity, recordCost, spentUsd } from '@/lib/generation';
import { prepareColoringImage } from '@/lib/image-upload';
import { useApp, useStore } from '@/lib/store/context';
import type { ColoringPage } from '@/lib/types';
import { cn, uid } from '@/lib/utils';
import type { TabProps } from './types';

const AGES = ['3-5 anni', '4-8 anni', '6-10 anni', 'Ragazzi e adulti (dettagli fini)'];
const COST_PER_PAGE = 0.15; // stima prudente per disegno vettoriale con il modello predefinito

const blank = (over: Partial<ColoringPage>): ColoringPage => ({ id: uid(), title: '', source: 'ia', svg: null, image: null, width: 0, height: 0, prompt: '', aiGenerated: true, seed: Math.floor(Math.random() * 1_000_000), ...over });
const srcOf = (p: ColoringPage) => p.image ?? (p.svg ? svgDataUrl(p.svg) : null);

export function ColoringTab({ project, niche, update, goTo }: TabProps) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const book = project.coloring ?? defaultColoring();
  const pages = book.pages;
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [count, setCount] = useState(30);
  const [notes, setNotes] = useState('');
  const [styleGuide, setStyleGuide] = useState('Thick clean black outlines, big simple shapes, no shading, no grey, white background, friendly and easy to color.');
  const [uploadAi, setUploadAi] = useState(true);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<{ id: string | null }>({ id: null });

  const setBook = (patch: Partial<typeof book>) => update({ coloring: { ...book, ...patch }, pageCount: null });
  const setPages = (next: ColoringPage[], extra: Partial<typeof project> = {}) => update({ coloring: { ...book, pages: next }, pageCount: null, ...extra });
  const patchPage = (id: string, patch: Partial<ColoringPage>) => setPages(pages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  /** Le immagini IA vanno dichiarate a KDP: la dichiarazione passa a «generate» da sola. */
  const declareAi = () => (project.kdp.aiImages === 'none' ? { kdp: { ...project.kdp, aiImages: 'generated' as const } } : {});

  const drawn = pages.filter((p) => p.svg || p.image);
  const missing = pages.filter((p) => !p.svg && !p.image);
  const pdfPages = drawn.length ? 3 + (book.toc ? 1 : 0) + drawn.length * 2 - 1 : 0;

  async function plan() {
    setBusy('plan');
    try {
      const done = await callAi({ task: 'coloringPlan', input: { brief: briefContext(project, niche), ageRange: book.ageRange, count, notes }, projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd }, { token: await getToken() });
      const out = done.data as ColoringPlanOutput;
      await recordCost(store, project.id, 'Disegni: piano delle pagine', done);
      setStyleGuide(out.styleGuide);
      const fresh = out.pages.map((p) => blank({ title: p.title, prompt: p.subject }));
      setPages([...pages, ...fresh]);
      toast(`${fresh.length} pagine pianificate. Ora fai disegnare ogni pagina all’IA, oppure caricale tu.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Piano non riuscito.', 'bad');
    } finally {
      setBusy(null);
    }
  }

  async function drawOne(id: string, silent = false): Promise<boolean> {
    const pg = pages.find((x) => x.id === id) ?? null;
    return drawPage(pg, silent);
  }

  async function drawPage(pg: ColoringPage | null, silent: boolean, latest?: { list: ColoringPage[] }): Promise<boolean> {
    if (!pg) return false;
    if (!pg.prompt.trim()) {
      if (!silent) toast('Scrivi prima cosa disegnare in questa pagina.', 'bad');
      return false;
    }
    try {
      const done = await callAi({ task: 'coloringPage', input: { subject: pg.prompt, ageRange: book.ageRange, styleGuide, language: project.locale, title: pg.title }, projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd }, { token: await getToken() });
      await recordCost(store, project.id, `Disegno: ${pg.title || 'pagina'}`, done);
      const svg = sanitizeLineArt((done.data as ColoringPageOutput).svg);
      const next = (latest?.list ?? pages).map((p) => (p.id === pg.id ? { ...p, svg, image: null, source: 'ia' as const, aiGenerated: true, width: 0, height: 0 } : p));
      if (latest) latest.list = next;
      setPages(next, declareAi());
      return true;
    } catch (e) {
      const msg = e instanceof LineArtError ? `Disegno scartato (${e.message}) — riprova.` : e instanceof Error ? e.message : 'Disegno non riuscito.';
      if (!silent) toast(msg, 'bad');
      else throw new Error(msg);
      return false;
    }
  }

  async function drawOneButton(id: string) {
    setBusy(`draw:${id}`);
    try {
      if (await drawOne(id)) toast('Disegno pronto. Guardalo e, se non ti piace, rigeneralo.', 'ok');
    } finally {
      setBusy(null);
    }
  }

  async function drawAll() {
    const todo = pages.filter((p) => !p.svg && !p.image && p.prompt.trim());
    if (!todo.length) return toast('Non ci sono pagine da disegnare: pianificale prima.', 'info');
    stopRef.current = false;
    setBusy('all');
    setProgress({ done: 0, total: todo.length });
    const latest = { list: pages };
    let ok = 0;
    let lastErr = '';
    for (const pg of todo) {
      if (stopRef.current) break;
      try {
        if (await drawPage(pg, true, latest)) ok++;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : 'errore';
        if (/Budget AI|chiave|mock|non disponibile/i.test(lastErr)) break;
      }
      setProgress({ done: ok, total: todo.length });
    }
    await logActivity(store, project.id, `Disegni: ${ok}/${todo.length} pagine disegnate con IA.`);
    setBusy(null);
    setProgress(null);
    toast(ok === todo.length ? `${ok} disegni pronti.` : `${ok}/${todo.length} disegni pronti.${lastErr ? ` Ultimo problema: ${lastErr}` : ''}`, ok === todo.length ? 'ok' : 'info');
  }

  function addMandala(n: number) {
    const fresh = Array.from({ length: n }, (_, i) => {
      const seed = Math.floor(Math.random() * 900_000) + i;
      return blank({ title: `Mandala ${pages.filter((p) => p.source === 'mandala').length + i + 1}`, source: 'mandala', svg: sanitizeLineArt(mandalaSvg(seed)), prompt: 'mandala', aiGenerated: false, seed });
    });
    setPages([...pages, ...fresh]);
    toast(`${n} mandala aggiunti (generati dal codice: nessun costo, nessuna IA).`, 'ok');
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const target = pickRef.current.id;
    setBusy('upload');
    try {
      const list = [...files].slice(0, target ? 1 : 60);
      let next = pages;
      for (const file of list) {
        const img = await prepareColoringImage(file);
        if (target) next = next.map((p) => (p.id === target ? { ...p, image: img.dataUrl, svg: null, width: img.width, height: img.height, source: 'caricata' as const, aiGenerated: uploadAi } : p));
        else next = [...next, blank({ title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 80), source: 'caricata', image: img.dataUrl, width: img.width, height: img.height, aiGenerated: uploadAi })];
      }
      setPages(next, uploadAi ? declareAi() : {});
      toast(`${list.length} immagini aggiunte, ripulite in bianco e nero.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Caricamento non riuscito.', 'bad');
    } finally {
      setBusy(null);
      pickRef.current.id = null;
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= pages.length) return;
    const next = [...pages];
    [next[i], next[j]] = [next[j], next[i]];
    setPages(next);
  };

  const aiReady = status?.ai.mode === 'anthropic';
  const imagePrompt = (p: ColoringPage) => `Coloring book page for ${book.ageRange || 'kids'}. ${p.prompt}. ${styleGuide} Portrait orientation, black outlines only on pure white background, no text, no letters, no grey tones, no shading.`;

  return (
    <div className="space-y-4">
      <Notice>
        Un libro da colorare è fatto di <b>disegni, non di testo</b>: una pagina bianca dietro ogni disegno (il pennarello non rovina quello dopo), frontespizio, pagina «appartiene a» e indice con i numeri di pagina reali.
        Puoi far disegnare le pagine all’IA (vettoriali, semplici), caricare immagini fatte con ChatGPT/altro, o aggiungere mandala generati dal codice.
      </Notice>

      <Card>
        <CardTitle action={<Badge tone={drawn.length >= 25 ? 'ok' : 'warn'}>{drawn.length} disegni · ~{pdfPages} pagine</Badge>}>Impostazioni</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Età dei bambini">{(id) => <Select id={id} value={AGES.includes(book.ageRange) ? book.ageRange : AGES[1]} onChange={(e) => setBook({ ageRange: e.target.value })}>{AGES.map((a) => <option key={a}>{a}</option>)}</Select>}</Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={book.toc} onChange={(e) => setBook({ toc: e.target.checked })} /> Indice dei disegni con i numeri di pagina</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={book.captions} onChange={(e) => setBook({ captions: e.target.checked })} /> Stampa il titolo sotto ogni disegno</label>
          </div>
        </div>
        {drawn.length < 25 && <p className="mt-3 text-xs text-warn">I libri da colorare che vendono hanno di solito 30–50 disegni: con meno di 25 il QA ti avvisa (non blocca).</p>}
      </Card>

      <Card>
        <CardTitle>1 · Piano dei disegni (IA)</CardTitle>
        <p className="mb-3 text-sm text-slate2">L’IA propone i soggetti di ogni pagina in base alla tua nicchia e al brief. Poi li puoi cambiare a mano.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Quante pagine">{(id) => <Input id={id} type="number" min={6} max={60} value={count} onChange={(e) => setCount(Math.min(60, Math.max(6, Number(e.target.value) || 6)))} />}</Field>
          <Field label="Indicazioni (facoltative)" className="sm:col-span-2">{(id) => <Input id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="es. animali della fattoria, dai più semplici ai più dettagliati" />}</Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="gold" onClick={() => void plan()} loading={busy === 'plan'} disabled={!aiReady || busy !== null}><Sparkles className="size-4" aria-hidden /> Pianifica {count} pagine</Button>
          {!aiReady && <span className="text-xs text-warn">Serve l’AI collegata (chiave Anthropic): il mock non finge disegni.</span>}
        </div>
        <Field label="Stile comune (in inglese: vale per tutti i disegni e per i prompt ChatGPT)" className="mt-3">{(id) => <Input id={id} value={styleGuide} onChange={(e) => setStyleGuide(e.target.value)} />}</Field>
      </Card>

      <Card>
        <CardTitle>2 · Pagine del libro</CardTitle>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="gold" onClick={() => void drawAll()} loading={busy === 'all'} disabled={!aiReady || busy === 'plan' || busy === 'upload' || !missing.some((p) => p.prompt.trim())}><Wand2 className="size-4" aria-hidden /> Disegna con IA le {missing.filter((p) => p.prompt.trim()).length} mancanti</Button>
          {busy === 'all' && <Button variant="outline" onClick={() => { stopRef.current = true; }}><Square className="size-4" aria-hidden /> Ferma</Button>}
          <Button variant="outline" onClick={() => { pickRef.current.id = null; fileRef.current?.click(); }} disabled={busy !== null}><ImagePlus className="size-4" aria-hidden /> Carica immagini (anche molte)</Button>
          <Button variant="outline" onClick={() => addMandala(5)} disabled={busy !== null}><Plus className="size-4" aria-hidden /> 5 mandala (gratis)</Button>
          <Button variant="outline" onClick={() => setPages([...pages, blank({ title: `Pagina ${pages.length + 1}` })])} disabled={busy !== null}><Plus className="size-4" aria-hidden /> Pagina vuota</Button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
        </div>
        <label className="mb-3 flex items-center gap-2 text-xs text-slate2"><input type="checkbox" className="size-4" checked={uploadAi} onChange={(e) => setUploadAi(e.target.checked)} /> Le immagini che carico sono state generate con IA (KDP richiede di dichiararlo). Togli la spunta solo se le hai disegnate tu.</label>
        {progress && <p className="mb-3 text-sm text-ink" aria-live="polite"><Loader2 className="mr-1 inline size-4 animate-spin" aria-hidden />Disegno {progress.done + 1} di {progress.total}… ogni disegno costa circa {COST_PER_PAGE.toFixed(2)} $ (il tetto del libro resta valido).</p>}
        {missing.some((p) => p.prompt.trim()) && !progress && <p className="mb-3 text-xs text-slate2">Costo indicativo per disegnare le mancanti con IA: circa {(missing.filter((p) => p.prompt.trim()).length * COST_PER_PAGE).toFixed(2)} $. Mandala e immagini caricate costano 0.</p>}

        {!pages.length ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-slate2">Nessuna pagina ancora. Pianifica con l’IA, carica le tue immagini o aggiungi dei mandala.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((p, i) => {
              const src = srcOf(p);
              return (
                <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3">
                  <div className="flex items-center justify-between text-xs text-slate2">
                    <span className="font-semibold text-ink">#{i + 1}</span>
                    <span className="flex gap-1">
                      <button className="rounded p-1 hover:bg-white/10" aria-label="Sposta su" onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></button>
                      <button className="rounded p-1 hover:bg-white/10" aria-label="Sposta giù" onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></button>
                      <button className="rounded p-1 hover:bg-white/10 hover:text-bad" aria-label="Rimuovi pagina" onClick={() => setPages(pages.filter((x) => x.id !== p.id))}><Trash2 className="size-3.5" /></button>
                    </span>
                  </div>
                  <div className={cn('grid aspect-[8.5/11] place-items-center overflow-hidden rounded-lg border border-line bg-white', !src && 'text-xs text-slate2')}>
                    {src ? <img src={src} alt={p.title || `Disegno ${i + 1}`} className="size-full object-contain" /> : busy === `draw:${p.id}` ? <Loader2 className="size-5 animate-spin text-cyan" aria-label="Disegno in corso" /> : 'Da disegnare'}
                  </div>
                  <Input aria-label="Titolo della pagina" placeholder="Titolo (per l’indice)" value={p.title} onChange={(e) => patchPage(p.id, { title: e.target.value })} />
                  {p.source !== 'mandala' && <Input aria-label="Cosa disegnare (in inglese)" placeholder="Cosa disegnare (in inglese)" value={p.prompt} onChange={(e) => patchPage(p.id, { prompt: e.target.value })} />}
                  <div className="flex flex-wrap gap-1.5">
                    {p.source !== 'mandala' && <Button size="sm" variant="outline" onClick={() => void drawOneButton(p.id)} loading={busy === `draw:${p.id}`} disabled={!aiReady || (busy !== null && busy !== `draw:${p.id}`)}><Wand2 className="size-3.5" aria-hidden /> {src ? 'Ridisegna' : 'Disegna'}</Button>}
                    <Button size="sm" variant="outline" onClick={() => { pickRef.current.id = p.id; fileRef.current?.click(); }} disabled={busy !== null}><ImagePlus className="size-3.5" aria-hidden /> Carica</Button>
                    {p.source === 'mandala' && <Button size="sm" variant="outline" onClick={() => { const seed = Math.floor(Math.random() * 900_000); patchPage(p.id, { svg: sanitizeLineArt(mandalaSvg(seed)), seed }); }}>Altro mandala</Button>}
                    {p.source !== 'mandala' && p.prompt.trim() && <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(imagePrompt(p)).then(() => toast('Prompt copiato: incollalo in ChatGPT, poi carica l’immagine qui.', 'ok'), () => toast('Copia non riuscita.', 'bad'))}><Copy className="size-3.5" aria-hidden /> Prompt ChatGPT</Button>}
                  </div>
                  <p className="text-[11px] text-slate2">{p.source === 'mandala' ? 'Mandala generato dal codice (nessuna IA)' : p.source === 'ia' ? (src ? 'Disegnato con IA (vettoriale)' : 'Non ancora disegnato') : `Immagine caricata${p.width ? ` · ${p.width}×${p.height}px` : ''}${p.aiGenerated ? ' · dichiarata IA' : ''}`}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Notice tone="warn">
        Diritti: usa soggetti generici e originali. Niente personaggi, marchi o franchise protetti (Disney, Pokémon, supereroi…), nemmeno «in stile». Rivedi ogni pagina: l’IA può sbagliare proporzioni o lasciare linee aperte (impossibili da colorare bene).
      </Notice>

      <div className="flex justify-end"><Button size="lg" onClick={() => goTo('studio')} disabled={!drawn.length}>Avanti: copertina e interni</Button></div>
    </div>
  );
}
