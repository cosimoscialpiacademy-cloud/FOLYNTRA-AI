/**
 * PDF interno per la stampa: HTML/CSS paginato con Chromium, una sezione per
 * volta, poi unione con pdf-lib. Ogni sezione inizia su pagina destra (dispari);
 * intestazioni pari/dispari, numeri di pagina e indice con le pagine REALI.
 */
import { PDFDocument } from 'pdf-lib';
import type { Browser } from 'playwright-core';
import { markdownToXhtml } from '../book/markdown';
import { MARKETPLACES, pageGeometry, insideMarginIn, type PageGeometry } from '../kdp/specs';
import type { BookBundle, Chapter, Project } from '../types';
import { escapeXml } from '../utils';
import { newOfflinePage } from './chromium';
import { fontFaceCss } from './fonts';

export interface TocEntry {
  title: string;
  page: number;
  kind: 'front' | 'chapter' | 'back';
}

export interface InteriorResult {
  pdf: Uint8Array;
  pageCount: number;
  toc: TocEntry[];
  geometry: PageGeometry;
}

interface Section {
  id: string;
  title: string | null;
  kind: 'front' | 'chapter' | 'back' | 'toc';
  /** Pagine di apertura senza numero né intestazione (frontespizio, colophon...). */
  bare: boolean;
  header: string | null;
  html: string;
}

const e = escapeXml;
const para = (text: string) => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${e(p).replace(/\n/g, '<br/>')}</p>`).join('\n');

export function sortedChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => a.position - b.position);
}

export function copyrightLines(project: Project, year: number): string[] {
  const lines = [
    `${project.title}${project.subtitle ? `. ${project.subtitle}` : ''}`,
    `© ${year} ${project.author || 'Autore'}. Tutti i diritti riservati.`,
    'Nessuna parte di questo libro può essere riprodotta senza autorizzazione scritta dell’autore, salvo brevi citazioni.',
    'Le informazioni contenute hanno scopo divulgativo e non sostituiscono il parere di un professionista.',
  ];
  if (project.layout.readerAiNotice) lines.push('Nota per il lettore: parti di questo libro sono state redatte con l’assistenza di strumenti di intelligenza artificiale e riviste dall’autore.');
  lines.push('Pubblicazione indipendente.');
  return lines;
}

/** Sezioni del libro nell'ordine di stampa (senza l'indice, inserito dal chiamante). */
export function buildSections(bundle: BookBundle, year: number): Section[] {
  const { project } = bundle;
  const out: Section[] = [];
  out.push({
    id: 'frontespizio', title: null, kind: 'front', bare: true, header: null,
    html: `<div class="titlepage"><h1 class="book-title">${e(project.title)}</h1>${project.subtitle ? `<p class="book-subtitle">${e(project.subtitle)}</p>` : ''}<p class="book-author">${e(project.author)}</p></div>
