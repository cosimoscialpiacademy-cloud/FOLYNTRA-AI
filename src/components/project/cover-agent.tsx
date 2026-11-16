'use client';

import { Check, Copy, ImagePlus, Search, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, Textarea, useToast } from '@/components/ui';
import type { CoverConcept, CoverCritiqueOutput, CoverStrategyOutput } from '@/lib/ai/schemas';
import { ART_TEMPLATES, COVER_ART, artById } from '@/lib/cover-art';
import { callAi, callCoverImage, callMarket } from '@/lib/client-api';
import { frontCoverSvg } from '@/lib/export/cover-svg';
import { briefContext, logActivity, recordCost, spentUsd } from '@/lib/generation';
import { blobToJpegBase64, prepareCompetitorShot } from '@/lib/image-upload';
import { TRIM_SIZES } from '@/lib/kdp/specs';
import { useApp, useStore } from '@/lib/store/context';
import type { CompetitorShot, CoverBrief, CoverSpec, Niche } from '@/lib/types';
import { cn, uid } from '@/lib/utils';
import type { TabProps } from './types';

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_SHOTS = 6;
const EMPTY: CoverBrief = { competitors: [], notes: '', strategy: null, strategyIsMock: false, critique: null, critiqueIsMock: false };

/** Riassunto testuale della nicchia per l'agente (dati dell'utente: quelli DEMO sono dichiarati tali). */
function nicheNotes(niche: Niche | null): string {
  if (!niche) return '';
  const comp = niche.competitors.slice(0, 8).map((c) => `- ${c.title}${c.price ? `, ${c.price}` : ''}${c.reviews ? `, ${c.reviews} recensioni` : ''}${c.rating ? `, ${c.rating}★` : ''}${c.pages ? `, ${c.pages} pagine` : ''}${c.verified ? '' : ' (non verificato)'}`).join('\n');
  return [`Nicchia: ${niche.keyword} (${niche.marketplace})${niche.demoOnly ? ' — DATI DEMO, non reali' : ''}`, niche.buyerPersona && `Chi compra: ${niche.buyerPersona}`, niche.category && `Categoria: ${niche.category}`, comp && `Concorrenti:\n${comp}`, niche.differentiationIdeas.length ? `Idee di differenziazione: ${niche.differentiationIdeas.join('; ')}` : ''].filter(Boolean).join('\n');
}

/** Costruisce la copertina corrispondente a un concept (valida palette e sfondo: i dati dell'IA non si fidano alla cieca). */
function specFromConcept(base: CoverSpec, c: CoverConcept): CoverSpec {
  const art = artById(c.artId);
  const isArt = ART_TEMPLATES.includes(c.template);
  const okPalette = HEX.test(c.palette.background) && HEX.test(c.palette.accent) && HEX.test(c.palette.text);
  return {
    ...base,
    template: c.template,
    titleFont: c.titleFont,
    palette: okPalette ? { ...c.palette } : art ? { ...art.palette } : base.palette,
    art: isArt ? (art ? { id: art.id, dataUrl: null, aiGenerated: true, dim: base.art?.dim ?? 0.55 } : base.art ?? null) : base.art ?? null,
  };
}

