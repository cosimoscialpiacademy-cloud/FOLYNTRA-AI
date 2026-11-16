'use client';

import { ArrowDown, ArrowUp, Lock, LockOpen, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Badge, Button, Card, CardTitle, Empty, Field, Input, Notice, Textarea, useDebouncedSave, useToast } from '@/components/ui';
import type { OutlineOutput } from '@/lib/ai/schemas';
import { callAi } from '@/lib/client-api';
import { createChapter } from '@/lib/defaults';
import { briefContext, logActivity, recordCost, spentUsd } from '@/lib/generation';
import { useApp, useStore } from '@/lib/store/context';
import type { Chapter } from '@/lib/types';
import { nowIso, uid, wordCount } from '@/lib/utils';
import type { TabProps } from './types';

function ChapterRow({ chapter, count, onMove, onDelete }: { chapter: Chapter; count: number; onMove: (dir: -1 | 1) => void; onDelete: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState({ title: chapter.title, summary: chapter.summary, sections: chapter.sections.join('\n'), targetWords: chapter.targetWords });
  const save = useCallback(
    async (d: typeof draft) => {
      const current = await store.get('chapters', chapter.id);
      if (!current) return;
      await store.put('chapters', { ...current, title: d.title, summary: d.summary, sections: d.sections.split('\n').map((s) => s.trim()).filter(Boolean), targetWords: Math.max(200, Math.min(8000, Math.round(d.targetWords) || 200)), updatedAt: nowIso() });
    },
    [store, chapter.id],
  );
  useDebouncedSave(draft, save);
  const locked = chapter.status === 'locked';
  const words = wordCount(chapter.content);

  async function toggleLock() {
    const current = await store.get('chapters', chapter.id);
    if (!current) return;
    await store.put('chapters', { ...current, status: locked ? (words ? 'generated' : 'draft') : 'locked', updatedAt: nowIso() });
  }

  return (
    <li className="rounded-xl border border-line bg-card p-3 sm:p-4" data-testid="chapter-row">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-midnight text-sm font-bold text-ink">{chapter.position}</span>
        <Input aria-label={`Titolo capitolo ${chapter.position}`} className="min-w-0 flex-1 font-medium" disabled={locked} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Sposta su" disabled={chapter.position === 1} onClick={() => onMove(-1)}><ArrowUp className="size-4" aria-hidden /></Button>
          <Button variant="ghost" size="sm" aria-label="Sposta giù" disabled={chapter.position === count} onClick={() => onMove(1)}><ArrowDown className="size-4" aria-hidden /></Button>
          <Button variant="ghost" size="sm" aria-label={locked ? 'Sblocca capitolo' : 'Blocca capitolo'} onClick={() => void toggleLock()}>{locked ? <Lock className="size-4 text-cyan" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}</Button>
          <Button variant="ghost" size="sm" aria-label="Elimina capitolo" disabled={locked} onClick={onDelete}><Trash2 className="size-4" aria-hidden /></Button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_7rem]">
        <Field label="Cosa impara il lettore">{(id) => <Textarea id={id} rows={3} disabled={locked} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />}</Field>
        <Field label="Sottosezioni (una per riga)">{(id) => <Textarea id={id} rows={3} disabled={locked} value={draft.sections} onChange={(e) => setDraft({ ...draft, sections: e.target.value })} />}</Field>
        <Field label="Parole">{(id) => <Input id={id} type="number" min={200} max={8000} step={100} disabled={locked} value={draft.targetWords} onChange={(e) => setDraft({ ...draft, targetWords: Number(e.target.value) })} />}</Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {locked && <Badge tone="gold">Bloccato: non viene modificato né rigenerato</Badge>}
        <Badge>{words ? `${words.toLocaleString('it-IT')} parole scritte` : 'non ancora scritto'}</Badge>
      </div>
    </li>
  );
}

