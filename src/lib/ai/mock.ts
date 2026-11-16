/**
 * Provider MOCK dichiarato: nessuna chiamata esterna, costo zero.
 * Produce strutture plausibili per provare il flusso e testo segnaposto
 * chiaramente marcato, che il QA blocca come "non pubblicabile".
 */
import { MOCK_MARKER } from '../book/analysis';
import type { BrainstormOutput, ChapterInput, ConceptOutput, CoverConcept, CoverCritiqueOutput, CoverStrategyOutput, MarketingOutput, OutlineOutput, ReviewOutput, BriefCtx } from './schemas';

export const MOCK_MODEL = 'mock-dichiarato';

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const topicOf = (b: BriefCtx) => (b.keyword || b.title || 'argomento del libro').trim();

export function mockBrainstorm(theme: string): BrainstormOutput {
  const angles = [
    'per principianti assoluti', 'in 15 minuti al giorno', 'per chi ha poco spazio', 'con budget ridotto', 'per famiglie con bambini',
    'per over 60', 'guida passo passo illustrata a parole', 'errori comuni da evitare', 'checklist stagionali', 'quaderno di lavoro',
  ];
  return {
    ideas: angles.map((a) => ({
      keyword: `${cap(theme.trim())} ${a}`,
      buyerPersona: 'IPOTESI mock: da definire con ricerca reale.',
      secondaryKeywords: [`${theme.trim()} guida`, `${theme.trim()} manuale`, `${theme.trim()} ${a.split(' ').slice(-1)[0]}`],
      unmetNeed: 'IPOTESI mock: nessun bisogno verificato.',
      differentiators: ['Struttura pratica con checklist', 'Linguaggio semplice senza tecnicismi'],
      risks: ['Idea generata dal mock senza alcun dato di mercato'],
    })),
  };
}

export function mockConcept(b: BriefCtx): ConceptOutput {
  const t = cap(topicOf(b));
  return {
    title: b.title || t,
    altTitles: [`${t}: la guida pratica`, `${t} senza stress`, `Il metodo semplice per ${t.toLowerCase()}`, `${t} passo dopo passo`, `${t}: tutto quello che serve sapere`],
    subtitle: 'Guida pratica passo dopo passo, con checklist ed esempi',
    audience: b.audience || 'Da definire: chi compra questo libro e perché.',
    problem: b.problem || 'Da definire: il problema concreto che il lettore vuole risolvere.',
    goal: b.goal || 'Da definire: cosa saprà fare il lettore alla fine del libro.',
    uniqueValue: b.uniqueValue || 'Da definire: perché questo libro è diverso dagli altri.',
    synopsis: `[${MOCK_MARKER}] Sinossi segnaposto per "${t}". Configura la chiave Anthropic per ottenere una proposta reale oppure scrivila a mano.`,
    keywords: [t.toLowerCase(), `${t.toLowerCase()} guida`, `${t.toLowerCase()} manuale`, `${t.toLowerCase()} per principianti`, `${t.toLowerCase()} pratico`, `${t.toLowerCase()} passo passo`, `${t.toLowerCase()} checklist`],
    description: `[${MOCK_MARKER}] Descrizione segnaposto: sostituiscila prima di pubblicare.`,
  };
}

export function mockOutline(b: BriefCtx, chapterCount: number, targetWords: number): OutlineOutput {
  const t = topicOf(b).toLowerCase();
  const pool = [
    { title: `Le basi: capire ${t}`, sections: ['Da dove partire', 'Concetti essenziali', 'Errori da evitare'] },
    { title: 'Strumenti e preparazione', sections: ['Cosa serve davvero', 'Organizzare lo spazio di lavoro', 'Sicurezza prima di tutto'] },
    { title: 'Il metodo passo dopo passo', sections: ['Pianificare', 'Eseguire', 'Verificare il risultato'] },
    { title: 'Problemi frequenti e soluzioni', sections: ['Riconoscere il problema', 'Soluzioni rapide', 'Quando chiamare un professionista'] },
    { title: 'Routine e manutenzione nel tempo', sections: ['Controlli periodici', 'Calendario stagionale', 'Checklist riassuntiva'] },
    { title: 'Casi pratici', sections: ['Caso semplice', 'Caso intermedio', 'Caso complesso'] },
    { title: 'Risparmiare tempo e denaro', sections: ['Priorità', 'Costi nascosti', 'Scelte sostenibili'] },
    { title: 'Piano d’azione personale', sections: ['Valutazione iniziale', 'Obiettivi a 30 giorni', 'Come mantenere i risultati'] },
  ];
  const per = Math.round(targetWords / chapterCount / 50) * 50;
  return {
    chapters: Array.from({ length: chapterCount }, (_, i) => {
      const p = pool[i % pool.length];
      return {
        title: i < pool.length ? p.title : `${p.title} (parte ${Math.floor(i / pool.length) + 1})`,
        summary: `Struttura proposta dal mock per "${t}": da rivedere e riscrivere.`,
        sections: p.sections,
        targetWords: per,
      };
    }),
  };
}

