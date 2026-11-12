# Amazon KDP / Amazon Ads — regole da rispettare (verificate 11/11/2026)

> **Non è consulenza legale né una garanzia di approvazione da parte di Amazon.** Le regole possono cambiare: ricontrollare i link ufficiali prima di ogni rilascio.

1. **Disclosure AI:** dichiarare in KDP la presenza di testo, immagini (anche cover e artwork interno) e traduzioni **generate** con IA. L'uso dell'IA solo come editing su contenuto dell'autore è differente. Registrare flag per ciascun asset. Fonte: https://kdp.amazon.com/it_IT/help/topic/G200672390
2. **Numero nuovi titoli:** creazione fino a **2 titoli per formato/settimana** e invio fino a **2 nuovi titoli per formato/settimana**, reset domenica 00 UTC secondo help KDP IT attuale. Non generare pulsanti per spam publishing. Fonte: https://kdp.amazon.com/it_IT/help/topic/G202172740
3. **Caricamento:** KDP è un portale con campi/dettagli, upload e anteprima. Non esiste API KDP pubblica standard per creare/approvare automaticamente libri. Preparare KIT e checklist, terminare con intervento utente. Fonte procedura: https://kdp.amazon.com/en_US/help/topic/G202172740
4. **Interno PDF:** pagina formato/margini, gabbia, bleed coerenti. Per manuscript con bleed, il PDF è necessario. Il PDF deve essere testato nel Previewer. Font incorporati, immagini alla risoluzione adeguata, indice reale, niente pagine mancanti. Fonti: https://kdp.amazon.com/en_US/help/topic/G201834190 e https://kdp.amazon.com/en_US/help/topic/G201857950
5. **Copertina cartacea:** unico file fronte+dorso+retro, sfondamento **0,125 pollici** per lato, testo non da tagliare minimo **0,25 pollici** dalla linea taglio esterna; lo spessore del dorso dipende da pagine, carta, tipo inchiostro. Non generare il dorso definitivo prima del PDF finale. Fonte: https://kdp.amazon.com/en_US/help/topic/G201857950
6. **EPUB:** contenuto reflowable per libri prevalentemente testuali; controllare toc/nav, immagini, link, lingua, metadata, validator e preview su device. Nessuna immagine a bassa risoluzione.
7. **Royalty cartacea:** dipende da soglia del prezzo sul marketplace (in Italia/Euro attualmente 50% per prezzi fino a 9,98€ e 60% da 9,99€) **meno costi stampa**. Non usare percentuali su fatturato come 'profitto netto'. Fonti: https://kdp.amazon.com/it_IT/help/topic/G201834330 e https://kdp.amazon.com/it_IT/help/topic/GSQF43YAMUPFTMSP
8. **Bonus in libro:** contenuti bonus pertinenti alla fine, nel sommario; KDP indica di non superare **10%** del libro per esperienza ottimale, evitare giveaway e link distraenti. Fonte: https://kdp.amazon.com/it_IT/help/topic/G202018960
9. **Link in ebook:** solo se arricchiscono direttamente l'esperienza lettura. Evitare moduli per raccogliere dati personali, esterni commerciali proibiti, link a parti fondamentali del libro, link ripetuti o ingannevoli. Fonte: https://kdp.amazon.com/en_US/help/topic/GQ6JQ7FM6C72HE4X
10. **Qualità:** blocco contenuti duplicati, deludenti, mal tradotti, mancanti, plagio/diritti sospetti, deceptive metadata, repeated books. Verifica manuale editoriale necessaria. Fonte: https://kdp.amazon.com/en_US/help/topic/G200952510
11. **Amazon Ads API:** esiste ma l'accesso è sottoposto a procedura di approvazione; richiede autorizzazione specifica account. Prima dell'approvazione creare pianificatore ed importazione CSV manuale; no fake live campaign. Fonti: https://advertising.amazon.com/about-api e https://advertising.amazon.com/API/docs/en-us/guides/account-management/authorization/authorization-grants
12. **Sponsored Products:** ads a CPC con targeting keyword/prodotti; il costo di clic non garantisce acquisti. Fonte: https://advertising.amazon.com/it-it/library/guides/authors-guide-to-sponsored-products/
13. **Best Sellers Rank:** ranking relativo, NON misura diretta delle copie o dei ricavi competitor. Fonte: https://kdp.amazon.com/en_US/help/topic/G201648140
14. **Google Trends API:** alpha access limitato, non una API pubblica per tutti; usarla solo se abilitati. Fonte: https://developers.google.com/search/apis/trends?hl=it
15. **Keepa API:** data API con chiave e sottoscrizione, rispettarne licenza e coverage. Fonte: https://keepa.com/api-docs/

## KDP export checklist da visualizzare

- [ ] Autore/proprietà e diritti confermati; contenuti originali, font e asset licenziati
- [ ] Titolo/sottotitolo/categorie/keywords coerenti e non fuorvianti
- [ ] AI-generated text, images, translations: disclosure flag pronto
- [ ] Testo esente da placeholder, duplicati gravi e riferimenti falsi
- [ ] File PDF interior col formato giusto, bleed/margini e font
- [ ] PDF cover calcolato dal page count dell'interno definitivo
- [ ] Cover front/spine/back, safe areas e qualità grafica
- [ ] EPUB con TOC navigabile e immagini valide
- [ ] Revisione umana completata; se cartaceo prova copia suggerita
- [ ] Simulatore prezzo e costo stampa corretto per formato/mercato
- [ ] Backup versionato di tutti gli asset; ZIP e checksum
- [ ] Upload, Previewer, dichiarazioni e invio **manuali in KDP**
