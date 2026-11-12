/**
 * Archivio Supabase: mappa le entità dell'app sulle tabelle di
 * supabase-schema.sql (RLS per proprietario). Usa SOLO la chiave pubblica
 * anon + la sessione dell'utente: nessuna service-role key nel browser.
 *
 * STATO: non ancora verificato contro un progetto Supabase reale (vedi REPORT-STATO.md).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateNiche } from '../niche/engine';
import type { Activity, Chapter, ChapterRevision, CollectionMap, CollectionName, CostEvent, ExportRecord, Job, Niche, Project } from '../types';
import { wordCount } from '../utils';
import { Emitter, type DataStore, type ListFilter } from './types';

type Row = Record<string, unknown>;

interface Mapping<T> {
  table: string;
  /** Colonna che collega al progetto/libro (book.id === project.id). */
  projectColumn: string | null;
  toRow(doc: T, userId: string): Row;
  fromRow(row: Row): T;
}

const MAP: { [K in CollectionName]: Mapping<CollectionMap[K]> } = {
  niches: {
    table: 'niches', projectColumn: null,
    toRow: (n: Niche, user_id) => {
      const ev = evaluateNiche(n);
      return { id: n.id, user_id, keyword: n.keyword, buyer_persona: n.buyerPersona, marketplace: n.marketplace, status: n.status, scores: { score: ev.score, coverage: ev.coverage, breakdown: ev.breakdown }, confidence: ev.confidence, commentary: n.commentary, data: n };
    },
    fromRow: (r) => r.data as Niche,
  },
  projects: {
    table: 'books', projectColumn: null,
    toRow: (p: Project, user_id) => ({
      id: p.id, user_id, project_id: p.id, title: p.title || 'Senza titolo', subtitle: p.subtitle, author_name: p.author, format_kind: p.kind, metadata: p,
      ai_generated_text: p.kdp.aiText === 'generated', ai_generated_images: p.kdp.aiImages === 'generated', ai_generated_translations: p.kdp.aiTranslation === 'generated',
      human_reviewed: p.kdp.humanReviewConfirmed, updated_at: p.updatedAt,
    }),
    fromRow: (r) => r.metadata as Project,
  },
  chapters: {
    table: 'chapters', projectColumn: 'book_id',
    toRow: (c: Chapter, user_id) => ({
      id: c.id, user_id, book_id: c.projectId, position: c.position, title: c.title, content_md: c.content, word_count: wordCount(c.content), status: c.status, ai_generated: c.aiGenerated,
      meta: { summary: c.summary, sections: c.sections, targetWords: c.targetWords, generatedBy: c.generatedBy }, updated_at: c.updatedAt,
    }),
    fromRow: (r) => {
      const m = (r.meta ?? {}) as Partial<Chapter>;
      return {
        id: r.id as string, projectId: r.book_id as string, position: r.position as number, title: r.title as string, content: r.content_md as string, status: r.status as Chapter['status'],
        aiGenerated: r.ai_generated as boolean, summary: m.summary ?? '', sections: m.sections ?? [], targetWords: m.targetWords ?? 2500, generatedBy: m.generatedBy ?? 'none', updatedAt: r.updated_at as string,
      };
    },
  },
  revisions: {
    table: 'chapter_revisions', projectColumn: 'book_id',
    toRow: (v: ChapterRevision, user_id) => ({ id: v.id, user_id, book_id: v.projectId, chapter_id: v.chapterId, content_md: v.content, word_count: v.words, reason: v.reason, created_at: v.createdAt }),
    fromRow: (r) => ({ id: r.id as string, projectId: r.book_id as string, chapterId: r.chapter_id as string, content: r.content_md as string, words: r.word_count as number, reason: r.reason as ChapterRevision['reason'], createdAt: r.created_at as string }),
  },
  jobs: {
    table: 'generation_jobs', projectColumn: 'book_id',
    toRow: (j: Job, user_id) => ({ id: j.id, user_id, book_id: j.projectId, job_type: j.jobType, status: j.status, progress: j.progress, idempotency_key: j.idempotencyKey, error_public: j.errorPublic, result: { chapterId: j.chapterId, attempts: j.attempts }, created_at: j.createdAt, updated_at: j.updatedAt }),
    fromRow: (r) => {
      const res = (r.result ?? {}) as { chapterId?: string | null; attempts?: number };
      return { id: r.id as string, projectId: r.book_id as string, chapterId: res.chapterId ?? null, jobType: r.job_type as Job['jobType'], status: r.status as Job['status'], progress: r.progress as number, idempotencyKey: r.idempotency_key as string, attempts: res.attempts ?? 0, errorPublic: (r.error_public as string) ?? null, createdAt: r.created_at as string, updatedAt: r.updated_at as string };
    },
  },
  costs: {
    table: 'cost_events', projectColumn: 'book_id',
    toRow: (c: CostEvent, user_id) => ({ id: c.id, user_id, book_id: c.projectId, provider: c.provider, activity: c.activity, input_tokens: c.inputTokens, output_tokens: c.outputTokens, cost_minor: Math.round(c.costUsd * 100), currency: 'USD', cost_usd: c.costUsd, model: c.model, recorded_at: c.recordedAt }),
    fromRow: (r) => ({ id: r.id as string, projectId: (r.book_id as string) ?? null, provider: r.provider as CostEvent['provider'], model: (r.model as string) ?? '', activity: r.activity as string, inputTokens: (r.input_tokens as number) ?? 0, outputTokens: (r.output_tokens as number) ?? 0, costUsd: Number(r.cost_usd ?? 0), recordedAt: r.recorded_at as string }),
  },
  exports: {
    table: 'export_artifacts', projectColumn: 'book_id',
    // I file restano sul dispositivo dell'utente (download): storage_path dichiara che non sono su Storage.
    toRow: (x: ExportRecord, user_id) => ({ id: x.id, user_id, book_id: x.projectId, artifact_type: 'kdp_kit', storage_path: 'download-locale', sha256: null, qa: x, created_at: x.createdAt }),
    fromRow: (r) => r.qa as ExportRecord,
  },
  activity: {
    table: 'activity_log', projectColumn: 'book_id',
    toRow: (a: Activity, user_id) => ({ id: a.id, user_id, book_id: a.projectId, message: a.message, created_at: a.createdAt }),
    fromRow: (r) => ({ id: r.id as string, projectId: (r.book_id as string) ?? null, message: r.message as string, createdAt: r.created_at as string }),
  },
};

