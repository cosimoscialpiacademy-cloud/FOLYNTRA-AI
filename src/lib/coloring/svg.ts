/**
 * Disegni al tratto per i libri da colorare. Tutto ciò che arriva dall'IA o dall'esterno passa da
 * `sanitizeLineArt`: solo forme semplici, nero su bianco, nessuno script, nessun riferimento esterno.
 */

const TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const DRAW = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray']);
const NUM = /^-?\d*\.?\d+(e-?\d+)?$/i;
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,\-eE+]+$/;
const POINTS = /^[0-9\s.,\-eE+]+$/;
const TRANSFORM = /^[a-zA-Z0-9\s().,\-+]+$/;
const FORBIDDEN = /<!|<\?|<script|<style|<foreignObject|<image|<use|<filter|<mask|<clipPath|<linearGradient|<radialGradient|<pattern|<text|<a[\s>]|javascript:|\son\w+\s*=|xlink:|href\s*=|url\(|&#|<!ENTITY/i;

export const LINEART_W = 1000;
export const LINEART_H = 1300;

export class LineArtError extends Error {}

const INK = '#000000';
const PAPER = '#ffffff';

function cleanColor(v: string, fallback: string): string {
  const x = v.trim().toLowerCase();
  if (x === 'none') return 'none';
  if (x === '#fff' || x === '#ffffff' || x === 'white') return PAPER;
  if (x === '#000' || x === '#000000' || x === 'black') return INK;
  return fallback;
}

/** Restituisce un SVG ricostruito da zero con soli elementi/attributi ammessi, oppure lancia LineArtError. */
export function sanitizeLineArt(raw: string): string {
  const src = raw.trim();
  if (src.length > 90_000) throw new LineArtError('Disegno troppo complesso.');
  if (!/^<svg[\s>]/i.test(src)) throw new LineArtError('La risposta non è un SVG.');
  if (FORBIDDEN.test(src)) throw new LineArtError('Il disegno contiene elementi non ammessi.');

  const out: string[] = [];
  const stack: string[] = [];
  let drawn = 0;
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    if (src.slice(last, m.index).trim()) throw new LineArtError('Testo non ammesso dentro l’SVG.');
    last = tagRe.lastIndex;
    const [, closing, nameRaw, attrSrc, selfClose] = m;
    const name = nameRaw.toLowerCase();
    if (!TAGS.has(name)) throw new LineArtError(`Elemento non ammesso: ${name}.`);
    if (closing) {
      if (stack.pop() !== name) throw new LineArtError('SVG mal formato.');
      if (name !== 'svg') out.push(`</${name}>`);
      continue;
    }
    const attrs: string[] = [];
    let hasStroke = false;
    for (const a of attrSrc.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const key = a[1].toLowerCase();
      const val = (a[2] ?? a[3] ?? '').trim();
      if (name === 'svg') continue; // l'intestazione la riscriviamo noi
      if (!ATTRS.has(key)) continue;
      if (key === 'd' && !PATH_D.test(val)) throw new LineArtError('Percorso non valido.');
      if (key === 'points' && !POINTS.test(val)) throw new LineArtError('Punti non validi.');
      if (key === 'transform' && !TRANSFORM.test(val)) throw new LineArtError('Trasformazione non valida.');
      if (['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'stroke-width'].includes(key) && !NUM.test(val)) throw new LineArtError(`Valore non valido per ${key}.`);
      if (key === 'fill') attrs.push(`fill="${cleanColor(val, 'none')}"`);
      else if (key === 'stroke') { hasStroke = true; attrs.push(`stroke="${cleanColor(val, INK)}"`); }
      else if (key === 'stroke-width') attrs.push(`stroke-width="${Math.min(14, Math.max(3, Number(val)))}"`);
      else if (key === 'stroke-linecap') attrs.push(`stroke-linecap="${/^(round|butt|square)$/.test(val) ? val : 'round'}"`);
      else if (key === 'stroke-linejoin') attrs.push(`stroke-linejoin="${/^(round|miter|bevel)$/.test(val) ? val : 'round'}"`);
      else if (key === 'stroke-dasharray') { if (POINTS.test(val)) attrs.push(`stroke-dasharray="${val}"`); }
      else attrs.push(`${key}="${val}"`);
    }
    if (name === 'svg') {
      if (stack.length) throw new LineArtError('SVG annidato.');
      out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LINEART_W} ${LINEART_H}"><rect width="${LINEART_W}" height="${LINEART_H}" fill="${PAPER}"/><g fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">`);
    } else {
      if (!stack.length) throw new LineArtError('Elemento fuori dall’SVG.');
      if (DRAW.has(name)) {
        drawn++;
        if (!hasStroke && !attrs.some((x) => x.startsWith('fill="#000'))) attrs.push(`stroke="${INK}"`);
      }
      out.push(`<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClose ? '/' : ''}>`);
    }
    if (!selfClose) stack.push(name);
    else if (name === 'svg') throw new LineArtError('SVG vuoto.');
  }
  if (src.slice(last).trim() || stack.length) throw new LineArtError('SVG incompleto o mal formato.');
  if (drawn < 6) throw new LineArtError('Il disegno è troppo povero (meno di 6 forme).');
  out.push('</g></svg>');
  return out.join('');
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml;base64,${typeof Buffer !== 'undefined' ? Buffer.from(svg, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(svg)))}`;
