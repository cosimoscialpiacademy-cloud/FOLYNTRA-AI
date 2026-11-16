/** Mandala generati dal codice: tratto netto, forme chiuse e ampie da colorare, nessuna IA e nessun costo. Stesso seme = stesso disegno. */
import { LINEART_H, LINEART_W } from './svg';

function rng(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const C = LINEART_W / 2;
const CY = LINEART_H / 2;
const f = (n: number) => n.toFixed(1);
const pt = (r: number, a: number) => `${f(C + r * Math.sin(a))},${f(CY - r * Math.cos(a))}`;

/** Petalo a goccia tra raggio r0 e r1 centrato sull'angolo a, con larghezza angolare w. */
function petal(r0: number, r1: number, a: number, w: number): string {
  const rm = r0 + (r1 - r0) * 0.55;
  return `<path d="M${pt(r0, a)} Q${pt(rm, a - w)} ${pt(r1, a)} Q${pt(rm, a + w)} ${pt(r0, a)}Z"/>`;
}
function diamond(r0: number, r1: number, a: number, w: number): string {
  const rm = (r0 + r1) / 2;
  return `<path d="M${pt(r0, a)} L${pt(rm, a - w)} L${pt(r1, a)} L${pt(rm, a + w)}Z"/>`;
}
/** Arco festonato tra due angoli, come un petalo tondo appoggiato sull'anello. */
function scallop(r: number, a0: number, a1: number, bulge: number): string {
  const am = (a0 + a1) / 2;
  return `<path d="M${pt(r, a0)} Q${pt(r + bulge, am)} ${pt(r, a1)}Z"/>`;
}

export function mandalaSvg(seed: number): string {
  const rand = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const parts: string[] = [];
  const n = pick([8, 10, 12, 16]);
  const step = (Math.PI * 2) / n;
  const rings = 4 + Math.floor(rand() * 2);
  parts.push(`<circle cx="${C}" cy="${CY}" r="38"/>`, `<circle cx="${C}" cy="${CY}" r="16"/>`);
  let r = 60;
  const total = 420;
  const kinds: ('petal' | 'diamond' | 'scallop' | 'dots')[] = ['petal', 'diamond', 'scallop', 'dots'];
  for (let k = 0; k < rings; k++) {
    const thick = (total - 60) / rings;
    const r1 = r + thick * (0.75 + rand() * 0.3);
    const kind = k === 0 ? 'petal' : k === rings - 1 ? 'scallop' : pick(kinds);
    const count = k % 2 ? n : n * (rand() > 0.5 ? 1 : 2);
    const st = (Math.PI * 2) / count;
    const offset = k % 2 ? st / 2 : 0;
    if (kind !== 'scallop') parts.push(`<circle cx="${C}" cy="${CY}" r="${f(r)}"/>`);
    for (let i = 0; i < count; i++) {
      const a = offset + i * st;
      if (kind === 'petal') parts.push(petal(r, r1, a, st * 0.42));
      else if (kind === 'diamond') parts.push(diamond(r, r1, a, st * 0.36));
      else if (kind === 'scallop') parts.push(scallop(r1 - 4, a - st / 2, a + st / 2, thick * 0.45));
      else {
        const rr = Math.max(7, thick * 0.17);
        parts.push(`<circle cx="${f(C + ((r + r1) / 2) * Math.sin(a))}" cy="${f(CY - ((r + r1) / 2) * Math.cos(a))}" r="${f(rr)}"/>`);
      }
    }
    r = r1 + 8;
  }
  for (let i = 0; i < n; i++) parts.push(`<path d="M${pt(14, i * step)} L${pt(38, i * step + step / 2)} L${pt(14, (i + 1) * step)}Z"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LINEART_W} ${LINEART_H}">${parts.join('')}</svg>`;
}
