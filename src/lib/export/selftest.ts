/** Auto-test del motore PDF all'avvio del server: il risultato finisce nei log (utile su host dove non si può aprire una shell). */
import { newOfflinePage, withBrowser } from './chromium';

export interface SelfTestResult {
  ok: boolean;
  detail: string;
}

export async function rendererSelfTest(): Promise<SelfTestResult> {
  const t0 = Date.now();
  try {
    const detail = await withBrowser(async (browser) => {
      const page = await newOfflinePage(browser);
      try {
        await page.setContent('<!doctype html><meta charset="utf-8"><h1>FOLYNTRA — prova di impaginazione</h1><p>àèéìòù</p>', { waitUntil: 'load' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw new Error('il risultato non è un PDF');
        return `Chromium ${browser.version()} · PDF di prova ${pdf.length} byte in ${Date.now() - t0} ms`;
      } finally {
        await page.context().close();
      }
    });
    return { ok: true, detail };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.split('\n')[0] : 'errore sconosciuto' };
  }
}
