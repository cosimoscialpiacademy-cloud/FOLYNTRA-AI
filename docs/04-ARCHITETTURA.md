# Architettura implementabile / integrazioni

## Tecnologie proposte

- Next.js (App Router), TypeScript strict, Tailwind, shadcn/ui, lucide-react, accessible mobile-first; deploy Netlify, PWA.
- Supabase Auth/Postgres/Storage con RLS; `supabase-schema.sql` come base verificata in migrazione.
- Anthropic API backend-only. Env model configurabile `ANTHROPIC_MODEL`. LLM chiamato solo dopo consenso del proprietario della chiave. Tokens e costi salvati. Identità provider astratta `TextProvider.generateStructured() / generateChapter()`.
- Worker persistente (Trigger.dev/Inngest/analogo) per job lunghi; in locale queue con processo server per sviluppo, senza nascondere i limiti del dev server. Resume idempotente a livello capitolo.
- PDF: Playwright Chromium server-render da HTML/CSS paginata (browser print), postprocess/merge con pdf-lib se necessario. Valutare PrinceXML solo se licensing sostenibile. EPUB: libreria valida e verifica epubcheck; DOCX: libreria `docx`; cover: SVG+Sharp/PDF-lib con tipografia visibile e diritti tracciati. Export zip con checksums.
- Optional providers: Keepa, Google Trends alpha, Amazon Ads API con autorizzazione, image generation solo dopo scelta API e crediti. Tutto con feature flag e fallback dichiarato.

## Modello dati

`projects`, `niches`, `market_evidence`, `books`, `chapters`, `book_assets`, `generation_jobs`, `export_artifacts`, `ad_campaign_plans`, `sales_entries`, `cost_events` (SQL allegato).

Ogni documento/asset è associato al proprietario autenticato tramite relazioni e RLS. Record `generatedByAi` per testi, immagini e traduzioni, fonte e revisioni. Cronologia capitoli (una tabella `chapter_revisions` in Fase B). Non mostrare dati d'altri utenti.

## API route / service layer

| Endpoint | Scopo |
|---|---|
| POST /api/niches/brainstorm | genera idee, NON dati di vendita |
| POST /api/niches/import | importa CSV e documenta origine |
| POST /api/niches/score | calcolo trasparente |
| POST /api/books | crea libro da nicchia/brief |
| POST /api/books/:id/outline | outline strutturato JSON |
| POST /api/books/:id/chapters/:id/generate | job incrementale |
| PATCH /api/books/:id/chapters/:id | save/edit/revision |
| POST /api/books/:id/cover | rende template originale |
| POST /api/books/:id/exports | PDF/EPUB/DOCX/ZIP con job status |
| GET /api/jobs/:id | status/progress/error sanitized |
| POST /api/reports/kdp-csv | import report royalty |
| POST /api/ads/plans | piano campagna per libro |

Tutti gli endpoint: validazione Zod, auth server-side, verifica ownership, idempotency key su azioni costose, rate-limits, max size file, log senza segreti, gestione errore e retry.

## Cost control

- Contesto AI parsimonioso: brief + outline + riassunti capitoli precedenti, non duplicare manoscritti interi a ogni chiamata.
- Per libro: limite parole richieste, token in/out reali, max budget configurabile, interruzione/resume, lock dei capitoli, cache prompt hash, controllo costi per progetto.
- Generazione immagini solo opt-in. Nessun costo esterno attivato in autonomia.

## Deploy e test

Crea file `netlify.toml`, guida per env, migration Supabase, comando build e Playwright browser se integrato, `README` definitivo e check e2e. Render PDF potrebbe richiedere worker separato: verifica limiti runtime Netlify, non creare promessa irrealizzabile di generazione browserless serverless.
