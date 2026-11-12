# FOLYNTRA AI — Design system e UI

**Personalità:** laboratorio editoriale + intelligence finanziaria. Premium e leggibile, non dashboard da cripto-scam. Design originale, non imitare RoboBook.

## Palette / gerarchia

- Midnight: `#0D1424` (sidebar/navbar, superfici scure)
- Ink: `#182239`
- Ivory: `#F7F4ED` (superfici chiare editoriali)
- Gold: `#D7B574` (accenti piccoli e meaningful, non testo su bianco)
- Slate: `#70798A`
- Success/Warning/Error con accessibilità WCAG AA.

Tipografia UI: Inter/Geist (font disponibili con licenza adeguata); titoli editoriali: una serif open-source adatta con integrazione corretta, evitare font file condivisi senza licenza. Interfaccia responsive. Animazioni brevi su transizioni e step; rispettare reduced-motion.

## Schermate 1×1 per progettazione

1. Landing / login: logo wordmark FOLYNTRA AI, promessa essenziale, call to action.
2. Dashboard: KPI verificabili (progetti, capitoli, export, costi), attività recenti, senza finte vendite.
3. Niche Intelligence: ricerca, country filter, tabella nicchie, score con intervalli/certainty, card 3 recommended opportunities.
4. Niche Detail: evidenze, trend quando presenti, competitor osservati e note mancanti, costo ROI con assunzioni, CTA 'Crea il libro in questa nicchia'.
5. Book Architect: audience persona, titolo, sottotitolo, indice drag-drop, book length e aspettative di lavoro umano.
6. Editor: capitoli nella rail, testo in pannello centrale, assistente revisioni in pannello destra (desktop). Su iPhone navigation a tabs.
7. Cover Studio: preview fronte/dorso/retro, resize, template, colori, foto/licenze, PDF.
8. KDP Kit: check verdi/gialli/rossi, export, elenco file + metadata, pulsante link sito ufficiale KDP.
9. Ads Lab: piano keyword, budget, CSV, performance solo dove disponibile.
10. Finanze: royalties dopo costi, Ads e API, margini reali vs ipotetici distinti con etichette.

## Microcopy fondamentale

- Demo: 'Questi dati servono solo a provare l'interfaccia: non indicano domanda reale.'
- Score: 'Indicatore comparativo, NON probabilità di vendita.'
- Ads: 'Pianificazione pronta: avvio campagne manuale finché Amazon Ads API non è autorizzata.'
- KDP: 'File preparati per upload manuale. Amazon verifica e approva la pubblicazione.'
- AI: 'Il contenuto generato da IA deve essere dichiarato a KDP e controllato da te.'

## Componenti

Card, sidebar, breadcrumbs, toasts, loading states non falsi, progress job autentico, comparison table, file checklist, editor documentale, cover 3D-ish CSS preview (NO sfondo 3D che distrae). Specificare fasi completed/blocked. Niente autoplay o pop-up invasivi.
