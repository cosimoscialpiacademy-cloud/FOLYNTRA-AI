/** Legge gli appunti personali dell'autore (docs/metodo-*.md). Solo server. Il testo conta solo dopo il commento «Incolla sotto». */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readAfterMarker(file: string): string {
  try {
    const t = readFileSync(path.join(process.cwd(), 'docs', file), 'utf8');
    const i = t.indexOf('-->');
    return (i >= 0 ? t.slice(i + 3) : '').trim().slice(0, 4000);
  } catch {
    return '';
  }
}

export const coverPlaybook = (): string => readAfterMarker('metodo-copertine.md');
export const personalPlaybook = (): string => readAfterMarker('metodo-personale.md');
