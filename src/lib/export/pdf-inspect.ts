/** Ispezione PDF con pdf-lib: dimensioni pagina e incorporazione dei font. */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';

export interface PdfReport {
  pageCount: number;
  /** Dimensioni distinte trovate, in pollici. */
  sizes: { widthIn: number; heightIn: number; pages: number }[];
  fonts: { name: string; embedded: boolean }[];
}

export async function inspectPdf(data: Uint8Array): Promise<PdfReport> {
  const doc = await PDFDocument.load(data);
  const sizes = new Map<string, { widthIn: number; heightIn: number; pages: number }>();
  for (const p of doc.getPages()) {
    const { width, height } = p.getSize();
    const key = `${width.toFixed(1)}x${height.toFixed(1)}`;
    const cur = sizes.get(key) ?? { widthIn: Math.round((width / 72) * 1000) / 1000, heightIn: Math.round((height / 72) * 1000) / 1000, pages: 0 };
    cur.pages += 1;
    sizes.set(key, cur);
  }
  const fonts = new Map<string, boolean>();
  const ctx = doc.context;
  const deref = (o: unknown): unknown => (o instanceof PDFRef ? ctx.lookup(o) : o);
  const hasFile = (fd: unknown): boolean => {
    const d = deref(fd);
    return d instanceof PDFDict && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => d.has(PDFName.of(k)));
  };
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || obj.get(PDFName.of('Type')) !== PDFName.of('Font')) continue;
    const subtype = String(obj.get(PDFName.of('Subtype')) ?? '');
    if (subtype === '/CIDFontType0' || subtype === '/CIDFontType2') continue; // valutati tramite il font Type0 padre
    const name = String(obj.get(PDFName.of('BaseFont')) ?? '/Type3').replace(/^\//, '');
    let embedded = false;
    if (subtype === '/Type3') embedded = true;
    else if (subtype === '/Type0') {
      const desc = deref(obj.get(PDFName.of('DescendantFonts')));
      const first = desc instanceof PDFArray ? deref(desc.get(0)) : null;
      embedded = first instanceof PDFDict && hasFile(first.get(PDFName.of('FontDescriptor')));
    } else embedded = hasFile(obj.get(PDFName.of('FontDescriptor')));
    fonts.set(name, (fonts.get(name) ?? true) && embedded);
  }
  return { pageCount: doc.getPageCount(), sizes: [...sizes.values()], fonts: [...fonts].map(([name, embedded]) => ({ name, embedded })) };
}