function ConceptCard({ c, base, index, recommended, onApply, trimW, trimH }: { c: CoverConcept; base: CoverSpec; index: number; recommended: boolean; onApply: () => void; trimW: number; trimH: number }) {
  const toast = useToast();
  const spec = specFromConcept(base, c);
  const needsCustomArt = ART_TEMPLATES.includes(c.template) && !artById(c.artId);
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border bg-card2 p-3', recommended ? 'border-cyan shadow-[0_0_0_1px_rgba(0,229,255,0.35)]' : 'border-line')}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-sm font-bold text-ink">{index + 1}. {c.name}</p>
        {recommended && <Badge tone="ok">Consigliato</Badge>}
      </div>
      <div className="mx-auto w-full max-w-[11rem] overflow-hidden rounded shadow-lg ring-1 ring-white/10" style={{ aspectRatio: `${trimW}/${trimH}` }} dangerouslySetInnerHTML={{ __html: frontCoverSvg(spec, trimW, trimH) }} />
      <p className="text-xs text-ink/90"><strong>Perché:</strong> {c.rationale}</p>
      <p className="text-xs text-ink/90"><strong>Come si distingue:</strong> {c.standOut}</p>
      {c.titleLines.length > 0 && <p className="text-xs text-slate2"><strong className="text-ink">Titolo su righe:</strong> {c.titleLines.join(' / ')}</p>}
      <p className="text-xs text-slate2"><strong className="text-ink">Prova in miniatura:</strong> {c.thumbnailTest}</p>
      <p className="text-xs text-warn"><strong>Rischi:</strong> {c.risks}</p>
      {c.customArtPrompt && (
        <div className="rounded-lg border border-line bg-card p-2 text-xs text-slate2">
          <p className="mb-1 font-semibold text-ink">Sfondo su misura (da generare)</p>
          <p className="break-words">{c.customArtPrompt}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => void navigator.clipboard.writeText(c.customArtPrompt).then(() => toast('Prompt copiato: incollalo nel generatore di immagini, poi carica il risultato.', 'ok'), () => toast('Copia non riuscita.', 'bad'))}><Copy className="size-4" aria-hidden /> Copia prompt</Button>
        </div>
      )}
      {needsCustomArt && !c.customArtPrompt && <p className="text-xs text-warn">Questo concept richiede uno sfondo che non è nel catalogo: scegline uno o caricane uno tuo.</p>}
      <Button className="mt-auto" size="sm" onClick={onApply}><Check className="size-4" aria-hidden /> Applica questo concept</Button>
    </div>
  );
}

