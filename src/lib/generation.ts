/**
 * Orchestrazione della scrittura: un job per capitolo, persistente e
 * riprendibile. Stessa chiave di idempotenza → nessun capitolo duplicato.
 */
import type { BriefCtx, ChapterInput } from './ai/schemas';
import { AiError, callAi, type DoneEvent } from './client-api';
import { MARKETPLACES } from './kdp/specs';
import type { DataStore } from './store/types';
import type { Chapter, CostEvent, Job, Niche, Project } from './types';
import { nowIso, uid, wordCount } from './utils';

export const MAX_ATTEMPTS = 3;
export const MAX_REVISIONS_PER_CHAPTER = 20;

export function briefContext(project: Project, niche: Niche | null): BriefCtx {
  const cut = (s: string, n = 5500) => s.slice(0, n);
  return {
    title: project.title.slice(0, 500), subtitle: project.subtitle.slice(0, 500), kind: project.kind,
    language: MARKETPLACES[project.marketplace].language, marketplace: project.marketplace,
    keyword: (niche?.keyword ?? project.kdp.keywords[0] ?? '').slice(0, 500),
    audience: cut(project.brief.audience), problem: cut(project.brief.problem), goal: cut(project.brief.goal),
    uniqueValue: cut(project.brief.uniqueValue), exclusions: cut(project.brief.exclusions), style: cut(project.brief.style), synopsis: cut(project.brief.synopsis),
  };
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** La chiave cambia solo se cambia ciò che il capitolo deve contenere. */
export function chapterIdempotencyKey(c: Chapter): string {
  return `chapter:${c.id}:${hash(JSON.stringify([c.title, c.summary, c.sections, c.targetWords]))}`;
}

export async function spentUsd(store: DataStore, projectId: string): Promise<number> {
  return (await store.list('costs', { projectId })).reduce((n, c) => n + c.costUsd, 0);
}

export async function recordCost(store: DataStore, projectId: string | null, activity: string, done: DoneEvent): Promise<void> {
  const cost: CostEvent = { id: uid(), projectId, provider: done.provider, model: done.model, activity, inputTokens: done.usage.inputTokens, outputTokens: done.usage.outputTokens, costUsd: done.usage.costUsd, recordedAt: nowIso() };
  await store.put('costs', cost);
}

export async function logActivity(store: DataStore, projectId: string | null, message: string): Promise<void> {
  await store.put('activity', { id: uid(), projectId, message, createdAt: nowIso() });
}

export async function saveRevision(store: DataStore, chapter: Chapter, reason: 'generazione' | 'salvataggio' | 'ripristino'): Promise<void> {
  if (!chapter.content.trim()) return;
  const existing = (await store.list('revisions', { projectId: chapter.projectId })).filter((r) => r.chapterId === chapter.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (existing.at(-1)?.content === chapter.content) return;
  await store.put('revisions', { id: uid(), projectId: chapter.projectId, chapterId: chapter.id, content: chapter.content, words: wordCount(chapter.content), reason, createdAt: nowIso() });
  for (const old of existing.slice(0, Math.max(0, existing.length + 1 - MAX_REVISIONS_PER_CHAPTER))) await store.remove('revisions', old.id);
}

/** All'avvio: i job rimasti "in corso" dopo una chiusura sono segnati come interrotti e riprendibili. */
export async function recoverInterruptedJobs(store: DataStore, projectId: string): Promise<number> {
  const jobs = (await store.list('jobs', { projectId })).filter((j) => j.status === 'running' || j.status === 'queued');
  for (const j of jobs) {
    await store.put('jobs', { ...j, status: 'failed', errorPublic: 'Interrotto (pagina chiusa o connessione persa). Puoi riprendere: il testo parziale è stato salvato.', updatedAt: nowIso() });
    if (j.chapterId) {
      const c = await store.get('chapters', j.chapterId);
      if (c && c.status === 'generating') await store.put('chapters', { ...c, status: 'draft', updatedAt: nowIso() });
    }
  }
  return jobs.length;
}

export interface GenerateResult {
  outcome: 'generated' | 'skipped' | 'failed' | 'cancelled';
  message: string;
}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

export async function generateChapter(opts: {
  store: DataStore; project: Project; niche: Niche | null; chapterId: string; token: string | null; signal: AbortSignal;
  /** Rigenera anche se esiste già un job riuscito con la stessa chiave. */
  force?: boolean;
  onProgress?: (chars: number) => void;
}): Promise<GenerateResult> {
  const { store, project, signal } = opts;
  const all = (await store.list('chapters', { projectId: project.id })).sort((a, b) => a.position - b.position);
  const chapter = all.find((c) => c.id === opts.chapterId);
  if (!chapter) return { outcome: 'failed', message: 'Capitolo non trovato.' };
  if (chapter.status === 'locked') return { outcome: 'skipped', message: `«${chapter.title}» è bloccato: non viene rigenerato.` };

  const key = chapterIdempotencyKey(chapter);
  const jobs = await store.list('jobs', { projectId: project.id });
  const previous = jobs.find((j) => j.idempotencyKey === key);
  if (previous?.status === 'succeeded' && chapter.content.trim() && !opts.force) {
    return { outcome: 'skipped', message: `«${chapter.title}» già generato con questa stessa richiesta: nessun duplicato.` };
  }

  const input: ChapterInput = {
    brief: briefContext(project, opts.niche),
    outline: all.map((c) => ({ position: c.position, title: c.title.slice(0, 500), summary: c.summary.slice(0, 1400) })),
    chapter: { position: chapter.position, title: chapter.title.slice(0, 500), summary: chapter.summary.slice(0, 1400), sections: chapter.sections.slice(0, 20).map((s) => s.slice(0, 500)), targetWords: Math.max(200, Math.min(8000, Math.round(chapter.targetWords))) },
    previousSummaries: all.filter((c) => c.position < chapter.position).map((c) => `${c.title}: ${c.summary}`.slice(0, 1400)),
    verifiedSources: project.sources.filter((s) => s.verified && s.citation.trim()).map((s) => s.citation.slice(0, 480)).slice(0, 40),
  };

  let job: Job = previous
    ? { ...previous, status: 'running', progress: 0, errorPublic: null, attempts: 0, updatedAt: nowIso() }
    : { id: uid(), projectId: project.id, chapterId: chapter.id, jobType: 'chapter', status: 'running', progress: 0, idempotencyKey: key, attempts: 0, errorPublic: null, createdAt: nowIso(), updatedAt: nowIso() };
  const before = chapter.content;
  if (before.trim()) await saveRevision(store, chapter, 'salvataggio');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    job = { ...job, status: 'running', attempts: attempt, progress: 0, updatedAt: nowIso() };
    await store.put('jobs', job);
    let text = '';
    let lastSave = Date.now();
    await store.put('chapters', { ...chapter, status: 'generating', updatedAt: nowIso() });
    try {
      const done = await callAi(
        { task: 'chapter', input, projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd },
        {
          token: opts.token, signal,
          onDelta: (t) => {
            text += t;
            opts.onProgress?.(text.length);
            if (Date.now() - lastSave > 1500) {
              // salvataggio progressivo: se la pagina si chiude resta il testo parziale
              lastSave = Date.now();
              const progress = Math.min(99, Math.round((wordCount(text) / Math.max(1, chapter.targetWords)) * 100));
              void store.put('chapters', { ...chapter, content: text, status: 'generating', updatedAt: nowIso() });
              void store.put('jobs', { ...job, progress, updatedAt: nowIso() });
            }
          },
        },
      );
      const content = (done.text ?? text).trim();
      const saved: Chapter = { ...chapter, content, status: 'generated', generatedBy: done.provider, aiGenerated: done.provider === 'anthropic', updatedAt: nowIso() };
      await store.put('chapters', saved);
      await saveRevision(store, saved, 'generazione');
      await recordCost(store, project.id, `Capitolo ${chapter.position}: ${chapter.title}`, done);
      await store.put('jobs', { ...job, status: 'succeeded', progress: 100, updatedAt: nowIso() });
      await logActivity(store, project.id, `Capitolo ${chapter.position} «${chapter.title}» generato (${done.provider === 'mock' ? 'mock dichiarato, costo 0' : `${done.model}, ${done.usage.costUsd.toFixed(4)} $`}).`);
      return { outcome: 'generated', message: `«${chapter.title}» generato.` };
    } catch (err) {
      if (signal.aborted) {
        await store.put('chapters', { ...chapter, content: text || before, status: 'draft', updatedAt: nowIso() });
        await store.put('jobs', { ...job, status: 'cancelled', errorPublic: 'Annullato dall’utente.', updatedAt: nowIso() });
        return { outcome: 'cancelled', message: 'Generazione annullata.' };
      }
      const retryable = err instanceof AiError && err.retryable;
      const message = err instanceof Error ? err.message : 'Errore sconosciuto';
      if (retryable && attempt < MAX_ATTEMPTS) {
        await store.put('jobs', { ...job, errorPublic: `Tentativo ${attempt} fallito: ${message} Nuovo tentativo…`, updatedAt: nowIso() });
        await wait(1500 * attempt * attempt, signal);
        continue;
      }
      await store.put('chapters', { ...chapter, content: text || before, status: 'draft', updatedAt: nowIso() });
      await store.put('jobs', { ...job, status: 'failed', errorPublic: message, updatedAt: nowIso() });
      return { outcome: 'failed', message };
    }
  }
  return { outcome: 'failed', message: 'Tentativi esauriti.' };
}