<div class="copyright">${copyrightLines(project, year).map((l) => `<p>${e(l)}</p>`).join('')}</div>`,
  });
  if (project.matter.dedication.trim()) {
    out.push({ id: 'dedica', title: null, kind: 'front', bare: true, header: null, html: `<div class="dedication">${para(project.matter.dedication)}</div>` });
  }
  if (project.matter.preface.trim()) {
    out.push({ id: 'prefazione', title: 'Prefazione', kind: 'front', bare: false, header: 'Prefazione', html: `<h1 class="section-title">Prefazione</h1>${markdownToXhtml(project.matter.preface)}` });
  }
  for (const c of sortedChapters(bundle.chapters)) {
    out.push({
      id: `cap-${c.position}`, title: c.title, kind: 'chapter', bare: false, header: c.title,
      html: `<p class="chapter-number">Capitolo ${c.position}</p><h1 class="chapter-title">${e(c.title)}</h1>${markdownToXhtml(c.content)}`,
    });
  }
  const back = (id: string, title: string, html: string) => out.push({ id, title, kind: 'back', bare: false, header: title, html: `<h1 class="section-title">${e(title)}</h1>${html}` });
  if (project.matter.conclusion.trim()) back('conclusione', 'Conclusione', markdownToXhtml(project.matter.conclusion));
  if (project.glossary.length) {
    back('glossario', 'Glossario', `<dl>${[...project.glossary].sort((a, b) => a.term.localeCompare(b.term, 'it')).map((g) => `<dt>${e(g.term)}</dt><dd>${e(g.definition)}</dd>`).join('')}</dl>`);
  }
  const verified = project.sources.filter((s) => s.verified && s.citation.trim());
  if (verified.length) back('bibliografia', 'Bibliografia', `<ul class="biblio">${verified.map((s) => `<li>${e(s.citation)}${s.url ? ` <span class="url">${e(s.url)}</span>` : ''}</li>`).join('')}</ul>`);
  if (project.matter.acknowledgments.trim()) back('ringraziamenti', 'Ringraziamenti', markdownToXhtml(project.matter.acknowledgments));
  if (project.matter.authorBio.trim()) back('autore', 'L’autore', markdownToXhtml(project.matter.authorBio));
  return out;
}

function pageCss(project: Project, g: PageGeometry, fonts: string): string {
  const l = project.layout;
  const serif = l.bodyFont === 'EB Garamond';
  const box = `font-family:'Inter',sans-serif;font-size:7.5pt;letter-spacing:0.08em;text-transform:uppercase;color:#444;`;
  return `${fonts}
@page { size: ${g.pageWidthIn}in ${g.pageHeightIn}in; margin: ${g.topIn}in ${g.outsideIn}in ${g.bottomIn}in ${g.insideIn}in; }
@page :left { margin-left: ${g.outsideIn}in; margin-right: ${g.insideIn}in; }
@page :right { margin-left: ${g.insideIn}in; margin-right: ${g.outsideIn}in; }
html { font-family: '${l.bodyFont}', ${serif ? 'serif' : 'sans-serif'}; font-size: ${l.fontSizePt}pt; line-height: ${l.lineHeight}; color: #111; }
body { margin: 0; text-align: justify; hyphens: auto; -webkit-hyphens: auto; orphans: 2; widows: 2; font-kerning: normal; }
p { margin: 0; text-indent: 1.2em; }
h1 + p, h2 + p, h3 + p, h4 + p, blockquote p, li p, .copyright p, .dedication p, .titlepage p, table + p, ul + p, ol + p, blockquote + p, hr + p { text-indent: 0; }
h1, h2, h3, h4 { font-family: 'Playfair Display', serif; text-align: left; hyphens: none; break-after: avoid; line-height: 1.2; }
h1.chapter-title, h1.section-title { font-size: 2em; margin: 0 0 1.6em 0; }
h1.section-title { padding-top: 18%; }
.chapter-number { font-family: 'Inter', sans-serif; font-size: 0.72em; letter-spacing: 0.22em; text-transform: uppercase; text-indent: 0; padding-top: 18%; margin-bottom: 0.9em; color: #555; }
h2 { font-size: 1.32em; margin: 1.5em 0 0.55em; }
h3 { font-size: 1.1em; margin: 1.2em 0 0.4em; }
h4 { font-size: 1em; margin: 1em 0 0.3em; font-family: 'Inter', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
ul, ol { margin: 0.6em 0 0.6em 1.4em; padding: 0; text-align: left; }
li { margin: 0.18em 0; break-inside: avoid; }
blockquote.callout { margin: 1em 0; padding: 0.7em 0.9em; border: 0.6pt solid #555; border-left: 3pt solid #333; background: #f1f1f1; break-inside: avoid; text-align: left; font-size: 0.95em; }
blockquote.callout p + p { margin-top: 0.4em; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9em; text-align: left; break-inside: avoid; hyphens: none; }
th, td { border: 0.5pt solid #444; padding: 0.3em 0.45em; vertical-align: top; }
th { font-family: 'Inter', sans-serif; font-size: 0.85em; background: #e6e6e6; }
hr { border: none; text-align: center; margin: 1.2em 0; }
hr::after { content: '* * *'; letter-spacing: 0.4em; }
code { font-size: 0.9em; }
a { color: inherit; text-decoration: none; }
.checkbox { display: inline-block; width: 0.75em; height: 0.75em; border: 0.7pt solid #111; margin-right: 0.35em; vertical-align: -0.05em; }
.checkbox.checked { background: #111; }
dt { font-weight: 700; margin-top: 0.6em; } dd { margin: 0 0 0 1.2em; }
.biblio { list-style: none; margin-left: 0; } .biblio li { margin-bottom: 0.5em; padding-left: 1.4em; text-indent: -1.4em; } .url { font-size: 0.85em; word-break: break-all; }
.titlepage { height: ${g.pageHeightIn - g.topIn - g.bottomIn}in; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; break-after: page; }
.book-title { font-size: 2.6em; margin: 0; text-align: center; } .book-subtitle { font-style: italic; font-size: 1.25em; margin-top: 1em; } .book-author { font-family: 'Inter', sans-serif; letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.85em; margin-top: 4em; }
.copyright { height: ${g.pageHeightIn - g.topIn - g.bottomIn}in; display: flex; flex-direction: column; justify-content: flex-end; font-size: 0.8em; text-align: left; hyphens: none; } .copyright p { margin-bottom: 0.5em; }
.dedication { padding-top: 30%; text-align: center; font-style: italic; }
.toc-row { display: flex; align-items: baseline; text-indent: 0; margin: 0.42em 0; text-align: left; hyphens: none; }
.toc-row .t { flex: 0 1 auto; } .toc-row .d { flex: 1 1 1em; border-bottom: 0.6pt dotted #777; margin: 0 0.4em; min-width: 1em; } .toc-row .n { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.toc-row.minor { font-style: italic; }
.hf-box { ${box} }`;
}

