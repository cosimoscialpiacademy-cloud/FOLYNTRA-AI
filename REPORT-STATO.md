# REPORT DI STATO — FOLYNTRA AI

**Data:** 12 novembre 2026 · **Repository:** `cosimoscialpiacademy-cloud/FOLYNTRA-AI` · **Branch:** `claude/happy-einstein-upmneo`

**Sintesi:** la Fase A è implementata e verificata end-to-end in modalità DEMO locale. Tre cose non sono state verificate perché mancano risorse esterne: AI Anthropic reale (nessuna chiave), Supabase (nessun progetto dedicato), deploy Netlify. **Il prodotto non è "completo al 100%".**

## Comandi eseguiti e risultati

| Comando | Esito |
|---|---|
| `npm install` | ok, `npm audit --omit=dev`: 0 vulnerabilità |
| `npm run typecheck` | 0 errori |
| `npm run lint` | 0 errori, 0 avvisi |
| `npm test` | 44/44 test in 6 file |
| `npm run build` | compilato; 5 pagine e 3 route API |
| `npm run e2e` (su `npm start`) | 17/17 passi, 0 errori in console |

## Percorso DEMO dimostrato (E2E automatico nel browser)

Progetto «Manuale pratico di manutenzione domestica di base», mercato Italia.

1. Accesso in modalità demo locale, con badge "MODALITÀ DEMO LOCALE" e "AI: mock dichiarato".
2. Nicchie DEMO caricate ed etichettate, affidabilità 0%.
3. CSV malformato: errori per riga comprensibili, nessun dato esistente alterato. CSV valido: nicchia importata con fonte e data.
4. Confronto affiancato di due nicchie.
5. Nicchia selezionata (con accettazione del rischio) → progetto con pubblico, keyword e categoria già nel brief.
6. Titolo con 5 alternative e concept.
7. Indice di 5 capitoli, modificato e identico dopo il ricaricamento della pagina.
8. 2 capitoli generati in job separati, presenti dopo il ricaricamento, marcati "TESTO DEMO (mock)".
9. Editor: modifica salvata, versione in cronologia; il capitolo mock non può essere marcato "rivisto".
10. Copertina: 3 proposte, template scelto; PDF interno di 11 pagine; dorso calcolato dalle pagine reali.
11. Export ZIP: scaricato, stato **BOZZA** (corretto: contiene testo mock), stati di pubblicazione bloccati.
12. Checksum SHA-256 del manifest ricalcolati e coincidenti per tutti i file.
13. Ads & Royalties: piano creato dalle keyword, report Ads importato (ACOS 41,06%, ROAS 2,44 calcolati dai dati), royalties importate (25,90 EUR), riga con data non valida scartata con messaggio.
14. Dashboard aggiornata; iPhone 390 px senza scorrimento orizzontale su 4 pagine e 6 schede.

### File prodotti nello ZIP (`…-kdp-kit-BOZZA.zip`, 17 pagine)

| File | Byte |
|---|---|
| `manuscript.pdf` | 111 574 |
| `cover-print.pdf` | 60 613 |
| `cover-ebook.jpg` (1600 × 2560) | 480 470 |
| `ebook.epub` | 434 982 |
| `editable.docx` | 11 261 |
| `bonus/quaderno-operativo.pdf` | 62 605 |
| `metadata.json` · `metadata.csv` | 2 352 · 859 |
| `description.html` | 85 |
| `royalty-simulation.json` | 1 032 |
| `ai-disclosure.json` | 1 495 |
| `diritti.md` | 597 |
| `kdp-checklist.md` | 3 156 |
| `guida-caricamento-kdp.md` | 1 020 |
| `qa-report.md` · `qa-report.json` | 8 669 · 15 260 |
| `manifest.json` | SHA-256 di tutti i file |

### Controlli QA su quell'export

- **20 superati**, tra cui: formato pagina 6 × 9 in uniforme, font tutti incorporati (interno e copertina), copertina dimensionata dal numero di pagine reale, JPEG 1600 × 2560, struttura EPUB, struttura DOCX, dichiarazione IA coerente.
- **8 falliti, come previsto in demo:** meno di 5 capitoli con testo, testo mock presente, paragrafi duplicati (avviso), capitoli non rivisti, conferma di revisione mancante, metadati con segnaposto/categoria DEMO, diritti non confermati, meno di 24 pagine.
- **3 non eseguiti e dichiarati:** epubcheck, KDP Previewer, copia di prova.

Un secondo test (`tests/export.test.ts`) esporta un libro con testo rivisto e conferme complete: 43 pagine, **tutti i controlli critici superati, stato "pronto"**. Verificato anche con strumenti esterni: `pdfinfo` (43 pagine, 432 × 648 pt), `pdffonts` (tutti i font `emb yes`), copertina 889,92 × 666 pt = 12,36 × 9,25 in, coerente con il dorso di 43 pagine su carta crema.

