/**
 * Copertine originali a template: SVG vettoriale generato dal codice (nessuna
 * immagine stock). Funzioni pure, usate sia per l'anteprima nel browser sia
 * per il rendering di stampa. Unità: punti tipografici (72 pt = 1 pollice).
 */
import { artHref } from '../cover-art';
import { BLEED_IN, COVER_SAFE_IN, type CoverGeometry } from '../kdp/specs';
import type { CoverSpec } from '../types';
import { escapeXml } from '../utils';

const PT = 72;

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Dimensione del titolo adattata alla lunghezza: evita testi tagliati. */
function titleSize(title: string, width: number, base: number, charFactor: number): number {
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length), 1);
  const byWord = (width * 0.98) / (longest * charFactor);
  const byLength = base * Math.min(1, Math.sqrt(38 / Math.max(title.length, 12)));
  return Math.max(base * 0.34, Math.min(base, byWord, byLength));
}

function fo(x: number, y: number, w: number, h: number, style: string, html: string): string {
  return `<foreignObject x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;${style}">${html}</div></foreignObject>`;
}

const t = (s: string) => escapeXml(s);


const ART_TEMPLATES_SET = new Set(['immersiva', 'cornice', 'vetrina']);
/** #rrggbb → rgba(): permette sfondi semitrasparenti nel testo. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const weightOf = (spec: CoverSpec) => (spec.titleFont === 'Montserrat' ? 800 : 700);

/** Opzioni di disegno: `ext` prolunga fondo e velature nell'abbondanza (alto, basso e destra), `skipArt` non disegna l'immagine (già posta sotto). */
interface PanelOpts {
  skipArt?: boolean;
  ext?: number;
}

function artImage(href: string | null, x: number, y: number, w: number, h: number, fallback: string): string {
  return href
    ? `<image href="${escapeXml(href)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${fallback}"/>`;
}

