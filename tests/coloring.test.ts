import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { mandalaSvg } from '../src/lib/coloring/mandala';
import { LineArtError, sanitizeLineArt } from '../src/lib/coloring/svg';
import { BundleSchema } from '../src/lib/bundle-schema';
import { withBrowser } from '../src/lib/export/chromium';
import { renderInterior } from '../src/lib/export/interior';
import { buildKit } from '../src/lib/export/kit';
import { coloringLayout, defaultColoring } from '../src/lib/defaults';
import type { BookBundle, ColoringPage } from '../src/lib/types';
import { sampleBundle } from './fixtures';

const OUT = path.resolve('test-output/coloring');
const NOW = new Date('2026-11-16T10:00:00Z');

/** Un pesciolino scritto a mano: serve a provare il percorso «IA → SVG» senza chiamare il modello. */
const FISH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
<ellipse cx="480" cy="480" rx="260" ry="170" stroke="#000" fill="none" stroke-width="7"/>
<path d="M730 480 L900 360 L900 600 Z" stroke="#000" fill="none" stroke-width="7"/>
<circle cx="360" cy="430" r="34" stroke="#000" fill="none"/><circle cx="368" cy="430" r="12" fill="#000"/>
<path d="M330 560 Q400 610 470 560" stroke="#000" fill="none"/>
<path d="M440 330 Q520 230 600 340" stroke="#000" fill="none"/>
<circle cx="200" cy="300" r="26"/><circle cx="150" cy="220" r="18"/><circle cx="215" cy="150" r="12"/>
<path d="M150 900 Q110 800 160 730 Q210 800 150 900Z"/><path d="M260 900 Q230 820 270 760 Q310 820 260 900Z"/>
<path d="M60 920 H940"/>
</svg>`;

function page(i: number, svg: string, title: string): ColoringPage {
  return { id: `p${i}`, title, source: i % 2 ? 'mandala' : 'ia', svg, image: null, width: 0, height: 0, prompt: 'test', aiGenerated: i % 2 === 0, seed: i };
}

function coloringBundle(n = 12): BookBundle {
  const b = sampleBundle({ chapters: 1, real: true });
  b.chapters = [];
  b.project.kind = 'coloring';
  b.project.layout = coloringLayout();
  b.project.title = 'Animali del mare da colorare';
  b.project.coloring = { ...defaultColoring(), pages: Array.from({ length: n }, (_, i) => page(i, i % 2 ? sanitizeLineArt(mandalaSvg(i + 1)) : sanitizeLineArt(FISH), `Disegno ${i + 1}`)) };
  b.project.kdp.aiImages = 'generated';
  return b;
}

describe('disegni al tratto', () => {
  it('il sanificatore accetta un disegno pulito e lo ricostruisce in nero su bianco', () => {
    const out = sanitizeLineArt(FISH);
    expect(out).toContain('viewBox="0 0 1000 1300"');
    expect(out).not.toMatch(/script|href|style/i);
    expect(out).toContain('stroke="#000000"');
  });

  it.each([
    ['script', '<svg viewBox="0 0 1000 1000"><script>alert(1)</script></svg>'],
    ['immagine esterna', '<svg><image href="http://x/y.png"/></svg>'],
    ['evento', '<svg><circle cx="1" cy="1" r="5" onload="x()"/></svg>'],
    ['testo', '<svg><text x="1" y="1">ciao</text></svg>'],
    ['url()', '<svg><circle cx="1" cy="1" r="5" fill="url(#a)"/></svg>'],
    ['non svg', '<html></html>'],
    ['troppo povero', '<svg><circle cx="500" cy="500" r="50"/></svg>'],
    ['non chiuso', '<svg><g><circle cx="1" cy="1" r="5"/></svg>'],
  ])('rifiuta: %s', (_n, src) => expect(() => sanitizeLineArt(src)).toThrow(LineArtError));

  it('i colori non ammessi diventano nero/niente: nessun grigio né colore', () => {
    const colored = FISH.replace('stroke="#000" fill="none" stroke-width="7"/>\n<path d="M730', 'stroke="#ff0000" fill="#00ff00" stroke-width="7"/>\n<path d="M730');
    const out = sanitizeLineArt(colored);
    expect(out).not.toMatch(/#ff0000|#00ff00/i);
  });

  it('i mandala sono deterministici, validi e diversi tra loro', () => {
    expect(mandalaSvg(5)).toBe(mandalaSvg(5));
    expect(mandalaSvg(5)).not.toBe(mandalaSvg(6));
    for (let i = 1; i <= 8; i++) expect(() => sanitizeLineArt(mandalaSvg(i))).not.toThrow();
  });
});

describe('libro da colorare: impaginazione e kit', () => {
  it('il pacchetto è valido per lo schema, anche senza capitoli', () => {
    expect(BundleSchema.safeParse(JSON.parse(JSON.stringify(coloringBundle()))).success).toBe(true);
    const empty = coloringBundle();
    empty.project.coloring!.pages = [];
    expect(BundleSchema.safeParse(JSON.parse(JSON.stringify(empty))).success).toBe(false);
  });

  it('PDF interno: disegno su pagine dispari, pagina bianca dietro, indice con le pagine reali', async () => {
    mkdirSync(OUT, { recursive: true });
    const bundle = coloringBundle(12);
    const r = await withBrowser((b) => renderInterior(bundle, b, 2026));
    writeFileSync(path.join(OUT, 'interno.pdf'), r.pdf);
    const designs = r.toc.filter((t) => t.title.startsWith('Disegno'));
    expect(designs).toHaveLength(12);
    designs.forEach((d, i) => {
      expect(d.page % 2).toBe(1); // sempre a destra
      if (i) expect(d.page - designs[i - 1].page).toBe(2); // una pagina bianca in mezzo
    });
    expect(r.pageCount).toBe(designs[11].page);
    expect(r.pageCount).toBeGreaterThanOrEqual(24);
    // L'indice stampato contiene davvero quei numeri.
    const text = execFileSync('pdftotext', ['-f', '5', '-l', '6', '-layout', path.join(OUT, 'interno.pdf'), '-'], { encoding: 'utf8' });
    expect(text).toContain('Indice');
    expect(text).toContain(`Disegno 12`);
    expect(text).toContain(String(designs[11].page));
    // Foglio di controllo visivo di alcune pagine.
    execFileSync('pdftoppm', ['-png', '-r', '40', '-f', '1', '-l', '12', path.join(OUT, 'interno.pdf'), path.join(OUT, 'pag')]);
  }, 180_000);

  it('senza indice nel libro non viene stampato; con indice il numero di pagine cambia', async () => {
    const a = coloringBundle(6);
    a.project.coloring!.toc = false;
    const b = coloringBundle(6);
    const [ra, rb] = await withBrowser(async (br) => [await renderInterior(a, br, 2026), await renderInterior(b, br, 2026)] as const);
    expect(ra.toc.filter((t) => t.title === 'Indice')).toHaveLength(0);
    expect(rb.pageCount).toBeGreaterThan(ra.pageCount - 1);
  }, 180_000);

  it('kit: solo cartaceo (niente EPUB/DOCX), dorso dal numero di pagine reale, QA coerente', async () => {
    const bundle = coloringBundle(14);
    const kit = await withBrowser((b) => buildKit(bundle, b, NOW));
    const zip = await JSZip.loadAsync(kit.zip);
    const names = Object.keys(zip.files);
    expect(names).toContain('manuscript.pdf');
    expect(names).toContain('cover-print.pdf');
    expect(names.some((n) => n.endsWith('.epub') || n.endsWith('.docx') || n.startsWith('bonus/'))).toBe(false);
    const id = (x: string) => kit.checks.find((c) => c.id === x);
    expect(id('colora.disegni')?.result).toBe('ok');
    expect(id('colora.quantita')?.result).toBe('fallito'); // meno di 25: solo avviso
    expect(id('colora.ia')?.result).toBe('ok');
    expect(id('cover.dimensioni')?.result).toBe('ok');
    expect(id('epub.struttura')).toBeUndefined();
    expect(id('contenuto.capitoli')).toBeUndefined();
    expect(kit.kdpReady).toBe(true); // tutti i controlli critici ok; «meno di 25 disegni» è solo un avviso
    const unconfirmed = coloringBundle(14);
    unconfirmed.project.kdp.rightsConfirmed = false;
    const k2 = await withBrowser((b) => buildKit(unconfirmed, b, NOW));
    expect(k2.kdpReady).toBe(false);
    expect(k2.checks.find((c) => c.id === 'colora.copyright')).toMatchObject({ result: 'fallito', severity: 'critico' });
  }, 240_000);

  it('QA: disegni IA con dichiarazione «nessuna immagine IA» bloccano; pagine senza disegno bloccano', async () => {
    const ai = coloringBundle(14);
    ai.project.kdp.aiImages = 'none';
    const empty = coloringBundle(14);
    empty.project.coloring!.pages[3] = { ...empty.project.coloring!.pages[3], svg: null, image: null };
    const [k1, k2] = await withBrowser(async (b) => [await buildKit(ai, b, NOW), await buildKit(empty, b, NOW)] as const);
    expect(k1.checks.find((c) => c.id === 'colora.ia')).toMatchObject({ result: 'fallito', severity: 'critico' });
    expect(k2.checks.find((c) => c.id === 'colora.disegni')).toMatchObject({ result: 'fallito', severity: 'critico' });
  }, 300_000);
});
