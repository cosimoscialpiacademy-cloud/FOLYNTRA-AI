import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { chromiumPath, withBrowser } from '../src/lib/export/chromium';
import { buildKit, descriptionToKdpHtml } from '../src/lib/export/kit';
import { inspectPdf } from '../src/lib/export/pdf-inspect';
import { coverGeometry } from '../src/lib/kdp/specs';
import { sampleBundle } from './fixtures';

const hasChromium = chromiumPath() !== null;
const OUT = path.join(process.cwd(), 'test-output');

describe.skipIf(!hasChromium)('KDP kit (integrazione con Chromium)', () => {
  it('produce tutti i file, con dorso calcolato dalle pagine reali, e blocca "pronto" con testo mock', async () => {
    const bundle = sampleBundle({ chapters: 6 });
    const kit = await withBrowser((b) => buildKit(bundle, b, new Date('2026-11-12T08:00:00Z')));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, kit.fileName), kit.zip);

    const zip = await JSZip.loadAsync(kit.zip);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
    for (const required of ['manuscript.pdf', 'ebook.epub', 'editable.docx', 'cover-print.pdf', 'cover-ebook.jpg', 'metadata.json', 'kdp-checklist.md', 'ai-disclosure.json', 'manifest.json', 'bonus/quaderno-operativo.pdf', 'qa-report.md', 'description.html', 'guida-caricamento-kdp.md']) {
      expect(names).toContain(required);
    }
    expect(kit.kdpReady).toBe(false);
    expect(kit.fileName).toContain('BOZZA');
    expect(kit.checks.find((c) => c.id === 'contenuto.mock')?.result).toBe('fallito');

    const interior = await inspectPdf(await zip.file('manuscript.pdf')!.async('uint8array'));
    expect(interior.pageCount).toBe(kit.pageCount);
    expect(interior.sizes).toEqual([{ widthIn: 6, heightIn: 9, pages: kit.pageCount }]);
    expect(interior.fonts.every((f) => f.embedded)).toBe(true);

    const g = coverGeometry('6x9', kit.pageCount, 'cream');
    const cover = await inspectPdf(await zip.file('cover-print.pdf')!.async('uint8array'));
    expect(cover.pageCount).toBe(1);
    expect(Math.abs(cover.sizes[0].widthIn - g.fullWidthIn)).toBeLessThan(0.01);
    expect(Math.abs(cover.sizes[0].heightIn - 9.25)).toBeLessThan(0.01);

    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const { createHash } = await import('node:crypto');
    for (const f of manifest.files) {
      const data = await zip.file(f.name)!.async('uint8array');
      expect(createHash('sha256').update(data).digest('hex')).toBe(f.sha256);
    }
  });

  it('con testo rivisto e conferme complete lo stato è "pronto" e l’indice riporta le pagine reali', async () => {
    const bundle = sampleBundle({ chapters: 6, real: true, paragraphs: 9 });
    const kit = await withBrowser((b) => buildKit(bundle, b, new Date('2026-11-12T08:00:00Z')));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, kit.fileName), kit.zip);
    const failed = kit.checks.filter((c) => c.severity === 'critico' && c.result !== 'ok');
    expect(failed).toEqual([]);
    expect(kit.kdpReady).toBe(true);
    expect(kit.pageCount).toBeGreaterThanOrEqual(24);
  });
});

describe('descrizione KDP', () => {
  it('usa solo tag ammessi', () => {
    const html = descriptionToKdpHtml('Testo **forte** e *corsivo* con [link](https://example.com).\n\n- uno\n- due');
    expect(html).toContain('<b>forte</b>');
    expect(html).toContain('<i>corsivo</i>');
    expect(html).not.toMatch(/<a |<strong|<em>/);
    expect(html).toContain('<ul><li>uno</li><li>due</li></ul>');
  });
});
