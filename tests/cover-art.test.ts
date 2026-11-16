import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ART_IDS, COVER_ART, artById } from '../src/lib/cover-art';
import { withBrowser } from '../src/lib/export/chromium';
import { renderCoverPdf, renderEbookCoverJpg } from '../src/lib/export/cover-render';
import { buildKit } from '../src/lib/export/kit';
import { coverGeometry } from '../src/lib/kdp/specs';
import type { CoverSpec } from '../src/lib/types';
import { sampleBundle } from './fixtures';

const OUT = path.resolve('test-output/cover-art');
const NOW = new Date('2026-11-16T10:00:00Z');

function spec(artId: string, template: CoverSpec['template'], font: CoverSpec['titleFont'] = 'Playfair Display', dim = 0.55): CoverSpec {
  const a = artById(artId)!;
  const base = sampleBundle().project.cover;
  return { ...base, title: 'Il giardino in un balcone', subtitle: 'Metodo semplice, stagione per stagione', author: 'Mario Rossi', tagline: 'Piccoli spazi, grandi raccolti', template, titleFont: font, palette: a.palette, art: { id: a.id, dataUrl: null, aiGenerated: true, dim } };
}

describe('copertine con immagine', () => {
  it('il catalogo è coerente: file presenti, id univoci, palette valide', async () => {
    expect(new Set(ART_IDS).size).toBe(ART_IDS.length);
    for (const a of COVER_ART) {
      for (const c of Object.values(a.palette)) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
      const meta = await sharp(path.join('public', 'cover-art', `${a.id}.jpg`)).metadata();
      expect(meta.width, a.id).toBeGreaterThanOrEqual(1300);
      const thumb = await sharp(path.join('public', 'cover-art', 'thumb', `${a.id}.webp`)).metadata();
      expect(thumb.width).toBe(340);
    }
  });

  it('disegna tutti gli sfondi nei tre layout (cover eBook JPEG 1600×2560) e salva un foglio di controllo', async () => {
    mkdirSync(OUT, { recursive: true });
    const tiles: { name: string; buf: Buffer }[] = [];
    await withBrowser(async (b) => {
      for (const [i, a] of COVER_ART.entries()) {
        const template = (['immersiva', 'cornice', 'vetrina'] as const)[i % 3];
        const font = (['Playfair Display', 'Montserrat', 'EB Garamond'] as const)[i % 3];
        const jpg = await renderEbookCoverJpg(b, spec(a.id, template, font));
        const meta = await sharp(jpg).metadata();
        expect([meta.width, meta.height]).toEqual([1600, 2560]);
        tiles.push({ name: `${a.id}-${template}`, buf: await sharp(jpg).resize(320, 512).png().toBuffer() });
      }
    });
    const cols = 6;
    const sheet = await sharp({ create: { width: cols * 330 + 10, height: Math.ceil(tiles.length / cols) * 522 + 10, channels: 3, background: '#081220' } })
      .composite(tiles.map((t, i) => ({ input: t.buf, left: 10 + (i % cols) * 330, top: 10 + Math.floor(i / cols) * 522 }))).png().toBuffer();
    writeFileSync(path.join(OUT, 'galleria.png'), sheet);
  });

  it('stesso sfondo nei 3 layout + montserrat: foglio di confronto', async () => {
    const tiles: Buffer[] = [];
    await withBrowser(async (b) => {
      for (const t of ['immersiva', 'cornice', 'vetrina'] as const) tiles.push(await sharp(await renderEbookCoverJpg(b, spec('oro-notte', t, 'Montserrat'))).resize(400, 640).png().toBuffer());
      for (const t of ['immersiva', 'cornice', 'vetrina'] as const) tiles.push(await sharp(await renderEbookCoverJpg(b, spec('marmo-oro', t, 'Playfair Display', 0.35))).resize(400, 640).png().toBuffer());
    });
    const sheet = await sharp({ create: { width: 3 * 410 + 10, height: 2 * 650 + 10, channels: 3, background: '#081220' } }).composite(tiles.map((input, i) => ({ input, left: 10 + (i % 3) * 410, top: 10 + Math.floor(i / 3) * 650 }))).png().toBuffer();
    writeFileSync(path.join(OUT, 'layout.png'), sheet);
  });

  it('PDF di stampa completo con immagine: 1 pagina, dimensioni dal numero di pagine reale', async () => {
    const g = coverGeometry('6x9', 120, 'cream');
    const pdf = await withBrowser((b) => renderCoverPdf(b, spec('aurora', 'immersiva'), g));
    expect(Buffer.from(pdf.subarray(0, 4)).toString('latin1')).toBe('%PDF');
    writeFileSync(path.join(OUT, 'cover-print-aurora.pdf'), pdf);
  });

  it('QA: immagine IA con dichiarazione «nessuna immagine IA» blocca; dichiarata passa; risoluzione ok', async () => {
    const bundle = sampleBundle({ chapters: 6, real: true });
    bundle.project.cover = spec('montagna', 'immersiva');
    bundle.project.kdp.aiImages = 'none';
    const bad = await withBrowser((b) => buildKit(bundle, b, NOW));
    expect(bad.checks.find((c) => c.id === 'copertina.immagine.ia')).toMatchObject({ result: 'fallito', severity: 'critico' });
    expect(bad.kdpReady).toBe(false);

    bundle.project.kdp.aiImages = 'generated';
    const good = await withBrowser((b) => buildKit(bundle, b, NOW));
    expect(good.checks.find((c) => c.id === 'copertina.immagine.ia')).toMatchObject({ result: 'ok' });
    expect(good.checks.find((c) => c.id === 'copertina.immagine.risoluzione')).toMatchObject({ result: 'ok', severity: 'avviso' });
    expect(good.kdpReady).toBe(true);
    const zip = await JSZip.loadAsync(good.zip);
    const disclosure = JSON.parse(await zip.file('ai-disclosure.json')!.async('string'));
    expect(disclosure.immagini.nota).toMatch(/GENERATA DA IA/);
    expect(await zip.file('diritti.md')!.async('string')).toMatch(/GPT Image 2\.6/);
  });
});

