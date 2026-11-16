import { describe, expect, it } from 'vitest';
import { applyReplacement, locateExcerpt } from '../src/lib/book/review-apply';

const text = 'Prima di comprare semi e piantine, osserva il balcone con calma.\n\nLa luce è l\'unico fattore che non puoi modificare, quindi parti da qui.\nOsserva\nl\'ombra dei palazzi.';

describe('applicazione della revisione AI', () => {
  it('trova e sostituisce un estratto esatto', () => {
    const out = applyReplacement(text, 'osserva il balcone con calma', 'osserva con calma il tuo balcone');
    expect(out).toContain('osserva con calma il tuo balcone');
    expect(out).not.toContain('osserva il balcone con calma');
    expect(out!.startsWith('Prima di comprare')).toBe(true);
  });

  it('tollera puntini, virgolette e spazi diversi agli estremi', () => {
    expect(locateExcerpt(text, '…osserva il balcone con calma…')).not.toBeNull();
    expect(locateExcerpt(text, '«osserva il balcone con calma»')).not.toBeNull();
    expect(locateExcerpt(text, 'Osserva l\'ombra   dei palazzi.')).not.toBeNull(); // il testo ha un ritorno a capo
  });

  it('non tocca il testo se il passaggio non si trova con sicurezza o la sostituzione è vuota', () => {
    expect(applyReplacement(text, 'frase che non esiste affatto nel capitolo', 'x')).toBeNull();
    expect(applyReplacement(text, 'osserva il balcone con calma', '   ')).toBeNull();
    expect(locateExcerpt(text, 'corto')).toBeNull();
  });

  it('sostituisce solo la prima occorrenza', () => {
    const t = 'ciao a tutti amici. ciao a tutti amici.';
    expect(applyReplacement(t, 'ciao a tutti amici.', 'salve a tutti.')).toBe('salve a tutti. ciao a tutti amici.');
  });
});
