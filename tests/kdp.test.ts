import { describe, expect, it } from 'vitest';
import { analyzeManuscript, checkRecipeConsistency, findDuplicates } from '../src/lib/book/analysis';
import { markdownToXhtml } from '../src/lib/book/markdown';
import { frontCoverSvg, fullCoverSvg } from '../src/lib/export/cover-svg';
import { ebookRoyalty, paperbackRoyalty } from '../src/lib/kdp/royalty';
import { coverGeometry, insideMarginIn, pageGeometry, spineWidthIn } from '../src/lib/kdp/specs';
import { projectPercent, projectSteps } from '../src/lib/progress';
import { sampleBundle } from './fixtures';

describe('geometria KDP', () => {
  it('dorso = pagine × spessore carta', () => {
    expect(spineWidthIn(200, 'white')).toBeCloseTo(0.4504, 4);
    expect(spineWidthIn(200, 'cream')).toBeCloseTo(0.5, 4);
    expect(() => spineWidthIn(0, 'white')).toThrow();
  });
  it('copertina completa con abbondanza e regola del testo sul dorso', () => {
    const g = coverGeometry('6x9', 200, 'cream');
    expect(g.fullWidthIn).toBeCloseTo(12.75, 4);
    expect(g.fullHeightIn).toBeCloseTo(9.25, 4);
    expect(g.spineTextAllowed).toBe(true);
    expect(coverGeometry('6x9', 78, 'cream').spineTextAllowed).toBe(false);
  });
  it('gabbia per fasce di pagine e pagina con abbondanza', () => {
    expect([24, 150, 151, 301, 501, 701].map(insideMarginIn)).toEqual([0.375, 0.375, 0.5, 0.625, 0.75, 0.875]);
    const g = pageGeometry('6x9', 100, true);
    expect(g.pageWidthIn).toBe(6.125);
    expect(g.pageHeightIn).toBe(9.25);
  });
});

describe('royalty (stime)', () => {
  it('soglia 9,99 €: 60% sopra, 50% sotto, al netto IVA e stampa', () => {
    const hi = paperbackRoyalty({ listPrice: 12.99, marketplace: 'amazon.it', pageCount: 150, printingCostOverride: 2.5 });
    expect(hi.rate).toBe(0.6);
    expect(hi.royalty).toBeCloseTo(0.6 * (12.99 / 1.04) - 2.5, 2);
    expect(paperbackRoyalty({ listPrice: 9.98, marketplace: 'amazon.it', pageCount: 150 }).rate).toBe(0.5);
    expect(paperbackRoyalty({ listPrice: 7.99, marketplace: 'amazon.co.uk', pageCount: 150 }).rate).toBe(0.6);
  });
  it('prezzo troppo basso dà royalty negativa, non un numero abbellito', () => {
    expect(paperbackRoyalty({ listPrice: 2, marketplace: 'amazon.com', pageCount: 300 }).royalty).toBeLessThan(0);
  });
  it('eBook 70% solo nell’intervallo', () => {
    expect(ebookRoyalty({ listPrice: 4.99, marketplace: 'amazon.com' }).rate).toBe(0.7);
    expect(ebookRoyalty({ listPrice: 0.99, marketplace: 'amazon.com' }).rate).toBe(0.35);
  });
});

