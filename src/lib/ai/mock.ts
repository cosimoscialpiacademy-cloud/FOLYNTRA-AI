/**
 * Provider MOCK dichiarato: nessuna chiamata esterna, costo zero.
 * Produce strutture plausibili per provare il flusso e testo segnaposto
 * chiaramente marcato, che il QA blocca come "non pubblicabile".
 */
import { MOCK_MARKER } from '../book/analysis';
import type { BrainstormOutput, ChapterInput, ConceptOutput, OutlineOutput, ReviewOutput, BriefCtx } from './schemas';

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