/** Layout con immagine: immersiva (titolo in basso su velatura), cornice (targa centrale) e vetrina (immagine sopra, pannello sotto). */
function artFront(spec: CoverSpec, w: number, h: number, opts: PanelOpts): string {
  const { background: bg, accent, text } = spec.palette;
  const u = w / 432;
  const m = COVER_SAFE_IN * PT + 14 * u;
  const e = opts.ext ?? 0;
  const dim = clamp01(spec.art?.dim ?? 0.55);
  const href = opts.skipArt ? null : artHref(spec.art);
  const placed = Boolean(opts.skipArt); // l'immagine è già stata disegnata sotto, in un riquadro esteso
  const img = (x: number, y: number, ww: number, hh: number) => (placed ? '' : artImage(href, x, y, ww, hh, bg));
  const title = spec.title || 'Titolo del libro';
  const sub = spec.subtitle;
  const author = spec.author || 'Nome Autore';
  const wt = weightOf(spec);
  const gid = `g-${spec.template}-${bg.slice(1)}-${Math.round(dim * 100)}`;

  if (spec.template === 'immersiva') {
    const fs = titleSize(title, w - 2 * m, 58 * u, 0.54);
    const top = Math.min(0.9, 0.15 + dim * 0.6);
    const bottom = Math.min(0.97, 0.45 + dim * 0.55);
    return `
<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${bg}" stop-opacity="${top.toFixed(2)}"/><stop offset="0.24" stop-color="${bg}" stop-opacity="0"/>
  <stop offset="0.40" stop-color="${bg}" stop-opacity="0"/><stop offset="0.78" stop-color="${bg}" stop-opacity="${(bottom * 0.78).toFixed(2)}"/><stop offset="1" stop-color="${bg}" stop-opacity="${bottom.toFixed(2)}"/>
</linearGradient></defs>
${img(0, 0, w, h)}
<rect x="0" y="${-e}" width="${w + e}" height="${h + 2 * e}" fill="url(#${gid})"/>
${fo(m, m - 4 * u, w - 2 * m, 36 * u, `justify-content:center;align-items:center;text-align:center;color:${accent};`,
  `<div style="font-family:'Inter',sans-serif;font-weight:700;font-size:${11.5 * u}px;letter-spacing:${3.2 * u}px;text-transform:uppercase;padding:${5 * u}px ${14 * u}px;background:${rgba(bg, 0.72)};">${t(author)}</div>`)}
<rect x="${(w - 44 * u) / 2}" y="${h * 0.6}" width="${44 * u}" height="${2.4 * u}" fill="${accent}"/>
${fo(m, h * 0.6 + 16 * u, w - 2 * m, h * 0.4 - m - 16 * u, `justify-content:flex-start;align-items:center;text-align:center;color:${text};`,
  `<div style="font-family:'${spec.titleFont}',serif;font-weight:${wt};font-size:${fs.toFixed(1)}px;line-height:1.08;text-wrap:balance;text-shadow:0 ${2 * u}px ${14 * u}px rgba(0,0,0,0.25);">${t(title)}</div>
   ${sub ? `<div style="font-family:'EB Garamond',serif;font-style:italic;font-size:${17.5 * u}px;line-height:1.3;margin-top:${12 * u}px;opacity:0.94;">${t(sub)}</div>` : ''}`)}`;
  }

  if (spec.template === 'cornice') {
    const fs = titleSize(title, w - 2 * m - 50 * u, 46 * u, 0.55);
    const plateA = (0.46 + dim * 0.4).toFixed(2);
    return `
${img(0, 0, w, h)}
<rect x="0" y="${-e}" width="${w + e}" height="${h + 2 * e}" fill="${bg}" opacity="${(dim * 0.42).toFixed(2)}"/>
<rect x="${m - 8 * u}" y="${m - 8 * u}" width="${w - 2 * m + 16 * u}" height="${h - 2 * m + 16 * u}" fill="none" stroke="${accent}" stroke-width="${1.6 * u}"/>
<rect x="${m - 2 * u}" y="${m - 2 * u}" width="${w - 2 * m + 4 * u}" height="${h - 2 * m + 4 * u}" fill="none" stroke="${accent}" stroke-width="${0.6 * u}" opacity="0.8"/>
<rect x="${m + 14 * u}" y="${h * 0.3}" width="${w - 2 * m - 28 * u}" height="${h * 0.34}" fill="${bg}" opacity="${plateA}"/>
<g transform="translate(${w / 2} ${h * 0.3 + 18 * u})" fill="none" stroke="${accent}" stroke-width="${1 * u}"><path d="M0 ${-6 * u} L${6 * u} 0 L0 ${6 * u} L${-6 * u} 0 Z" fill="${accent}"/><path d="M${-46 * u} 0 H${-14 * u} M${14 * u} 0 H${46 * u}"/></g>
${fo(m + 26 * u, h * 0.3 + 30 * u, w - 2 * m - 52 * u, h * 0.34 - 44 * u, `justify-content:center;align-items:center;text-align:center;color:${text};`,
  `<div style="font-family:'${spec.titleFont}',serif;font-weight:${wt};font-size:${fs.toFixed(1)}px;line-height:1.1;text-wrap:balance;">${t(title)}</div>
   ${sub ? `<div style="font-family:'EB Garamond',serif;font-style:italic;font-size:${16 * u}px;line-height:1.28;margin-top:${10 * u}px;">${t(sub)}</div>` : ''}`)}
${fo(m, h - m - 40 * u, w - 2 * m, 30 * u, `justify-content:center;align-items:center;text-align:center;color:${text};`,
  `<div style="font-family:'Inter',sans-serif;font-weight:600;font-size:${12 * u}px;letter-spacing:${3 * u}px;text-transform:uppercase;padding:${4 * u}px ${12 * u}px;background:${bg};background-clip:padding-box;opacity:0.95;">${t(author)}</div>`)}`;
  }

  // vetrina
  const split = 0.62;
  const fs = titleSize(title, w - 2 * m, 46 * u, 0.55);
  return `
<defs><linearGradient id="${gid}v" x1="0" y1="0" x2="0" y2="1"><stop offset="0.72" stop-color="${bg}" stop-opacity="0"/><stop offset="1" stop-color="${bg}" stop-opacity="${(0.25 + dim * 0.7).toFixed(2)}"/></linearGradient></defs>
<rect x="0" y="${h * split}" width="${w + e}" height="${h * (1 - split) + e}" fill="${bg}"/>
${img(0, 0, w, h * split)}
<rect x="0" y="${-e}" width="${w + e}" height="${h * split + e}" fill="url(#${gid}v)"/>
<rect x="${m}" y="${h * split - 5 * u}" width="${64 * u}" height="${10 * u}" fill="${accent}"/>
${fo(m, h * split + 22 * u, w - 2 * m, h * (1 - split) - m - 54 * u, `justify-content:flex-start;color:${text};`,
  `<div style="font-family:'${spec.titleFont}',serif;font-weight:${wt};font-size:${fs.toFixed(1)}px;line-height:1.08;text-wrap:balance;">${t(title)}</div>
   ${sub ? `<div style="font-family:'EB Garamond',serif;font-style:italic;font-size:${16.5 * u}px;line-height:1.3;margin-top:${10 * u}px;opacity:0.92;">${t(sub)}</div>` : ''}`)}
${fo(m, h - m - 30 * u, w - 2 * m, 30 * u, `justify-content:flex-end;color:${accent};`,
  `<div style="font-family:'Inter',sans-serif;font-weight:700;font-size:${12.5 * u}px;letter-spacing:${3 * u}px;text-transform:uppercase;">${t(author)}</div>`)}`;
}

