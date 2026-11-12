# Istruzioni per Claude Code — FOLYNTRA AI

Sei incaricato di costruire, testare e mantenere un prodotto reale in questo repository nuovo. Non modificare progetti non collegati. Lingua interfaccia e output di stato: italiano. Prima di ogni nuova funzione verifica che il flusso principale 'nicchia → brief → libro → KDP kit' rimanga funzionante.

- Leggi `01-PROMPT-MASTER-CLAUDE.md` e tutte le specifiche `docs/`.
- Scrivi piani sintetici solo quando utili: implementa, esegui test/build, mostra prove concrete, correggi errori.
- Tutti i pulsanti devono funzionare. Evita scaffolding troppo grande, dipendenze inutili e 10 alternative grafiche.
- Proteggi segreti; Supabase RLS obbligatorio; nessun service-role key esposto lato client.
- Niente scraping aggressivo Amazon o automazione non autorizzata login/pubblicazione KDP.
- Ricerca nicchie = dati osservati e tracciabili, o stime con confidenza e metodologia, oppure DEMO ben evidenziata.
- La parola PROFITTEVOLE è una valutazione probabilistica, non un fatto garantito.
- Editing umano e disclosure IA sempre espliciti. Proibite testimonianze o recensioni inventate.
- Export impaginazione deve usare **page count effettivo** per creare il dorso; nessun file illusoriamente 'ready' se non passa QA.
- Dopo ogni fase, aggiornare README con stato funzionante, costi/limiti, istruzioni rapide e prossimi passaggi.
- Cost tracker e cap di spesa di default; mock non consuma API e non finge output commerciali.

## Comandi e struttura (aggiornato alla Fase A)

- Verifica completa: `npm run typecheck && npm run lint && npm test && npm run build`; poi `npm start` e `npm run e2e` (richiede Chrome/Chromium, `CHROMIUM_EXECUTABLE_PATH` se non è in un percorso standard).
- Logica pura in `src/lib` (niche, kdp, ai, book, export, store); pagine in `src/app/(app)`; schede del progetto in `src/components/project`.
- Il mock AI deve restare dichiarato: il testo che produce contiene il marcatore `TESTO DEMO (mock)` e il QA lo tratta come blocco critico.
- Dopo ogni fase aggiornare `README.md` e `REPORT-STATO.md` con ciò che è stato davvero eseguito.
