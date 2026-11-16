/** Rendering copertine: PDF vettoriale completo (stampa) e JPEG eBook 1600×2560. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import sharp from 'sharp';
import { artById } from '../cover-art';
import type { CoverGeometry } from '../kdp/specs';
import type { CoverSpec } from '../types';
import { newOfflinePage } from './chromium';
import { frontCoverSvg, fullCoverSvg } from './cover-svg';
import { fontFaceCss } from './fonts';

export const EBOOK_COVER = { width: 1600, height: 2560 };

/** Il rendering è offline: l'immagine del catalogo diventa un data URL letto da public/cover-art (id validato dal catalogo). */
export async function resolveCoverArt(spec: CoverSpec): Promise<CoverSpec> {
  const a = spec.art;
  if (!a || a.dataUrl || !a.id) return spec;
  const item = artById(a.id);
  if (!item) return { ...spec, art: null };
  const buf = await readFile(path.join(process.cwd(), 'public', 'cover-art', `${item.id}.jpg`));
  return { ...spec, art: { ...a, dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` } };
}

/** Dimensioni dell'immagine usata (se la copertina ne usa una), per il controllo di risoluzione. */
export async function coverArtInfo(spec: CoverSpec): Promise<{ width: number; height: number; source: 'catalogo' | 'caricata'; aiGenerated: boolean } | null> {
  const resolved = await resolveCoverArt(spec);
  const url = resolved.art?.dataUrl;
  if (!url || !['immersiva', 'cornice', 'vetrina'].includes(spec.template)) return null;
  const meta = await sharp(Buffer.from(url.split(',')[1] ?? '', 'base64')).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0, source: resolved.art?.id ? 'catalogo' : 'caricata', aiGenerated: Boolean(resolved.art?.aiGenerated) };
}

async function page(browser: Browser, widthCss: string, heightCss: string, svg: string): Promise<string> {
  const fonts = await fontFaceCss(['EB Garamond', 'Playfair Display', 'Inter', 'Oswald', 'Montserrat']);
  void browser;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${fonts}
@page{size:${widthCss} ${heightCss};margin:0} html,body{margin:0;padding:0;width:${widthCss};height:${heightCss};overflow:hidden} svg{display:block}</style></head><body>${svg}</body></html>`;
}

export async function renderCoverPdf(browser: Browser, inputSpec: CoverSpec, g: CoverGeometry): Promise<Uint8Array> {
  const spec = await resolveCoverArt(inputSpec);
  const p = await newOfflinePage(browser);
  try {
    await p.setContent(await page(browser, `${g.fullWidthIn}in`, `${g.fullHeightIn}in`, fullCoverSvg(spec, g)), { waitUntil: 'load' });
    await p.evaluate('document.fonts.ready').catch(() => undefined);
    return await p.pdf({ preferCSSPageSize: true, printBackground: true, pageRanges: '1' });
  } finally {
    await p.context().close();
  }
}

export async function renderEbookCoverJpg(browser: Browser, inputSpec: CoverSpec): Promise<Uint8Array> {
  const spec = await resolveCoverArt(inputSpec);
  const context = await browser.newContext({ viewport: { width: 800, height: 1280 }, deviceScaleFactor: 2, javaScriptEnabled: false });
  try {
    const p = await context.newPage();
    // proporzione 1:1,6 consigliata da KDP per le cover eBook
    await p.setContent(await page(browser, '800px', '1280px', frontCoverSvg(spec, 6, 9.6)), { waitUntil: 'load' });
    await p.evaluate('document.fonts.ready').catch(() => undefined);
    const png = await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 800, height: 1280 } });
    return new Uint8Array(await sharp(png).resize(EBOOK_COVER.width, EBOOK_COVER.height).flatten({ background: '#ffffff' }).withMetadata({ density: 300 }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer());
  } finally {
    await context.close();
  }
}
