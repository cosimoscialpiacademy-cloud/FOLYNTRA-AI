'use client';

import { CheckCircle2, Eye, History, Lock, LockOpen, Pencil, Play, RotateCcw, Save, ShieldAlert, Sparkles, Square, Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, CardTitle, Empty, Notice, Progress, Textarea, useDebouncedSave, useToast } from '@/components/ui';
import type { ReviewOutput } from '@/lib/ai/schemas';
import { analyzeManuscript, containsMockText } from '@/lib/book/analysis';
import { applyReplacement, locateExcerpt } from '@/lib/book/review-apply';
import { markdownToXhtml } from '@/lib/book/markdown';
import { callAi } from '@/lib/client-api';
import { briefContext, generateChapter, logActivity, recordCost, saveRevision, spentUsd } from '@/lib/generation';
import { useApp, useLive, useStore } from '@/lib/store/context';
import type { Chapter, ChapterStatus } from '@/lib/types';
import { cn, formatDateTime, formatMoney, nowIso, wordCount } from '@/lib/utils';
import type { TabProps } from './types';

const STATUS: Record<ChapterStatus, { label: string; tone: 'neutral' | 'warn' | 'gold' | 'ok' | 'dark' }> = {
  draft: { label: 'Bozza', tone: 'neutral' },
  generating: { label: 'In scrittura…', tone: 'warn' },
  generated: { label: 'Da rivedere', tone: 'gold' },
  reviewed: { label: 'Rivisto', tone: 'ok' },
  locked: { label: 'Bloccato', tone: 'dark' },
};

function Editor({ chapter, onSaved }: { chapter: Chapter; onSaved: () => void }) {
  const store = useStore();
  const [text, setText] = useState(chapter.content);
  const [preview, setPreview] = useState(false);
  const locked = chapter.status === 'locked';
  const save = useCallback(
    async (content: string) => {
      const current = await store.get('chapters', chapter.id);
      if (!current || current.status === 'generating' || current.status === 'locked') return;
      const generatedBy = current.generatedBy === 'none' && content.trim() ? 'human' : current.generatedBy === 'mock' && content.trim() && !containsMockText(content) ? 'human' : current.generatedBy;
      // una modifica dopo la revisione riporta il capitolo a "da rivedere"
      const status: ChapterStatus = current.status === 'reviewed' && content !== current.content ? 'generated' : current.status === 'draft' && content.trim() ? 'generated' : current.status;
      await store.put('chapters', { ...current, content, generatedBy, status, updatedAt: nowIso() });
      onSaved();
    },
    [store, chapter.id, onSaved],
  );
  const { dirty } = useDebouncedSave(text, save, 900);
  const html = useMemo(() => (preview ? markdownToXhtml(text) : ''), [preview, text]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate2" aria-live="polite">{wordCount(text).toLocaleString('it-IT')} parole su {chapter.targetWords.toLocaleString('it-IT')} · {locked ? 'bloccato' : dirty ? 'salvataggio…' : 'salvato'}</p>
        <Button variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>{preview ? <><Pencil className="size-4" aria-hidden /> Modifica</> : <><Eye className="size-4" aria-hidden /> Anteprima</>}</Button>
      </div>
      {preview ? (
        <div className="prose-book min-h-80 rounded-lg border border-line bg-card p-4 sm:p-6" dangerouslySetInnerHTML={{ __html: html || '<p><em>Nessun testo.</em></p>' }} />
      ) : (
        <Textarea aria-label={`Testo del capitolo ${chapter.title}`} className="min-h-[28rem] font-mono text-sm" disabled={locked} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'Scrivi qui in Markdown oppure genera il capitolo.\n\n## Sottosezione\nTesto…\n\n> **Nota:** riquadro di approfondimento\n\n| Colonna | Colonna |\n|---|---|\n| … | … |'} />
      )}
    </div>
  );
}