## Cosa funziona oggi

- Dashboard con soli numeri reali (progetti, capitoli, parole, export, spesa AI, attività).
- Niche Intelligence: brainstorming di ipotesi, import CSV (segnali o concorrenti), DEMO etichettata, formula di `docs/03`, affidabilità separata, rischi, concorrenti manuali con stima dichiarata, confronto, scenari economici ipotetici.
- Book Architect: brief dalla nicchia, titolo + 5 alternative, sinossi, pagine iniziali/finali, fonti verificabili, glossario, indice modificabile con blocco capitoli.
- Book Writer: job per capitolo, salvataggio progressivo, ripresa dopo interruzione, retry, idempotenza, budget, token e costi, cronologia versioni, controlli (segnaposto, fonti mancanti, duplicati, indice, ricette), revisione AI.
- Cover & Interior: 3 template originali, palette, font, testi; PDF interno paginato; anteprima fronte e copertina completa con guide.
- KDP Kit: ZIP, QA che blocca lo stato "pronto", stati di pubblicazione dichiarati dall'utente.
- Ads & Royalties: piano Sponsored Products manuale, ACOS di pareggio, CPC massimo, import report Ads e royalties KDP in CSV, margine reale distinto da quello stimato; la dashboard mostra spesa Ads e royalties solo se importate.
- Backup/ripristino JSON dei dati, PWA installabile con pagina offline.

## Cosa NON è stato verificato

| Area | Stato | Cosa serve |
|---|---|---|
| **AI Anthropic reale** | Codice scritto (SDK ufficiale, streaming, output strutturati, limiti di costo) e compilato, **mai eseguito contro l'API**. I "2 capitoli reali + export valido" della definizione di finito **non sono stati fatti**. | Chiave API Anthropic con credito e il tuo consenso alla spesa |
| **Supabase** | Adapter e schema scritti, **mai eseguiti** su un database. Nel tuo account esistono solo progetti di altri prodotti, che non ho toccato. Il test "utente A non vede i dati di B" non è stato eseguito. | Un progetto Supabase nuovo dedicato a FOLYNTRA |
| **Deploy Netlify** | `netlify.toml` presente, **nessun deploy**. Le Netlify Functions non includono Chromium: PDF e copertine richiedono un host Node con Chrome o un worker esterno. | Decisione sull'hosting |
| **epubcheck** | Non eseguito: l'esecuzione dello strumento scaricato è stata negata in questo ambiente. L'EPUB ha solo la verifica strutturale interna. L'app lo esegue da sola se imposti `EPUBCHECK_JAR`. | Java + epubcheck sul server, oppure Kindle Previewer |
| **KDP Previewer** | Non eseguibile da software: è un passaggio manuale. | Caricamento di prova sul tuo account |

## Scostamenti dalle specifiche

