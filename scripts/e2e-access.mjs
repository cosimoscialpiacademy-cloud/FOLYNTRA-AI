// E2E della protezione con codice di accesso + percorso AI "reale" contro un FINTO server Anthropic.
// Avvia da solo l'app (porta 3100) e il finto provider: nessuna rete esterna, nessun costo, nessuna chiave vera.
// Uso: npm run build && CHROMIUM_EXECUTABLE_PATH=... node scripts/e2e-access.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const CODE = 'codice-di-prova-1';
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.resolve('test-output/e2e-access');
mkdirSync(OUT, { recursive: true });
const exe = [process.env.CHROMIUM_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!exe) throw new Error('Chromium non trovato: imposta CHROMIUM_EXECUTABLE_PATH');

// ---- finto provider compatibile Anthropic ----
const upstream = [];
const brainstorm = { ideas: Array.from({ length: 3 }, (_, i) => ({ keyword: `Idea reale di prova ${i + 1}`, buyerPersona: 'Persona di prova', secondaryKeywords: ['a', 'b', 'c'], unmetNeed: 'Bisogno di prova', differentiators: ['d1', 'd2'], risks: ['r1'] })) };
const sig = (value) => ({ value, why: 'giudizio qualitativo di prova' });
const keepaProduct = (asin, bsr, reviews) => ({ asin, title: `Libro di prova ${asin}`, numberOfPages: 160, binding: 'Paperback', publicationDate: 20240101, images: [{ variant: 'MAIN', l: `${asin}.jpg` }], stats: { current: [-1, 1499, -1, bsr, ...Array(12).fill(-1), 44, reviews] } });
const fake = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url?.startsWith('/search')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return void res.end(JSON.stringify({ tokensLeft: 99, products: [keepaProduct('BTEST00001', 2500, 180), keepaProduct('BTEST00002', 5200, 90), keepaProduct('BTEST00003', 9000, 40)] }));
  }
  let s = '';
  for await (const c of req) s += c;
  const body = JSON.parse(s);
  const prompt = JSON.stringify(body.messages);
  upstream.push({ key: req.headers['x-api-key'] ?? null, auth: req.headers.authorization ?? null, stream: Boolean(body.stream), headers: Object.keys(req.headers), scoring: prompt.includes('Valuta queste ipotesi di nicchia') });
  let payload = brainstorm;
  if (prompt.includes("Estrai l'elenco dei LIBRI")) {
    payload = { books: [{ title: 'Orto sul balcone facile', asin: '', price: 12.99, rating: 4.5, reviews: 1234, boughtLastMonth: 1000, pages: -1, bsr: -1 }, { title: 'Verdure in vaso', asin: '', price: 9.99, rating: 4.2, reviews: 310, boughtLastMonth: 100, pages: -1, bsr: -1 }], notes: '' };
  }
  if (prompt.includes('Valuta queste ipotesi di nicchia')) {
    const ids = [...prompt.matchAll(/id=([0-9a-zA-Z-]+)/g)].map((m) => m[1]);
    payload = { results: ids.map((id, i) => ({ id, demand: sig(70 - i), competition: sig(50), trend: sig(60), unitEconomics: sig(55), differentiation: sig(65), risks: ['rischio di prova'], verifyChecklist: ['verifica 1', 'verifica 2'], summary: 'Sintesi di prova.' })) };
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(payload) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 700 } }));
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const fakePort = fake.address().port;

