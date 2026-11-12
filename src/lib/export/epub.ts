/** EPUB 3 reflowable costruito a mano (mimetype non compresso per primo, nav + NCX). */
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { MARKETPLACES } from '../kdp/specs';
import type { BookBundle } from '../types';
import { escapeXml as e } from '../utils';
import { buildSections } from './interior';

const CSS = `body{font-family:serif;line-height:1.5;margin:0 5%;}
h1{font-size:1.7em;margin:2em 0 1em;text-align:left;} h2{font-size:1.3em;margin:1.4em 0 .5em;} h3{font-size:1.1em;margin:1.2em 0 .4em;} h4{font-size:1em;}
p{margin:0;text-indent:1.2em;} h1+p,h2+p,h3+p,h4+p,blockquote p,li p{text-indent:0;}
blockquote.callout{margin:1em 0;padding:.6em .8em;border-left:.25em solid #666;background:#f0f0f0;}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.9em;} th,td{border:1px solid #666;padding:.3em .4em;text-align:left;vertical-align:top;}
.chapter-number{text-indent:0;font-size:.8em;letter-spacing:.15em;text-transform:uppercase;margin-top:2em;}
.titlepage{text-align:center;margin-top:20%;} .titlepage p{text-indent:0;} .book-title{text-align:center;} .book-subtitle{font-style:italic;} .book-author{margin-top:3em;letter-spacing:.1em;text-transform:uppercase;}
.copyright{margin-top:3em;font-size:.85em;} .copyright p{text-indent:0;margin-bottom:.5em;} .dedication{text-align:center;font-style:italic;margin-top:20%;}
.checkbox{display:inline-block;width:.7em;height:.7em;border:1px solid #000;margin-right:.3em;} .checkbox.checked{background:#000;}
dt{font-weight:bold;margin-top:.6em;} dd{margin-left:1.2em;} .biblio{list-style:none;padding:0;} .biblio li{margin-bottom:.5em;} .url{font-size:.85em;}
.cover{text-align:center;margin:0;padding:0;} .cover img{max-width:100%;height:auto;}`;

function xhtml(title: string, lang: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="utf-8"/><title>${e(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`;
}

export async function buildEpub(bundle: BookBundle, coverJpg: Uint8Array | null, modified = new Date()): Promise<Uint8Array> {
  const { project } = bundle;
  const lang = MARKETPLACES[project.marketplace].locale.slice(0, 2);
  const sections = buildSections(bundle, modified.getFullYear());
  const docs = sections.map((s, i) => ({ id: `s${i + 1}`, file: `${String(i + 1).padStart(3, '0')}-${s.id}.xhtml`, title: s.title ?? (s.id === 'frontespizio' ? 'Frontespizio' : 'Dedica'), inNav: Boolean(s.title), html: s.html }));

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  const o = zip.folder('OEBPS')!;
  o.file('style.css', CSS);
  if (coverJpg) {
    o.file('images/cover.jpg', coverJpg);
    o.file('cover.xhtml', xhtml('Copertina', lang, `<div class="cover"><img src="images/cover.jpg" alt="Copertina: ${e(project.title)}"/></div>`));
  }
  for (const d of docs) o.file(d.file, xhtml(d.title, lang, d.html));

  const navItems = docs.filter((d) => d.inNav);
  o.file('nav.xhtml', xhtml('Indice', lang, `<nav epub:type="toc" id="toc"><h1>Indice</h1><ol>${navItems.map((d) => `<li><a href="${d.file}">${e(d.title)}</a></li>`).join('')}</ol></nav>`));
  o.file('toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:${project.id}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${e(project.title)}</text></docTitle>
<navMap>${navItems.map((d, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${e(d.title)}</text></navLabel><content src="${d.file}"/></navPoint>`).join('')}</navMap></ncx>`);

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...(coverJpg ? ['<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>', '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'] : []),
    ...docs.map((d) => `<item id="${d.id}" href="${d.file}" media-type="application/xhtml+xml"/>`),
  ];
  const spine = [...(coverJpg ? ['<itemref idref="cover" linear="yes"/>'] : []), ...docs.map((d) => `<itemref idref="${d.id}"/>`)];
  o.file('content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:${project.id}</dc:identifier>
<dc:title>${e(project.title)}</dc:title>
<dc:language>${lang}</dc:language>
<dc:creator>${e(project.author || 'Autore')}</dc:creator>
${project.kdp.description ? `<dc:description>${e(project.kdp.description.slice(0, 1000))}</dc:description>` : ''}
<meta property="dcterms:modified">${modified.toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
${coverJpg ? '<meta name="cover" content="cover-image"/>' : ''}
</metadata>
<manifest>${manifest.join('')}</manifest>
<spine toc="ncx">${spine.join('')}</spine>
</package>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/epub+zip' });
}

export interface StructureReport {
  ok: boolean;
  problems: string[];
}

/** Verifica strutturale interna (NON sostituisce epubcheck). */
export async function validateEpub(data: Uint8Array): Promise<StructureReport> {
  const problems: string[] = [];
  if (new TextDecoder().decode(data.slice(30, 58)) !== 'mimetypeapplication/epub+zip') problems.push('mimetype non è la prima voce non compressa dell’archivio');
  const zip = await JSZip.loadAsync(data);
  const read = async (p: string) => (zip.file(p) ? zip.file(p)!.async('string') : null);
  const container = await read('META-INF/container.xml');
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) return { ok: false, problems: [...problems, 'container.xml mancante o senza rootfile'] };
  const opf = await read(opfPath);
  if (!opf) return { ok: false, problems: [...problems, 'content.opf mancante'] };
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const items = [...opf.matchAll(/<item\s+id="([^"]+)"\s+href="([^"]+)"\s+media-type="([^"]+)"([^>]*)\/>/g)].map((m) => ({ id: m[1], href: m[2], type: m[3], rest: m[4] }));
  if (!items.some((i) => i.rest.includes('properties="nav"'))) problems.push('documento di navigazione (nav) assente');
  for (const it of items) {
    const content = await read(base + it.href);
    if (content === null) {
      problems.push(`file dichiarato ma assente: ${it.href}`);
      continue;
    }
    if (it.type.includes('xml')) {
      const v = XMLValidator.validate(content);
      if (v !== true) problems.push(`XML non ben formato in ${it.href}: ${v.err.msg} (riga ${v.err.line})`);
    }
  }
  const ids = new Set(items.map((i) => i.id));
  for (const m of opf.matchAll(/<itemref\s+idref="([^"]+)"/g)) if (!ids.has(m[1])) problems.push(`spine riferisce un id inesistente: ${m[1]}`);
  for (const tag of ['dc:identifier', 'dc:title', 'dc:language']) if (!opf.includes(`<${tag}`)) problems.push(`metadato obbligatorio assente: ${tag}`);
  if (XMLValidator.validate(opf) !== true) problems.push('content.opf non è XML ben formato');
  return { ok: problems.length === 0, problems };
}
