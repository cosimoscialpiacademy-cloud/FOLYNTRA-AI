/**
 * KDP PUBLISH KIT: produce tutti i file, esegue il QA e crea lo ZIP con
 * manifest SHA-256. Non pubblica nulla: il caricamento su KDP è manuale.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import sharp from 'sharp';
import type { Browser } from 'playwright-core';
import { inlineToXhtml, lex } from '../book/markdown';
import { runQa } from '../kdp/qa';
import { ebookRoyalty, priceLadder } from '../kdp/royalty';
import { MARKETPLACES, TRIM_SIZES, coverGeometry } from '../kdp/specs';
import type { BookBundle, ExportFile, QaCheck } from '../types';
import { escapeXml, slugify, wordCount } from '../utils';
import { newOfflinePage } from './chromium';
import { renderCoverPdf, renderEbookCoverJpg } from './cover-render';
import { buildDocx, validateDocx } from './docx';
import { buildEpub, validateEpub } from './epub';
import { FONT_LICENSE_NOTE, fontFaceCss } from './fonts';
import { renderInterior, sortedChapters } from './interior';
import { inspectPdf } from './pdf-inspect';

export interface KitResult {
  zip: Uint8Array;
  fileName: string;
  files: ExportFile[];
  checks: QaCheck[];
  kdpReady: boolean;
  pageCount: number;
}

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

/** Descrizione KDP: solo i tag HTML ammessi (p, b, i, br, ul/ol/li). */
export function descriptionToKdpHtml(text: string): string {
  return lex(text)
    .map((t) => {
      if (t.type === 'paragraph' || t.type === 'text' || t.type === 'heading') return `<p>${inlineToXhtml('tokens' in t ? t.tokens : undefined)}</p>`;
      if (t.type === 'list') return `<${t.ordered ? 'ol' : 'ul'}>${(t.items as { tokens: unknown[] }[]).map((it) => `<li>${inlineToXhtml((it.tokens[0] as { tokens?: never[] })?.tokens)}</li>`).join('')}</${t.ordered ? 'ol' : 'ul'}>`;
      return '';
    })
    .join('\n')
    .replace(/<(\/?)strong>/g, '<$1b>')
    .replace(/<(\/?)em>/g, '<$1i>')
    .replace(/<\/?(a|code|del)[^>]*>/g, '');
}

