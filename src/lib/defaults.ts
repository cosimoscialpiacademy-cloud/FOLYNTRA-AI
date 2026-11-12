/** Valori iniziali e fabbriche: la nicchia selezionata popola il brief (docs/02 §3). */
import { MARKETPLACES } from './kdp/specs';
import type { Chapter, CoverSpec, KdpMeta, LayoutSettings, Niche, Project } from './types';

export const DEFAULT_BUDGET_USD = 20;

export const COVER_PRESETS: { template: CoverSpec['template']; label: string; description: string; palette: CoverSpec['palette']; titleFont: CoverSpec['titleFont'] }[] = [
  { template: 'classico', label: 'Classico', description: 'Cornice tipografica, serif elegante, simmetria.', palette: { background: '#0D1424', accent: '#D7B574', text: '#F7F4ED' }, titleFont: 'Playfair Display' },
  { template: 'moderno', label: 'Moderno', description: 'Blocchi geometrici, titolo condensato ad alto impatto.', palette: { background: '#F7F4ED', accent: '#B4532A', text: '#182239' }, titleFont: 'Oswald' },
  { template: 'editoriale', label: 'Editoriale', description: 'Motivo generativo a linee, composizione asimmetrica.', palette: { background: '#1F3A3D', accent: '#E8C27A', text: '#F7F4ED' }, titleFont: 'EB Garamond' },
];

export function defaultLayout(): LayoutSettings {
  return { trim: '6x9', paper: 'cream', bleed: false, bodyFont: 'EB Garamond', fontSizePt: 11, lineHeight: 1.45, runningHeaders: true, readerAiNotice: false };
}

export function defaultCover(title: string, author: string): CoverSpec {
  const p = COVER_PRESETS[0];
  return { template: p.template, palette: { ...p.palette }, titleFont: p.titleFont, title, subtitle: '', author, tagline: '', backText: '', seed: 7 };
}

export function defaultKdp(): KdpMeta {
  return {
    description: '', keywords: [], categories: [], listPricePaperback: 12.99, listPriceEbook: 4.99,
    aiText: 'none', aiImages: 'none', aiTranslation: 'none',
    rightsConfirmed: false, humanReviewConfirmed: false, publishState: 'non_pronto',
  };
}

export function createProject(input: { id: string; name: string; niche: Niche | null; marketplace?: Project['marketplace']; now: string; budgetUsd?: number }): Project {
  const { niche } = input;
  const marketplace = niche?.marketplace ?? input.marketplace ?? 'amazon.it';
  const kdp = defaultKdp();
  if (niche) kdp.keywords = [niche.keyword, ...niche.secondaryKeywords].filter(Boolean).slice(0, 7);
  if (niche?.category) kdp.categories = [niche.category];
  return {
    id: input.id,
    nicheId: niche?.id ?? null,
    name: input.name,
    marketplace,
    locale: MARKETPLACES[marketplace].locale,
    status: niche ? 'research' : 'draft',
    kind: 'nonfiction',
    title: input.name,
    subtitle: '',
    altTitles: [],
    author: '',
    brief: {
      audience: niche?.buyerPersona ?? '',
      problem: '',
      goal: '',
      uniqueValue: niche?.differentiationIdeas.join(' · ') ?? '',
      exclusions: '',
      style: 'Chiaro, pratico, concreto; frasi brevi, esempi reali, nessuna promessa esagerata.',
      synopsis: '',
    },
    targetWords: 20000,
    matter: { dedication: '', preface: '', conclusion: '', acknowledgments: '', authorBio: '' },
    glossary: [],
    sources: [],
    layout: defaultLayout(),
    cover: defaultCover(input.name, ''),
    kdp,
    budgetUsd: input.budgetUsd ?? DEFAULT_BUDGET_USD,
    pageCount: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function createChapter(input: { id: string; projectId: string; position: number; title: string; summary?: string; sections?: string[]; targetWords?: number; now: string }): Chapter {
  return {
    id: input.id, projectId: input.projectId, position: input.position, title: input.title,
    summary: input.summary ?? '', sections: input.sections ?? [], targetWords: input.targetWords ?? 2500,
    content: '', status: 'draft', generatedBy: 'none', aiGenerated: false, updatedAt: input.now,
  };
}