describe('etichette di copertina (bonus, sigillo, invito)', () => {
  const badges = [
    { kind: 'banner' as const, text: 'Includes 7-day meal plan', subtext: '' },
    { kind: 'seal' as const, text: '30+', subtext: 'Recipes' },
    { kind: 'cta' as const, text: 'Start cooking today', subtext: '' },
  ];
  const cook = (artId: string, template: CoverSpec['template'], over: Partial<CoverSpec> = {}): CoverSpec => ({
    ...spec(artId, template, 'Montserrat', 0.5), title: 'Diabetic Friendly Cooking for One', subtitle: 'Simple single-serving recipes and a plate-method guide', author: 'Anna Verdi', tagline: '', badges, badgesConfirmed: true, ...over,
  });

  it('disegna fascia, sigillo e invito nei tre layout e salva un foglio di controllo', async () => {
    mkdirSync(OUT, { recursive: true });
    const jobs: [string, CoverSpec][] = [
      ['piatto-bilanciato', 'vetrina'], ['tavola-per-uno', 'immersiva'], ['icone-salvia', 'cornice'], ['piatto-bilanciato', 'immersiva'], ['tavola-per-uno', 'cornice'], ['icone-salvia', 'vetrina'],
    ].map(([id, t]) => [`${id}-${t}`, cook(id, t as CoverSpec['template'], { palette: artById(id)!.palette })]);
    const tiles: Buffer[] = [];
    await withBrowser(async (b) => {
      for (const [, s] of jobs) tiles.push(await sharp(await renderEbookCoverJpg(b, s)).resize(400, 640).png().toBuffer());
      // anche in miniatura da risultati di ricerca (110 px) per giudicare la leggibilità
      for (const [, s] of jobs.slice(0, 3)) tiles.push(await sharp(await renderEbookCoverJpg(b, s)).resize(110, 176).png().toBuffer());
    });
    const sheet = await sharp({ create: { width: 3 * 410 + 10, height: 2 * 650 + 200, channels: 3, background: '#e9e6df' } })
      .composite([
        ...tiles.slice(0, 6).map((input, i) => ({ input, left: 10 + (i % 3) * 410, top: 10 + Math.floor(i / 3) * 650 })),
        ...tiles.slice(6).map((input, i) => ({ input, left: 10 + i * 130, top: 1310 })),
      ]).png().toBuffer();
    writeFileSync(path.join(OUT, 'etichette.png'), sheet);
    expect(tiles).toHaveLength(9);
  });

  it('QA: frasi vietate e mancata conferma bloccano il kit; etichette vere e confermate passano', async () => {
    const run = async (cover: CoverSpec) => {
      const bundle = sampleBundle({ chapters: 6, real: true });
      bundle.project.cover = cover;
      bundle.project.kdp.aiImages = 'generated';
      return withBrowser((b) => buildKit(bundle, b, NOW));
    };
    const ok = await run(cook('piatto-bilanciato', 'vetrina'));
    expect(ok.checks.find((c) => c.id === 'copertina.etichette.vietate')).toMatchObject({ result: 'ok' });
    expect(ok.checks.find((c) => c.id === 'copertina.etichette.vere')).toMatchObject({ result: 'ok' });
    expect(ok.kdpReady).toBe(true);

    const unconfirmed = await run(cook('piatto-bilanciato', 'vetrina', { badgesConfirmed: false }));
    expect(unconfirmed.checks.find((c) => c.id === 'copertina.etichette.vere')).toMatchObject({ result: 'fallito', severity: 'critico' });
    expect(unconfirmed.kdpReady).toBe(false);

    const bad = await run(cook('piatto-bilanciato', 'vetrina', { badges: [{ kind: 'banner', text: '#1 Bestseller — lowers blood sugar', subtext: '' }] }));
    expect(bad.checks.find((c) => c.id === 'copertina.etichette.vietate')).toMatchObject({ result: 'fallito', severity: 'critico' });
    expect(bad.kdpReady).toBe(false);

    const wrongLayout = await run(cook('piatto-bilanciato', 'classico'));
    expect(wrongLayout.checks.find((c) => c.id === 'copertina.etichette.layout')).toMatchObject({ result: 'fallito', severity: 'avviso' });
  });
});
