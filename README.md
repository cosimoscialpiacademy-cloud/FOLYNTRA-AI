# FOLYNTRA AI — Publishing Intelligence

Web app (Next.js, PWA, interfaccia in italiano) che accompagna un libro dalla ricerca di nicchia al pacchetto per Amazon KDP: punteggio di nicchia trasparente, brief, indice, scrittura capitolo per capitolo, copertina a template, PDF interno, EPUB, DOCX e ZIP di pubblicazione con controlli di qualità.

**Stato: Fase A (MVP) funzionante in modalità DEMO locale.** Dettagli, prove e limiti in [`REPORT-STATO.md`](REPORT-STATO.md). Le specifiche vincolanti sono in `docs/` e in `CLAUDE.md`.

> FOLYNTRA non promette vendite, non pubblica su KDP al posto tuo (non esiste un'API pubblica) e non inventa dati di mercato.

## Avvio rapido

Servono Node.js 20.9+ e Chrome o Chromium installato (per PDF e copertine).

```bash
npm install
```

```bash
npm run dev
```

Apri http://localhost:3000 ed entra in **modalità demo locale**: nessun account, dati salvati solo nel browser, AI sostituita da un mock dichiarato a costo zero. Se Chrome non è in un percorso standard, imposta `CHROMIUM_EXECUTABLE_PATH`.

## Il flusso

1. **Scopri nicchie** — ipotesi (brainstorming), import CSV validato, nicchie DEMO etichettate, concorrenti inseriti a mano, punteggio 0–100 spiegato, affidabilità separata, confronto affiancato, scenari economici ipotetici.
2. **Brief** — precompilato dalla nicchia scelta; titolo con 5 alternative, sinossi, pagine iniziali/finali, fonti verificate, glossario.
3. **Indice** — capitoli e sottosezioni modificabili, riordino, blocco.
4. **Scrittura** — un job per capitolo con salvataggio progressivo, ripresa, nessun duplicato a parità di richiesta, cronologia versioni, costi e budget, controlli automatici e revisione AI.
5. **Cover & interni** — 3 copertine originali personalizzabili; PDF interno con margini a specchio, intestazioni pari/dispari, indice con pagine reali; dorso calcolato dal numero di pagine effettivo.
6. **KDP Kit** — un clic produce lo ZIP con tutti i file, report QA e manifest SHA-256. Lo stato "pronto" è bloccato finché un controllo critico non passa.
7. **Ads & Royalties** — piano Sponsored Products manuale (gruppi per corrispondenza, negative, offerte, budget), ACOS di pareggio e CPC massimo, import dei report Ads e delle royalties KDP in CSV con ACOS, ROAS e margine. Nessuna campagna viene creata o avviata.

## Configurazione

Copia `.env.example` in `.env.local` (mai nel repository) e compila solo ciò che ti serve.

| Funzione | Variabili | Senza |
|---|---|---|
| AI reale Anthropic | `ANTHROPIC_API_KEY`, `ENABLE_EXTERNAL_PAID_APIS=true`, facoltativa `ANTHROPIC_MODEL` | mock dichiarato, costo 0 |
| AI reale senza Supabase (solo in ambiente privato) | `ALLOW_UNAUTHENTICATED_AI=true` | resta il mock |
| Tetto di spesa per libro | `MAX_AI_SPEND_CENTS_PER_BOOK` (default 2000 = 20 $) | 20 $ |
| Login e database | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` + eseguire `supabase-schema.sql` | dati nel browser |
| PDF e copertine | `CHROMIUM_EXECUTABLE_PATH` | percorsi di sistema comuni |
| Validazione EPUB | `EPUBCHECK_JAR` (richiede Java) | solo verifica strutturale interna, dichiarata nel report |

Il modello predefinito è `claude-opus-5-5`. Per spendere meno: `claude-sonnet-5-5` o `claude-haiku-5-5` (listino in `src/lib/ai/pricing.ts`, visibile in Impostazioni). L'AI reale parte solo con chiave **e** consenso esplicito (`ENABLE_EXTERNAL_PAID_APIS=true`); ogni richiesta viene rifiutata se il caso peggiore supererebbe il budget del libro.

## Comandi

| Comando | Cosa fa |
|---|---|
| `npm run dev` | sviluppo |
| `npm run build` / `npm start` | produzione |
| `npm run typecheck` · `npm run lint` | controlli statici |
| `npm test` | 44 test (motore nicchie, CSV, regole KDP, job, Ads e royalties, export reale con Chromium) |
| `npm run e2e` | percorso demo completo nel browser; richiede l'app avviata (`E2E_BASE_URL`, default `http://localhost:3000`) |

## Architettura in breve

- `src/app` — pagine (App Router) e tre route server: `/api/ai` (stream NDJSON), `/api/export` (PDF interno o ZIP), `/api/status` (stato integrazioni, solo booleani).
- `src/lib/niche` — punteggio, confidenza, import CSV, dati DEMO. `src/lib/niche-score.ts` e `src/lib/unit-economics.ts` sono le utility originali del pacchetto.
- `src/lib/ai` — provider Anthropic e mock dichiarato dietro un'unica interfaccia; prompt, schemi Zod, listino e limiti di costo.
- `src/lib/export` — impaginazione HTML/CSS con Chromium + `pdf-lib`, EPUB 3, DOCX, copertine SVG, kit e ispezione PDF.
- `src/lib/kdp` — formati, dorso, margini, royalty simulate, controlli QA.
- `src/lib/store` — stessa interfaccia per archivio locale (IndexedDB) e Supabase (RLS per utente).

Le route server sono di solo calcolo: i dati restano nell'archivio dell'utente. Con Supabase configurato ogni route richiede un token valido.

## Limiti noti

- Supabase, AI reale e deploy Netlify **non sono ancora stati verificati** (mancano progetto e chiavi): vedi `REPORT-STATO.md`.
- Su Netlify il rendering PDF richiede un Chromium che le Functions non includono: serve un host Node con Chrome o un worker esterno.
- Costi di stampa in euro indicativi: l'app li segnala come "da verificare" e permette di sovrascriverli.
- Gli import di report Ads e royalties riconoscono le intestazioni più comuni (inglese e italiano) ma non sono stati provati su esportazioni reali di Amazon.
- Keepa, A+ content, materiali di lancio, immagini AI e traduzioni non sono implementati e non compaiono come pulsanti.

## Licenze

Font EB Garamond, Playfair Display, Inter e Oswald: SIL Open Font License 1.1 (pacchetti `@fontsource`). Le copertine sono grafica vettoriale generata dal codice, senza immagini di terzi.

## Pubblicazione su Railway (preparata, NON ancora provata)

File: `Dockerfile` (Node 22 + Chromium), `railway.json` (healthcheck `/api/status`), `.dockerignore`.
Non verificato: l'ambiente di sviluppo non ha un motore Docker, quindi la build dell'immagine non è stata eseguita.

1. Crea un account su railway.com e un progetto «Deploy from GitHub repo» con questo repository (branch indicato).
2. Variabili d'ambiente (mai nel repository): al primo test nessuna; l'app parte in modalità DEMO con AI mock.
   Per l'AI reale servono `ANTHROPIC_API_KEY`, `ENABLE_EXTERNAL_PAID_APIS=true` e un login (Supabase) oppure `ALLOW_UNAUTHENTICATED_AI=true` solo su un link privato.
3. In Settings → Networking → «Generate Domain»: è l'indirizzo da aprire dal telefono.
4. Costi: Railway è a consumo (indicativamente pochi dollari al mese): controlla il piano sul loro sito.