- **API**: `docs/04` elenca endpoint REST con accesso al database lato server. Ho realizzato tre route di solo calcolo (`/api/ai`, `/api/export`, `/api/status`); i dati vengono letti e scritti dal client nell'archivio dell'utente (IndexedDB oppure Supabase con RLS). Motivo: far funzionare lo stesso flusso senza database. Conseguenza: i job sono persistenti e riprendibili ma guidati dal browser, non da un worker; se chiudi la pagina la generazione si ferma e si riprende alla riapertura.
- **Budget**: il server rifiuta le richieste che supererebbero il tetto, ma la spesa già sostenuta gli viene comunicata dal client. È adeguato all'uso personale della Fase A, non a un servizio multiutente.
- **Schema SQL**: corretto un errore di sintassi nello starter (`+` al posto di `||` nel blocco delle policy) e aggiunte in modo additivo due tabelle (`chapter_revisions`, `activity_log`) e alcune colonne; rimosso il vincolo unico su `(book_id, position)` che impediva il riordino dei capitoli.
- **Limite di frequenza**: in memoria per istanza, non distribuito.
- **Costi di stampa in euro**: non ho trovato la tabella ufficiale per Amazon.it; i valori sono marcati "indicativi" in interfaccia e nei file. Quelli in dollari e sterline corrispondono alla documentazione KDP consultata.
- **Test 9 e 11 di `docs/06`**: il bonus PDF è incluso (quaderno operativo derivato dall'indice); Ads planner e import CSV sono implementati. Gli alias delle colonne dei report Amazon **non sono stati verificati su file reali**: se un tuo report non viene riconosciuto, l'errore elenca le colonne attese.

## Cosa resta da fare

- **Subito, con le tue credenziali:** prova reale con Anthropic; progetto Supabase e test RLS con due utenti; scelta dell'hosting e deploy verificato.
- **Fase A, rifiniture:** immagini caricate dall'utente in copertina; trascinamento per riordinare i capitoli (oggi frecce su/giù); annulla/ripeti nell'editor oltre alla cronologia.
- **Fase B rimanente:** adapter Keepa, import trend, A+ content, pagina autore, email e post di lancio, altri bonus.
- **Per vendere il software:** login multiutente verificato, controllo di spesa AI lato server per utente (oppure chiave Anthropic personale dell'acquirente), pagamenti e licenze, hosting con Chromium, termini di servizio e informativa privacy.
- **Fase C:** Amazon Ads API dopo approvazione, abbonamenti e team, traduzioni, illustrazioni, fiction.

## API con costo potenziale

- **Anthropic**: a consumo. Indicativamente un libro di 20 000 parole richiede circa 60–80 mila token in uscita: meno di 2 $ con Opus 5.5, meno di 1 $ con Sonnet 5.5, pochi centesimi con Haiku 5.5. Stima non misurata. Tetto predefinito 20 $ per libro.
- **Supabase**: il piano gratuito basta per l'uso personale, ma ha un numero limitato di progetti attivi.
- **Keepa, Amazon Ads**: non usate; nessuna chiamata viene effettuata.

## Prima azione per te

Apri l'app in locale (`npm install`, poi `npm run dev`) e percorri il flusso demo. Poi dimmi quale delle tre verifiche mancanti vuoi sbloccare per prima: chiave Anthropic, progetto Supabase nuovo, oppure hosting.


---

## Aggiornamento — identità visiva, protezione accesso, deploy

**Eseguito davvero (16/11/2026):**
- `npm run typecheck`, `npm run lint`: nessun errore. `npm test`: **62/62** (nuovi: `tests/access.test.ts` 9, `tests/ai-anthropic.test.ts` 9).
- `npm run build` ok. `npm run e2e`: demo completo **17/17** + `scripts/e2e-access.mjs` **8/8** (schermata di blocco, codice errato/giusto, 401 su `/api/ai` e `/api/export` senza codice, chiave solo lato server, nessun segreto nell'HTML, «Blocca»).
- Grafica: logo ufficiale usato così com'è (ritagliato, non ridisegnato), palette e font della tavola applicati a tutta l'app; schermate controllate su desktop e iPhone 390 px senza scorrimento orizzontale.
- Deploy su Railway: build Docker riuscita, container avviato, dominio generato.

**Dimostrato solo contro un FINTO server compatibile Anthropic (nessuna chiave vera):** streaming dei capitoli, risposte strutturate, costi dai token, rifiuto del modello, troncamento `[DA COMPLETARE]`, chiave non valida (401), tetto di spesa che impedisce la chiamata, `ANTHROPIC_MODEL`.

**NON verificato:**
- Una chiamata reale ad Anthropic (nessuna chiave in questo ambiente): i parametri (`output_config.effort`, formato strutturato, nome modello) sono quelli dell'SDK ma l'accettazione dal servizio vero resta da provare.
- Il PDF generato da Chromium dentro il container Railway; il sito Railway non è raggiungibile da questo ambiente (proxy), quindi l'ho controllato solo via log di build/avvio.
- Supabase, epubcheck, report Amazon reali, tabella costi di stampa in EUR (come prima).

**Scelte da conoscere:** lo slogan «genera profitto con l'AI» della tavola non è usato (promessa di guadagno); i valori «Ricavi stimati» della tavola sono solo stile, l'app mostra solo numeri reali.

## Aggiornamento — modulo Marketing, auto-test PDF

- Nuova scheda **Marketing**: descrizione Amazon, punti chiave, 4 moduli A+, pagina autore, 3 email di lancio, 6 post social, angolazioni per annunci manuali, checklist di due settimane. Tutto modificabile; «Usa come descrizione KDP» e «Usa nel libro»; download `.md`; incluso nello ZIP come `marketing/kit-marketing.md`.
- Onestà: il prompt vieta testimonianze, recensioni, premi, classifiche, numeri di vendita, promesse di risultato e bio inventate (restano segnaposto `[DA COMPLETARE/VERIFICARE]`). Il QA segnala (avviso, non blocco) un kit con testo mock o segnaposto.
- Auto-test all'avvio del server (`src/instrumentation.ts`): scrive nei log `[renderer] OK — Chromium … PDF di prova …` oppure `FALLITO`. Disattivabile con `RENDERER_SELFTEST=false`. Chromium parte con `--disable-dev-shm-usage` (evita crash nei container).
- Eseguito: typecheck, lint, **72/72** test, e2e demo **18/18**, e2e accesso **8/8**.
- Non verificato: il kit marketing con l'AI reale (solo mock e finto provider).

## Aggiornamento — copertine con immagine, agente direttore artistico, analisi concorrenza

- **12 sfondi per copertina** in alta risoluzione (1360×2048) generati con IA (GPT Image 2.6 via Higgsfield, 16/11/2026; costo ~12 crediti), in `public/cover-art` con miniature. Tre nuovi layout (Immersiva, Cornice, Vetrina), font Montserrat, velatura regolabile, caricamento di immagine propria, immagine estesa nell'abbondanza di stampa.
- **KDP e IA**: scegliere uno sfondo del catalogo imposta la dichiarazione «immagini generate da IA»; il QA blocca se manca (critico) e avvisa se la risoluzione scende sotto ~200 dpi. Note su diritti/uso commerciale in `diritti.md` e `ai-disclosure.json`.
- **Agente direttore artistico**: screenshot dei concorrenti forniti dall'utente (nessuno scraping) → lettura del mercato, 3 concept con motivazione e rischi, valutazione della copertina reale (disegnata dal server), rielaborazione sui commenti, confronto in miniatura. Con AI non collegata risponde con segnaposto dichiarati (mock).
- `docs/10-ANALISI-CONCORRENZA-E-GAP.md`: confronto con il sistema di Stoppello da sole fonti pubbliche. Il contenuto del corso a pagamento NON è stato letto (area riservata).
- Eseguito: typecheck, lint, **77/77** test, e2e demo **18/18**, e2e accesso **8/8**.
- **Non verificato:** l'agente con l'AI reale (solo mock e finto provider); la lettura di immagini da parte del modello vero.
- Prossimi passi: Autopilota, ottimizzatore Ads (azioni suggerite), traduzioni, metodo personale da `docs/metodo-*.md`.

## Aggiornamento — percentuali delle nicchie (Stima IA)

- Problema: le ipotesi generate dall'IA nascevano senza segnali, quindi Opportunità «dato non disponibile», Affidabilità 0% e Copertura 0%.
- Soluzione: **Stima IA** (stato `ai_estimate`): il modello dà un giudizio qualitativo 0-100 sui 5 segnali con motivazione; parte da sola dopo la generazione delle ipotesi, c'è il pulsante «Stima IA» (tutte le nicchie senza punteggio) e il pulsante nel dettaglio nicchia.
- Onestà: non sono dati di mercato; badge «Stima IA» ovunque; affidabilità limitata a ~30%; non sovrascrive mai dati osservati/importati/manuali; con il mock restituisce errore (non inventa valutazioni); il prompt vieta di citare volumi, BSR, vendite o prezzi reali e chiede una checklist di verifica manuale.
- Dati veri: concorrenti inseriti a mano, CSV (Keepa/Helium 10/Publisher Rocket…). Adattatore Keepa API: non ancora fatto (richiede la tua chiave a pagamento).
- Eseguito: typecheck, lint, **83/83** test, e2e demo **18/18**, e2e accesso **8/8** (con percentuali verificate nel browser: opportunità 60, affidabilità 30%, copertura 100%).

## Aggiornamento — revisione applicabile, lingua, dati reali e concorrenti in automatico (Keepa)

- **Revisione AI applicabile**: ogni suggerimento mostra problema e cosa fare **in italiano**, passaggio originale, versione proposta (nella lingua del libro) e traduzione italiana; «Applica» per uno o «Applica tutti». Prima di ogni modifica la versione attuale va in cronologia (ripristinabile). Se il passaggio non si trova con sicurezza non si tocca il testo. Test: `tests/review-apply.test.ts`.
- **Lingua**: spiegazioni, rischi, motivazioni e checklist sempre in italiano; il prodotto (capitoli, descrizione, email, post, titoli in copertina) nella lingua del mercato scelto.
- **Dati reali e concorrenti da soli (Keepa)**: `/api/market` cerca la keyword su Amazon via **Keepa API** (servizio a pagamento, nessuno scraping), ricava i libri con miglior Sales Rank, calcola domanda/competizione/economia (stato «Importato», metodologia dichiarata) e scarica le 3 copertine migliori per l'agente. Pulsanti: «Dati reali (Keepa)» nella nicchia; «Trova i 3 concorrenti migliori e analizza» nell'agente copertine. Il caricamento manuale di screenshot resta facoltativo.
- Il Sales Rank è un indicatore **indiretto** di vendite, non il profitto: le soglie sono euristiche dichiarate (scala per mercato).
- Eseguito: typecheck, lint, **100/100** test, e2e demo 18/18, e2e accesso **9/9** (con Keepa simulato: affidabilità 30% → 60%).
- **NON verificato:** Keepa con una chiave reale (formato letto dalla documentazione ufficiale e provato solo contro un servizio finto); l'analisi di immagini da parte del modello vero.
- Richiede: `KEEPA_API_KEY` sul server. Le copertine dei concorrenti sono scaricate (max 3 per analisi) dal CDN di Amazon con gli indirizzi forniti da Keepa; controlla che l'uso sia coerente con i termini di Keepa e di Amazon.