export function OutlineTab({ project, chapters, niche, goTo }: TabProps) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const [count, setCount] = useState(Math.max(5, chapters.length || 8));
  const [busy, setBusy] = useState(false);

  async function renumber(list: Chapter[]) {
    for (const [i, c] of list.entries()) if (c.position !== i + 1) await store.put('chapters', { ...c, position: i + 1, updatedAt: nowIso() });
  }

  async function generate() {
    const keep = chapters.filter((c) => c.status === 'locked' || wordCount(c.content) > 0);
    const drop = chapters.filter((c) => !keep.includes(c));
    if (chapters.length && !window.confirm(`Generare un nuovo indice? ${keep.length} capitoli bloccati o già scritti vengono conservati; ${drop.length} capitoli vuoti vengono sostituiti.`)) return;
    setBusy(true);
    try {
      const done = await callAi(
        { task: 'outline', input: { brief: briefContext(project, niche), chapterCount: Math.max(3, Math.min(30, count)), targetWords: Math.max(3000, Math.min(120000, project.targetWords)) }, projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd },
        { token: await getToken() },
      );
      const out = done.data as OutlineOutput;
      for (const c of drop) await store.remove('chapters', c.id);
      await renumber(keep);
      const now = nowIso();
      for (const [i, c] of out.chapters.entries()) {
        await store.put('chapters', createChapter({ id: uid(), projectId: project.id, position: keep.length + i + 1, title: c.title, summary: c.summary, sections: c.sections, targetWords: Math.max(200, Math.min(8000, Math.round(c.targetWords) || 2000)), now }));
      }
      await recordCost(store, project.id, 'Indice del libro', done);
      await logActivity(store, project.id, `Indice di ${out.chapters.length} capitoli generato (${done.provider === 'mock' ? 'mock dichiarato' : done.model}).`);
      toast(`Indice di ${out.chapters.length} capitoli creato. Modificalo liberamente.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Generazione non riuscita.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    await store.put('chapters', createChapter({ id: uid(), projectId: project.id, position: chapters.length + 1, title: `Capitolo ${chapters.length + 1}`, now: nowIso() }));
  }

  async function move(c: Chapter, dir: -1 | 1) {
    const other = chapters.find((x) => x.position === c.position + dir);
    if (!other) return;
    await store.put('chapters', { ...c, position: other.position, updatedAt: nowIso() });
    await store.put('chapters', { ...other, position: c.position, updatedAt: nowIso() });
  }

  async function remove(c: Chapter) {
    if (wordCount(c.content) > 0 && !window.confirm(`«${c.title}» contiene testo. Eliminarlo comunque?`)) return;
    await store.remove('chapters', c.id);
    await renumber(chapters.filter((x) => x.id !== c.id));
  }

  const totalTarget = chapters.reduce((n, c) => n + c.targetWords, 0);
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Indice del libro</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Numero di capitoli" className="w-40">{(id) => <Input id={id} type="number" min={3} max={30} value={count} onChange={(e) => setCount(Number(e.target.value) || 5)} />}</Field>
          <Button variant="gold" onClick={() => void generate()} loading={busy}><Sparkles className="size-4" aria-hidden /> Genera indice</Button>
          <Button variant="outline" onClick={() => void add()}><Plus className="size-4" aria-hidden /> Aggiungi capitolo</Button>
        </div>
        {status?.ai.mode === 'mock' && <p className="mt-2 text-xs text-warn">AI non collegata: l’indice arriva dal mock dichiarato (struttura generica da riscrivere).</p>}
        <p className="mt-2 text-sm text-slate2">{chapters.length} capitoli · {totalTarget.toLocaleString('it-IT')} parole previste su {project.targetWords.toLocaleString('it-IT')} obiettivo. Le sottosezioni formano l’indice gerarchico e guidano la scrittura.</p>
        {chapters.length > 0 && chapters.length < 5 && <Notice tone="warn" className="mt-3">Servono almeno 5 capitoli perché il pacchetto possa risultare pronto.</Notice>}
      </Card>

      {chapters.length === 0 ? (
        <Empty title="Indice vuoto">Genera una proposta oppure aggiungi i capitoli a mano.</Empty>
      ) : (
        <ol className="space-y-3">
          {chapters.map((c) => <ChapterRow key={c.id} chapter={c} count={chapters.length} onMove={(d) => void move(c, d)} onDelete={() => void remove(c)} />)}
        </ol>
      )}

      <div className="flex justify-end"><Button size="lg" disabled={!chapters.length} onClick={() => goTo('scrittura')}>Avanti: scrittura</Button></div>
    </div>
  );
}
