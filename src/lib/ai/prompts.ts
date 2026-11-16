/** Prompt in italiano. Contesto parsimonioso: brief + indice + riassunti (docs/04). */
import type { BriefCtx, ChapterInput } from './schemas';

export const SYSTEM_EDITORIAL = `Sei un redattore editoriale esperto di saggistica pratica per l'autoedizione.
Regole inderogabili:
- Scrivi contenuti originali e utili per il lettore descritto nel brief, nella lingua indicata.
- Non inventare fonti, studi, statistiche, citazioni, testimonianze, recensioni o certificazioni. Se un'affermazione richiede una fonte che non ti è stata fornita, scrivi il segnaposto [FONTE MANCANTE: cosa va verificato] accanto all'affermazione.
- Non promettere risultati, guadagni o guarigioni. Per temi di salute, legali o finanziari invita a rivolgersi a un professionista.
- Non imitare né citare libri concorrenti; non usare marchi registrati come se fossero tuoi.
- Non inserire link, moduli di raccolta email, giveaway o inviti a lasciare recensioni.`;

export function briefBlock(b: BriefCtx): string {
  const row = (k: string, v: string) => (v.trim() ? `${k}: ${v.trim()}\n` : '');
  return (
    row('Titolo di lavoro', b.title) + row('Sottotitolo', b.subtitle) + row('Tipo di libro', { nonfiction: 'manuale pratico / saggistica', workbook: 'workbook con esercizi', cookbook: 'ricettario' }[b.kind]) +
    row('Lingua del libro', b.language) + row('Mercato', b.marketplace) + row('Nicchia / keyword', b.keyword) + row('Pubblico', b.audience) +
    row('Problema del lettore', b.problem) + row('Obiettivo concreto', b.goal) + row('Proposta unica', b.uniqueValue) +
    row('Argomenti da escludere', b.exclusions) + row('Stile', b.style) + row('Sinossi', b.synopsis)
  );
}

export function brainstormPrompt(i: { theme: string; audience: string; marketplace: string; language: string; category: string }): string {
  return `Genera 12 IPOTESI di nicchie e micro-nicchie per libri su ${i.marketplace} (lingua: ${i.language}).
Tema di partenza: ${i.theme}
${i.audience ? `Pubblico indicato: ${i.audience}\n` : ''}${i.category ? `Categoria di interesse: ${i.category}\n` : ''}
Per ogni ipotesi indica: keyword principale, chi compra e perché, 3-5 keyword secondarie, bisogno non soddisfatto, 2-3 differenziatori editoriali, rischi (affidabilità, competenze richieste, marchi, temi sensibili).
NON fornire volumi di ricerca, vendite, BSR, prezzi o qualunque numero di mercato: sono ipotesi da verificare con dati reali.`;
}

export function conceptPrompt(b: BriefCtx): string {
  return `Brief di partenza:\n${briefBlock(b)}
Proponi il concept editoriale: un titolo principale, esattamente 5 titoli alternativi, un sottotitolo, pubblico, problema, obiettivo concreto, proposta unica, una sinossi di 120-180 parole, esattamente 7 keyword di ricerca pertinenti (non fuorvianti, senza marchi né nomi di altri autori) e una descrizione di vendita di 150-250 parole in testo semplice, senza promesse di risultati.`;
}

export function outlinePrompt(b: BriefCtx, chapterCount: number, targetWords: number): string {
  return `Brief:\n${briefBlock(b)}
Progetta l'indice del libro: esattamente ${chapterCount} capitoli in progressione logica, per circa ${targetWords} parole complessive.
Per ogni capitolo: titolo, riassunto di 2-3 frasi su cosa impara il lettore, 3-6 sottosezioni (titoli brevi) e parole obiettivo (la somma deve avvicinarsi a ${targetWords}).
${b.kind === 'cookbook' ? 'È un ricettario: i capitoli raggruppano ricette; le sottosezioni sono i nomi delle ricette.' : ''}${b.kind === 'workbook' ? 'È un workbook: ogni capitolo termina con una sottosezione di esercizi.' : ''}`;
}