export function WriterTab({ project, chapters, niche, update, goTo }: TabProps) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const jobs = useLive('jobs', project.id);
  const costs = useLive('costs', project.id);
  const revisions = useLive('revisions', project.id);
  const [activeId, setActiveId] = useState<string | null>(chapters[0]?.id ?? null);
  const [nonce, setNonce] = useState(0);
  const [running, setRunning] = useState<{ current: string; done: number; total: number } | null>(null);
  const [review, setReview] = useState<{ chapterId: string; data: ReviewOutput; provider: string } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const active = chapters.find((c) => c.id === activeId) ?? chapters[0] ?? null;
  const spent = costs.data.reduce((n, c) => n + c.costUsd, 0);
  const issues = useMemo(() => analyzeManuscript(project, chapters), [project, chapters]);
  const activeIssues = active ? issues.filter((i) => i.chapterId === active.id) : [];
  const activeJob = active ? [...jobs.data].filter((j) => j.chapterId === active.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : undefined;
  const activeRevisions = active ? revisions.data.filter((r) => r.chapterId === active.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const empty = chapters.filter((c) => c.status !== 'locked' && wordCount(c.content) === 0);
  const noop = useCallback(() => undefined, []);

  async function run(ids: string[], force = false) {
    if (running || !ids.length) return;
    const abort = new AbortController();
    abortRef.current = abort;
    const token = await getToken();
    let done = 0;
    if (project.status === 'draft' || project.status === 'research') update({ status: 'writing' });
    for (const id of ids) {
      if (abort.signal.aborted) break;
      const ch = chapters.find((c) => c.id === id);
      setRunning({ current: ch?.title ?? '', done, total: ids.length });
      setActiveId(id);
      const r = await generateChapter({ store, project, niche, chapterId: id, token, signal: abort.signal, force });
      setNonce((n) => n + 1);
      if (r.outcome === 'failed') {
        toast(`Generazione interrotta: ${r.message}`, 'bad');
        break;
      }
      if (r.outcome === 'cancelled') {
        toast('Generazione fermata: il testo parziale è stato salvato.', 'info');
        break;
      }
      if (r.outcome === 'skipped') toast(r.message, 'info');
      done += 1;
    }
    setRunning(null);
    abortRef.current = null;
  }

  async function setStatus(c: Chapter, next: ChapterStatus) {
    const current = await store.get('chapters', c.id);
    if (!current) return;
    if (next === 'reviewed' || next === 'locked') {
      if (!wordCount(current.content)) return toast('Il capitolo è vuoto.', 'bad');
      if (containsMockText(current.content) || current.generatedBy === 'mock') return toast('Contiene testo DEMO del mock: sostituiscilo prima di marcarlo come rivisto.', 'bad');
      await saveRevision(store, current, 'salvataggio');
    }
    await store.put('chapters', { ...current, status: next, updatedAt: nowIso() });
    setNonce((n) => n + 1);
    if (next === 'reviewed') await logActivity(store, project.id, `Capitolo ${c.position} «${c.title}» marcato come rivisto.`);
  }

  async function snapshot(c: Chapter) {
    const current = await store.get('chapters', c.id);
    if (!current?.content.trim()) return toast('Niente da salvare.', 'bad');
    await saveRevision(store, current, 'salvataggio');
    toast('Versione salvata nella cronologia.', 'ok');
  }

  async function restore(c: Chapter, content: string) {
    const current = await store.get('chapters', c.id);
    if (!current || current.status === 'locked') return toast('Capitolo bloccato.', 'bad');
    await saveRevision(store, current, 'salvataggio');
    const restored = { ...current, content, status: 'generated' as const, updatedAt: nowIso() };
    await store.put('chapters', restored);
    await saveRevision(store, restored, 'ripristino');
    setNonce((n) => n + 1);
    toast('Versione ripristinata.', 'ok');
  }

  async function aiReview(c: Chapter) {
    const current = await store.get('chapters', c.id);
    if (!current || current.content.trim().length < 50) return toast('Serve più testo per una revisione.', 'bad');
    setReviewing(true);
    try {
      const done = await callAi({ task: 'review', input: { brief: briefContext(project, niche), chapterTitle: c.title.slice(0, 500), content: current.content.slice(0, 60000) }, projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd }, { token: await getToken() });
      setReview({ chapterId: c.id, data: done.data as ReviewOutput, provider: done.provider });
      setApplied(new Set());
      await recordCost(store, project.id, `Revisione AI: ${c.title}`, done);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Revisione non riuscita.', 'bad');
    } finally {
      setReviewing(false);
    }
  }

  /** Applica uno o più suggerimenti: salva prima la versione attuale nella cronologia, poi sostituisce i passaggi. */
  async function applySuggestions(c: Chapter, indexes: number[]) {
    if (!review || review.chapterId !== c.id) return;
    const current = await store.get('chapters', c.id);
    if (!current) return;
    if (current.status === 'locked' || current.status === 'generating') return toast('Il capitolo è bloccato o in generazione: sbloccalo per applicare le modifiche.', 'bad');
    let content = current.content;
    const done = new Set(applied);
    const failed: number[] = [];
    for (const n of indexes) {
      const issue = review.data.issues[n];
      const next = issue ? applyReplacement(content, issue.excerpt, issue.replacement) : null;
      if (next === null) failed.push(n);
      else {
        content = next;
        done.add(n);
      }
    }
    if (content !== current.content) {
      await saveRevision(store, current, 'salvataggio');
      await store.put('chapters', { ...current, content, status: current.status === 'reviewed' ? 'generated' : current.status, updatedAt: nowIso() });
      await logActivity(store, project.id, `Revisione AI: applicati ${indexes.length - failed.length} suggerimenti al capitolo ${c.position} «${c.title}» (versione precedente in cronologia).`);
      setApplied(done);
      setNonce((x) => x + 1);
    }
    if (failed.length) toast(`${failed.length === 1 ? 'Un passaggio non è stato trovato' : `${failed.length} passaggi non sono stati trovati`} nel testo (forse l'hai già modificato): correggilo a mano.`, 'info');
    else toast(`Applicato${indexes.length > 1 ? ` (${indexes.length} modifiche)` : ''}. La versione precedente è nella cronologia: puoi ripristinarla.`, 'ok');
  }

  if (!chapters.length) return <Empty title="Nessun capitolo">Crea prima l’indice. <button className="font-medium text-cyan underline" onClick={() => goTo('indice')}>Vai all’indice</button></Empty>;

  const mock = status?.ai.mode === 'mock';
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-ink">Scrittura capitolo per capitolo</h2>
            <p className="mt-1 text-sm text-slate2">Un job separato per capitolo, con salvataggio progressivo: se chiudi la pagina riprendi da dove eri. La stessa richiesta non crea duplicati.</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-ink">{formatMoney(spent, 'USD')} <span className="font-normal text-slate2">spesi su {formatMoney(Math.min(project.budgetUsd, status?.ai.maxUsdPerBook ?? project.budgetUsd), 'USD')}</span></p>
            <p className="text-xs text-slate2">{costs.data.reduce((n, c) => n + c.inputTokens, 0).toLocaleString('it-IT')} token in · {costs.data.reduce((n, c) => n + c.outputTokens, 0).toLocaleString('it-IT')} token out</p>
          </div>
        </div>
        {mock && <Notice tone="warn" className="mt-3"><strong>Mock dichiarato attivo.</strong> {status?.ai.reason} I capitoli generati ora sono segnaposto marcati “TESTO DEMO”: servono a provare il flusso, non sono pubblicabili e non costano nulla.</Notice>}
        <div className="mt-3 flex flex-wrap gap-2">
          {running ? (
            <Button variant="danger" onClick={() => abortRef.current?.abort()}><Square className="size-4" aria-hidden /> Ferma</Button>
          ) : (
            <>
              <Button variant="gold" disabled={!empty.length} onClick={() => void run(empty.slice(0, 2).map((c) => c.id))}><Play className="size-4" aria-hidden /> Genera i prossimi 2 capitoli</Button>
              <Button variant="outline" disabled={!empty.length} onClick={() => void run(empty.map((c) => c.id))}>Genera tutti i {empty.length} vuoti</Button>
            </>
          )}
        </div>
        {running && (
          <div className="mt-3" data-testid="generation-progress">
            <p className="mb-1 text-sm text-ink">Capitolo {running.done + 1} di {running.total}: «{running.current}»</p>
            <Progress value={activeJob?.status === 'running' ? activeJob.progress : 0} label="Avanzamento del capitolo in scrittura" />
            {activeJob?.errorPublic && <p className="mt-1 text-xs text-warn">{activeJob.errorPublic}</p>}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Capitoli" className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {chapters.map((c) => (
              <li key={c.id} className="shrink-0 lg:shrink">
                <button onClick={() => setActiveId(c.id)} aria-current={active?.id === c.id ? 'true' : undefined}
                  className={cn('w-56 rounded-lg border px-3 py-2 text-left transition-colors lg:w-full', active?.id === c.id ? 'border-cyan bg-card shadow-sm' : 'border-line bg-card/60 hover:bg-card')}>
                  <p className="truncate text-sm font-medium text-ink">{c.position}. {c.title}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                    <span className="text-xs text-slate2">{wordCount(c.content).toLocaleString('it-IT')} par.</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {active && (
          <div className="min-w-0 space-y-4">
            <Card>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-bold text-ink">{active.position}. {active.title}</h3>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={STATUS[active.status].tone}>{STATUS[active.status].label}</Badge>
                    {active.generatedBy === 'mock' && <Badge tone="demo">TESTO DEMO (mock)</Badge>}
                    {active.generatedBy === 'anthropic' && <Badge tone="gold">Generato da IA: da dichiarare a KDP</Badge>}
                    {active.generatedBy === 'human' && <Badge>Scritto da te</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={Boolean(running) || active.status === 'locked'} onClick={() => { if (!wordCount(active.content) || window.confirm('Rigenerare il capitolo? La versione attuale resta nella cronologia.')) void run([active.id], true); }}>
                    <Sparkles className="size-4" aria-hidden /> {wordCount(active.content) ? 'Rigenera' : 'Genera questo capitolo'}
                  </Button>
                </div>
              </div>

              {active.status === 'generating' ? (
                <div>
                  <p className="mb-2 text-sm text-warn">Scrittura in corso: il testo si aggiorna e viene salvato man mano.</p>
                  <div className="prose-book max-h-[28rem] min-h-40 overflow-y-auto rounded-lg border border-line bg-card p-4" dangerouslySetInnerHTML={{ __html: markdownToXhtml(active.content) || '<p><em>In attesa del primo testo…</em></p>' }} />
                </div>
              ) : (
                <Editor key={`${active.id}:${nonce}:${active.status === 'locked'}`} chapter={active} onSaved={noop} />
              )}

              {activeJob?.status === 'failed' && <Notice tone="bad" className="mt-3">Ultima generazione non riuscita (tentativi: {activeJob.attempts}). {activeJob.errorPublic} <button className="font-semibold underline" onClick={() => void run([active.id], true)}>Riprendi</button></Notice>}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                <Button variant="outline" size="sm" onClick={() => void snapshot(active)}><Save className="size-4" aria-hidden /> Salva versione</Button>
                {active.status === 'reviewed' ? (
                  <Button variant="outline" size="sm" onClick={() => void setStatus(active, 'generated')}><RotateCcw className="size-4" aria-hidden /> Riporta a “da rivedere”</Button>
                ) : active.status !== 'locked' ? (
                  <Button size="sm" disabled={active.status === 'generating'} onClick={() => void setStatus(active, 'reviewed')}><CheckCircle2 className="size-4" aria-hidden /> Ho rivisto questo capitolo</Button>
                ) : null}
                {active.status === 'locked' ? (
                  <Button variant="outline" size="sm" onClick={() => void setStatus(active, 'reviewed')}><LockOpen className="size-4" aria-hidden /> Sblocca</Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={active.status === 'generating'} onClick={() => void setStatus(active, 'locked')}><Lock className="size-4" aria-hidden /> Blocca</Button>
                )}
                <Button variant="outline" size="sm" loading={reviewing} disabled={active.status === 'generating'} onClick={() => void aiReview(active)}><ShieldAlert className="size-4" aria-hidden /> Revisione AI</Button>
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardTitle>Controlli automatici</CardTitle>
                {activeIssues.length === 0 ? (
                  <p className="text-sm text-ok">Nessuna segnalazione per questo capitolo.</p>
                ) : (
                  <ul className="space-y-2">
                    {activeIssues.map((i, n) => (
                      <li key={n} className="text-sm">
                        <Badge tone={i.severity === 'critico' ? 'bad' : 'warn'}>{i.kind}</Badge> <span className="text-ink">{i.message}</span>
                        {i.excerpt && <p className="mt-0.5 text-xs italic text-slate2">«{i.excerpt}»</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-slate2">Segnaposto, fonti mancanti, duplicati, coerenza con l’indice{project.kind === 'cookbook' ? ', ingredienti delle ricette' : ''}. Sono euristiche locali: non certificano originalità né correttezza dei fatti.</p>
                {review?.chapterId === active.id && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="text-sm font-semibold text-ink">Revisione AI {review.provider === 'mock' && <Badge tone="warn">mock</Badge>}</p>
                    <p className="mt-1 text-sm text-ink">{review.data.summary}</p>
                    {review.data.issues.length === 0 ? (
                      <p className="mt-2 text-sm text-slate2">Nessun problema da segnalare.</p>
                    ) : (
                      <>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Button size="sm" disabled={active.status === 'locked' || review.data.issues.every((i, n) => applied.has(n) || !i.replacement.trim() || locateExcerpt(active.content, i.excerpt) === null)} onClick={() => void applySuggestions(active, review.data.issues.map((_, n) => n).filter((n) => !applied.has(n) && review.data.issues[n].replacement.trim()))}>
                            <Check className="size-4" aria-hidden /> Applica tutti i suggerimenti
                          </Button>
                          <span className="text-xs text-slate2">Ogni modifica salva prima la versione attuale nella cronologia.</span>
                        </div>
                        <ul className="mt-3 space-y-3">
                          {review.data.issues.map((i, n) => {
                            const found = locateExcerpt(active.content, i.excerpt) !== null;
                            const canApply = Boolean(i.replacement.trim()) && found && !applied.has(n) && active.status !== 'locked';
                            return (
                              <li key={n} className="rounded-lg border border-line bg-card2 p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Badge tone="gold">{{ stile: 'Stile', grammatica: 'Grammatica', struttura: 'Struttura', fatti: 'Fatti da verificare' }[i.type] ?? i.type}</Badge>
                                  {applied.has(n) ? <Badge tone="ok">Applicato ✓</Badge> : <Button size="sm" variant="outline" disabled={!canApply} onClick={() => void applySuggestions(active, [n])}>Applica</Button>}
                                </div>
                                <p className="mt-2 text-ink"><strong>Problema:</strong> {i.problem}</p>
                                <p className="mt-1 text-ink"><strong>Cosa fare:</strong> {i.suggestion}</p>
                                <p className="mt-2 text-xs font-semibold text-slate2">Passaggio originale</p>
                                <p className="rounded bg-white/5 p-2 text-xs italic text-ink/90">«{i.excerpt}»</p>
                                {i.replacement.trim() ? (
                                  <>
                                    <p className="mt-2 text-xs font-semibold text-ok">Versione proposta (nella lingua del libro)</p>
                                    <p className="rounded bg-ok/10 p-2 text-xs text-ink">{i.replacement}</p>
                                    {i.translationIt.trim() && <p className="mt-1 text-xs text-slate2"><strong className="text-ink">In italiano:</strong> {i.translationIt}</p>}
                                  </>
                                ) : (
                                  <p className="mt-2 text-xs text-warn">Nessuna riscrittura automatica: va verificato o corretto a mano.</p>
                                )}
                                {i.replacement.trim() && !found && !applied.has(n) && <p className="mt-1 text-xs text-warn">Non trovo questo passaggio nel testo attuale (forse l’hai già modificato).</p>}
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </Card>

              <Card>
                <CardTitle><History className="mr-1 inline size-4 align-[-2px]" aria-hidden />Cronologia versioni</CardTitle>
                {activeRevisions.length === 0 ? (
                  <p className="text-sm text-slate2">Ancora nessuna versione salvata.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {activeRevisions.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span><span className="font-medium text-ink">{formatDateTime(r.createdAt)}</span> <span className="text-slate2">· {r.reason} · {r.words.toLocaleString('it-IT')} parole</span></span>
                        <Button variant="ghost" size="sm" disabled={r.content === active.content || active.status === 'locked'} onClick={() => void restore(active, r.content)}>Ripristina</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end"><Button size="lg" onClick={() => goTo('studio')}>Avanti: cover e interni</Button></div>
    </div>
  );
}
