/** Avanzamento REALE del progetto, calcolato dai dati salvati (nessuna percentuale finta). */
import type { Chapter, ExportRecord, Project } from './types';
import { wordCount } from './utils';

export interface Step {
  key: 'brief' | 'indice' | 'scrittura' | 'disegni' | 'studio' | 'kit';
  label: string;
  /** 0–1 */
  ratio: number;
  detail: string;
}

export function projectSteps(project: Project, chapters: Chapter[], exports: ExportRecord[]): Step[] {
  const briefFields = [project.title, project.author, project.brief.audience, project.brief.problem, project.brief.uniqueValue, project.brief.synopsis];
  const briefDone = briefFields.filter((f) => f.trim()).length;
  const written = chapters.filter((c) => wordCount(c.content) > 0).length;
  const reviewed = chapters.filter((c) => c.status === 'reviewed' || c.status === 'locked').length;
  const n = chapters.length;
  const coverOk = Boolean(project.cover.title.trim() && project.cover.author.trim());
  const last = [...exports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (project.kind === 'coloring') {
    const pages = project.coloring?.pages ?? [];
    const drawn = pages.filter((p) => p.svg || p.image).length;
    return [
      { key: 'brief', label: 'Brief', ratio: briefDone / briefFields.length, detail: `${briefDone}/${briefFields.length} campi chiave` },
      { key: 'disegni', label: 'Disegni', ratio: Math.min(1, drawn / 25), detail: pages.length ? `${drawn}/${pages.length} disegnate` : 'da creare' },
      { key: 'studio', label: 'Cover & interni', ratio: (coverOk ? 0.5 : 0) + (project.pageCount ? 0.5 : 0), detail: project.pageCount ? `${project.pageCount} pagine reali` : 'anteprima PDF da generare' },
      { key: 'kit', label: 'KDP Kit', ratio: last ? (last.kdpReady ? 1 : 0.5) : 0, detail: last ? (last.kdpReady ? 'pacchetto pronto' : 'esportato come BOZZA') : 'non esportato' },
    ];
  }
  return [
    { key: 'brief', label: 'Brief', ratio: briefDone / briefFields.length, detail: `${briefDone}/${briefFields.length} campi chiave` },
    { key: 'indice', label: 'Indice', ratio: Math.min(1, n / 5), detail: n ? `${n} capitoli` : 'da creare' },
    { key: 'scrittura', label: 'Scrittura', ratio: n ? (written + reviewed) / (2 * n) : 0, detail: n ? `${written}/${n} scritti · ${reviewed}/${n} rivisti` : '—' },
    { key: 'studio', label: 'Cover & interni', ratio: (coverOk ? 0.5 : 0) + (project.pageCount ? 0.5 : 0), detail: project.pageCount ? `${project.pageCount} pagine reali` : 'anteprima PDF da generare' },
    { key: 'kit', label: 'KDP Kit', ratio: last ? (last.kdpReady ? 1 : 0.5) : 0, detail: last ? (last.kdpReady ? 'pacchetto pronto' : 'esportato come BOZZA') : 'non esportato' },
  ];
}

export function projectPercent(steps: Step[]): number {
  return Math.round((steps.reduce((n, s) => n + s.ratio, 0) / steps.length) * 100);
}

export const STATUS_LABEL: Record<Project['status'], string> = {
  draft: 'Bozza', research: 'Ricerca', writing: 'Scrittura', review: 'Revisione', export_ready: 'Pacchetto pronto', published_by_user: 'Pubblicato dall’utente',
};
