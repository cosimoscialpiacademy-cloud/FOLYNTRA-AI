# Dove siamo e prossimi passi (nota di consegna, 16/11/2026)

> Nessun segreto in questo file. Il codice di accesso e le chiavi sono nelle variabili di Railway e nella chat del proprietario.

## Stato online
- Sito: https://folyntra-ai-production.up.railway.app (progetto Railway `308cf5f7-03f9-44f1-bed0-20b415dd056b`, servizio `60277490-5298-4d8e-80ea-d2059c9870a1`, ambiente `ed2d0bec-6007-4cbb-a2f7-0cf14de565c8`).
- Ramo di sviluppo e di deploy: `claude/happy-einstein-upmneo`. Ultimo commit al momento della nota: vedi `git log`.
- Variabili già impostate su Railway (solo i nomi): `ANTHROPIC_API_KEY`, `ENABLE_EXTERNAL_PAID_APIS`, `APP_ACCESS_CODE`.
- AI reale attiva (`claude-opus-5-5`), PDF/copertine con Chromium verificati sul server (log `[renderer] OK`).

## Come si ridistribuisce (attenzione)
- Dopo ogni push: `connect-service-source` sul servizio con repo `cosimoscialpiacademy-cloud/folyntra-ai` e ramo `claude/happy-einstein-upmneo` (il webhook automatico non scatta).
- Il pulsante «Deploy» di Railway sulle variabili in coda ha costruito una volta dal ramo `main` (vuoto) e ha fallito: dopo aver aggiunto variabili dal pannello, riportare la sorgente sul ramo giusto.
- Il sito resta sulla versione buona se un deploy fallisce.

## PROSSIMO PASSO CONCORDATO: collegare SerpApi (alternativa economica a Keepa)
Motivo: Keepa costa troppo. SerpApi dichiara ~100 ricerche Amazon gratis al mese senza carta (da verificare sul loro sito). È un servizio di terzi che legge Amazon: zona grigia rispetto ai termini di Amazon, rischio dichiarato al proprietario, scelta sua. La via pulita e già pronta resta: screenshot della ricerca + «Incolla da Amazon».

Quando il proprietario è al computer:
1. **Lui**: crea un account gratuito su serpapi.com e copia la chiave API; la aggiunge su Railway come `SERPAPI_API_KEY` (mai in chat). Poi si riporta la sorgente sul ramo giusto (vedi sopra).
2. **Io**: abilitare l'host `serpapi.com` nell'ambiente di lavoro (`update_environment`), leggere la documentazione ufficiale (https://serpapi.com/amazon-search-api) per i campi esatti (asin, titolo, thumbnail, prezzo, rating, recensioni, «bought last month», risultati sponsorizzati da escludere).
3. **Io**: implementare l'adattatore in `src/lib/providers/serpapi.ts` con la stessa interfaccia `MarketBook` di `keepa.ts`; scegliere il provider in `/api/market` (Keepa se c'è `KEEPA_API_KEY`, altrimenti SerpApi se c'è `SERPAPI_API_KEY`); escludere gli sponsorizzati; mappare «bought last month» su `monthlySold` (il Sales Rank non c'è: la domanda usa quel campo, vedi `src/lib/niche/market.ts`).
4. Test con un finto server (come `tests/market.test.ts`), aggiornare `scripts/e2e-access.mjs`, testo dei pulsanti nell'interfaccia (ora dice «Keepa»), `/api/status` (`providers`), `.env.example`, README e REPORT-STATO.
5. Provare dal vivo con la chiave vera (una sola ricerca) e rifinire.

## Altri lavori aperti (in ordine di utilità)
- **Metodo del corso**: aspettare il riassunto che il proprietario incolla (estratto con Claude in Chrome sul suo Mac). Poi trasformarlo nel metodo dell'app con testi e codice propri (non copiare il corso) e usare `docs/metodo-copertine.md` e `docs/metodo-personale.md`.
- **Autopilota**: un pulsante che porta avanti brief → indice → capitoli → marketing e si ferma ai controlli umani (revisione, scelta copertina, caricamento KDP).
- **Ottimizzatore Ads**: azioni suggerite (non tocca Amazon) dai report importati.
- **Traduzioni** verso altri marketplace.
- **Dati sul cloud**: oggi i libri sono solo nel browser (IndexedDB) e non si sincronizzano tra dispositivi (ha già causato «0 progetti» sul telefono). Soluzione: Supabase (richiede un nuovo progetto Supabase dedicato, autorizzazione del proprietario). Nel frattempo usare Esporta/Importa backup in Impostazioni.
- **Per vendere a 99 €**: login multiutente, pagamenti/licenze, termini e privacy, landing di vendita.
- Provare dal vivo con la vera AI: analisi immagini dell'agente copertine e «Incolla da Amazon» su una pagina vera.

## Verifiche da rilanciare
`npm run typecheck && npm run lint && npm test && npm run build`, poi `npm start` e `npm run e2e` (richiede `CHROMIUM_EXECUTABLE_PATH`). Ultimo esito: 105/105 test, e2e demo 18/18, e2e accesso 10/10.

## Cose da ricordare
- Il logo ufficiale è in `brand/` (non ridisegnarlo; `npm run icons`). Palette e font nella tavola di identità.
- Gli sfondi delle copertine sono immagini IA (GPT Image 2.6 via Higgsfield): il proprietario deve verificare l'uso commerciale nel proprio piano.
- Regole del progetto: niente scraping aggressivo di Amazon né automazione di KDP, niente dati o recensioni inventati, mock sempre dichiarato, nessun file «pronto» se non passa il QA.
