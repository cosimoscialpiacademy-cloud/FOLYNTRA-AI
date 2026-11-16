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
    /** Il passaggio corretto, nella lingua del libro, da sostituire a `excerpt`. Vuoto se serve una verifica o una fonte e non una riscrittura. */
    replacement: z.string(),
    /** Traduzione italiana della versione proposta (vuota se il libro è già in italiano o se non c'è sostituzione). */
    translationIt: z.string(),
  })),
  summary: z.string(),
});
export type ReviewOutput = z.infer<typeof ReviewOutput>;

export const MarketingInput = z.object({ brief: BriefCtx, authorName: short, currentDescription: z.string().max(8000) });
export const MarketingOutput = z.object({
  hook: z.string(),
  amazonDescription: z.string(),
  bullets: z.array(z.string()),
  aPlus: z.array(z.object({ title: z.string(), body: z.string(), imageIdea: z.string() })),
  authorBio: z.string(),
  emails: z.array(z.object({ subject: z.string(), body: z.string(), sendWhen: z.string() })),
  posts: z.array(z.object({ platform: z.string(), text: z.string(), hashtags: z.array(z.string()) })),
  adAngles: z.array(z.string()),
  launchChecklist: z.array(z.string()),
});
export type MarketingOutput = z.infer<typeof MarketingOutput>;

const HEX = z.string();
export const CoverConcept = z.object({
  name: z.string(),
  rationale: z.string(),
  standOut: z.string(),
  template: z.enum(['immersiva', 'cornice', 'vetrina', 'classico', 'moderno', 'editoriale']),
  /** id di uno sfondo del catalogo, oppure stringa vuota. */
  artId: z.string(),
  /** Se nessuno sfondo del catalogo va bene: prompt in inglese per generarne uno (senza testo). Altrimenti stringa vuota. */
  customArtPrompt: z.string(),
  palette: z.object({ background: HEX, accent: HEX, text: HEX }),
  titleFont: z.enum(['Playfair Display', 'EB Garamond', 'Oswald', 'Montserrat']),
  titleLines: z.array(z.string()),
  taglineSuggestion: z.string(),
  thumbnailTest: z.string(),
  risks: z.string(),
});
export type CoverConcept = z.infer<typeof CoverConcept>;

export const CoverStrategyOutput = z.object({
  marketReading: z.object({ dominantStyles: z.array(z.string()), colorPatterns: z.array(z.string()), typographyPatterns: z.array(z.string()), gaps: z.array(z.string()) }),
  audienceInsight: z.string(),
  basedOn: z.enum(['immagini_concorrenti', 'solo_testo_e_conoscenze_generali']),
  concepts: z.array(CoverConcept),
  recommendedIndex: z.number(),
  recommendationReason: z.string(),
  thumbnailChecklist: z.array(z.string()),
});
export type CoverStrategyOutput = z.infer<typeof CoverStrategyOutput>;

export const CoverCritiqueOutput = z.object({
  verdict: z.string(),
  standsOut: z.string(),
  readability: z.string(),
  strengths: z.array(z.string()),
  problems: z.array(z.string()),
  improvedConcept: CoverConcept,
});
export type CoverCritiqueOutput = z.infer<typeof CoverCritiqueOutput>;

const CoverImage = z.object({ mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']), data: z.string().max(220_000), note: z.string().max(200) });
export const CoverInput = z.object({
  brief: BriefCtx,
  nicheNotes: z.string().max(3000),
  notes: z.string().max(1500),
  feedback: z.string().max(1500),
  /** Strategia precedente (JSON) per rielaborarla in base al feedback. */
  previous: z.string().max(12000),
  competitors: z.array(CoverImage).max(6),
  catalog: z.array(z.object({ id: z.string().max(40), name: z.string().max(80), tone: z.enum(['dark', 'light']), suits: z.string().max(120) })).max(30),
  currentCover: z.object({ template: z.string().max(20), artId: z.string().max(40), title: z.string().max(300), fontName: z.string().max(40) }),
});
export const CoverCritiqueInput = CoverInput.extend({ ownCover: CoverImage });

const Sig = z.object({ value: z.number(), why: z.string() });
export const NicheScoreInput = z.object({
  items: z.array(z.object({ id: z.string().max(80), keyword: short, buyerPersona: short, category: short, marketplace: short, secondaryKeywords: z.array(short).max(8), notes: z.string().max(800) })).min(1).max(12),
  language: short,
});
export const NicheScoreOutput = z.object({
  results: z.array(z.object({
    id: z.string(),
    demand: Sig, competition: Sig, trend: Sig, unitEconomics: Sig, differentiation: Sig,
    risks: z.array(z.string()), verifyChecklist: z.array(z.string()), summary: z.string(),
  })),
});
export type NicheScoreOutput = z.infer<typeof NicheScoreOutput>;

export const AiRequest = z.discriminatedUnion('task', [
  z.object({ task: z.literal('brainstorm'), input: BrainstormInput }),
  z.object({ task: z.literal('concept'), input: ConceptInput }),
  z.object({ task: z.literal('outline'), input: OutlineInput }),
  z.object({ task: z.literal('chapter'), input: ChapterInput }),
  z.object({ task: z.literal('review'), input: ReviewInput }),
  z.object({ task: z.literal('marketing'), input: MarketingInput }),
  z.object({ task: z.literal('nicheScore'), input: NicheScoreInput }),
  z.object({ task: z.literal('cover'), input: CoverInput }),
  z.object({ task: z.literal('coverCritique'), input: CoverCritiqueInput }),
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