const app = spawn(path.resolve('node_modules/.bin/next'), ['start', '-p', String(PORT), '-H', '127.0.0.1'], {
  env: { ...process.env, KEEPA_API_KEY: 'keepa-finta-solo-test', KEEPA_BASE_URL: `http://127.0.0.1:${fakePort}`, ANTHROPIC_API_KEY: 'sk-ant-finta-solo-test', ANTHROPIC_BASE_URL: `http://127.0.0.1:${fakePort}`, ENABLE_EXTERNAL_PAID_APIS: 'true', APP_ACCESS_CODE: CODE, NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' },
  stdio: 'ignore',
});
const stop = () => { app.kill(); fake.close(); };
process.on('exit', stop);

const results = [];
const assert = (c, m) => { if (!c) throw new Error(m); };
const step = async (name, fn) => {
  try {
    const d = await fn();
    results.push(name);
    console.log(`  OK   ${name}${d ? ` — ${d}` : ''}`);
  } catch (e) {
    console.log(`  FAIL ${name} — ${String(e.message).split('\n')[0]}`);
    throw e;
  }
};

let browser;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/status`)).ok) break; } catch { /* attende l'avvio */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'it-IT' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await step('API senza codice: AI ed export rifiutano (401), lo stato non svela il codice', async () => {
    const ai = await fetch(`${BASE}/api/ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const ex = await fetch(`${BASE}/api/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert(ai.status === 401 && ex.status === 401, `attesi 401, ottenuti ${ai.status}/${ex.status}`);
    const st = await (await fetch(`${BASE}/api/status`)).json();
    assert(st.access.required === true && st.access.valid === false, 'stato accesso errato');
    assert(!JSON.stringify(st).includes(CODE) && !JSON.stringify(st).includes('sk-ant'), 'lo stato espone segreti');
    return `ai ${ai.status}, export ${ex.status}`;
  });

  await step('Senza codice: /dashboard rimanda alla pagina di accesso', async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForURL(`${BASE}/`);
    await page.getByText('Accesso riservato').first().waitFor();
    await page.screenshot({ path: path.join(OUT, '01-accesso-riservato.png'), fullPage: false });
  });

  await step('Codice errato: errore chiaro, nessun accesso', async () => {
    await page.getByLabel('Codice di accesso').fill('codice-sbagliato-9');
    await page.getByRole('button', { name: /Sblocca/ }).click();
    await page.getByText('Codice errato').waitFor();
    assert(new URL(page.url()).pathname === '/', 'non doveva entrare');
  });

  await step('Codice giusto: entra nell’app con AI reale attiva (badge modello)', async () => {
    await page.getByLabel('Codice di accesso').fill(CODE);
    await page.getByRole('button', { name: /Sblocca/ }).click();
    await page.waitForURL('**/dashboard');
    await page.getByText('AI: claude-opus-5-5').waitFor();
    await page.screenshot({ path: path.join(OUT, '02-dashboard-ai-reale.png') });
  });

  await step('Brainstorm con provider “reale” + stima IA automatica: percentuali visibili e dichiarate', async () => {
    await page.goto(`${BASE}/nicchie`, { waitUntil: 'networkidle' });
    await page.getByPlaceholder(/manutenzione domestica/).fill('orto sul balcone');
    await page.getByRole('button', { name: /Genera ipotesi di nicchia/ }).click();
    await page.getByText('Idea reale di prova 1').first().waitFor({ timeout: 20000 });
    const row = page.locator('tr', { hasText: 'Idea reale di prova 1' });
    await row.getByText('Stima IA').first().waitFor({ timeout: 20000 });
    const cells = (await row.innerText()).replace(/\s+/g, ' ');
    const m = cells.match(/(\d+)\s*Stima IA\s*(\d+)%\s*(\d+)%/);
    assert(m, `riga senza percentuali: ${cells}`);
    const [, score, conf, cov] = m.map(Number);
    assert(score > 0 && score <= 100, `opportunità non valida: ${score}`);
    assert(conf > 0 && conf <= 30, `affidabilità deve essere bassa (≤30%), trovata ${conf}%`);
    assert(cov === 100, `copertura attesa 100%, trovata ${cov}%`);
    await page.getByText(/non dati di mercato/).first().waitFor();
    const calls = upstream.length;
    assert(calls === 2, `chiamate al provider: ${calls} (attese 2: ipotesi + stima)`);
    assert(upstream[0].key === 'sk-ant-finta-solo-test' || String(upstream[0].auth).includes('sk-ant-finta-solo-test'), 'la chiave del server non è stata usata');
    assert(upstream.every((u) => !String(u.auth ?? '').includes(CODE)), 'il codice di accesso è finito al provider');
    await page.screenshot({ path: path.join(OUT, '03-brainstorm-reale.png'), fullPage: true });
    return `opportunità ${score}% · affidabilità ${conf}% · copertura ${cov}% · 2 chiamate`;
  });

  await step('Dati reali (Keepa) dal dettaglio nicchia: concorrenti e segnali importati, affidabilità sopra il 30% delle sole stime IA', async () => {
    const row = page.locator('tr', { hasText: 'Idea reale di prova 1' });
    await row.getByRole('button', { name: 'Apri' }).click();
    await page.getByRole('button', { name: /Dati reali \(Keepa\)/ }).click();
    await page.getByText(/Dati reali importati da Keepa \(3 libri\)/).waitFor({ timeout: 20000 });
    await page.getByText('Libro di prova BTEST00001').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(1800); // salvataggio ritardato
    const cells = (await row.innerText()).replace(/\s+/g, ' ');
    const m = cells.match(/(\d+)\s*(?:Stima IA)?\s*(\d+)%\s*(\d+)%/);
    assert(m, `riga senza percentuali: ${cells}`);
    const conf = Number(m[2]);
    assert(conf > 30, `affidabilità attesa > 30% con dati reali, trovata ${conf}%`);
    assert(!JSON.stringify(upstream).includes('keepa-finta'), 'la chiave Keepa è finita altrove');
    await page.screenshot({ path: path.join(OUT, '04-dati-reali-keepa.png'), fullPage: true });
    return `affidabilità ${conf}% (da 30%)`;
  });

  await step('Incolla da Amazon (gratis): l’IA estrae i libri dal testo copiato e la nicchia si riempie di concorrenti e segnali', async () => {
    const row = page.locator('tr', { hasText: 'Idea reale di prova 2' });
    await row.getByRole('button', { name: 'Apri' }).click();
    await page.getByLabel('Testo copiato da Amazon').fill('Risultati\nOrto sul balcone facile - Guida per principianti 4,5 su 5 stelle (1.234) Più di 1.000 acquistati nell\'ultimo mese 12,99 €\nVerdure in vaso - manuale pratico 4,2 su 5 stelle (310) Più di 100 acquistati nell\'ultimo mese 9,99 €\nSponsorizzato: Semi di pomodoro.');
    await page.getByRole('button', { name: /Estrai e importa/ }).click();
    await page.getByText(/Importati 2 libri dai dati incollati/).waitFor({ timeout: 20000 });
    await page.getByText('Orto sul balcone facile').first().waitFor({ timeout: 10000 });
    assert(upstream.length === 3, `chiamate al provider IA: ${upstream.length} (attese 3: ipotesi, stima, estrazione)`);
    await page.screenshot({ path: path.join(OUT, '05-incolla-amazon.png'), fullPage: true });
    return '2 libri estratti e importati';
  });

  await step('Il codice resta salvato solo sul dispositivo; “Blocca” lo cancella e richiede di nuovo il codice', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText('AI: claude-opus-5-5').waitFor();
    await page.getByRole('button', { name: /Blocca/ }).first().click();
    await page.waitForURL(`${BASE}/`);
    await page.getByText('Accesso riservato').first().waitFor();
  });

  await step('Nessun segreto nel codice servito al browser', async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    assert(!html.includes('sk-ant') && !html.includes(CODE), 'segreto nel HTML');
  });

  await step('Nessun errore JavaScript in pagina', async () => assert(errors.length === 0, errors.join(' | ')));
  console.log(`\n${results.length} passi superati. Schermate: ${OUT}`);
} catch (err) {
  console.error('\nTest fallito:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  stop();
}