/** Pannello frontale in un riquadro w×h con origine (0,0). */
function frontPanel(spec: CoverSpec, w: number, h: number, opts: PanelOpts = {}): string {
  if (ART_TEMPLATES_SET.has(spec.template)) return artFront(spec, w, h, opts);

  const { background: bg, accent, text } = spec.palette;
  const u = w / 432; // scala rispetto al 6×9
  const m = COVER_SAFE_IN * PT + 14 * u;
  const title = spec.title || 'Titolo del libro';
  const sub = spec.subtitle;
  const author = spec.author || 'Nome Autore';
  const r = rng(spec.seed);

  if (spec.template === 'classico') {
    const fs = titleSize(title, w - 2 * m - 30 * u, 50 * u, 0.56);
    return `
<rect width="${w}" height="${h}" fill="${bg}"/>
<rect x="${m - 10 * u}" y="${m - 10 * u}" width="${w - 2 * m + 20 * u}" height="${h - 2 * m + 20 * u}" fill="none" stroke="${accent}" stroke-width="${1.6 * u}"/>
<rect x="${m - 4 * u}" y="${m - 4 * u}" width="${w - 2 * m + 8 * u}" height="${h - 2 * m + 8 * u}" fill="none" stroke="${accent}" stroke-width="${0.6 * u}"/>
<g transform="translate(${w / 2} ${m + 46 * u})" fill="none" stroke="${accent}" stroke-width="${1 * u}">
  <path d="M0 ${-14 * u} L${14 * u} 0 L0 ${14 * u} L${-14 * u} 0 Z"/><path d="M0 ${-7 * u} L${7 * u} 0 L0 ${7 * u} L${-7 * u} 0 Z" fill="${accent}"/>
  <path d="M${-70 * u} 0 H${-22 * u} M${22 * u} 0 H${70 * u}"/>
</g>
${fo(m + 15 * u, m + 80 * u, w - 2 * m - 30 * u, h - 2 * m - 190 * u, `justify-content:center;align-items:center;text-align:center;color:${text};`,
  `<div style="font-family:'${spec.titleFont}',serif;font-weight:700;font-size:${fs.toFixed(1)}px;line-height:1.12;text-wrap:balance;">${t(title)}</div>
   ${sub ? `<div style="width:${60 * u}px;height:${1 * u}px;background:${accent};margin:${20 * u}px 0;"></div><div style="font-family:'EB Garamond',serif;font-style:italic;font-size:${17 * u}px;line-height:1.3;">${t(sub)}</div>` : ''}`)}
${fo(m, h - m - 70 * u, w - 2 * m, 50 * u, `justify-content:center;align-items:center;text-align:center;color:${accent};`,
  `<div style="font-family:'Inter',sans-serif;font-weight:600;font-size:${12.5 * u}px;letter-spacing:${3 * u}px;text-transform:uppercase;">${t(author)}</div>`)}`;
  }

  if (spec.template === 'moderno') {
    const blockH = h * 0.6;
    const fs = titleSize(title.toUpperCase(), w - 2 * m, 62 * u, 0.5);
    const circles = Array.from({ length: 3 }, (_, i) => {
      const cx = w * (0.55 + r() * 0.4), cy = blockH * (0.1 + r() * 0.3), rad = (38 + r() * 70) * u;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="${i === 1 ? bg : text}" opacity="${i === 1 ? 0.18 : 0.12}"/>`;
    }).join('');
    return `
<rect width="${w}" height="${h}" fill="${bg}"/>
<rect width="${w}" height="${blockH}" fill="${accent}"/>
<g clip-path="inset(0)">${circles}</g>
<rect x="${m}" y="${blockH - 6 * u}" width="${70 * u}" height="${12 * u}" fill="${text}"/>
${fo(m, m, w - 2 * m, blockH - m - 26 * u, `justify-content:flex-end;color:${bg};`,
  `<div style="font-family:'${spec.titleFont}',sans-serif;font-weight:700;font-size:${fs.toFixed(1)}px;line-height:1.04;text-wrap:balance;text-transform:uppercase;letter-spacing:${0.5 * u}px;">${t(title)}</div>`)}
${fo(m, blockH + 26 * u, w - 2 * m, h - blockH - m - 70 * u, `color:${text};`,
  sub ? `<div style="font-family:'Inter',sans-serif;font-weight:400;font-size:${16 * u}px;line-height:1.35;">${t(sub)}</div>` : '')}
${fo(m, h - m - 34 * u, w - 2 * m, 34 * u, `justify-content:flex-end;color:${text};`,
  `<div style="font-family:'Inter',sans-serif;font-weight:700;font-size:${13 * u}px;letter-spacing:${2 * u}px;text-transform:uppercase;">${t(author)}</div>`)}`;
  }

  // editoriale
  const fs = titleSize(title, w - 2 * m - 22 * u, 54 * u, 0.5);
  const cx = w * (0.62 + r() * 0.2), cy = h * (0.2 + r() * 0.1);
  const arcs = Array.from({ length: 16 }, (_, i) => {
    const rad = (22 + i * 17) * u;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}" fill="none" stroke="${accent}" stroke-width="${(0.7 + (i % 4 === 0 ? 0.9 : 0)) * u}" opacity="${(0.75 - i * 0.04).toFixed(2)}" stroke-dasharray="${i % 3 === 0 ? `${(40 + r() * 80) * u} ${(8 + r() * 14) * u}` : 'none'}"/>`;
  }).join('');
  return `
<rect width="${w}" height="${h}" fill="${bg}"/>
<svg x="0" y="0" width="${w}" height="${h * 0.56}" viewBox="0 0 ${w} ${h * 0.56}" overflow="hidden">${arcs}</svg>
<rect x="${m}" y="${h * 0.56}" width="${4 * u}" height="${h * 0.44 - m - 50 * u}" fill="${accent}"/>
${fo(m, m, w - 2 * m, 40 * u, `color:${accent};`,
  `<div style="font-family:'Inter',sans-serif;font-weight:600;font-size:${11.5 * u}px;letter-spacing:${3 * u}px;text-transform:uppercase;">${t(author)}</div>`)}
${fo(m + 22 * u, h * 0.56, w - 2 * m - 22 * u, h * 0.44 - m - 50 * u, `justify-content:flex-start;color:${text};`,
  `<div style="font-family:'${spec.titleFont}',serif;font-weight:700;font-size:${fs.toFixed(1)}px;line-height:1.08;text-wrap:balance;">${t(title)}</div>
   ${sub ? `<div style="font-family:'EB Garamond',serif;font-style:italic;font-size:${17 * u}px;line-height:1.3;margin-top:${14 * u}px;color:${accent};">${t(sub)}</div>` : ''}`)}
${spec.tagline ? fo(m, h - m - 36 * u, w - 2 * m, 36 * u, `justify-content:flex-end;color:${text};opacity:0.85;`,
  `<div style="font-family:'Inter',sans-serif;font-size:${10.5 * u}px;letter-spacing:${1 * u}px;">${t(spec.tagline)}</div>`) : ''}`;
}

function backPanel(spec: CoverSpec, w: number, h: number): string {
  const { background: bg, accent, text } = spec.palette;
  const dark = spec.template === 'moderno';
  const u = w / 432;
  const m = COVER_SAFE_IN * PT + 22 * u;
  const paragraphs = (spec.backText || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const length = paragraphs.join(' ').length;
  const fs = Math.max(8.5, Math.min(12.5, 12.5 * Math.sqrt(900 / Math.max(length, 500)))) * u;
  // In basso a destra resta libera l'area per il codice a barre (2" × 1,2") che KDP stampa da sé.
  const artBack = (spec.template === 'immersiva' || spec.template === 'cornice') ? artHref(spec.art) : null;
  const backBase = artBack
    ? `${artImage(artBack, 0, 0, w, h, bg)}<rect width="${w}" height="${h}" fill="${bg}" opacity="${(0.78 + 0.18 * clamp01(spec.art?.dim ?? 0.55)).toFixed(2)}"/>`
    : `<rect width="${w}" height="${h}" fill="${dark ? spec.palette.text : bg}"/>`;
  return `
${backBase}
${fo(m, m, w - 2 * m, h - 2 * m - 1.35 * PT, `color:${dark ? bg : text};`,
  `${spec.tagline ? `<div style="font-family:'${spec.titleFont}',serif;font-weight:700;font-size:${19 * u}px;line-height:1.2;color:${accent};margin-bottom:${16 * u}px;">${t(spec.tagline)}</div>` : ''}
   ${paragraphs.map((p) => `<p style="font-family:'EB Garamond',serif;font-size:${fs.toFixed(2)}px;line-height:1.42;margin:0 0 ${8 * u}px 0;text-align:justify;">${t(p)}</p>`).join('')}`)}
${fo(m, h - m - 1.2 * PT, w - 2 * m - 2.2 * PT, 1.2 * PT, `justify-content:flex-end;color:${accent};`,
  `<div style="font-family:'Inter',sans-serif;font-weight:600;font-size:${10 * u}px;letter-spacing:${2 * u}px;text-transform:uppercase;">${t(spec.author)}</div>`)}`;
}

function spinePanel(spec: CoverSpec, spineW: number, h: number, allowed: boolean): string {
  const { background: bg, accent, text } = spec.palette;
  const fill = spec.template === 'moderno' ? accent : bg;
  const color = spec.template === 'moderno' ? bg : text;
  let label = '';
  if (allowed) {
    // KDP: almeno 0,0625" di margine per lato tra testo e bordi del dorso.
    const fs = Math.min(15, (spineW - 2 * 0.0625 * PT) * 0.62);
    const len = h - 2 * (COVER_SAFE_IN * PT + 20);
    label = `<g transform="translate(${spineW / 2} ${h / 2}) rotate(90)">${fo(-len / 2, -fs * 0.8, len, fs * 1.6, `flex-direction:row;justify-content:space-between;align-items:center;color:${color};white-space:nowrap;`,
      `<span style="font-family:'${spec.titleFont}',serif;font-weight:700;font-size:${fs.toFixed(2)}px;overflow:hidden;text-overflow:ellipsis;max-width:68%;">${t(spec.title)}</span><span style="font-family:'Inter',sans-serif;font-weight:600;font-size:${(fs * 0.62).toFixed(2)}px;letter-spacing:1px;text-transform:uppercase;color:${spec.template === 'moderno' ? bg : accent};">${t(spec.author)}</span>`)}</g>`;
  }
  return `<rect width="${spineW}" height="${h}" fill="${fill}"/>${label}`;
}

function wrap(width: number, height: number, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

/** Solo fronte (anteprima e cover eBook). */
export function frontCoverSvg(spec: CoverSpec, widthIn: number, heightIn: number): string {
  return wrap(widthIn * PT, heightIn * PT, frontPanel(spec, widthIn * PT, heightIn * PT));
}

/** Copertina completa retro + dorso + fronte con abbondanza. `guides` solo per l'anteprima. */
export function fullCoverSvg(spec: CoverSpec, g: CoverGeometry, opts: { guides?: boolean } = {}): string {
  const b = BLEED_IN * PT;
  const tw = g.trimWidthIn * PT, th = g.trimHeightIn * PT, sp = g.spineIn * PT;
  const W = g.fullWidthIn * PT, H = g.fullHeightIn * PT;
  const backFill = spec.template === 'moderno' ? spec.palette.text : spec.palette.background;
  const frontX = b + tw + sp;
  const guides = opts.guides
    ? `<g fill="none" stroke="#ff3b6b" stroke-width="0.8" stroke-dasharray="4 3">
        <rect x="${b}" y="${b}" width="${W - 2 * b}" height="${H - 2 * b}"/>
        <path d="M${b + tw} 0 V${H} M${frontX} 0 V${H}"/>
        <rect x="${b + tw - 0.25 * PT - 2 * PT}" y="${H - b - 0.25 * PT - 1.2 * PT}" width="${2 * PT}" height="${1.2 * PT}" stroke="#2a9d8f"/>
      </g>`
    : '';
  // I pannelli laterali vengono estesi nell'abbondanza con il proprio colore di fondo.
  return wrap(W, H, `
<rect width="${b + tw}" height="${H}" fill="${backFill}"/>
<rect x="${frontX}" width="${tw + b}" height="${H}" fill="${spec.palette.background}"/>
<svg x="${frontX}" y="0" width="${tw + b}" height="${H}" viewBox="0 ${-b} ${tw + b} ${H}" overflow="hidden">${frontBleed(spec, tw, th, b)}</svg>
<svg x="0" y="0" width="${b + tw}" height="${H}" viewBox="${-b} ${-b} ${b + tw} ${H}" overflow="hidden">${backPanel(spec, tw, th)}</svg>
<svg x="${b + tw}" y="0" width="${sp}" height="${H}" viewBox="0 ${-b} ${sp} ${H}" overflow="hidden"><rect y="${-b}" width="${sp}" height="${H}" fill="${spec.template === 'moderno' ? spec.palette.accent : spec.palette.background}"/>${spinePanel(spec, sp, th, g.spineTextAllowed)}</svg>
${guides}`);
}

/** Fronte con i fondi prolungati nell'abbondanza (colori pieni o immagine estesa, nessun testo oltre il rifilo). */
function frontBleed(spec: CoverSpec, tw: number, th: number, b: number): string {
  if (ART_TEMPLATES_SET.has(spec.template)) {
    const href = artHref(spec.art);
    const bg = spec.palette.background;
    // L'immagine copre anche l'abbondanza (alto, basso, destra): niente bordi vuoti se il taglio ha tolleranza.
    const under = spec.template === 'vetrina'
      ? `<rect y="${-b}" width="${tw + b}" height="${th + 2 * b}" fill="${bg}"/>${artImage(href, 0, -b, tw + b, th * 0.62 + b, bg)}`
      : artImage(href, 0, -b, tw + b, th + 2 * b, bg);
    return under + frontPanel(spec, tw, th, { skipArt: true, ext: b });
  }
  const under = spec.template === 'moderno'
    ? `<rect y="${-b}" width="${tw + b}" height="${th * 0.6 + b}" fill="${spec.palette.accent}"/><rect y="${th * 0.6}" width="${tw + b}" height="${th * 0.4 + b}" fill="${spec.palette.background}"/>`
    : `<rect y="${-b}" width="${tw + b}" height="${th + 2 * b}" fill="${spec.palette.background}"/>`;
  return under + frontPanel(spec, tw, th).replace(/<rect width="[\d.]+" height="[\d.]+" fill="[^"]+"\/>/, '');
}
