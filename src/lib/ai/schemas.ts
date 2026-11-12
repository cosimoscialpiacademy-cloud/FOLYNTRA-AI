/** Contratti (Zod) delle richieste/risposte AI: validati sia in ingresso sia in uscita. */
import { z } from 'zod';

const short = z.string().max(600);
const long = z.string().max(6000);

export const BriefCtx = z.object({
  title: short, subtitle: short, kind: z.enum(['nonfiction', 'workbook', 'cookbook']), language: short, marketplace: short,
  keyword: short, audience: long, problem: long, goal: long, uniqueValue: long, exclusions: long, style: long, synopsis: long,
});
export type BriefCtx = z.infer<typeof BriefCtx>;

export const BrainstormInput = z.object({ theme: z.string().min(2).max(300), audience: short, marketplace: short, language: short, category: short });
export const BrainstormOutput = z.object({
  ideas: z.array(z.object({
    keyword: z.string(), buyerPersona: z.string(), secondaryKeywords: z.array(z.string()),
    unmetNeed: z.string(), differentiators: z.array(z.string()), risks: z.array(z.string()),
  })),
});
export type BrainstormOutput = z.infer<typeof BrainstormOutput>;

export const ConceptInput = z.object({ brief: BriefCtx });
export const ConceptOutput = z.object({
  title: z.string(), altTitles: z.array(z.string()), subtitle: z.string(),
  audience: z.string(), problem: z.string(), goal: z.string(), uniqueValue: z.string(), synopsis: z.string(),
  keywords: z.array(z.string()), description: z.string(),
});
export type ConceptOutput = z.infer<typeof ConceptOutput>;

export const OutlineInput = z.object({ brief: BriefCtx, chapterCount: z.number().int().min(3).max(30), targetWords: z.number().int().min(3000).max(120000) });
export const OutlineOutput = z.object({
  chapters: z.array(z.object({ title: z.string(), summary: z.string(), sections: z.array(z.string()), targetWords: z.number() })),
});
export type OutlineOutput = z.infer<typeof OutlineOutput>;

export const ChapterInput = z.object({
  brief: BriefCtx,
  outline: z.array(z.object({ position: z.number().int(), title: short, summary: z.string().max(1500) })).max(40),
  chapter: z.object({ position: z.number().int(), title: short, summary: z.string().max(1500), sections: z.array(short).max(20), targetWords: z.number().int().min(200).max(8000) }),
  /** Riassunti dei capitoli precedenti: contesto parsimonioso, mai il manoscritto intero. */
  previousSummaries: z.array(z.string().max(1500)).max(40),
  verifiedSources: z.array(z.string().max(500)).max(40),
});
export type ChapterInput = z.infer<typeof ChapterInput>;

export const ReviewInput = z.object({ brief: BriefCtx, chapterTitle: short, content: z.string().min(50).max(60000) });
export const ReviewOutput = z.object({
  issues: z.array(z.object({
    type: z.enum(['stile', 'grammatica', 'struttura', 'fatti']), excerpt: z.string(), problem: z.string(), suggestion: z.string(),
  })),
  summary: z.string(),
});
export type ReviewOutput = z.infer<typeof ReviewOutput>;

export const AiRequest = z.discriminatedUnion('task', [
  z.object({ task: z.literal('brainstorm'), input: BrainstormInput }),
  z.object({ task: z.literal('concept'), input: ConceptInput }),
  z.object({ task: z.literal('outline'), input: OutlineInput }),
  z.object({ task: z.literal('chapter'), input: ChapterInput }),
  z.object({ task: z.literal('review'), input: ReviewInput }),
]).and(z.object({
  projectId: z.string().max(80).nullable(),
  /** Spesa già registrata per il libro (USD) e tetto scelto dall'utente. */
  spentUsd: z.number().min(0).max(100000),
  budgetUsd: z.number().min(0).max(100000),
}));
export type AiRequest = z.infer<typeof AiRequest>;

export type AiTask = AiRequest['task'];

/** Eventi NDJSON dello stream /api/ai. */
export type AiEvent =
  | { t: 'delta'; text: string }
  | { t: 'done'; provider: 'anthropic' | 'mock'; model: string; data?: unknown; text?: string; usage: { inputTokens: number; outputTokens: number; costUsd: number; priceKnown: boolean } }
  | { t: 'error'; message: string; retryable: boolean };