export function CoverAgent({ project, niche, update }: Pick<TabProps, 'project' | 'niche' | 'update'>) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<'strategy' | 'critique' | 'market' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [thumb, setThumb] = useState<160 | 110 | 70>(110);
  const fileRef = useRef<HTMLInputElement>(null);
  const cb = project.coverBrief ?? EMPTY;
  const setCb = (patch: Partial<CoverBrief>) => update({ coverBrief: { ...cb, ...patch } });
  const trim = TRIM_SIZES[project.layout.trim];
  const cover = project.cover;

  async function addShots(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_SHOTS - cb.competitors.length;
    if (room <= 0) return toast(`Massimo ${MAX_SHOTS} copertine concorrenti.`, 'bad');
    const added: CompetitorShot[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      try {
        const r = await prepareCompetitorShot(f);
        added.push({ id: uid(), data: r.base64, note: '' });
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Immagine non valida.', 'bad');
      }
    }
    if (added.length) setCb({ competitors: [...cb.competitors, ...added] });
    if (fileRef.current) fileRef.current.value = '';
  }

  const baseInput = (previous: CoverStrategyOutput | null, fb: string, shotList: CompetitorShot[] = cb.competitors) => ({
    brief: briefContext(project, niche),
    nicheNotes: nicheNotes(niche).slice(0, 3000),
    notes: cb.notes.slice(0, 1500),
    feedback: fb.slice(0, 1500),
    previous: previous ? JSON.stringify(previous).slice(0, 12000) : '',
    competitors: shotList.map((s) => ({ mediaType: 'image/jpeg' as const, data: s.data, note: s.note.slice(0, 200) })),
    catalog: COVER_ART.map((a) => ({ id: a.id, name: a.name, tone: a.tone, suits: a.suits })),
    currentCover: { template: cover.template, artId: cover.art?.id ?? '', title: cover.title.slice(0, 300), fontName: cover.titleFont },
  });

  async function runStrategy(withFeedback: boolean, shotList?: CompetitorShot[]) {
    setBusy('strategy');
    try {
      const done = await callAi({ task: 'cover', input: baseInput(withFeedback ? cb.strategy : null, withFeedback ? feedback : '', shotList), projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd }, { token: await getToken() });
      setCb({ strategy: done.data as CoverStrategyOutput, strategyIsMock: done.provider === 'mock' });
      await recordCost(store, project.id, 'Agente copertine: strategia', done);
      await logActivity(store, project.id, `Agente copertine: ${withFeedback ? 'strategia rielaborata' : 'strategia generata'} (${done.provider === 'mock' ? 'mock dichiarato' : done.model}).`);
      if (withFeedback) setFeedback('');
      toast(done.provider === 'mock' ? 'Strategia segnaposto (mock): serve la chiave AI per un’analisi vera.' : 'Strategia pronta: sono ipotesi da verificare in miniatura.', done.provider === 'mock' ? 'info' : 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Analisi non riuscita.', 'bad');
    } finally {
      setBusy(null);
    }
  }

  /** Cerca da solo, via Keepa, i 3 libri che vendono meglio per la keyword della nicchia e li fa analizzare all'agente. */
  async function findAndAnalyze() {
    const keyword = niche?.keyword || project.kdp.keywords.find((k) => k.trim()) || project.title;
    setBusy('market');
    try {
      const r = await callMarket(keyword, project.marketplace, true, await getToken());
      if (!r.covers.length) throw new Error('Ho trovato dei libri ma non sono riuscito a scaricarne le copertine: riprova o caricale a mano.');
      const shots: CompetitorShot[] = r.covers.map((c) => ({ id: c.asin, data: c.data, note: c.note }));
      setCb({ competitors: shots });
      toast(`Trovati i ${shots.length} libri che vendono meglio per «${keyword}». Ora li analizzo…`, 'ok');
      setBusy(null);
      await runStrategy(false, shots);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ricerca dei concorrenti non riuscita.', 'bad');
      setBusy(null);
    }
  }

  async function runCritique() {
    setBusy('critique');
    try {
      const token = await getToken();
      const jpg = await callCoverImage(cover, token);
      const own = await blobToJpegBase64(jpg, 720);
      const done = await callAi({ task: 'coverCritique', input: { ...baseInput(cb.strategy, feedback), ownCover: { mediaType: 'image/jpeg', data: own, note: 'nostra copertina' } }, projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd }, { token });
      setCb({ critique: done.data as CoverCritiqueOutput, critiqueIsMock: done.provider === 'mock' });
      await recordCost(store, project.id, 'Agente copertine: valutazione', done);
      await logActivity(store, project.id, `Agente copertine: copertina valutata (${done.provider === 'mock' ? 'mock dichiarato' : done.model}).`);
      toast(done.provider === 'mock' ? 'Valutazione segnaposto (mock).' : 'Valutazione pronta.', done.provider === 'mock' ? 'info' : 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Valutazione non riuscita.', 'bad');
    } finally {
      setBusy(null);
    }
  }

  function apply(c: CoverConcept) {
    const next = specFromConcept(cover, c);
    const declare = next.art?.aiGenerated && project.kdp.aiImages === 'none' ? { kdp: { ...project.kdp, aiImages: 'generated' as const } } : {};
    update({ cover: { ...next, tagline: cover.tagline || c.taglineSuggestion || '' }, ...declare });
    toast(`Concept «${c.name}» applicato alla copertina.`, 'ok');
  }

  const strat = cb.strategy;
  const crit = cb.critique;
  const shots = cb.competitors;
  const oursSvg = frontCoverSvg(cover, trim.widthIn, trim.heightIn);
  // La nostra copertina viene messa in mezzo ai concorrenti, come in una pagina di risultati.
  const grid: ({ kind: 'shot'; id: string; src: string } | { kind: 'ours' })[] = shots.map((s) => ({ kind: 'shot' as const, id: s.id, src: `data:image/jpeg;base64,${s.data}` }));
  grid.splice(Math.min(2, grid.length), 0, { kind: 'ours' });

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Direttore artistico</CardTitle>
        <p className="text-sm text-slate2">Un agente che lavora con te sulla copertina: confronta i concorrenti della nicchia, propone 3 concept, valuta la copertina che stai costruendo e la rielabora con i tuoi commenti. Sono <strong className="text-ink">ipotesi da verificare</strong>, non garanzie di vendita.</p>
        {status?.ai.mode === 'mock' && <Notice tone="warn" className="mt-3">AI non collegata: l’agente risponde con segnaposto dichiarati (mock). Con la chiave Anthropic analizza davvero le immagini dei concorrenti.</Notice>}

        <div className="mt-4 rounded-xl border border-cyan/30 bg-cyan/5 p-3">
          <p className="text-sm font-semibold text-ink">Automatico: trova da solo i concorrenti che vendono</p>
          <p className="mt-0.5 text-xs text-slate2">Cerca la keyword della tua nicchia su Amazon (via Keepa), prende i <strong className="text-ink">3 libri con il miglior Sales Rank</strong> (un indicatore indiretto di vendite, non del profitto reale), ne guarda le copertine e propone concept per fare meglio.</p>
          <Button className="mt-2" variant="primary" onClick={() => void findAndAnalyze()} loading={busy === 'market'} disabled={busy !== null || !status?.providers.keepa}><Search className="size-4" aria-hidden /> Trova i 3 concorrenti migliori e analizza</Button>
          {!status?.providers.keepa && <p className="mt-2 text-xs text-warn">Non ancora attivo: serve un piano API di Keepa (servizio a pagamento) e la variabile <code>KEEPA_API_KEY</code> sul server. Nel frattempo puoi caricare tu le copertine qui sotto.</p>}
        </div>

        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">1 · Copertine dei concorrenti <span className="font-normal text-slate2">(fino a {MAX_SHOTS}) · oppure caricale tu</span></p>
          <p className="text-xs text-slate2">Fai uno screenshot dei risultati di Amazon per la tua parola chiave e carica le copertine dei libri che vendono meglio. Nessuno scraping: le immagini le fornisci tu e restano nel tuo archivio.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {shots.map((s) => (
              <div key={s.id} className="w-28 space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/jpeg;base64,${s.data}`} alt="Copertina concorrente" className="aspect-[2/3] w-full rounded object-cover ring-1 ring-white/10" />
                <Input aria-label="Nota sulla copertina" placeholder="nota (facoltativa)" maxLength={200} value={s.note} onChange={(e) => setCb({ competitors: shots.map((x) => (x.id === s.id ? { ...x, note: e.target.value } : x)) })} className="min-h-8 px-2 py-1 text-xs" />
                <button className="inline-flex items-center gap-1 text-xs text-slate2 hover:text-bad" onClick={() => setCb({ competitors: shots.filter((x) => x.id !== s.id), strategy: cb.strategy })}><Trash2 className="size-3.5" aria-hidden /> Togli</button>
              </div>
            ))}
            {shots.length < MAX_SHOTS && (
              <button onClick={() => fileRef.current?.click()} className="grid h-40 w-28 place-items-center rounded border border-dashed border-line text-xs text-slate2 hover:border-cyan hover:text-cyan">
                <span className="flex flex-col items-center gap-1"><ImagePlus className="size-5" aria-hidden /> Aggiungi</span>
              </button>
            )}
            <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Carica copertine dei concorrenti" onChange={(e) => void addShots(e.target.files)} />
          </div>
        </div>

        <div className="mt-4">
          <Field label="2 · Cosa vuoi ottenere" hint="Es. «voglio un aspetto premium ma accessibile», «per chi parte da zero», «niente toni scuri».">
            {(id) => <Textarea id={id} rows={2} maxLength={1500} value={cb.notes} onChange={(e) => setCb({ notes: e.target.value })} />}
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="gold" onClick={() => void runStrategy(false)} loading={busy === 'strategy'} disabled={busy !== null}><Wand2 className="size-4" aria-hidden /> {strat ? 'Rifai l’analisi da capo' : 'Analizza e proponi 3 concept'}</Button>
          <Button variant="outline" onClick={() => void runCritique()} loading={busy === 'critique'} disabled={busy !== null || status?.renderer === false}><Search className="size-4" aria-hidden /> Valuta la mia copertina attuale</Button>
        </div>
      </Card>

      {strat && (
        <Card>
          <CardTitle action={<Badge tone={cb.strategyIsMock ? 'demo' : strat.basedOn === 'immagini_concorrenti' ? 'ok' : 'warn'}>{cb.strategyIsMock ? 'TESTO DEMO (mock)' : strat.basedOn === 'immagini_concorrenti' ? 'Basato sulle immagini dei concorrenti' : 'Senza immagini: solo testo e conoscenze generali'}</Badge>}>Cosa ha visto l’agente</CardTitle>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {([['Stili dominanti', strat.marketReading.dominantStyles], ['Colori ricorrenti', strat.marketReading.colorPatterns], ['Tipografia', strat.marketReading.typographyPatterns], ['Spazi liberi da occupare', strat.marketReading.gaps]] as const).map(([t, items]) => (
              <div key={t} className="rounded-lg border border-line bg-card2 p-3"><p className="mb-1 font-semibold text-ink">{t}</p><ul className="list-disc space-y-0.5 pl-5 text-slate2">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            ))}
          </div>
          <p className="mt-3 text-sm text-ink/90"><strong>Pubblico:</strong> {strat.audienceInsight}</p>

          <p className="mb-2 mt-5 text-sm font-semibold text-ink">3 concept</p>
          <div className="grid gap-3 md:grid-cols-3">
            {strat.concepts.slice(0, 3).map((c, i) => <ConceptCard key={i} c={c} base={cover} index={i} recommended={i === strat.recommendedIndex} onApply={() => apply(c)} trimW={trim.widthIn} trimH={trim.heightIn} />)}
          </div>
          <p className="mt-3 text-sm text-ink/90"><strong>Perché il consigliato:</strong> {strat.recommendationReason}</p>
          {strat.thumbnailChecklist.length > 0 && (
            <div className="mt-3 rounded-lg border border-line bg-card2 p-3 text-sm"><p className="mb-1 font-semibold text-ink">Checklist in miniatura</p><ul className="space-y-0.5 text-slate2">{strat.thumbnailChecklist.map((x, i) => <li key={i}>☐ {x}</li>)}</ul></div>
          )}

          <div className="mt-4 border-t border-line pt-4">
            <Field label="Il tuo commento (l’agente rielabora)" hint="Es. «più scura», «il titolo deve leggersi meglio», «più semplice», «mi piace il 2 ma con altri colori».">
              {(id) => <Textarea id={id} rows={2} maxLength={1500} value={feedback} onChange={(e) => setFeedback(e.target.value)} />}
            </Field>
            <Button className="mt-2" variant="outline" onClick={() => void runStrategy(true)} loading={busy === 'strategy'} disabled={busy !== null || !feedback.trim()}><Sparkles className="size-4" aria-hidden /> Rielabora con il mio commento</Button>
          </div>
        </Card>
      )}

      {crit && (
        <Card>
          <CardTitle action={cb.critiqueIsMock ? <Badge tone="demo">TESTO DEMO (mock)</Badge> : undefined}>Valutazione della tua copertina</CardTitle>
          <p className="text-sm text-ink/90"><strong>Verdetto:</strong> {crit.verdict}</p>
          <p className="mt-1 text-sm text-ink/90"><strong>Si distingue?</strong> {crit.standsOut}</p>
          <p className="mt-1 text-sm text-ink/90"><strong>Si legge in miniatura?</strong> {crit.readability}</p>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-ok/40 bg-ok/10 p-3"><p className="mb-1 font-semibold text-ok">Punti di forza</p><ul className="list-disc space-y-0.5 pl-5 text-ink/90">{crit.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div className="rounded-lg border border-warn/40 bg-warn/10 p-3"><p className="mb-1 font-semibold text-warn">Problemi</p><ul className="list-disc space-y-0.5 pl-5 text-ink/90">{crit.problems.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
          <p className="mb-2 mt-4 text-sm font-semibold text-ink">Versione migliorata</p>
          <div className="max-w-xs"><ConceptCard c={crit.improvedConcept} base={cover} index={0} recommended={false} onApply={() => apply(crit.improvedConcept)} trimW={trim.widthIn} trimH={trim.heightIn} /></div>
        </Card>
      )}

      <Card>
        <CardTitle action={<div className="flex gap-1" role="group" aria-label="Dimensione miniature">{([160, 110, 70] as const).map((s) => <button key={s} aria-pressed={thumb === s} onClick={() => setThumb(s)} className={cn('min-h-8 rounded-md px-2 text-xs font-medium', thumb === s ? 'bg-cyan text-onbrand' : 'bg-white/10 text-ink')}>{s}px</button>)}</div>}>Confronto in miniatura</CardTitle>
        <p className="mb-3 text-xs text-slate2">Come appare nei risultati di Amazon (la tua è quella evidenziata). Domande da farti: si nota? si legge il titolo? il genere è riconoscibile?</p>
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-3">
          {grid.map((g, i) =>
            g.kind === 'ours' ? (
              <div key="ours" style={{ width: thumb }} className="overflow-hidden rounded-sm shadow-md ring-2 ring-cyan"><div style={{ aspectRatio: `${trim.widthIn}/${trim.heightIn}` }} dangerouslySetInnerHTML={{ __html: oursSvg }} /></div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={g.id + i} src={g.src} alt="Copertina concorrente" style={{ width: thumb }} className="aspect-[2/3] rounded-sm object-cover shadow-sm ring-1 ring-black/10" />
            ),
          )}
        </div>
        {shots.length === 0 && <p className="mt-2 text-xs text-slate2">Carica almeno una copertina concorrente per il confronto.</p>}
      </Card>
    </div>
  );
}
