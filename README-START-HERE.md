# FOLYNTRA AI · Pacchetto di sviluppo per Claude

**Versione:** 11 novembre 2026 | **Progetto nuovo:** non modificare repository/progetti esistenti.

**FOLYNTRA AI – Publishing Intelligence**: dalla scoperta delle nicchie alla creazione di manoscritti, copertine, pacchetti KDP, marketing e analisi dei margini. È un progetto di prodotto originale, funzionalmente ispirato alla categoria di strumenti RoboProfit + RoboBook + RoboAds, non una copia di codice, marchio, UI o contenuti proprietari.

## Partenza più rapida

1. Crea un **repository GitHub privato nuovo** `folyntra-ai`, distinto dagli altri progetti.
2. Apri Claude **in un ambiente con accesso ai file e possibilità di eseguire codice** (preferibilmente Claude Code nel nuovo repo). Una chat che genera codice, ma non lo esegue, non produce automaticamente un sito funzionante.
3. Carica questo ZIP o tutti i file estratti in quel repository.
4. Copia e incolla integralmente il file **`01-PROMPT-MASTER-CLAUDE.md`** come primo messaggio per Claude.
5. Claude dovrà implementare e testare **prima la Fase A utilizzabile** (login, dashboard, ricerca demo/import dati, studio libro, generazione AI, PDF/EPUB, cover template, pacchetto KDP). Poi Fase B (ricerche con dati autorizzati, Ads, avanzamenti).
6. Configura solo i segreti richiesti tramite variabili d'ambiente. Non incollare mai chiavi, password o token nella chat o nel repository.
7. Esegui la checklist di `docs/06-TEST-ACCETTAZIONE.md`, verifica un vero pacchetto esportato e la preview ufficiale KDP prima di pubblicare.

## Regole non negoziabili

- Non promettere bestseller, vendite o guadagni.
- Niente scraping invasivo di Amazon, bypass CAPTCHA, bot di pubblicazione KDP o accesso fraudolento ad account terzi.
- Al **11/11/2026** KDP limita creazioni e nuovi invii a **2 titoli per formato alla settimana**: consultare la policy ufficiale per gli aggiornamenti.
- KDP richiede la **dichiarazione del contenuto generato dall'IA** (testo, immagini, traduzioni). L'utente resta responsabile di diritti, veridicità e qualità.
- Non sono disponibili veri dati di domanda KDP gratuitamente per tutte le nicchie: contrassegnare chiaramente ogni punto come osservato, stimato, importato o demo; registrare fonte, timestamp, confidenza e limitazioni.
- Senza approvazione API Amazon Ads, fornire pianificatore campagne e importazione report CSV, non fingere di lanciare campagne effettive.
- Senza API pubblica per pubblicazione KDP, produrre file e checklist per caricamento **manuale**.

## Struttura pacchetto

- `01-PROMPT-MASTER-CLAUDE.md`: **istruzione principale da incollare**
- `docs/02-SPECIFICA-FUNZIONALE.md`: 8 moduli e workflow end-to-end
- `docs/03-MOTORE-NICCHIE.md`: modello trasparente di opportunità e dati
- `docs/04-ARCHITETTURA.md`: stack, tabelle, endpoint, worker e sicurezza
- `docs/05-REGOLE-KDP-FONTI.md`: vincoli ufficiali KDP/Ads
- `docs/06-TEST-ACCETTAZIONE.md`: prove ripetibili prima di dichiarare pronto
- `docs/07-STILE-UX.md`: UI/brand responsive e microcopy
- `docs/08-RICERCA-STOPPELLO.md`: verifica delle dichiarazioni pubbliche
- `CLAUDE.md`: istruzioni persistenti per Claude Code
- `supabase-schema.sql`: migrazione iniziale con RLS
- `src/lib/*`: utility iniziali implementate (scoring, conti economici)
- `tests/*`: verifiche per le utility; sono starter, **non tutta la piattaforma**
- `.env.example`: nomi delle credenziali senza valori segreti.

## Obiettivo minimo concreto

Con una nicchia scelta e un modello AI configurato, deve essere possibile generare un manoscritto strutturato, revisionarlo, creare una copertina originale da template, ottenere **PDF interno**, **EPUB**, **DOCX**, **PDF copertina**, **JPEG copertina**, metadati, checklist AI e file ZIP completo. Se un requisito è ancora limitato, l'interfaccia deve dirlo chiaramente e non mostrare falsi successi.
