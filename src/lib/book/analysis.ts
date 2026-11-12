/**
 * Controlli editoriali deterministici (docs/02 §6): segnaposto, duplicati,
 * fonti non confermate, titoli non corrispondenti all'indice, coerenza ricette.
 * Sono euristiche: non sostituiscono la revisione umana né certificano originalità.
 */
import { extractHeadings } from './markdown';
import type { Chapter, Project } from '../types';
import { wordCount } from '../utils';

export const MOCK_MARKER = 'TESTO DEMO (mock)';
const MOCK_FILLER_RE = /è un segnaposto del capitolo|segnaposto dell’elenco|Esercizio segnaposto/;

/** Vero se nel testo resta materiale prodotto dal mock. */
export function containsMockText(content: string): boolean {
  return content.includes(MOCK_MARKER) || MOCK_FILLER_RE.test(content);
}

export const MISSING_SOURCE_RE = /\[(FONTE (MANCANTE|DA VERIFICARE)[^\]]*)\]/gi;
const PLACEHOLDER_RE = /\[(TODO|DA COMPLETARE|INSERIRE|PLACEHOLDER|XXX|TBD)[^\]]*\]|lorem ipsum|\bTODO\b|\bTBD\b/gi;

export interface TextIssue {
  kind: 'mock' | 'segnaposto' | 'fonte' | 'duplicato' | 'indice' | 'lunghezza' | 'ricetta';
  severity: 'critico' | 'avviso';
  chapterId: string;
  chapterTitle: string;
  message: string;
  excerpt?: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function paragraphs(md: string): string[] {
  return md.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p && !p.startsWith('#') && !p.startsWith('|') && wordCount(p) >= 18);
}

function shingles(text: string, size = 6): Set<string> {
  const w = norm(text).split(' ');
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i++) out.add(w.slice(i, i + size).join(' '));
  return out;
}

/** Paragrafi quasi identici (Jaccard su 6-grammi ≥ 0,6) all'interno del manoscritto. */
export function findDuplicates(chapters: Chapter[]): TextIssue[] {
  const all = chapters.flatMap((c) => paragraphs(c.content).map((p) => ({ c, p, s: shingles(p) })));
  const issues: TextIssue[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (seen.has(j)) continue;
      const a = all[i].s, b = all[j].s;
      if (!a.size || !b.size) continue;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      const jac = inter / (a.size + b.size - inter);
      if (jac >= 0.6) {
        seen.add(j);
        issues.push({
          kind: 'duplicato', severity: 'avviso', chapterId: all[j].c.id, chapterTitle: all[j].c.title,
          message: `Paragrafo quasi identico a uno del capitolo "${all[i].c.title}".`, excerpt: all[j].p.slice(0, 140),
        });
      }
    }
  }
  return issues;
}

/** Ricette: ogni ingrediente elencato dovrebbe comparire nel procedimento. */
export function checkRecipeConsistency(chapter: Chapter): TextIssue[] {
  const issues: TextIssue[] = [];
  const blocks = chapter.content.split(/\n(?=#{2,4}\s)/);
  for (let i = 0; i < blocks.length - 1; i++) {
    if (!/^#{2,4}\s*ingredienti/i.test(blocks[i]) || !/^#{2,4}\s*(procedimento|preparazione)/i.test(blocks[i + 1])) continue;
    const method = norm(blocks[i + 1]);
    for (const line of blocks[i].split('\n').filter((l) => /^\s*[-*]\s+/.test(l))) {
      const words = norm(line.replace(/\([^)]*\)/g, '')).split(' ').filter((w) => w.length > 3 && !/^\d/.test(w) && !['grammi', 'cucchiai', 'cucchiaio', 'cucchiaino', 'pizzico', 'quanto', 'basta', 'litro', 'litri', 'circa', 'tazza', 'tazze', 'spicchio', 'spicchi', 'fette', 'fetta'].includes(w));
      if (words.length && !words.some((w) => method.includes(w.slice(0, Math.max(4, w.length - 1))))) {
        issues.push({ kind: 'ricetta', severity: 'avviso', chapterId: chapter.id, chapterTitle: chapter.title, message: 'Ingrediente non citato nel procedimento.', excerpt: line.trim() });
      }
    }
  }
  return issues;
}

export function analyzeManuscript(project: Project, chapters: Chapter[]): TextIssue[] {
  const issues: TextIssue[] = [];
  for (const c of chapters) {
    const base = { chapterId: c.id, chapterTitle: c.title };
    const words = wordCount(c.content);
    if (words === 0) {
      issues.push({ ...base, kind: 'lunghezza', severity: 'critico', message: 'Capitolo vuoto.' });
      continue;
    }
    if (c.generatedBy === 'mock' || containsMockText(c.content)) {
      issues.push({ ...base, kind: 'mock', severity: 'critico', message: 'Contiene testo DEMO generato dal mock: non è contenuto pubblicabile.' });
    }
    for (const m of c.content.matchAll(PLACEHOLDER_RE)) {
      issues.push({ ...base, kind: 'segnaposto', severity: 'critico', message: 'Segnaposto non risolto.', excerpt: m[0] });
    }
    for (const m of c.content.matchAll(MISSING_SOURCE_RE)) {
      issues.push({ ...base, kind: 'fonte', severity: 'critico', message: 'Affermazione senza fonte confermata.', excerpt: m[0] });
    }
    if (c.sections.length) {
      const found = extractHeadings(c.content).map((h) => norm(h.text));
      const missing = c.sections.filter((s) => !found.some((f) => f.includes(norm(s)) || norm(s).includes(f)));
      if (missing.length) {
        issues.push({ ...base, kind: 'indice', severity: 'avviso', message: `Sezioni dell’indice non trovate nel testo: ${missing.join('; ')}.` });
      }
    }
    if (words < Math.min(300, c.targetWords * 0.3)) {
      issues.push({ ...base, kind: 'lunghezza', severity: 'avviso', message: `Solo ${words} parole su ${c.targetWords} previste.` });
    }
    if (project.kind === 'cookbook') issues.push(...checkRecipeConsistency(c));
  }
  issues.push(...findDuplicates(chapters));
  return issues;
}
