/** Eseguito una volta all'avvio del server (solo produzione, runtime Node). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production' || process.env.RENDERER_SELFTEST === 'false') return;
  const { chromiumPath } = await import('./lib/export/chromium');
  if (!chromiumPath()) {
    console.warn('[renderer] Chromium non trovato: PDF e copertine non saranno disponibili (imposta CHROMIUM_EXECUTABLE_PATH).');
    return;
  }
  const { rendererSelfTest } = await import('./lib/export/selftest');
  void rendererSelfTest().then((r) => (r.ok ? console.log(`[renderer] OK — ${r.detail}`) : console.error(`[renderer] FALLITO — ${r.detail}`)));
}