export class SupabaseStore implements DataStore {
  readonly mode = 'supabase' as const;
  private emitter = new Emitter();
  constructor(private client: SupabaseClient, private userId: string) {}

  async list<K extends CollectionName>(collection: K, filter?: ListFilter): Promise<CollectionMap[K][]> {
    const m = MAP[collection];
    let q = this.client.from(m.table).select('*').limit(2000);
    if (filter?.projectId) q = q.eq(m.projectColumn ?? 'id', filter.projectId);
    const { data, error } = await q;
    if (error) throw new Error(`Lettura ${collection} non riuscita: ${error.message}`);
    return (data as Row[]).map((r) => m.fromRow(r));
  }

  async get<K extends CollectionName>(collection: K, id: string): Promise<CollectionMap[K] | null> {
    const m = MAP[collection];
    const { data, error } = await this.client.from(m.table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Lettura ${collection} non riuscita: ${error.message}`);
    return data ? m.fromRow(data as Row) : null;
  }

  async put<K extends CollectionName>(collection: K, doc: CollectionMap[K]): Promise<void> {
    const m = MAP[collection];
    if (collection === 'projects') {
      // books richiede la riga projects proprietaria (stesso id).
      const p = doc as Project;
      const { error } = await this.client.from('projects').upsert({ id: p.id, user_id: this.userId, name: p.name, marketplace: p.marketplace, locale: p.locale, status: p.status, niche_id: p.nicheId, updated_at: p.updatedAt });
      if (error) throw new Error(`Salvataggio progetto non riuscito: ${error.message}`);
    }
    const { error } = await this.client.from(m.table).upsert(m.toRow(doc, this.userId));
    if (error) throw new Error(`Salvataggio ${collection} non riuscito: ${error.message}`);
    this.emitter.emit(collection);
  }

  async remove<K extends CollectionName>(collection: K, id: string): Promise<void> {
    // Eliminare la riga projects elimina a cascata libro, capitoli, job ed export.
    const table = collection === 'projects' ? 'projects' : MAP[collection].table;
    const { error } = await this.client.from(table).delete().eq('id', id);
    if (error) throw new Error(`Eliminazione ${collection} non riuscita: ${error.message}`);
    this.emitter.emit(collection);
  }

  subscribe(listener: (c: CollectionName) => void): () => void {
    return this.emitter.subscribe(listener);
  }
}