function sectionDoc(project: Project, css: string, s: Section, startPage: number): string {
  const lang = MARKETPLACES[project.marketplace].locale.slice(0, 2);
  const box = `font-family:'Inter',sans-serif;font-size:7.5pt;letter-spacing:0.08em;text-transform:uppercase;color:#444;`;
  const q = (t: string) => `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
  let running = '';
  if (!s.bare) {
    running = `html { counter-reset: page ${startPage - 1}; }
@page { @bottom-center { content: counter(page); ${box} letter-spacing: 0; font-size: 8.5pt; } }`;
    if (project.layout.runningHeaders && s.header) {
      running += `
@page :left { @top-center { content: ${q(project.title)}; ${box} } }
@page :right { @top-center { content: ${q(s.header)}; ${box} } }
@page :first { @top-center { content: none; } }`;
    }
  }
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"/><title>${e(project.title)}</title><style>${css}\n${running}</style></head><body>${s.html}</body></html>`;
}

function tocHtml(entries: TocEntry[]): string {
  return `<h1 class="section-title">Indice</h1>${entries.map((t) => `<p class="toc-row${t.kind === 'chapter' ? '' : ' minor'}"><span class="t">${e(t.title)}</span><span class="d"></span><span class="n">${t.page}</span></p>`).join('')}`;
}

async function renderPdf(browser: Browser, html: string): Promise<Uint8Array> {
  const page = await newOfflinePage(browser);
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready').catch(() => undefined);
    return await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: false });
  } finally {
    await page.context().close();
  }
}

async function countPages(pdf: Uint8Array): Promise<number> {
  return (await PDFDocument.load(pdf)).getPageCount();
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map((it, j) => fn(it, i + j)))));
  }
  return out;
}

/** Pagina iniziale di ogni sezione, con le sezioni sempre su pagina dispari. */
function layoutStarts(counts: number[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let next = 1;
  for (const n of counts) {
    if (next % 2 === 0) next += 1;
    starts.push(next);
    next += n;
  }
  return { starts, total: next - 1 };
}

export async function renderInterior(bundle: BookBundle, browser: Browser, year = new Date().getFullYear()): Promise<InteriorResult> {
  const { project } = bundle;
  const fonts = await fontFaceCss(['EB Garamond', 'Playfair Display', 'Inter']);
  const content = buildSections(bundle, year);
  const tocIndex = content.findIndex((s) => s.id !== 'frontespizio' && s.id !== 'dedica');
  const insertAt = tocIndex === -1 ? content.length : tocIndex;

  let assumedPages = project.pageCount ?? 120;
  for (let attempt = 0; ; attempt++) {
    const geometry = pageGeometry(project.layout.trim, assumedPages, project.layout.bleed);
    const css = pageCss(project, geometry, fonts);

    // Passo 1: conteggio pagine di ogni sezione (i numeri stanno nei margini e non alterano il flusso).
    const draftCounts = await inBatches(content, 4, async (s) => countPages(await renderPdf(browser, sectionDoc(project, css, s, 1))));
    const placeholderToc: TocEntry[] = content.filter((s) => s.title).map((s) => ({ title: s.title as string, page: 888, kind: s.kind === 'toc' ? 'front' : (s.kind as TocEntry['kind']) }));
    const tocSection = (entries: TocEntry[]): Section => ({ id: 'indice', title: null, kind: 'toc', bare: false, header: 'Indice', html: tocHtml(entries) });
    const tocPages = await countPages(await renderPdf(browser, sectionDoc(project, css, tocSection(placeholderToc), 1)));

    const sections = [...content.slice(0, insertAt), tocSection(placeholderToc), ...content.slice(insertAt)];
    const counts = [...draftCounts.slice(0, insertAt), tocPages, ...draftCounts.slice(insertAt)];
    const { starts, total } = layoutStarts(counts);

    // La gabbia dipende dal numero di pagine: se la fascia cambia si reimpagina.
    if (insideMarginIn(total) !== insideMarginIn(assumedPages) && attempt < 3) {
      assumedPages = total;
      continue;
    }

    const toc: TocEntry[] = sections.map((s, i) => ({ s, page: starts[i] })).filter((x) => x.s.title).map((x) => ({ title: x.s.title as string, page: x.page, kind: x.s.kind as TocEntry['kind'] }));
    sections[insertAt] = tocSection(toc);

    // Passo 2: rendering definitivo con numerazione reale.
    const finals = await inBatches(sections, 4, (s, i) => renderPdf(browser, sectionDoc(project, css, s, starts[i])));
    const out = await PDFDocument.create();
    const size: [number, number] = [geometry.pageWidthIn * 72, geometry.pageHeightIn * 72];
    for (let i = 0; i < finals.length; i++) {
      const doc = await PDFDocument.load(finals[i]);
      if (doc.getPageCount() !== counts[i]) throw new Error(`Impaginazione instabile nella sezione "${sections[i].id}": riprova.`);
      while (out.getPageCount() + 1 < starts[i]) out.addPage(size);
      for (const p of await out.copyPages(doc, doc.getPageIndices())) out.addPage(p);
    }
    out.setTitle(project.title);
    out.setAuthor(project.author);
    out.setCreator('FOLYNTRA AI');
    out.setProducer('FOLYNTRA AI (Chromium + pdf-lib)');
    const pdf = await out.save();
    return { pdf, pageCount: out.getPageCount(), toc, geometry };
  }
}