describe('controlli editoriali', () => {
  it('segnala mock, segnaposto, fonti mancanti e capitoli vuoti come critici', () => {
    const b = sampleBundle({ chapters: 5 });
    b.chapters[1] = { ...b.chapters[1], generatedBy: 'human', content: '## Cosa serve davvero\n\nTesto con [FONTE MANCANTE: dato sul consumo] e [TODO rivedere] ancora dentro al paragrafo di prova.' };
    b.chapters[2] = { ...b.chapters[2], content: '', generatedBy: 'none' };
    const issues = analyzeManuscript(b.project, b.chapters);
    expect(issues.some((i) => i.kind === 'mock' && i.severity === 'critico')).toBe(true);
    expect(issues.filter((i) => i.chapterId === b.chapters[1].id).map((i) => i.kind)).toEqual(expect.arrayContaining(['fonte', 'segnaposto', 'indice']));
    expect(issues.some((i) => i.chapterId === b.chapters[2].id && i.message === 'Capitolo vuoto.')).toBe(true);
  });
  it('trova paragrafi duplicati tra capitoli', () => {
    const b = sampleBundle({ chapters: 5, real: true });
    const texts = [
      'La caldaia va controllata ogni anno da un tecnico abilitato, che verifica la combustione, pulisce il bruciatore e rilascia il rapporto di efficienza energetica previsto.',
      'Per sostituire una guarnizione del rubinetto si chiude prima la valvola generale, poi si smonta la manopola con un cacciavite e si estrae il vitone con una chiave regolabile.',
      'Le pareti con macchie di umidità vanno prima asciugate e trattate con un prodotto antimuffa, quindi ritinteggiate con una pittura traspirante adatta agli ambienti interni.',
    ];
    const chapters = texts.map((t, i) => ({ ...b.chapters[i], content: `## Sezione\n\n${t}` }));
    expect(findDuplicates(chapters)).toEqual([]);
    chapters[2] = { ...chapters[2], content: `${chapters[2].content}\n\n${texts[0]}` };
    const d = findDuplicates(chapters);
    expect(d).toHaveLength(1);
    expect(d[0].chapterId).toBe(chapters[2].id);
  });
  it('ricette: ingrediente mai usato nel procedimento', () => {
    const b = sampleBundle({ chapters: 5, real: true });
    const c = { ...b.chapters[0], content: '### Torta\n\n#### Ingredienti\n\n- 200 g di farina\n- 3 uova\n- 100 g di zucchero\n\n#### Procedimento\n\n1. Mescola la farina con le uova.\n2. Inforna.' };
    const r = checkRecipeConsistency(c);
    expect(r).toHaveLength(1);
    expect(r[0].excerpt).toMatch(/zucchero/);
  });
});

describe('markdown e copertine', () => {
  it('l’HTML nel testo non viene mai eseguito', () => {
    const html = markdownToXhtml('Ciao <script>alert(1)</script> **forte**\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))');
    expect(html).not.toMatch(/<script|<img|javascript:/);
    expect(html).toContain('<strong>forte</strong>');
  });
  it('tabelle, riquadri e attività producono XHTML chiuso', () => {
    const html = markdownToXhtml('> **Nota:** attenzione\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n- [ ] da fare\n- [x] fatto\n\n---');
    expect(html).toContain('<blockquote class="callout">');
    expect(html).toContain('<table><thead><tr><th>A</th>');
    expect(html).toContain('<span class="checkbox checked"></span>');
    expect(html).toContain('<hr/>');
    expect(html).not.toMatch(/\[ \]|\[x\]/);
  });
  it('i testi di copertina sono sempre escapati', () => {
    const b = sampleBundle();
    const spec = { ...b.project.cover, title: '<script>x</script> & "A"', author: '<b>y</b>' };
    for (const template of ['classico', 'moderno', 'editoriale'] as const) {
      const svg = frontCoverSvg({ ...spec, template }, 6, 9) + fullCoverSvg({ ...spec, template }, coverGeometry('6x9', 120, 'white'), { guides: true });
      expect(svg).not.toMatch(/<script|<b>/);
      expect(svg).toContain('&lt;script&gt;');
    }
  });
});

describe('avanzamento', () => {
  it('è calcolato dai dati, non simulato', () => {
    const b = sampleBundle({ chapters: 5 });
    const steps = projectSteps(b.project, b.chapters, []);
    expect(steps.find((s) => s.key === 'scrittura')?.ratio).toBe(0.5);
    expect(steps.find((s) => s.key === 'kit')?.ratio).toBe(0);
    expect(projectPercent(steps)).toBeGreaterThan(0);
    expect(projectPercent(steps)).toBeLessThan(100);
  });
});
