'use client';

import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardTitle, Field, Input, Notice, Select, Textarea, useToast } from '@/components/ui';
import type { ConceptOutput } from '@/lib/ai/schemas';
import { callAi } from '@/lib/client-api';
import { briefContext, logActivity, recordCost, spentUsd } from '@/lib/generation';
import { MARKETPLACES } from '@/lib/kdp/specs';
import { useApp, useStore } from '@/lib/store/context';
import type { BookKind, Brief } from '@/lib/types';
import { coloringLayout, defaultColoring } from '@/lib/defaults';
import { uid } from '@/lib/utils';
import type { TabProps } from './types';

const KINDS: { value: BookKind; label: string }[] = [
  { value: 'nonfiction', label: 'Manuale pratico / saggistica' },
  { value: 'workbook', label: 'Workbook con esercizi' },
  { value: 'cookbook', label: 'Ricettario' },
  { value: 'coloring', label: 'Libro da colorare (disegni a tutta pagina)' },
];

export function BriefTab({ project, niche, update, goTo }: TabProps) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const setBrief = (patch: Partial<Brief>) => update({ brief: { ...project.brief, ...patch } });
  /** Passando a «da colorare» si impostano subito formato 8,5×11, carta bianca e dichiarazione IA; il resto resta com'è. */
  function changeKind(kind: BookKind) {
    if (kind === 'coloring' && project.kind !== 'coloring') update({ kind, layout: coloringLayout(), coloring: project.coloring ?? defaultColoring(), pageCount: null });
    else update({ kind, ...(kind !== 'coloring' && project.kind === 'coloring' ? { pageCount: null } : {}) });
  }
  const m = MARKETPLACES[project.marketplace];

  async function generateConcept() {
    setBusy(true);
    try {
      const done = await callAi({ task: 'concept', input: { brief: briefContext(project, niche) }, projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd }, { token: await getToken() });
      const c = done.data as ConceptOutput;
      const fill = (cur: string, next: string) => (cur.trim() ? cur : next);
      update({
        altTitles: [...new Set([c.title, ...c.altTitles].filter((t) => t && t !== project.title))].slice(0, 6),
        subtitle: fill(project.subtitle, c.subtitle),
        brief: { ...project.brief, audience: fill(project.brief.audience, c.audience), problem: fill(project.brief.problem, c.problem), goal: fill(project.brief.goal, c.goal), uniqueValue: fill(project.brief.uniqueValue, c.uniqueValue), synopsis: fill(project.brief.synopsis, c.synopsis) },
        kdp: { ...project.kdp, keywords: project.kdp.keywords.filter((k) => k.trim()).length >= 7 ? project.kdp.keywords : [...new Set([...project.kdp.keywords.filter((k) => k.trim()), ...c.keywords])].slice(0, 7), description: fill(project.kdp.description, c.description) },
      });
      await recordCost(store, project.id, 'Proposta editoriale (titoli, sinossi, keyword)', done);
      await logActivity(store, project.id, `Proposta editoriale generata (${done.provider === 'mock' ? 'mock dichiarato' : done.model}).`);
      toast('Proposta pronta: ho riempito solo i campi vuoti. Scegli il titolo tra le alternative.', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Generazione non riuscita.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {niche && (
        <Notice tone={niche.demoOnly ? 'demo' : 'info'}>
          Brief precompilato dalla nicchia <strong>«{niche.keyword}»</strong>{niche.demoOnly ? ' (dati DEMO: nessun valore di mercato)' : ''}: pubblico, differenziazione, categoria e parole chiave arrivano da lì.
        </Notice>
      )}

      <Card>
        <CardTitle action={<Button variant="gold" onClick={() => void generateConcept()} loading={busy}><Sparkles className="size-4" aria-hidden /> Proponi titoli e concept</Button>}>Identità del libro</CardTitle>
        {status?.ai.mode === 'mock' && <p className="mb-3 text-xs text-warn">AI non collegata: la proposta arriva dal mock dichiarato (testi generici, costo zero). {status.ai.reason}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Titolo" className="sm:col-span-2">{(id) => <Input id={id} value={project.title} onChange={(e) => update({ title: e.target.value })} />}</Field>
          {project.altTitles.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-ink">Titoli alternativi <span className="font-normal text-slate2">(tocca per usarne uno)</span></p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {project.altTitles.map((t) => (
                  <button key={t} className="rounded-full border border-line bg-card px-3 py-1.5 text-left text-sm hover:border-cyan hover:bg-cyan/10" onClick={() => update({ title: t, altTitles: [project.title, ...project.altTitles.filter((x) => x !== t)].filter(Boolean).slice(0, 6) })}>{t}</button>
                ))}
              </div>
            </div>
          )}
          <Field label="Sottotitolo" className="sm:col-span-2">{(id) => <Input id={id} value={project.subtitle} onChange={(e) => update({ subtitle: e.target.value })} />}</Field>
          <Field label="Autore (nome in copertina)">{(id) => <Input id={id} value={project.author} onChange={(e) => update({ author: e.target.value })} />}</Field>
          <Field label="Tipo di libro">{(id) => <Select id={id} value={project.kind} onChange={(e) => changeKind(e.target.value as BookKind)}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select>}</Field>
          <Field label="Mercato e lingua" hint="Ereditati dalla nicchia.">{(id) => <Input id={id} disabled value={`${m.label} · ${m.language}`} />}</Field>
          <Field label="Parole obiettivo totali" hint="Scegli in base al valore per il lettore, non a un numero di pagine.">{(id) => <Input id={id} type="number" min={3000} max={120000} step={1000} value={project.targetWords} onChange={(e) => update({ targetWords: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
          <Field label="Tetto di spesa AI per questo libro (USD)" hint={`Il server applica comunque il limite massimo di ${status?.ai.maxUsdPerBook ?? 20} $.`}>{(id) => <Input id={id} type="number" min={0} step={1} value={project.budgetUsd} onChange={(e) => update({ budgetUsd: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
        </div>
        <p className="mt-3 text-xs text-slate2">Fiction e libri illustrati non sono ancora disponibili: nessuna immagine viene promessa senza un provider autorizzato.</p>
      </Card>

      <Card>
        <CardTitle>Brief editoriale</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pubblico">{(id) => <Textarea id={id} rows={3} value={project.brief.audience} onChange={(e) => setBrief({ audience: e.target.value })} />}</Field>
          <Field label="Problema del lettore">{(id) => <Textarea id={id} rows={3} value={project.brief.problem} onChange={(e) => setBrief({ problem: e.target.value })} />}</Field>
          <Field label="Obiettivo concreto">{(id) => <Textarea id={id} rows={3} value={project.brief.goal} onChange={(e) => setBrief({ goal: e.target.value })} />}</Field>
          <Field label="Proposta unica / differenziatore">{(id) => <Textarea id={id} rows={3} value={project.brief.uniqueValue} onChange={(e) => setBrief({ uniqueValue: e.target.value })} />}</Field>
          <Field label="Argomenti da escludere">{(id) => <Textarea id={id} rows={2} value={project.brief.exclusions} onChange={(e) => setBrief({ exclusions: e.target.value })} />}</Field>
          <Field label="Stile">{(id) => <Textarea id={id} rows={2} value={project.brief.style} onChange={(e) => setBrief({ style: e.target.value })} />}</Field>
          <Field label="Sinossi" className="sm:col-span-2">{(id) => <Textarea id={id} rows={5} value={project.brief.synopsis} onChange={(e) => setBrief({ synopsis: e.target.value })} />}</Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Pagine iniziali e finali</CardTitle>
        <p className="mb-3 text-sm text-slate2">Frontespizio, copyright e indice paginato sono creati automaticamente. Le sezioni lasciate vuote non vengono stampate. Puoi usare Markdown.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Dedica">{(id) => <Textarea id={id} rows={2} value={project.matter.dedication} onChange={(e) => update({ matter: { ...project.matter, dedication: e.target.value } })} />}</Field>
          <Field label="Biografia autore">{(id) => <Textarea id={id} rows={2} value={project.matter.authorBio} onChange={(e) => update({ matter: { ...project.matter, authorBio: e.target.value } })} />}</Field>
          <Field label="Prefazione / introduzione" className="sm:col-span-2">{(id) => <Textarea id={id} rows={4} value={project.matter.preface} onChange={(e) => update({ matter: { ...project.matter, preface: e.target.value } })} />}</Field>
          <Field label="Conclusione" className="sm:col-span-2">{(id) => <Textarea id={id} rows={4} value={project.matter.conclusion} onChange={(e) => update({ matter: { ...project.matter, conclusion: e.target.value } })} />}</Field>
          <Field label="Ringraziamenti" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={project.matter.acknowledgments} onChange={(e) => update({ matter: { ...project.matter, acknowledgments: e.target.value } })} />}</Field>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle action={<Button variant="outline" size="sm" onClick={() => update({ sources: [...project.sources, { id: uid(), citation: '', url: '', verified: false }] })}><Plus className="size-4" aria-hidden /> Fonte</Button>}>Fonti e bibliografia</CardTitle>
          <p className="mb-3 text-sm text-slate2">Solo le fonti che <strong>tu</strong> marchi come verificate vengono passate all’AI e stampate in bibliografia. L’AI non può aggiungerne.</p>
          {project.sources.length === 0 && <p className="text-sm text-slate2">Nessuna fonte: l’AI non ne citerà e segnalerà con [FONTE MANCANTE] le affermazioni da verificare.</p>}
          <ul className="space-y-3">
            {project.sources.map((s, i) => {
              const set = (patch: Partial<typeof s>) => update({ sources: project.sources.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <li key={s.id} className="rounded-lg border border-line p-3">
                  <Input aria-label={`Citazione fonte ${i + 1}`} placeholder="Autore, Titolo, editore, anno" value={s.citation} onChange={(e) => set({ citation: e.target.value })} />
                  <Input aria-label={`URL fonte ${i + 1}`} className="mt-2" placeholder="URL (facoltativo)" value={s.url} onChange={(e) => set({ url: e.target.value })} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-cyan" checked={s.verified} onChange={(e) => set({ verified: e.target.checked })} /> L’ho consultata e verificata</label>
                    <div className="flex items-center gap-2">
                      {s.verified ? <Badge tone="ok">verificata</Badge> : <Badge tone="warn">non verificata</Badge>}
                      <button aria-label={`Rimuovi fonte ${i + 1}`} className="p-1 text-slate2 hover:text-bad" onClick={() => update({ sources: project.sources.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden /></button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardTitle action={<Button variant="outline" size="sm" onClick={() => update({ glossary: [...project.glossary, { term: '', definition: '' }] })}><Plus className="size-4" aria-hidden /> Voce</Button>}>Glossario</CardTitle>
          {project.glossary.length === 0 && <p className="text-sm text-slate2">Facoltativo: le voci compaiono in ordine alfabetico a fine libro.</p>}
          <ul className="space-y-3">
            {project.glossary.map((g, i) => {
              const set = (patch: Partial<typeof g>) => update({ glossary: project.glossary.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <li key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[10rem_1fr_auto]">
                  <Input aria-label={`Termine ${i + 1}`} placeholder="Termine" value={g.term} onChange={(e) => set({ term: e.target.value })} />
                  <Input aria-label={`Definizione ${i + 1}`} placeholder="Definizione" value={g.definition} onChange={(e) => set({ definition: e.target.value })} />
                  <button aria-label={`Rimuovi voce ${i + 1}`} className="justify-self-end p-2 text-slate2 hover:text-bad" onClick={() => update({ glossary: project.glossary.filter((_, j) => j !== i) })}><Trash2 className="size-4" aria-hidden /></button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="flex justify-end"><Button size="lg" onClick={() => goTo(project.kind === 'coloring' ? 'disegni' : 'indice')}>{project.kind === 'coloring' ? 'Avanti: disegni' : 'Avanti: indice'}</Button></div>
    </div>
  );
}
