# NICHE INTELLIGENCE — il cuore commerciale di FOLYNTRA

**Definizione:** una nicchia è un pubblico preciso con un problema specifico e una ragione per pagare per un libro originale. La dashboard non dichiara che una nicchia è 'profittevole' solo perché una AI lo dice.

## Esplorazione

Partendo da un mercato (`amazon.it`, `.com`, `.de`, ecc.) e una categoria di interesse, generare idee di nicchie/microniche, keyword primarie/secondarie, bisogni non soddisfatti, buyer persona, differenziatori editoriali, stagionalità, tema evergreen/trend-drop, rischio affidabilità, requisiti professionali e fattori culturali/linguistici.

## Dati / provenance

**Provider legalmente usabili:**
- Keepa API (se abbonamento e autorizzazione): serie temporali prodotti Amazon, prezzi e BSR nei limiti copertura/licenza; NON trasforma BSR in copie vendute verificate.
- Google Trends API alpha (solo accesso ammesso) oppure file importati/scansione manuale autorizzata e campionamento etichettato; NON è volume ricerche Amazon.
- Dataset concessi in licenza da provider terzi, CSV/JSON caricati dall'utente, dati editoriali raccolti manualmente, Google Books/Open Library come fonti bibliografiche (non prova vendite Amazon).
- Ricerca assistita di mercato senza accesso dati: solo brainstorming e checklist, niente valori di 'ricerca mensile' inventati.

Ogni metrica usa `{value, unit, status:'observed'|'estimated'|'imported'|'demo'|'missing', source, observedAt, sampleSize?, confidence, methodology?}`. Visualizza 'DATO NON DISPONIBILE' anziché generare numeri credibili.

## Scoring trasparente

Per fattori su 0–100 validati: `Opportunity = 0.30*Domanda + 0.25*(100-Competizione) + 0.15*Trend + 0.20*Economia + 0.10*Differenziazione`, arrotondato. Non convertire il voto in probabilità di successo. **Confidence** separata basata su frazione campi coperti, freschezza, qualità e provenienza; per dati esclusivamente DEMO confidence commerciale = 0. Evidenzia 3 rischi maggiori.

- **Domanda:** segnali comparabili e coerenti di ricerca/acquisto, con fonti e data.
- **Competizione:** numero concorrenti osservati (se noto), rating/review, posizionamento, qualità copertina/contenuto, marchi dominanti. Un minor numero non equivale a un'opportunità se non c'è domanda.
- **Trend:** stabilità per 12-24 mesi o crescita reale; stagionalità.
- **Economia:** rapporto realistico fra prezzo per mercato, costo stampa, royalty stimata, CPC possibile, costo API e lavoro.
- **Differenziazione:** originalità del valore, competenza richiesta, migliorie possibili rispetto ai libri analizzati, rischi di contenuti sensibili e accuratezza.

### Regole di qualità

- Niente ASIN o libri inventati: se impossibile trovare competitor affidabili, mostrali come 'non verificati'.
- BSR = indicatore relativo, non quantità di vendite certa. BSR e report vendite KDP propri vanno tenuti distinti.
- Non fare scraping massivo, aggiramento captcha o violazione condizioni dei marketplace.
- 'Nicchia selezionata' avvia una proposta editoriale originale: promessa, angle, titolo, differenziatore, 7 keyword suggerite, possibile indice e piano contenuti.
- Score alto con bassa confidenza non viene presentato come validazione.

## Tabella confronto in UI

| Campo | Descrizione |
|---|---|
| Topic / buyer persona | Chi compra e perché |
| Mercato + data | marketplace, timestamp osservazione |
| Domanda / concorrenza / trend | subscore con tooltip evidenze |
| Reviews top competitors | fonte, campione, mediane, mai finti |
| Formati tipici / prezzo | valori osservati separati da ipotesi |
| Royalties | per scenario dopo costo stampa |
| Opportunità 0–100 | score di selezione, non probabilità guadagno |
| Affidabilità / data coverage | metrica indipendente |
| Rischo IP/qualità | marchi, contenuti derivativi, salute/legale/finanza |
| Next step | Analizza ancora / Crea brief |

## Valutazione dei guadagni, non predizione

Esempio matematico **puramente ipotetico**: 50 copie/mese × 3€ royalty stimata = 150€; meno 70€ Ads e 20€ AI/servizi = **60€ margine** prima di altre spese/imposte. Se 0 vendite, il risultato è negativo. Il sistema permette scenari zero/conservativo/ottimistico con ipotesi modificate dall'utente e non dichiara una previsione attendibile senza dati.
