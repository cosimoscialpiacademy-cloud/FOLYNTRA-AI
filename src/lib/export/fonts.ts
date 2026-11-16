/** Font open-source (SIL OFL, pacchetti @fontsource) incorporati nei documenti di stampa. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

const FAMILIES: Record<string, { pkg: string; variants: [number, 'normal' | 'italic'][] }> = {
  'EB Garamond': { pkg: 'eb-garamond', variants: [[400, 'normal'], [400, 'italic'], [700, 'normal'], [700, 'italic']] },
  'Playfair Display': { pkg: 'playfair-display', variants: [[400, 'normal'], [700, 'normal'], [400, 'italic']] },
  Inter: { pkg: 'inter', variants: [[400, 'normal'], [400, 'italic'], [600, 'normal'], [700, 'normal']] },
  Oswald: { pkg: 'oswald', variants: [[400, 'normal'], [700, 'normal']] },
  Montserrat: { pkg: 'montserrat', variants: [[600, 'normal'], [700, 'normal'], [800, 'normal']] },
};

export const FONT_LICENSE_NOTE = 'Font EB Garamond, Playfair Display, Inter, Oswald e Montserrat: SIL Open Font License 1.1 (uso commerciale e incorporazione consentiti).';

const cache = new Map<string, string>();

/** CSS @font-face con i file incorporati in base64: il rendering non dipende dai font di sistema. */
export async function fontFaceCss(families: string[]): Promise<string> {
  const key = families.slice().sort().join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const dir = (pkg: string) => path.join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files');
  const rules: string[] = [];
  for (const family of families) {
    const f = FAMILIES[family];
    if (!f) throw new Error(`Font non disponibile: ${family}`);
    for (const [weight, style] of f.variants) {
      for (const [subset, range] of [['latin', LATIN], ['latin-ext', LATIN_EXT]] as const) {
        const file = path.join(dir(f.pkg), `${f.pkg}-${subset}-${weight}-${style}.woff2`);
        const data = await readFile(file);
        rules.push(`@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');unicode-range:${range};}`);
      }
    }
  }
  const css = rules.join('\n');
  cache.set(key, css);
  return css;
}
