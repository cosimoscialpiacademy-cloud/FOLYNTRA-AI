/**
 * QA del pacchetto KDP. "KDP pronto" richiede che TUTTI i controlli critici
 * siano 'ok': un controllo critico fallito o non eseguito blocca lo stato.
 */
import { analyzeManuscript, type TextIssue } from '../book/analysis';
import type { PdfReport } from '../export/pdf-inspect';
import type { BookBundle, QaCheck } from '../types';
import { wordCount } from '../utils';
import { BLEED_IN, MAX_PAGES, MIN_PAGES, TRIM_SIZES, type CoverGeometry } from './specs';

export interface QaInput {
  bundle: BookBundle;
  interior: PdfReport;
  cover: PdfReport;
  coverGeometry: CoverGeometry;
  ebookCover: { width: number; height: number; format: string };
  epub: { ok: boolean; problems: string[] };
  docx: { ok: boolean; problems: string[] };
  bonusWords: number;
  /** Presente solo se epubcheck è stato davvero eseguito. */
  epubcheck?: { ok: boolean; detail: string };
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

export function runQa(input: QaInput): { checks: QaCheck[]; kdpReady: boolean; issues: TextIssue[] } {
  const { bundle, interior, cover, coverGeometry: g } = input;
  const { project, chapters } = bundle;
  const checks: QaCheck[] = [];
  const add = (id: string, label: string, severity: QaCheck['severity'], ok: boolean | 'skip', detail: string) =>
    checks.push({ id, label, severity, result: ok === 'skip' ? 'non_eseguito' : ok ? 'ok' : 'fallito', detail });

  // --- Contenuto ---
  const issues = analyzeManuscript(project, chapters);
  const crit = (kind: TextIssue['kind']) => issues.filter((i) => i.kind === kind && i.severity === 'critico');
  add('contenuto.capitoli', 'Almeno 5 capitoli con testo', 'critico', chapters.length >= 5 && crit('lunghezza').length === 0,
    chapters.length < 5 ? `Solo ${chapters.length} capitoli.` : crit('lunghezza').length ? `${crit('lunghezza').length} capitoli vuoti.` : `${chapters.length} capitoli, ${chapters.reduce((n, c) => n + wordCount(c.content), 0)} parole.`);
  add('contenuto.mock', 'Nessun testo DEMO/mock nel manoscritto', 'critico', crit('mock').length === 0, crit('mock').length ? `Testo mock in: ${crit('mock').map((i) => i.chapterTitle).join('; ')}.` : 'Nessun segnaposto mock.');
  add('contenuto.segnaposto', 'Nessun segnaposto non risolto', 'critico', crit('segnaposto').length === 0, crit('segnaposto').length ? `${crit('segnaposto').length} segnaposto (es. ${crit('segnaposto')[0].excerpt}).` : 'Nessun segnaposto.');
  add('contenuto.fonti', 'Nessuna affermazione con fonte mancante', 'critico', crit('fonte').length === 0, crit('fonte').length ? `${crit('fonte').length} marcatori [FONTE MANCANTE] da risolvere.` : 'Nessun marcatore di fonte mancante.');
  const dup = issues.filter((i) => i.kind === 'duplicato');
  add('contenuto.duplicati', 'Paragrafi duplicati', 'avviso', dup.length === 0, dup.length ? `${dup.length} paragrafi quasi identici.` : 'Nessun duplicato rilevato (euristica interna, non è un controllo antiplagio).');
  const idx = issues.filter((i) => i.kind === 'indice');
  add('contenuto.indice', 'Testo coerente con l’indice', 'avviso', idx.length === 0, idx.length ? idx.map((i) => `${i.chapterTitle}: ${i.message}`).join(' ') : 'Tutte le sezioni previste sono presenti.');
  const unreviewed = chapters.filter((c) => c.status !== 'reviewed' && c.status !== 'locked');
  add('revisione.capitoli', 'Revisione umana di ogni capitolo', 'critico', unreviewed.length === 0, unreviewed.length ? `${unreviewed.length} capitoli non ancora marcati come rivisti.` : 'Tutti i capitoli sono marcati come rivisti.');
  add('revisione.conferma', 'Conferma finale di revisione umana', 'critico', project.kdp.humanReviewConfirmed, project.kdp.humanReviewConfirmed ? 'Confermata dall’utente.' : 'Da confermare nel KDP Kit.');
  const unverified = project.sources.filter((s) => !s.verified);
  add('fonti.elenco', 'Fonti in elenco verificate', 'avviso', unverified.length === 0, unverified.length ? `${unverified.length} fonti non verificate: escluse dalla bibliografia.` : 'Nessuna fonte non verificata.');

  // --- Metadati e dichiarazioni ---
  add('meta.titolo', 'Titolo e autore presenti', 'critico', Boolean(project.title.trim() && project.author.trim()), project.author.trim() ? 'Presenti.' : 'Manca il nome autore.');
  const desc = project.kdp.description.trim();
  add('meta.descrizione', 'Descrizione presente (max 4000 caratteri)', 'critico', desc.length > 0 && desc.length <= 4000, desc ? `${desc.length} caratteri.` : 'Descrizione mancante.');
  const kw = project.kdp.keywords.filter((k) => k.trim());
  add('meta.keyword', '7 parole chiave', 'avviso', kw.length === 7, `${kw.length} parole chiave su 7.`);
  add('meta.keyword.min', 'Almeno una parola chiave, massimo 7', 'critico', kw.length >= 1 && kw.length <= 7, `${kw.length} parole chiave.`);
  const cats = project.kdp.categories.filter((c) => c.trim());
  add('meta.categorie', 'Da 1 a 3 categorie', 'critico', cats.length >= 1 && cats.length <= 3, `${cats.length} categorie.`);
  const anyAi = chapters.some((c) => c.aiGenerated);
  add('ia.dichiarazione', 'Dichiarazione IA coerente con il contenuto', 'critico', !(anyAi && project.kdp.aiText === 'none'),
    anyAi && project.kdp.aiText === 'none' ? 'Ci sono capitoli generati da IA ma la dichiarazione indica "nessun testo IA".' : `Testo: ${project.kdp.aiText}; immagini: ${project.kdp.aiImages}; traduzioni: ${project.kdp.aiTranslation}.`);
  add('diritti', 'Diritti e proprietà confermati', 'critico', project.kdp.rightsConfirmed, project.kdp.rightsConfirmed ? 'Confermati dall’utente.' : 'Da confermare nel KDP Kit.');

  // --- PDF interno ---
  const trim = TRIM_SIZES[project.layout.trim];
  const b = project.layout.bleed ? BLEED_IN : 0;
  const sizeOk = interior.sizes.length === 1 && near(interior.sizes[0].widthIn, trim.widthIn + b) && near(interior.sizes[0].heightIn, trim.heightIn + 2 * b);
  add('pdf.formato', 'PDF interno: formato pagina uniforme e corretto', 'critico', sizeOk, `Atteso ${trim.widthIn + b} × ${trim.heightIn + 2 * b} in; trovato ${interior.sizes.map((s) => `${s.widthIn} × ${s.heightIn} in (${s.pages} pag.)`).join(', ')}.`);
  add('pdf.pagine', `PDF interno: tra ${MIN_PAGES} e ${MAX_PAGES} pagine`, 'critico', interior.pageCount >= MIN_PAGES && interior.pageCount <= MAX_PAGES, `${interior.pageCount} pagine.`);
  const notEmb = interior.fonts.filter((f) => !f.embedded);
  add('pdf.font', 'PDF interno: font incorporati', 'critico', interior.fonts.length > 0 && notEmb.length === 0, notEmb.length ? `Non incorporati: ${notEmb.map((f) => f.name).join(', ')}.` : `${interior.fonts.length} font, tutti incorporati.`);

  // --- Copertina ---
  const cs = cover.sizes[0];
  add('cover.dimensioni', 'Copertina: dimensioni calcolate dal numero di pagine reale', 'critico', cover.pageCount === 1 && near(cs.widthIn, g.fullWidthIn) && near(cs.heightIn, g.fullHeightIn) && g.pageCount === interior.pageCount,
    `Dorso ${g.spineIn} in per ${g.pageCount} pagine (${project.layout.paper === 'cream' ? 'carta crema' : 'carta bianca'}); file ${cs.widthIn} × ${cs.heightIn} in, atteso ${g.fullWidthIn} × ${g.fullHeightIn} in.`);
  const cNotEmb = cover.fonts.filter((f) => !f.embedded);
  add('cover.font', 'Copertina: font incorporati', 'critico', cNotEmb.length === 0, cNotEmb.length ? `Non incorporati: ${cNotEmb.map((f) => f.name).join(', ')}.` : 'Tutti incorporati.');
  add('cover.dorso', 'Testo sul dorso', 'info', true, g.spineTextAllowed ? 'Titolo e autore sul dorso.' : 'Meno di 79 pagine: dorso senza testo, come richiesto da KDP.');
  add('cover.testi', 'Copertina: titolo e autore compilati', 'critico', Boolean(project.cover.title.trim() && project.cover.author.trim()), project.cover.author.trim() ? 'Presenti.' : 'Manca titolo o autore in copertina.');
  add('cover.ebook', 'Cover eBook JPEG 1600 × 2560', 'critico', input.ebookCover.format === 'jpeg' && input.ebookCover.width === 1600 && input.ebookCover.height === 2560, `${input.ebookCover.format.toUpperCase()} ${input.ebookCover.width} × ${input.ebookCover.height} px.`);

  // --- eBook / DOCX ---
  add('epub.struttura', 'EPUB: struttura valida (verifica interna)', 'critico', input.epub.ok, input.epub.ok ? 'mimetype, container, OPF, manifest, spine, nav e XHTML ben formati.' : input.epub.problems.join('; '));
  add('epub.epubcheck', 'EPUB: validazione con epubcheck', 'avviso', input.epubcheck ? input.epubcheck.ok : 'skip', input.epubcheck ? input.epubcheck.detail : 'Non eseguita (EPUBCHECK_JAR non configurato): validare con epubcheck o Kindle Previewer.');
  add('docx.struttura', 'DOCX: struttura valida (verifica interna)', 'critico', input.docx.ok, input.docx.ok ? 'Parti OOXML presenti e ben formate.' : input.docx.problems.join('; '));

  // --- Bonus e passaggi manuali ---
  const total = chapters.reduce((n, c) => n + wordCount(c.content), 0);
  add('bonus.limite', 'Bonus entro il 10% del libro (se inserito nel libro)', 'info', true, `Bonus scaricabile separato: ${input.bonusWords} parole (${total ? Math.round((input.bonusWords / total) * 100) : 0}% del testo). Non è incluso nel manoscritto.`);
  add('manuale.previewer', 'Anteprima nel KDP Previewer', 'info', 'skip', 'Passaggio manuale: caricare i file su KDP e controllare l’anteprima ufficiale.');
  add('manuale.prova', 'Copia di prova cartacea', 'info', 'skip', 'Consigliata prima della pubblicazione.');

  const kdpReady = checks.every((c) => c.severity !== 'critico' || c.result === 'ok');
  return { checks, kdpReady, issues };
}