export function chapterPrompt(i: ChapterInput): string {
  const outline = i.outline.map((c) => `${c.position}. ${c.title}`).join('\n');
  const prev = i.previousSummaries.length ? `Riassunto dei capitoli precedenti (non ripeterli):\n${i.previousSummaries.map((s, n) => `- Cap. ${n + 1}: ${s}`).join('\n')}\n\n` : '';
  const sources = i.verifiedSources.length ? `Fonti verificate dall'autore che puoi citare (solo queste):\n${i.verifiedSources.map((s) => `- ${s}`).join('\n')}\n\n` : 'Non ti sono state fornite fonti verificate: non citarne nessuna.\n\n';
  const kind =
    i.brief.kind === 'cookbook'
      ? 'Per ogni ricetta usa questo schema: "### Nome ricetta", poi "#### Ingredienti" (elenco puntato con quantità), "#### Procedimento" (passi numerati che usano tutti gli ingredienti elencati), "#### Note".'
      : i.brief.kind === 'workbook'
        ? 'Chiudi il capitolo con una sezione "## Esercizi" con 3-5 esercizi pratici e spazi di risposta indicati come elenco di attività "- [ ]".'
        : 'Inserisci dove utile un riquadro di approfondimento come citazione Markdown ("> **Nota:** ...") e, se serve, una tabella Markdown.';
  return `Brief:\n${briefBlock(i.brief)}
Indice completo:\n${outline}

${prev}${sources}Scrivi il capitolo ${i.chapter.position}: "${i.chapter.title}".
Cosa deve coprire: ${i.chapter.summary}
Sottosezioni obbligatorie (usa esattamente questi titoli come "## "):\n${i.chapter.sections.map((s) => `- ${s}`).join('\n') || '- (decidi tu 3-5 sottosezioni)'}

Lunghezza: circa ${i.chapter.targetWords} parole. Formato: Markdown, senza ripetere il titolo del capitolo come H1 e senza preamboli o commenti rivolti a me. ${kind}`;
}

export function reviewPrompt(b: BriefCtx, title: string, content: string): string {
  return `Brief:\n${briefBlock(b)}
Rivedi il capitolo "${title}" qui sotto. Segnala al massimo 12 problemi concreti, classificati come: stile, grammatica, struttura, fatti.
Per "fatti" segnala le affermazioni che richiedono una fonte o una verifica: NON proporre fonti inventate, indica solo cosa va verificato.
Per ogni problema riporta l'estratto esatto (max 200 caratteri), il problema e la correzione suggerita. Chiudi con un giudizio sintetico di 2-3 frasi. Non certificare l'originalità del testo.

--- CAPITOLO ---
${content}`;
}

export function marketingPrompt(b: BriefCtx, authorName: string, currentDescription: string): string {
  return `Brief del libro:\n${briefBlock(b)}Autore: ${authorName.trim() || '(da indicare)'}
${currentDescription.trim() ? `Descrizione attuale (migliorala, non copiarla):\n${currentDescription.trim()}\n` : ''}
Prepara il KIT MARKETING per il lancio manuale di questo libro su Amazon KDP. Rispetta SEMPRE queste regole:
- NIENTE testimonianze, recensioni, premi, "bestseller", "n. 1", statistiche, percentuali o numeri di vendita. Se servirebbe una prova, scrivi [DA VERIFICARE: cosa serve].
- NIENTE promesse di risultati, guadagni, guarigioni o tempi garantiti. Descrivi cosa il lettore trova nel libro, non cosa otterrà per certo.
- Per la biografia dell'autore NON inventare titoli di studio, esperienze, premi o numeri: usa solo il nome indicato e segnaposto [DA COMPLETARE: ...] per ogni fatto personale.
- Niente prezzi, sconti o inviti a lasciare recensioni (Amazon li vieta nei contenuti del prodotto). Nessun link inventato.
- Le email sono per la lista di contatti dell'autore stessa (persone che hanno scelto di riceverle): niente spam.

Produci:
1. hook: una frase di posizionamento (max 20 parole).
2. amazonDescription: descrizione di vendita 150-230 parole, testo semplice con paragrafi brevi, per il pubblico indicato.
3. bullets: 5 punti breve "cosa trovi nel libro" (nessuna promessa di risultato).
4. aPlus: 4 moduli per i contenuti A+ (titolo, testo 40-70 parole, idea per l'immagine da far realizzare all'autore).
5. authorBio: 70-110 parole, in terza persona, con segnaposto per i fatti personali.
6. emails: 3 email di lancio (annuncio, approfondimento utile con un consiglio tratto dal tema, ultimo promemoria): oggetto, testo 80-140 parole, quando inviarla (es. "giorno del lancio").
7. posts: 6 post per social diversi (Instagram, Facebook, LinkedIn, X, TikTok come copione breve, Pinterest): testo e 3-5 hashtag pertinenti.
8. adAngles: 5 angolazioni per annunci Sponsored Products MANUALI (idee di messaggio e di parole chiave, senza cifre di budget).
9. launchChecklist: 10 passi pratici e realistici per le prime due settimane (inclusa la verifica manuale di tutto ciò che è [DA VERIFICARE]).`;
}
