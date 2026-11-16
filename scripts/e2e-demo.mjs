// E2E in modalità DEMO (docs/06): nicchia → brief → indice → 2 capitoli → cover → ZIP.
// Uso: avviare l'app (npm run build && npm start) e poi `npm run e2e`.
// Variabili: E2E_BASE_URL (default http://localhost:3000), CHROMIUM_EXECUTABLE_PATH, E2E_OUT (cartella output).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve(process.env.E2E_OUT ?? 'test-output/e2e');
const exe = [process.env.CHROMIUM_EXECUTABLE_PATH, process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!exe) throw new Error('Chromium non trovato: imposta CHROMIUM_EXECUTABLE_PATH');
mkdirSync(OUT, { recursive: true });

const results = [];
const step = async (name, fn) => {
  const t = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? '', ms: Date.now() - t });
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, detail: String(err?.message ?? err).split('\n')[0], ms: Date.now() - t });
    console.log(`  FAIL ${name} — ${String(err?.message ?? err).split('\n')[0]}`);
    throw err;
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, locale: 'it-IT' });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());
const shot = (name, opts = {}) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true, ...opts });
const TITLE = 'Manuale pratico di manutenzione domestica di base';
let zipPath = '';

try {
  await step('Landing: accesso in modalità demo locale dichiarata', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByText('Modalità demo locale').waitFor();
    await shot('01-landing');
    await page.getByRole('link', { name: /Entra nell’app/ }).click();
    await page.waitForURL('**/dashboard');
    await page.getByText('MODALITÀ DEMO LOCALE').waitFor();
    await page.getByText('AI: mock dichiarato').waitFor();
  });

  await step('Nicchie DEMO etichettate, affidabilità 0%', async () => {
    await page.goto(`${BASE}/nicchie`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Carica nicchie DEMO/ }).click();
    await page.getByRole('button', { name: 'Organizzazione domestica per piccoli appartamenti' }).waitFor();
    const row = page.locator('tr', { hasText: 'Organizzazione domestica per piccoli appartamenti' });
    assert((await row.innerText()).includes('DEMO'), 'badge DEMO assente');
    assert((await row.innerText()).includes('0%'), 'affidabilità demo non è 0%');
    await page.getByText('non indicano domanda reale').first().waitFor();
  });

  await step('CSV malformato: errore comprensibile, dati esistenti intatti', async () => {
    await page.setInputFiles('#csv-file', { name: 'rotto.csv', mimeType: 'text/csv', buffer: Buffer.from('keyword,marketplace,demand,competition,trend,unitEconomics,differentiation\n"Senza mercato",,50,50,50,50,50\n"Valore errato",amazon.it,abc,50,50,50,50\n\n') });
    const box = page.getByTestId('import-result');
    await box.getByText('Nessuna nicchia importata').waitFor();
    await box.getByText(/Marketplace non supportato/).waitFor();
    await box.getByText(/deve essere un numero fra 0 e 100/).waitFor();
    await page.getByRole('button', { name: 'Organizzazione domestica per piccoli appartamenti' }).waitFor();
  });

  await step('CSV valido importato con fonte e data', async () => {
    await page.setInputFiles('#csv-file', { name: 'mie-nicchie.csv', mimeType: 'text/csv', buffer: Buffer.from('keyword,marketplace,demand,competition,trend,unitEconomics,differentiation,source_type,source_name,observed_at\n"Manutenzione casa per chi vive in affitto",amazon.it,62,48,55,58,70,imported,"Rilevazione manuale di prova",2026-11-01\n') });
    await page.getByTestId('import-result').getByText('1 nicchie importate').waitFor();
    const row = page.locator('tr', { hasText: 'Manutenzione casa per chi vive in affitto' });
    await row.waitFor();
    assert(!(await row.innerText()).includes('DEMO'), 'la nicchia importata non deve essere DEMO');
    await shot('02-nicchie');
  });

  await step('Confronto affiancato di due nicchie', async () => {
    await page.getByLabel('Confronta Organizzazione domestica per piccoli appartamenti').check();
    await page.getByLabel('Confronta Manutenzione casa per chi vive in affitto').check();
    await page.getByText('Confronto affiancato').waitFor();
  });

  await step('Selezione nicchia → progetto con brief precompilato', async () => {
    await page.getByRole('button', { name: 'Organizzazione domestica per piccoli appartamenti' }).first().click();
    await page.getByText('Crea il libro in questa nicchia').waitFor();
    await page.getByLabel('Nome del progetto / titolo di lavoro').fill(TITLE);
    assert(await page.getByRole('button', { name: 'Crea il libro' }).isDisabled(), 'il libro non deve essere creabile senza accettare il rischio');
    await page.getByLabel(/Accetto il rischio/).check();
    await page.getByRole('button', { name: 'Crea il libro' }).click();
    await page.waitForURL('**/progetti/**');
    await page.getByRole('heading', { name: TITLE }).waitFor();
    assert((await page.getByLabel('Pubblico', { exact: true }).inputValue()).includes('Adulti che vivono in spazi ridotti'), 'pubblico non ereditato dalla nicchia');
    await page.getByLabel('Autore (nome in copertina)').fill('Mario Rossi');
  });

  await step('Titolo + 5 alternative e concept (mock dichiarato)', async () => {
    await page.getByRole('button', { name: /Proponi titoli e concept/ }).click();
    await page.getByText('Titoli alternativi').waitFor();
    const n = await page.locator('button.rounded-full').count();
    assert(n >= 5, `attese ≥5 alternative, trovate ${n}`);
    await page.getByText('Tutte le modifiche sono salvate').waitFor();
    await shot('03-brief');
    return `${n} alternative`;
  });

  let chapterTitles = [];
  await step('Indice di 5 capitoli, modificabile e persistente al ricaricamento', async () => {
    await page.getByRole('tab', { name: /Indice/ }).click();
    await page.getByLabel('Numero di capitoli').fill('5');
    await page.getByRole('button', { name: /Genera indice/ }).click();
    await page.getByTestId('chapter-row').nth(4).waitFor();
    assert((await page.getByTestId('chapter-row').count()) === 5, 'attesi 5 capitoli');
    await page.getByLabel('Titolo capitolo 1').fill('Le basi della manutenzione di casa');
    await page.waitForTimeout(1500);
    chapterTitles = await page.getByTestId('chapter-row').locator('input[aria-label^="Titolo capitolo"]').evaluateAll((els) => els.map((e) => e.value));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('chapter-row').nth(4).waitFor();
    const after = await page.getByTestId('chapter-row').locator('input[aria-label^="Titolo capitolo"]').evaluateAll((els) => els.map((e) => e.value));
    assert(JSON.stringify(after) === JSON.stringify(chapterTitles), 'la struttura è cambiata dopo il ricaricamento');
    await shot('04-indice');
    return after.join(' | ');
  });

  await step('2 capitoli generati in job separati, salvati e persistenti', async () => {
    await page.getByRole('tab', { name: /Scrittura/ }).click();
    await page.getByText('Mock dichiarato attivo').waitFor();
    await page.getByRole('button', { name: /Genera i prossimi 2 capitoli/ }).click();
    await page.getByTestId('generation-progress').waitFor();
    await page.getByTestId('generation-progress').waitFor({ state: 'detached', timeout: 60_000 });
    const nav = page.getByRole('navigation', { name: 'Capitoli' });
    assert((await nav.getByText('Da rivedere').count()) === 2, 'attesi 2 capitoli generati');
    await page.reload({ waitUntil: 'networkidle' });
    assert((await page.getByRole('navigation', { name: 'Capitoli' }).getByText('Da rivedere').count()) === 2, 'i capitoli non sono rimasti dopo il ricaricamento');
    const text = await page.getByLabel(/Testo del capitolo/).inputValue();
    assert(text.includes('TESTO DEMO (mock)'), 'il testo mock deve essere marcato');
    await page.getByText('Contiene testo DEMO generato dal mock').waitFor();
    await shot('05-scrittura');
  });

  await step('Editor: modifica salvata, cronologia, blocco rifiutato per testo mock', async () => {
    const editor = page.getByLabel(/Testo del capitolo/);
    await editor.fill((await editor.inputValue()) + '\n\nParagrafo aggiunto a mano durante il test.');
    await page.getByText(/· salvato/).waitFor();
    await page.getByRole('button', { name: 'Salva versione' }).click();
    await page.getByText('Versione salvata nella cronologia.').waitFor();
    await page.getByRole('button', { name: /Ho rivisto questo capitolo/ }).click();
    await page.getByText(/Contiene testo DEMO del mock/).first().waitFor();
  });

  await step('Cover: 3 proposte, template scelto, PDF interno e dorso dalle pagine reali', async () => {
    await page.getByRole('tab', { name: /Cover/ }).click();
    assert((await page.locator('button[aria-pressed]', { hasText: /Classico|Moderno|Editoriale/ }).count()) === 3, 'attese 3 proposte di copertina');
    await page.getByRole('button', { name: /Editoriale/ }).click();
    await page.getByLabel('Testo del retro').fill('Un manuale chiaro per prendersi cura della casa.\n\nControlli periodici, piccole riparazioni e indicazioni su quando chiamare un professionista.');
    await page.getByRole('button', { name: 'Retro + dorso + fronte' }).click();
    await page.getByText(/Il dorso dipende dalle pagine reali/).waitFor();
    await page.getByRole('button', { name: /Genera anteprima PDF interno/ }).click();
    await page.getByText(/PDF interno pronto/).waitFor({ timeout: 120_000 });
    await page.getByTestId('cover-preview').waitFor();
    const info = await page.getByText(/Dorso:/).innerText();
    await shot('06-cover');
    return info.replace(/\s+/g, ' ');
  });

  await step('Export ZIP KDP: file completi, stato BOZZA bloccato dai controlli critici', async () => {
    await page.getByRole('tab', { name: /KDP Kit/ }).click();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 180_000 }), page.getByRole('button', { name: /Esporta ZIP KDP/ }).click()]);
    zipPath = path.join(OUT, download.suggestedFilename());
    await download.saveAs(zipPath);
    await page.getByTestId('export-result').waitFor();
    await page.getByText('BOZZA — NON PRONTO PER KDP').waitFor();
    assert(await page.locator('option[value="inviato_dall_utente"]').isDisabled(), 'lo stato "inviato" deve restare bloccato');
    assert(zipPath.includes('BOZZA'), 'il nome dello ZIP deve dichiarare BOZZA');
    await shot('07-kit');
  });

  let zipFiles = [];
  await step('Contenuto dello ZIP e checksum del manifest', async () => {
    const zip = await JSZip.loadAsync(readFileSync(zipPath));
    zipFiles = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).sort();
    for (const f of ['manuscript.pdf', 'ebook.epub', 'editable.docx', 'cover-print.pdf', 'cover-ebook.jpg', 'metadata.json', 'kdp-checklist.md', 'ai-disclosure.json', 'manifest.json', 'bonus/quaderno-operativo.pdf', 'qa-report.md']) assert(zipFiles.includes(f), `manca ${f}`);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    const { createHash } = await import('node:crypto');
    for (const f of manifest.files) assert(createHash('sha256').update(await zip.file(f.name).async('nodebuffer')).digest('hex') === f.sha256, `checksum errato: ${f.name}`);
    const qa = JSON.parse(await zip.file('qa-report.json').async('string'));
    assert(qa.kdpReady === false, 'con testo mock il pacchetto non può essere pronto');
    writeFileSync(path.join(OUT, 'qa-report.json'), JSON.stringify(qa, null, 2));
    return `${zipFiles.length} file, ${manifest.pagine} pagine`;
  });

  await step('Marketing: kit generato (mock dichiarato), modificabile, scaricabile, nello ZIP', async () => {
    await page.getByRole('tab', { name: /^Marketing/ }).click();
    await page.getByText('Nessun kit ancora').waitFor();
    await page.getByRole('button', { name: /Genera kit marketing/ }).click();
    await page.getByText('TESTO DEMO (mock)').first().waitFor();
    await page.getByLabel('Frase di posizionamento').waitFor();
    assert((await page.getByLabel('Frase di posizionamento').inputValue()).includes('TESTO DEMO (mock)'), 'il kit mock deve essere marcato');
    // modifica salvata: sostituisco la frase e ricarico
    await page.getByLabel('Frase di posizionamento').fill('Una guida chiara per tenere la casa in ordine.');
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: /^Marketing/ }).click();
    assert((await page.getByLabel('Frase di posizionamento').inputValue()) === 'Una guida chiara per tenere la casa in ordine.', 'la modifica non è stata salvata');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Scarica \.md/ }).click()]);
    const md = readFileSync(await dl.path(), 'utf8');
    assert(md.includes('# Kit marketing') && md.includes('Una guida chiara per tenere la casa in ordine.') && md.includes('BOZZA'), 'markdown scaricato incompleto');
    await shot('07a-marketing');
    // esporta di nuovo il kit e controlla che marketing/ sia nello ZIP
    await page.getByRole('tab', { name: /KDP Kit/ }).click();
    const [zdl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: /Esporta ZIP KDP/ }).click()]);
    const zip2 = await JSZip.loadAsync(readFileSync(await zdl.path()));
    assert(zip2.file('marketing/kit-marketing.md'), 'marketing/kit-marketing.md assente dallo ZIP');
    await page.getByText(/Kit marketing senza testo segnaposto/).waitFor();
    return 'kit in ZIP + controllo QA (avviso)';
  });

  await step('Ads & Royalties: piano manuale, import report, ACOS e pareggio', async () => {
    await page.getByRole('tab', { name: /Ads & Royalties/ }).click();
    await page.getByText('Nessun report importato: nessuna performance viene mostrata').waitFor({ state: 'detached', timeout: 1000 }).catch(() => undefined);
    await page.getByRole('button', { name: 'Crea piano Ads' }).click();
    await page.getByText('ACOS di pareggio').waitFor();
    await page.getByText(/avvio campagne manuale finché Amazon Ads API non è autorizzata/).waitFor();
    await page.getByText('Nessun report importato: nessuna performance viene mostrata').waitFor();
    await page.setInputFiles('#ads-report-file', { name: 'report-ads.csv', mimeType: 'text/csv', buffer: Buffer.from('Campaign Name,Targeting,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)\n"Manuale casa","manutenzione casa","1,200",40,"€ 12,00","€ 38,97",3\n"Manuale casa","fai da te",800,10,"€ 4,00","€ 0,00",0\n') });
    const box = page.getByTestId('ads-results');
    await box.waitFor();
    const text = (await box.innerText()).replace(/\s+/g, ' ');
    assert(text.includes('41,06%'), `ACOS atteso 41,06% — ${text.slice(0, 200)}`);
    assert(text.includes('2,44'), 'ROAS atteso 2,44');
    await page.setInputFiles('#royalties-file', { name: 'royalties.csv', mimeType: 'text/csv', buffer: Buffer.from('Royalty Date,Title,Marketplace,Units Sold,Royalty,Currency\n2026-10-31,"Manuale",Amazon.it,5,"18,50",EUR\n2026-10-31,"Manuale",Amazon.de,2,"7,40",EUR\nnon-una-data,"Manuale",Amazon.it,1,1,EUR\n') });
    const roy = page.getByTestId('royalties-results');
    await roy.waitFor();
    assert((await roy.innerText()).includes('25,90'), 'totale royalties atteso 25,90');
    await page.getByText(/Data non valida/).waitFor();
    await shot('07b-ads-royalties');
    return 'ACOS 41,06% · ROAS 2,44 · royalties 25,90 EUR';
  });

  await step('Libro da colorare: tipo, 15 mandala, PDF con indice e pagine bianche, kit solo cartaceo', async () => {
    const COLOR_TITLE = 'Animali del mare da colorare';
    await page.goto(`${BASE}/nicchie`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Organizzazione domestica per piccoli appartamenti' }).first().click();
    await page.getByLabel('Nome del progetto / titolo di lavoro').fill(COLOR_TITLE);
    await page.getByLabel(/Accetto il rischio/).check();
    await page.getByRole('button', { name: 'Crea il libro' }).click();
    await page.waitForURL('**/progetti/**');
    await page.getByRole('heading', { name: COLOR_TITLE }).waitFor();
    await page.getByLabel('Autore (nome in copertina)').fill('Mario Rossi');
    await page.getByLabel('Tipo di libro').selectOption('coloring');
    await page.getByRole('tab', { name: /Disegni/ }).waitFor();
    assert((await page.getByRole('tab', { name: /^\d? ?Scrittura/ }).count()) === 0, 'un libro da colorare non deve avere la scheda Scrittura');
    await page.getByRole('tab', { name: /Disegni/ }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /5 mandala/ }).click();
    await page.getByText(/15 disegni/).first().waitFor();
    await page.getByRole('button', { name: /Disegna con IA le 0 mancanti/ }).isDisabled();
    await shot('10-disegni');
    await page.getByRole('tab', { name: /Cover/ }).click();
    await page.getByRole('button', { name: /Genera anteprima PDF interno/ }).click();
    await page.getByText(/PDF interno pronto/).waitFor({ timeout: 180_000 });
    const pagesTxt = await page.getByText(/Dorso:/).innerText();
    await page.getByRole('tab', { name: /KDP Kit/ }).click();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 240_000 }), page.getByRole('button', { name: /Esporta ZIP KDP/ }).click()]);
    const zp = path.join(OUT, `colorare-${download.suggestedFilename()}`);
    await download.saveAs(zp);
    const zip = await JSZip.loadAsync(readFileSync(zp));
    const names = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name);
    assert(names.includes('manuscript.pdf') && names.includes('cover-print.pdf'), 'mancano PDF interno o copertina');
    assert(!names.some((n) => n.endsWith('.epub') || n.endsWith('.docx') || n.startsWith('bonus/')), 'un libro da colorare non deve avere EPUB/DOCX/bonus');
    const qa = JSON.parse(await zip.file('qa-report.json').async('string'));
    const ck = (id) => qa.checks.find((c) => c.id === id);
    assert(ck('colora.disegni')?.result === 'ok', 'controllo disegni non ok');
    assert(ck('colora.ia')?.result === 'ok', 'dichiarazione IA incoerente');
    assert(qa.kdpReady === false, 'senza conferma di diritti e revisione non può essere pronto');
    await shot('11-kit-colorare');
    return `${pagesTxt.replace(/\s+/g, ' ').slice(0, 60)} · ${names.length} file`;
  });

  await step('Dashboard aggiornata con dati reali', async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.getByText(TITLE).first().waitFor();
    await page.getByText(/Kit KDP esportato/).first().waitFor();
    await shot('08-dashboard');
  });

  await step('Responsive iPhone 390 px: nessuno scorrimento orizzontale', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const report = [];
    for (const url of ['/dashboard', '/nicchie', '/progetti', '/impostazioni']) {
      await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `scorrimento orizzontale di ${overflow}px su ${url}`);
      report.push(url);
    }
    await page.goto(`${BASE}/progetti`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: TITLE }).click();
    for (const tab of ['Brief', 'Indice', 'Scrittura', 'Cover', 'KDP Kit', 'Marketing', 'Ads & Royalties']) {
      await page.getByRole('tab', { name: new RegExp(tab) }).click();
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `scorrimento orizzontale di ${overflow}px nella scheda ${tab}`);
      await shot(`09-mobile-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`, { fullPage: false });
    }
    return `${report.length} pagine + 7 schede`;
  });

  await step('Nessun errore in console', async () => {
    assert(consoleErrors.length === 0, `errori console: ${consoleErrors.slice(0, 3).join(' | ')}`);
  });
} finally {
  writeFileSync(path.join(OUT, 'e2e-report.json'), JSON.stringify({ base: BASE, date: new Date().toISOString(), results, consoleErrors, zip: zipPath }, null, 2));
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passi superati. Output: ${OUT}`);
process.exit(failed ? 1 : 0);
