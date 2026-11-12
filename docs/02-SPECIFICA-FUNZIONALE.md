# FOLYNTRA AI — Specifica funzionale

## Persona e promessa realistica

Utente: autore/editore indipendente che vuole scoprire domanda, differenziarsi, creare contenuti originali utili e distribuire via KDP. Promessa: **ridurre il lavoro editoriale ripetitivo**, non garantire vendite.

## Journey principale (stati persistenti)

1. **Inizio**: nuovo progetto, mercato (Amazon.it/com/uk/de/fr/es), lingua, obiettivo, competenze, fascia prezzo, ore di revisione disponibili, budget massimo strumenti/Ads.
2. **Trova nicchia**: genera 10-20 ipotesi da input tema/pubblico, ma etichetta IPOTESI. Cerca dati live via provider autorizzato o carica CSV. Classifica qualità e opportunità, mostra concorrenti e fonti, evidenzia lacune, genera 3 idee differenziate. L'utente sceglie un'ipotesi e accetta un rischio.
3. **Brief**: pubblico target, problema, obiettivo concreto, differenziatore, argomenti da escludere, riferimenti, versione libro; layout non-fiction, ricettario, workbook. Nessuna scelta resta esclusa dal progetto a valle.
4. **Progetta**: titoli/sottotitoli, indice completo numerato, front matter (frontespizio, colophon, copyright, avviso IA opzionale per lettore, introduzione), body matter (capitoli e sottocapitoli), back matter (conclusione, appendici, risorse, bibliografia, biografia). Proposta di lunghezza basata su valore, non sul numero finto di pagine.
5. **Scrivi**: generazione a capitolo con prompt coerenti e contesto riassunto; bozza -> revisione -> verificato -> bloccato; autosave, cronologia e recupero errore; originale, no copia eccessiva dei competitor. Obiettivo: un libro che risolva il problema della nicchia, non solo testo generico.
6. **Controlla**: ortografia, contenuti ripetuti, titoli non corrispondenti all'indice, segnaposto, affermazioni non supportate, errori di ricetta, diritti immagini, qualità del testo, leggibilità, riferimenti, campi obbligatori.
7. **Progetta grafica**: copertina tipografica con template originale e 3 variazioni, assets con diritti verificabili, spine PDF per stampa usando conteggio pagine del PDF finale, margini e bleed; preview mobile di book cover e pagine interne, scelta tipografia, template.
8. **Esporta**: PDF interno stampa, PDF copertina completa, eBook EPUB + JPEG cover, Word DOCX, metadata.json/csv, guida KDP, report copyright/AI, manifest SHA-256, ZIP dei bonus, moduli A+. Controlli automatizzati e revisioni manuali.
9. **Pubblica**: checklist e link al KDP ufficiale, caricamento e conferma **da parte dell'utente** (non API inesistente). Campi di stato 'pacchetto pronto'/'inviato dall'utente'/'pubblicato e verificato'. Pubblicazione/successo non auto dichiarati.
10. **Vendi**: sito/landing facoltativo, keyword plan, campagne Amazon Ads manuali, allocazione costo-per-click, A+; import report Amazon e Ads, dashboard unit economics.

## Tipologie libro

| Tipo | MVP | Evoluzione |
|---|---|---|
| Manuale pratico / saggistica | Sì, capitoli e fonti | Revisione collaborativa |
| Workbook / guida con esercizi | Sì, modelli schede | Planner avanzati |
| Ricettario | Template e controlli | Fotografia illustrativa provider autorizzato |
| Fiction | Outline e bozza fase B | Memoria personaggi e continuità |
| Libro illustrato bambini | Template fase C | Illustrazioni coerenti e diritti |
| Puzzle / low content | Non primario | Generatore regole speciali KDP |

## Definizione interfaccia

Navigazione: Panoramica, Scopri nicchie, Progetti, Editor, Cover Studio, KDP Export, Ads Lab, Royalties, Impostazioni. Un progetto usa wizard step-by-step con progress bar reale, salvataggio, undo, revisioni. Ogni output ha status `bozza`, `da_verificare`, `verificato`, `esportato`. Desktop con preview divisa; iPhone con tab progressiva e pulsanti grandi.

## Permessi/Costi

Uso personale singolo nella fase A; schema pronto per più account, ogni utente vede solo i propri dati. Ogni chiamata AI ha stimato/speso e budget totale e per libro. Confronta prezzo di listino e margine per mercato usando costi stampa documentati e aggiornabili; non finge vendite.
