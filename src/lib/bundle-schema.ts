/** Validazione del pacchetto libro ricevuto dalle route di export. */
import { z } from 'zod';

const s = (max: number) => z.string().max(max);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const BundleSchema = z.object({
  project: z.object({
    id: z.string().uuid(),
    nicheId: z.string().nullable(),
    name: s(300),
    marketplace: z.enum(['amazon.it', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.es']),
    locale: s(20),
    status: s(40),
    kind: z.enum(['nonfiction', 'workbook', 'cookbook']),
    title: s(300).min(1, 'Titolo mancante'),
    subtitle: s(400),
    altTitles: z.array(s(300)).max(20),
    author: s(200),
    brief: z.object({ audience: s(6000), problem: s(6000), goal: s(6000), uniqueValue: s(6000), exclusions: s(6000), style: s(6000), synopsis: s(6000) }),
    targetWords: z.number(),
    matter: z.object({ dedication: s(2000), preface: s(60000), conclusion: s(60000), acknowledgments: s(20000), authorBio: s(20000) }),
    glossary: z.array(z.object({ term: s(200), definition: s(2000) })).max(500),
    sources: z.array(z.object({ id: s(80), citation: s(1000), url: s(500), verified: z.boolean() })).max(500),
    layout: z.object({
      trim: z.enum(['5x8', '5.5x8.5', '6x9', '7x10', '8.5x11']), paper: z.enum(['white', 'cream']), bleed: z.boolean(), bodyFont: z.enum(['EB Garamond', 'Inter']),
      fontSizePt: z.number().min(8).max(16), lineHeight: z.number().min(1.1).max(2), runningHeaders: z.boolean(), readerAiNotice: z.boolean(),
    }),
    cover: z.object({
      template: z.enum(['classico', 'moderno', 'editoriale']), palette: z.object({ background: color, accent: color, text: color }),
      titleFont: z.enum(['Playfair Display', 'Oswald', 'EB Garamond']), title: s(300), subtitle: s(400), author: s(200), tagline: s(200), backText: s(3000), seed: z.number().int().min(0).max(1_000_000),
    }),
    kdp: z.object({
      description: s(8000), keywords: z.array(s(100)).max(20), categories: z.array(s(200)).max(10), listPricePaperback: z.number().min(0).max(999), listPriceEbook: z.number().min(0).max(999),
      aiText: z.enum(['none', 'assisted', 'generated']), aiImages: z.enum(['none', 'assisted', 'generated']), aiTranslation: z.enum(['none', 'assisted', 'generated']),
      rightsConfirmed: z.boolean(), humanReviewConfirmed: z.boolean(), publishState: s(40),
    }),
    budgetUsd: z.number(),
    pageCount: z.number().int().nullable(),
    createdAt: s(40),
    updatedAt: s(40),
  }),
  chapters: z.array(z.object({
    id: s(80), projectId: s(80), position: z.number().int().min(1).max(200), title: s(300), summary: s(3000), sections: z.array(s(300)).max(40), targetWords: z.number(),
    content: s(300_000), status: z.enum(['draft', 'generating', 'generated', 'reviewed', 'locked']), generatedBy: z.enum(['none', 'mock', 'anthropic', 'human']), aiGenerated: z.boolean(), updatedAt: s(40),
  })).min(1, 'Serve almeno un capitolo').max(80),
});

export const ExportRequest = z.object({ format: z.enum(['kit', 'interior']), bundle: BundleSchema });
