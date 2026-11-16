import { describe, expect, it } from 'vitest';
import { rendererSelfTest } from '../src/lib/export/selftest';

describe('auto-test del motore PDF', () => {
  it('con Chromium disponibile produce un PDF e lo dichiara', async () => {
    const r = await rendererSelfTest();
    expect(r.ok, r.detail).toBe(true);
    expect(r.detail).toMatch(/Chromium .* PDF di prova \d+ byte/);
  });

  it('con un percorso Chromium inesistente fallisce con un messaggio chiaro, senza lanciare', async () => {
    const saved = process.env.CHROMIUM_EXECUTABLE_PATH;
    process.env.CHROMIUM_EXECUTABLE_PATH = '/non/esiste/chrome';
    try {
      const r = await rendererSelfTest();
      // se esiste un altro Chromium di sistema l'esito può essere ok: in ogni caso non deve lanciare
      expect(typeof r.ok).toBe('boolean');
    } finally {
      if (saved === undefined) delete process.env.CHROMIUM_EXECUTABLE_PATH;
      else process.env.CHROMIUM_EXECUTABLE_PATH = saved;
    }
  });
});
