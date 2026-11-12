/** Avvio di Chromium per il rendering paginato (PDF) e delle copertine. */
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';

const CANDIDATES = [
  process.env.CHROMIUM_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

export class RendererUnavailableError extends Error {}

export function chromiumPath(): string | null {
  return CANDIDATES.find((p): p is string => Boolean(p) && existsSync(p as string)) ?? null;
}

export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const executablePath = chromiumPath();
  if (!executablePath) {
    throw new RendererUnavailableError('Chromium non trovato: imposta CHROMIUM_EXECUTABLE_PATH con il percorso di Chrome/Chromium sul server.');
  }
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--font-render-hinting=none'] });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/** Blocca ogni richiesta di rete: i documenti sono autosufficienti (font e immagini in data URL). */
export async function newOfflinePage(browser: Browser) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.route('**/*', (route) => (route.request().url().startsWith('data:') || route.request().url() === 'about:blank' ? route.continue() : route.abort()));
  return context.newPage();
}