/** Testo segnaposto strutturato (titoli, elenco, riquadro, tabella) per provare impaginazione ed export. */
export function mockChapter(i: ChapterInput): string {
  const sections = i.chapter.sections.length ? i.chapter.sections : ['Prima sezione', 'Seconda sezione', 'Terza sezione'];
  const filler = (n: number, s: string) =>
    `Questo paragrafo ${n} della sezione «${s}» è un segnaposto del capitolo ${i.chapter.position}, «${i.chapter.title}». ` +
    'Serve soltanto a verificare salvataggio, cronologia, impaginazione ed esportazione senza consumare crediti AI. ' +
    `Non contiene informazioni reali sull’argomento e va sostituito con testo scritto o generato e poi revisionato da una persona (rif. ${i.chapter.position}.${n}.${s.length}).`;
  const parts: string[] = [`> **${MOCK_MARKER}** — Segnaposto prodotto senza AI. Non è contenuto pubblicabile: l’esportazione resta in stato BOZZA finché è presente.`, ''];
  sections.forEach((s, idx) => {
    parts.push(`## ${s}`, '', filler(1, s), '', filler(2, s), '');
    if (idx === 0) parts.push('- Primo punto segnaposto dell’elenco', '- Secondo punto segnaposto dell’elenco', '- Terzo punto segnaposto dell’elenco', '');
    if (idx === 1) parts.push('| Voce | Descrizione segnaposto |', '|---|---|', '| A | Riga di esempio della tabella |', '| B | Seconda riga di esempio |', '');
    if (idx === 2) parts.push('> **Nota:** riquadro di esempio per verificare la resa dei box nel PDF e nell’EPUB.', '');
    parts.push(filler(3, s), '');
  });
  if (i.brief.kind === 'workbook') parts.push('## Esercizi', '', '- [ ] Esercizio segnaposto 1', '- [ ] Esercizio segnaposto 2', '');
  return parts.join('\n');
}

export function mockReview(): ReviewOutput {
  return {
    issues: [],
    summary: 'Revisione AI non eseguita: è attivo il mock. Sono comunque disponibili i controlli automatici locali (segnaposto, duplicati, fonti, indice).',
  };
}

/** Kit marketing segnaposto: ogni testo porta il marcatore MOCK e nessun dato inventato. */
export function mockMarketing(b: BriefCtx, authorName: string): MarketingOutput {
  const t = topicOf(b);
  const tag = `[${MOCK_MARKER}]`;
  return {
    hook: `${tag} Frase di posizionamento segnaposto per «${t}».`,
    amazonDescription: `${tag} Descrizione segnaposto per «${t}». Configura la chiave Anthropic per ottenere una bozza reale oppure scrivila tu.`,
    bullets: Array.from({ length: 5 }, (_, i) => `${tag} Punto ${i + 1} segnaposto: cosa trova il lettore nel libro.`),
    aPlus: Array.from({ length: 4 }, (_, i) => ({ title: `${tag} Modulo ${i + 1}`, body: 'Testo segnaposto del modulo A+.', imageIdea: 'Idea immagine segnaposto: da far realizzare all’autore.' })),
    authorBio: `${tag} ${authorName.trim() || 'L’autore'} [DA COMPLETARE: chi sei, cosa ti qualifica, perché questo libro].`,
    emails: [
      { subject: `${tag} Annuncio`, body: 'Testo segnaposto dell’email di annuncio.', sendWhen: 'Giorno del lancio' },
      { subject: `${tag} Approfondimento`, body: 'Testo segnaposto dell’email di approfondimento.', sendWhen: 'Tre giorni dopo il lancio' },
      { subject: `${tag} Promemoria`, body: 'Testo segnaposto dell’ultimo promemoria.', sendWhen: 'Una settimana dopo il lancio' },
    ],
    posts: ['Instagram', 'Facebook', 'LinkedIn', 'X', 'TikTok (copione)', 'Pinterest'].map((platform) => ({ platform, text: `${tag} Post segnaposto per ${platform}.`, hashtags: ['#segnaposto'] })),
    adAngles: Array.from({ length: 5 }, (_, i) => `${tag} Angolazione ${i + 1} segnaposto per un annuncio manuale.`),
    launchChecklist: ['Rileggi tutto il libro', 'Conferma di aver riveduto ogni capitolo', 'Carica i file su KDP e controlla il Previewer', 'Prepara la tua lista contatti', 'Sostituisci ogni testo segnaposto', 'Verifica ogni [DA VERIFICARE]', 'Pianifica le email', 'Prepara i post', 'Valuta un piccolo test Ads manuale', 'Annota i risultati reali'].map((x) => `${tag} ${x}`),
  };
}

