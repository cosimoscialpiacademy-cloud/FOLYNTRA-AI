import { mockChapter, mockOutline } from '../src/lib/ai/mock';
import type { BriefCtx } from '../src/lib/ai/schemas';
import { createChapter, createProject } from '../src/lib/defaults';
import type { BookBundle } from '../src/lib/types';

export const NOW = '2026-11-12T08:00:00.000Z';

export function briefCtx(title: string): BriefCtx {
  return { title, subtitle: '', kind: 'nonfiction', language: 'Italiano', marketplace: 'amazon.it', keyword: 'manutenzione domestica', audience: '', problem: '', goal: '', uniqueValue: '', exclusions: '', style: '', synopsis: '' };
}

/** Libro di prova: `real` = testo "umano" rivisto (pubblicabile), altrimenti testo mock. */
export function sampleBundle(opts: { chapters?: number; real?: boolean; paragraphs?: number } = {}): BookBundle {
  const title = 'Manuale pratico di manutenzione domestica di base';
  const project = createProject({ id: '11111111-1111-4111-8111-111111111111', name: title, niche: null, now: NOW });
  project.author = 'Mario Rossi';
  project.subtitle = 'Riparazioni semplici, controlli periodici e sicurezza in casa';
  project.cover = { ...project.cover, title, subtitle: project.subtitle, author: project.author, tagline: 'La casa in ordine, senza stress', backText: 'Un manuale chiaro per chi vuole prendersi cura della propria casa.\n\nSchede pratiche, controlli stagionali e indicazioni su quando chiamare un professionista.' };
  project.kdp = { ...project.kdp, description: 'Una guida **pratica** alla manutenzione di casa.\n\n- Controlli periodici\n- Piccole riparazioni', keywords: ['manutenzione casa', 'fai da te', 'riparazioni domestiche', 'manuale casa', 'bricolage base', 'casa sicura', 'checklist casa'], categories: ['Casa e giardino'], aiText: 'none', rightsConfirmed: true, humanReviewConfirmed: true };
  project.matter.preface = 'Questa prefazione spiega a chi si rivolge il libro e come usarlo.';
  project.matter.authorBio = 'Mario Rossi si occupa di manutenzione da vent’anni.';
  project.glossary = [{ term: 'Guarnizione', definition: 'Elemento di tenuta tra due superfici.' }];
  project.sources = [{ id: 's1', citation: 'Rossi M., Appunti di cantiere, 2020.', url: '', verified: true }];
  const brief = briefCtx(title);
  const outline = mockOutline(brief, opts.chapters ?? 6, 12000);
  const chapters = outline.chapters.map((c, i) => {
    const ch = createChapter({ id: `22222222-2222-4222-8222-00000000000${i}`, projectId: project.id, position: i + 1, title: c.title, summary: c.summary, sections: c.sections, targetWords: c.targetWords, now: NOW });
    if (opts.real) {
      const body = (s: string, n: number) => Array.from({ length: opts.paragraphs ?? 6 }, (_, k) => `Nel capitolo ${i + 1}, alla voce «${s}», il passaggio ${k + 1} descrive un controllo diverso: si osserva lo stato del componente numero ${n * 7 + k * 3 + i}, si annota la data e si decide se intervenire subito oppure programmare l’intervento per la stagione ${['fredda', 'calda', 'umida', 'secca'][(k + n + i) % 4]}, tenendo conto del tempo disponibile e degli attrezzi ${k % 2 ? 'già presenti in casa' : 'da procurarsi'} (${i}-${n}-${k}).`).join('\n\n');
      ch.content = c.sections.map((s, n) => `## ${s}\n\n${body(s, n)}\n\n${n === 0 ? '> **Nota:** stacca sempre la corrente prima di intervenire.\n\n' : ''}${n === 1 ? '| Attrezzo | Uso |\n|---|---|\n| Cacciavite | Viti |\n| Pinza | Presa |\n\n' : ''}`).join('\n');
      ch.generatedBy = 'human';
      ch.status = 'reviewed';
    } else {
      ch.content = mockChapter({ brief, outline: [], chapter: { position: i + 1, title: c.title, summary: c.summary, sections: c.sections, targetWords: c.targetWords }, previousSummaries: [], verifiedSources: [] });
      ch.generatedBy = 'mock';
      ch.status = 'generated';
    }
    return ch;
  });
  return { project, chapters };
}