/** Bonus: quaderno operativo derivato dall'indice (non ripete il testo del libro). */
function bonusHtml(bundle: BookBundle, fonts: string): { html: string; words: number } {
  const { project } = bundle;
  const e = escapeXml;
  const pages = sortedChapters(bundle.chapters).map((c) => {
    const points = c.sections.length ? c.sections : ['Punto chiave 1', 'Punto chiave 2', 'Punto chiave 3'];
    return `<section><p class="k">Scheda ${c.position}</p><h2>${e(c.title)}</h2>
<h3>Ho messo in pratica</h3><ul class="cb">${points.map((s) => `<li><span class="box"></span>${e(s)}</li>`).join('')}</ul>
<h3>La cosa più utile che ho imparato</h3><div class="lines l3"></div>
<h3>La mia prossima azione concreta</h3><div class="lines l2"></div>
<h3>Entro quando</h3><div class="lines l1"></div></section>`;
  });
  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><title>Quaderno operativo</title><style>${fonts}
@page{size:A4;margin:22mm 20mm} body{font-family:'EB Garamond',serif;font-size:12pt;color:#111;margin:0}
h1{font-family:'Playfair Display',serif;font-size:30pt;margin:60mm 0 6mm} .sub{font-style:italic;font-size:14pt} .note{margin-top:20mm;font-size:10pt;color:#444}
section{break-before:page} .k{font-family:'Inter',sans-serif;font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:#555;margin:0}
h2{font-family:'Playfair Display',serif;font-size:20pt;margin:2mm 0 8mm} h3{font-family:'Inter',sans-serif;font-size:9.5pt;letter-spacing:.06em;text-transform:uppercase;margin:9mm 0 3mm}
ul.cb{list-style:none;padding:0;margin:0} ul.cb li{margin:2.5mm 0} .box{display:inline-block;width:3.6mm;height:3.6mm;border:.5pt solid #111;margin-right:3mm;vertical-align:-.4mm}
.lines{background:repeating-linear-gradient(to bottom,transparent 0,transparent 8.6mm,#888 8.6mm,#888 8.8mm)} .l1{height:9mm}.l2{height:18mm}.l3{height:27mm}</style></head><body>
<h1>Quaderno operativo</h1><p class="sub">Schede di lavoro per «${e(project.title)}»</p><p class="note">Materiale bonus da stampare. Una scheda per capitolo: spunta ciò che hai applicato e annota la tua prossima azione.</p>
${pages.join('\n')}</body></html>`;
  return { html, words: wordCount(html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ')) };
}

async function maybeEpubcheck(epub: Uint8Array): Promise<{ ok: boolean; detail: string } | undefined> {
  const jar = process.env.EPUBCHECK_JAR;
  if (!jar || !existsSync(jar)) return undefined;
  const dir = await mkdtemp(path.join(tmpdir(), 'folyntra-epub-'));
  try {
    const file = path.join(dir, 'ebook.epub');
    await writeFile(file, epub);
    const { stdout, stderr } = await promisify(execFile)('java', ['-jar', jar, file], { timeout: 120_000 }).catch((err: { stdout?: string; stderr?: string }) => ({ stdout: err.stdout ?? '', stderr: err.stderr ?? 'epubcheck non avviabile' }));
    const out = `${stdout}\n${stderr}`;
    const ok = /No errors or warnings detected|Messages: 0 fatals? \/ 0 errors? \/ 0 warnings?/.test(out);
    const summary = out.match(/Messages:[^\n]*/)?.[0] ?? out.trim().split('\n').slice(-2).join(' ');
    return { ok, detail: `epubcheck eseguito: ${summary}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function buildKit(bundle: BookBundle, browser: Browser, now = new Date()): Promise<KitResult> {
  const { project, chapters } = bundle;
  const m = MARKETPLACES[project.marketplace];

  // 1. Interno → numero di pagine REALE → geometria copertina (docs/05 §5).
  const interior = await renderInterior(bundle, browser, now.getFullYear());
  const geometry = coverGeometry(project.layout.trim, interior.pageCount, project.layout.paper);
  const [coverPdf, coverJpg] = await Promise.all([renderCoverPdf(browser, project.cover, geometry), renderEbookCoverJpg(browser, project.cover)]);
  const [epub, docx] = await Promise.all([buildEpub(bundle, coverJpg, now), buildDocx(bundle, now.getFullYear())]);

  const fonts = await fontFaceCss(['EB Garamond', 'Playfair Display', 'Inter']);
  const bonus = bonusHtml(bundle, fonts);
  const bp = await newOfflinePage(browser);
  let bonusPdf: Uint8Array;
  try {
    await bp.setContent(bonus.html, { waitUntil: 'load' });
    bonusPdf = await bp.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await bp.context().close();
  }

  // 2. QA sui file realmente prodotti.
  const jpgMeta = await sharp(coverJpg).metadata();
  const qa = runQa({
    bundle,
    interior: await inspectPdf(interior.pdf),
    cover: await inspectPdf(coverPdf),
    coverGeometry: geometry,
    ebookCover: { width: jpgMeta.width ?? 0, height: jpgMeta.height ?? 0, format: jpgMeta.format ?? 'sconosciuto' },
    epub: await validateEpub(epub),
    docx: await validateDocx(docx),
    bonusWords: bonus.words,
    epubcheck: await maybeEpubcheck(epub),
  });

  // 3. Documenti di accompagnamento.
  const trim = TRIM_SIZES[project.layout.trim];
  const ladder = priceLadder(project.marketplace, interior.pageCount, project.kdp.listPricePaperback);
  const ebook = ebookRoyalty({ listPrice: project.kdp.listPriceEbook, marketplace: project.marketplace });
  const stato = qa.kdpReady ? 'PACCHETTO PRONTO PER IL CARICAMENTO MANUALE' : 'BOZZA — NON PRONTO PER KDP';
  const metadata = {
    stato,
    generatoIl: now.toISOString(),
    titolo: project.title, sottotitolo: project.subtitle, autore: project.author,
    lingua: m.language, marketplace: project.marketplace,
    paroleChiave: project.kdp.keywords.filter((k) => k.trim()).slice(0, 7),
    categorie: project.kdp.categories.filter((c) => c.trim()).slice(0, 3),
    descrizioneHtml: descriptionToKdpHtml(project.kdp.description),
    cartaceo: { formato: `${trim.widthIn} x ${trim.heightIn} in`, carta: project.layout.paper === 'cream' ? 'crema' : 'bianca', inchiostro: 'nero', abbondanzaInterno: project.layout.bleed, pagine: interior.pageCount, dorsoIn: geometry.spineIn, copertinaIn: `${geometry.fullWidthIn} x ${geometry.fullHeightIn}`, finitura: 'a scelta su KDP (opaca/lucida)' },
    prezzi: { nota: 'SIMULAZIONE: verificare con il calcolatore ufficiale KDP. Non è una previsione di vendita.', valuta: m.currency, cartaceo: ladder, ebook },
    parole: chapters.reduce((n, c) => n + wordCount(c.content), 0),
  };
  const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const metadataCsv = ['campo,valore', ...[['titolo', project.title], ['sottotitolo', project.subtitle], ['autore', project.author], ['lingua', m.language], ['marketplace', project.marketplace], ...metadata.paroleChiave.map((k, i) => [`parola_chiave_${i + 1}`, k]), ...metadata.categorie.map((c, i) => [`categoria_${i + 1}`, c]), ['pagine', String(interior.pageCount)], ['prezzo_cartaceo', String(project.kdp.listPricePaperback)], ['prezzo_ebook', String(project.kdp.listPriceEbook)]].map((r) => r.map(csvCell).join(','))].join('\n');

  const aiLabel = { none: 'nessun contenuto generato da IA', assisted: 'IA usata solo come assistenza (editing/idee) su contenuto dell’autore', generated: 'contenuto GENERATO da IA (da dichiarare a KDP)' } as const;
  const aiDisclosure = {
    nota: 'KDP richiede di dichiarare testo, immagini e traduzioni generati da IA. L’utente resta responsabile della dichiarazione. Fonte: https://kdp.amazon.com/it_IT/help/topic/G200672390',
    testo: { valore: project.kdp.aiText, significato: aiLabel[project.kdp.aiText] },
    immagini: { valore: project.kdp.aiImages, significato: aiLabel[project.kdp.aiImages], nota: 'La copertina è generata da template vettoriali del software, senza modelli di generazione immagini.' },
    traduzioni: { valore: project.kdp.aiTranslation, significato: aiLabel[project.kdp.aiTranslation] },
    capitoli: sortedChapters(chapters).map((c) => ({ posizione: c.position, titolo: c.title, origineTesto: c.generatedBy, generatoDaIa: c.aiGenerated, stato: c.status })),
    revisioneUmanaConfermata: project.kdp.humanReviewConfirmed,
  };
  const mark = (c: QaCheck) => (c.result === 'ok' ? '[x]' : '[ ]');
  const icon = (c: QaCheck) => (c.result === 'ok' ? 'OK' : c.result === 'fallito' ? 'FALLITO' : 'NON ESEGUITO');
  const qaMd = `# Report QA — ${project.title}\n\n**Stato: ${stato}**\n\nGenerato il ${now.toISOString()}. Controlli critici falliti o non eseguiti bloccano lo stato "pronto".\n\n| Esito | Gravità | Controllo | Dettaglio |\n|---|---|---|---|\n${qa.checks.map((c) => `| ${icon(c)} | ${c.severity} | ${c.label} | ${c.detail.replace(/\|/g, '/')} |`).join('\n')}\n\n## Segnalazioni sul testo\n\n${qa.issues.length ? qa.issues.map((i) => `- [${i.severity}] ${i.chapterTitle}: ${i.message}${i.excerpt ? ` — «${i.excerpt}»` : ''}`).join('\n') : 'Nessuna segnalazione.'}\n\n## Test non eseguiti da questo software\n\n- Kindle Previewer / KDP Previewer (manuale).\n- Verifica antiplagio e verifica dei fatti: restano responsabilità dell’autore.\n- ${FONT_LICENSE_NOTE}\n`;
  const checklist = `# Checklist KDP — ${project.title}\n\n**Stato del pacchetto: ${stato}**\n\nFile preparati per upload manuale. Amazon verifica e approva la pubblicazione.\n\n## Controlli automatici\n\n${qa.checks.filter((c) => c.severity !== 'info').map((c) => `- ${mark(c)} ${c.label} — ${c.detail}`).join('\n')}\n\n## Da fare a mano sul tuo account KDP\n\n- [ ] Autore/proprietà e diritti confermati; contenuti originali, font e asset licenziati\n- [ ] Titolo/sottotitolo/categorie/keyword coerenti e non fuorvianti\n- [ ] Dichiarazione IA compilata come in \`ai-disclosure.json\`\n- [ ] Caricato \`manuscript.pdf\` e controllato nel Previewer (margini, pagine, indice)\n- [ ] Caricato \`cover-print.pdf\` e controllato dorso e aree sicure nel Previewer\n- [ ] Caricato \`ebook.epub\` + \`cover-ebook.jpg\` e controllato in Kindle Previewer\n- [ ] Prezzo verificato con il calcolatore ufficiale KDP\n- [ ] Copia di prova cartacea ordinata e controllata (consigliato)\n- [ ] Backup di questo ZIP conservato\n- [ ] Rispetto del limite KDP sui nuovi titoli a settimana\n`;
  const guide = `# Guida al caricamento manuale su KDP\n\nNon esiste un’API pubblica KDP: questo software NON pubblica al posto tuo.\n\n1. Accedi a https://kdp.amazon.com e scegli **Crea** → Kindle eBook oppure Copertina flessibile.\n2. **Dettagli**: copia titolo, sottotitolo, autore, descrizione (\`description.html\`), parole chiave e categorie da \`metadata.json\`.\n3. **Contenuti generati dall’IA**: rispondi come indicato in \`ai-disclosure.json\`.\n4. **Cartaceo**: formato ${trim.widthIn} × ${trim.heightIn} in, carta ${project.layout.paper === 'cream' ? 'crema' : 'bianca'}, inchiostro nero, ${project.layout.bleed ? 'con' : 'senza'} abbondanza. Carica \`manuscript.pdf\` (${interior.pageCount} pagine) e \`cover-print.pdf\` (dorso ${geometry.spineIn} in).\n5. **eBook**: carica \`ebook.epub\` e \`cover-ebook.jpg\`.\n6. Apri il **Previewer** e controlla ogni pagina. Correggi qui e riesporta se serve.\n7. **Prezzi**: i valori in \`royalty-simulation.json\` sono simulazioni; conferma con il calcolatore KDP.\n8. Invia per la revisione. Solo dopo l’approvazione di Amazon il libro è pubblicato.\n\n\`editable.docx\` serve per modifiche in Word; \`bonus/\` contiene materiale scaricabile separato.\n`;
  const rights = `# Diritti e responsabilità\n\n- Autore dichiarato: ${project.author || '(da compilare)'}\n- Conferma diritti da parte dell’utente: ${project.kdp.rightsConfirmed ? 'SÌ' : 'NO — da confermare prima di pubblicare'}\n- Testi: responsabilità dell’autore per originalità, veridicità e fonti. Nessuna certificazione di originalità è fornita dal software.\n- Copertina: grafica vettoriale originale generata da template FOLYNTRA; nessuna immagine stock.\n- ${FONT_LICENSE_NOTE}\n- Fonti verificate dall’autore: ${project.sources.filter((s) => s.verified).length}; non verificate (escluse dalla bibliografia): ${project.sources.filter((s) => !s.verified).length}.\n`;

  const entries: [string, Uint8Array | string][] = [
    ['manuscript.pdf', interior.pdf],
    ['cover-print.pdf', coverPdf],
    ['cover-ebook.jpg', coverJpg],
    ['ebook.epub', epub],
    ['editable.docx', docx],
    ['bonus/quaderno-operativo.pdf', bonusPdf],
    ['metadata.json', JSON.stringify(metadata, null, 2)],
    ['metadata.csv', metadataCsv],
    ['description.html', metadata.descrizioneHtml],
    ['royalty-simulation.json', JSON.stringify(metadata.prezzi, null, 2)],
    ['ai-disclosure.json', JSON.stringify(aiDisclosure, null, 2)],
    ['diritti.md', rights],
    ['kdp-checklist.md', checklist],
    ['guida-caricamento-kdp.md', guide],
    ['qa-report.md', qaMd],
    ['qa-report.json', JSON.stringify({ stato, kdpReady: qa.kdpReady, checks: qa.checks, issues: qa.issues }, null, 2)],
  ];
  const enc = new TextEncoder();
  const files: ExportFile[] = entries.map(([name, data]) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    return { name, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const manifest = { prodotto: 'FOLYNTRA AI — KDP Publish Kit', stato, kdpReady: qa.kdpReady, generatoIl: now.toISOString(), pagine: interior.pageCount, algoritmo: 'SHA-256', files };
  const zip = new JSZip();
  for (const [name, data] of entries) zip.file(name, data, { date: now });
  zip.file('manifest.json', JSON.stringify(manifest, null, 2), { date: now });
  const zipData = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { zip: zipData, fileName: `${slugify(project.title)}-kdp-kit${qa.kdpReady ? '' : '-BOZZA'}.zip`, files, checks: qa.checks, kdpReady: qa.kdpReady, pageCount: interior.pageCount };
}
