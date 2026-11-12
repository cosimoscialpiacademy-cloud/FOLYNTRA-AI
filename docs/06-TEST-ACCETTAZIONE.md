# Test di accettazione — evitare la demo finta

## E2E: flusso obbligatorio

1. Utente crea progetto `Manuale pratico di manutenzione domestica di base` su mercato Italia.
2. Motore mostra nicchie **DEMO** (non farle sembrare reali), permette import CSV, assegna score trasparente, fonte/data/affidabilità; categoria fittizia marcata.
3. L'utente seleziona una nicchia, apre un brief già popolato con pubblico/keyword/differenziazione.
4. Sistema genera titolo, sottotitolo e un indice modificabile di **almeno 5 capitoli**; salvataggio e riapertura mantengono esattamente la struttura.
5. Con Anthropic configurato, genera **2 capitoli completi** in job separati; stato e conteggio token/costi reale; reload dell'app conserva testi; ripetizione con stessa idempotency key non produce capitoli duplicati.
6. Editor consente cambiare e bloccare capitolo, verifica indice corrispondente, segnala placeholder, duplicati e fonti non confermate.
7. Template cover originale genera una cover leggibile JPG e una stampa wrap con dimensioni coerenti al PDF interno; nessuna immagine stock senza licenza.
8. Esporta **manuscript.pdf**, **ebook.epub**, **editable.docx**, **cover-print.pdf**, **cover-ebook.jpg**, **metadata.json**, **kdp-checklist.md**, **ai-disclosure.json**, **manifest.json** e ZIP con tutti i file. Documenta problemi se export non pronto.
9. Esporta bonus in PDF pertinente al contenuto, aggiunto in `bonus/`, senza duplicare il testo principale.
10. Lista pubblicazione spiega passaggi manuali KDP e conserva stato azioni dell'utente. Mai mostrare 'pubblicato' per il solo click su export.
11. Ads planner calcola scenario profitto/pareggio; import CSV delle spese; non dichiara campagne attive se API non collegata.

## Non funzionali e sicurezza

- Build/lint/typecheck e test tutti verdi; zero pulsanti finti nei flussi dichiarati finiti.
- Responsive iPhone 390 px, tablet e desktop; nessun testo troncato nei pulsanti o modali.
- Utente A non vede/modifica dati di B (RLS e endpoint server).
- Secrets solo server; errori privacy-safe; limitazione job/costi.
- Set job limite, simula disconnessione e re-queue senza perdita dati.
- CSV malformato/righe vuote: errore comprensibile, non perdita progressi.
- Nessuna chiamata a providers live quando manca API key; mock visibile.
- QA di file: EPUB validato, PDF pagine/crop/margini controllati, cover spine ricalcolato, link e formati utili. Quando test esterno non disponibile, segnala la limitazione.

## Acceptance document

Claude deve consegnare `REPORT-STATO.md` con: features realmente testate, repo/branch, comandi eseguiti, output, problemi residui, necessità di API con costo potenziale, passi utente rimasti. Nessun '100% completo' se mancano integrazioni fondamentali.
