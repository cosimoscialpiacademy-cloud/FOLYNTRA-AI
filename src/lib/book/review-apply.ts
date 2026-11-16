/** Applica al testo di un capitolo un suggerimento della revisione AI: trova il passaggio e lo sostituisce. */

export interface Span {
  start: number;
  end: number;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Cerca l'estratto citato dall'IA nel testo. Tollera puntini o virgolette agli estremi e spazi/ritorni a capo diversi.
 * Restituisce null se non lo trova con sicurezza (meglio non toccare il testo che sostituire il passaggio sbagliato).
 */
export function locateExcerpt(content: string, excerpt: string): Span | null {
  const raw = excerpt.trim();
  if (raw.length < 8) return null;
  let i = content.indexOf(raw);
  if (i >= 0) return { start: i, end: i + raw.length };
  const cleaned = raw.replace(/^(\.\.\.|…|[«"“‘'])+/, '').replace(/(\.\.\.|…|[»"”’'])+$/, '').trim();
  if (cleaned.length < 8) return null;
  i = content.indexOf(cleaned);
  if (i >= 0) return { start: i, end: i + cleaned.length };
  const words = cleaned.split(/\s+/).map(escapeRegExp);
  if (words.length >= 3) {
    const m = new RegExp(words.join('\\s+')).exec(content);
    if (m) return { start: m.index, end: m.index + m[0].length };
  }
  return null;
}

/** Sostituisce la prima occorrenza dell'estratto con la versione proposta. Null se non applicabile. */
export function applyReplacement(content: string, excerpt: string, replacement: string): string | null {
  const rep = replacement.trim();
  if (!rep) return null;
  const span = locateExcerpt(content, excerpt);
  if (!span) return null;
  return content.slice(0, span.start) + rep + content.slice(span.end);
}
