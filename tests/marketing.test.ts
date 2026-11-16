import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { mockMarketing } from '../src/lib/ai/mock';
import { marketingPrompt } from '../src/lib/ai/prompts';
import { AiRequest, MarketingOutput } from '../src/lib/ai/schemas';
import { runAi } from '../src/lib/ai/server';
import { marketingHasMock, marketingPlaceholders, marketingToMarkdown, toMarketingKit } from '../src/lib/book/marketing';
import { ExportRequest } from '../src/lib/bundle-schema';
import { buildKit } from '../src/lib/export/kit';
import { withBrowser } from '../src/lib/export/chromium';
import { briefCtx, sampleBundle } from './fixtures';

const NOW = '2026-11-12T08:00:00.000Z';
const mockKit = () => toMarketingKit(mockMarketing(briefCtx('Manuale di casa'), 'Mario Rossi'), 'mock', NOW);
const realKit = () => toMarketingKit({
  hook: 'Una guida chiara per prendersi cura della casa.', amazonDescription: 'Un manuale pratico con controlli stagionali.', bullets: ['Controlli per ogni stagione', 'Quando chiamare un professionista'],
  aPlus: [{ title: 'Controlli', body: 'Schede per ogni stagione.', imageIdea: 'Foto di una checklist' }], authorBio: 'Mario Rossi scrive di manutenzione domestica.',
  emails: [{ subject: 'È uscito il libro', body: 'Ciao, ecco il mio libro.', sendWhen: 'Giorno del lancio' }], posts: [{ platform: 'Facebook', text: 'Nuovo libro!', hashtags: ['casa', '#fai da te'] }],
  adAngles: ['Chi vive in affitto'], launchChecklist: ['Rileggi tutto'],
}, 'anthropic', NOW);

describe('kit marketing', () => {
  it('il mock produce un kit valido per lo schema, interamente marcato come DEMO', () => {
    const out = mockMarketing(briefCtx('Manuale di casa'), 'Mario Rossi');
    expect(MarketingOutput.safeParse(out).success).toBe(true);
    const kit = toMarketingKit(out, 'mock', NOW);
    expect(marketingHasMock(kit)).toBe(true);
    expect(kit.emails).toHaveLength(3);
    expect(kit.posts).toHaveLength(6);
    expect(kit.aPlus).toHaveLength(4);
    expect(marketingToMarkdown({ title: 'T', author: 'A' }, kit)).toMatch(/BOZZA — contiene testo segnaposto/);
  });

  it('il mock non inventa recensioni, premi, classifiche o numeri', () => {
    const md = marketingToMarkdown({ title: 'T', author: 'A' }, mockKit());
    expect(md).not.toMatch(/bestseller|n\. ?1|recensi[oa]n[ei] da|★|⭐|premio vinto|\d+ ?%|\d+ copie/i);
    expect(md).toContain('[DA COMPLETARE'); // la bio chiede all'autore i fatti personali
  });

  it('un kit scritto davvero non risulta mock e normalizza gli hashtag', () => {
    const kit = realKit();
    expect(marketingHasMock(kit)).toBe(false);
    expect(kit.posts[0].hashtags).toEqual(['#casa', '#fai da te']);
    expect(marketingPlaceholders(kit)).toBe(0);
  });

  it('i segnaposto [DA COMPLETARE/VERIFICARE] vengono contati', () => {
    const kit = { ...realKit(), authorBio: 'Mario [DA COMPLETARE: studi] ha [DA VERIFICARE: premio].' };
    expect(marketingPlaceholders(kit)).toBe(2);
  });

  it('il prompt vieta testimonianze, promesse, recensioni a pagamento e bio inventate', () => {
    const p = marketingPrompt(briefCtx('Manuale'), 'Mario Rossi', '');
    expect(p).toMatch(/NIENTE testimonianze, recensioni, premi/);
    expect(p).toMatch(/NIENTE promesse/);
    expect(p).toMatch(/NON inventare titoli di studio/);
    expect(p).toMatch(/inviti a lasciare recensioni/);
  });

  it('il task marketing passa dal livello AI (mock dichiarato) e rispetta lo schema', async () => {
    const req = AiRequest.parse({ task: 'marketing', input: { brief: briefCtx('Manuale'), authorName: 'Mario Rossi', currentDescription: '' }, projectId: null, spentUsd: 0, budgetUsd: 5 });
    const events = [];
    for await (const e of runAi(req, new AbortController().signal)) events.push(e);
    const done = events.find((e) => e.t === 'done');
    expect(done).toMatchObject({ t: 'done', provider: 'mock', usage: { costUsd: 0 } });
    expect(MarketingOutput.safeParse((done as { data: unknown }).data).success).toBe(true);
  });
});

describe('kit marketing nello ZIP', () => {
  it('lo schema di export lo accetta e il kit contiene marketing/kit-marketing.md con controllo QA', async () => {
    const bundle = sampleBundle({ chapters: 6, real: true });
    bundle.project.marketing = realKit();
    expect(ExportRequest.safeParse({ format: 'kit', bundle }).success).toBe(true);
    const kit = await withBrowser((b) => buildKit(bundle, b, new Date(NOW)));
    const zip = await JSZip.loadAsync(kit.zip);
    const md = await zip.file('marketing/kit-marketing.md')!.async('string');
    expect(md).toContain('# Kit marketing');
    expect(md).toContain('Una guida chiara per prendersi cura della casa.');
    expect(kit.files.some((f) => f.name === 'marketing/kit-marketing.md')).toBe(true);
    const qa = kit.checks.find((c) => c.id === 'marketing.stato')!;
    expect(qa).toMatchObject({ result: 'ok', severity: 'avviso' });
  });

  it('con kit mock: avviso (non blocca) e senza kit: controllo "non eseguito" informativo', async () => {
    const withMock = sampleBundle({ chapters: 6, real: true });
    withMock.project.marketing = mockKit();
    const a = await withBrowser((b) => buildKit(withMock, b, new Date(NOW)));
    expect(a.checks.find((c) => c.id === 'marketing.stato')).toMatchObject({ result: 'fallito', severity: 'avviso' });
    expect(a.kdpReady).toBe(true); // il marketing è facoltativo: non blocca "pronto"
    const none = sampleBundle({ chapters: 6, real: true });
    const b2 = await withBrowser((b) => buildKit(none, b, new Date(NOW)));
    expect(b2.checks.find((c) => c.id === 'marketing.stato')).toMatchObject({ result: 'non_eseguito', severity: 'info' });
    expect(b2.files.some((f) => f.name.startsWith('marketing/'))).toBe(false);
  });
});