/** Strategia copertina segnaposto: valida per lo schema, marcata MOCK, nessun parere di mercato inventato. */
export function mockCoverStrategy(i: { currentCover: { title: string }; catalog: { id: string; tone: 'dark' | 'light' }[] }): CoverStrategyOutput {
  const tag = `[${MOCK_MARKER}]`;
  const dark = i.catalog.find((a) => a.tone === 'dark')?.id ?? '';
  const light = i.catalog.find((a) => a.tone === 'light')?.id ?? '';
  const concept = (name: string, template: CoverConcept['template'], artId: string, bg: string, accent: string, text: string, font: CoverConcept['titleFont']): CoverConcept => ({
    name: `${tag} ${name}`, rationale: `${tag} Motivazione segnaposto: serve la chiave AI per un'analisi vera.`, standOut: `${tag} Nessuna analisi dei concorrenti eseguita.`,
    template, artId, customArtPrompt: '', palette: { background: bg, accent, text }, titleFont: font, titleLines: (i.currentCover.title || 'Titolo').split(' ').slice(0, 4),
    taglineSuggestion: '', thumbnailTest: `${tag} Riduci la copertina a 100 px e controlla che il titolo si legga.`, risks: `${tag} Concept non basato su dati.`, badges: [],
  });
  return {
    marketReading: { dominantStyles: [`${tag} Analisi non eseguita`], colorPatterns: [`${tag} Analisi non eseguita`], typographyPatterns: [`${tag} Analisi non eseguita`], gaps: [`${tag} Analisi non eseguita`] },
    audienceInsight: `${tag} Nessuna analisi del pubblico: configura la chiave Anthropic.`,
    basedOn: 'solo_testo_e_conoscenze_generali',
    concepts: [
      concept('Scuro d’impatto', 'immersiva', dark, '#0A1426', '#E4C07A', '#F7F4ED', 'Montserrat'),
      concept('Chiaro elegante', 'vetrina', light, '#F4F1EA', '#A9852F', '#1B2233', 'Playfair Display'),
      concept('Cornice sobria', 'cornice', dark, '#04292E', '#7FF3E1', '#F2FFFC', 'EB Garamond'),
    ],
    recommendedIndex: 0,
    recommendationReason: `${tag} Nessuna raccomandazione reale: è un segnaposto per provare il flusso.`,
    thumbnailChecklist: [`${tag} Il titolo si legge a 100 px?`, `${tag} Si distingue accanto ai concorrenti?`, `${tag} Il genere è riconoscibile?`],
  };
}

export function mockCoverCritique(i: { currentCover: { title: string }; catalog: { id: string; tone: 'dark' | 'light' }[] }): CoverCritiqueOutput {
  const tag = `[${MOCK_MARKER}]`;
  const s = mockCoverStrategy(i);
  return {
    verdict: `${tag} Nessuna valutazione reale: è attivo il mock.`, standsOut: `${tag} Non valutato.`, readability: `${tag} Non valutata.`,
    strengths: [`${tag} Non valutati`], problems: [`${tag} Non valutati`], improvedConcept: s.concepts[0],
  };
}
