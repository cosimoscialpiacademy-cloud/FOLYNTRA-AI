/** Kit marketing: conversione in testo/Markdown e controlli di onestà. Puro (usato da browser e server). */
import type { MarketingKit, Project } from '../types';
import { containsMockText } from './analysis';

export type MarketingFields = Omit<MarketingKit, 'generatedBy' | 'generatedAt'>;

export function marketingText(m: MarketingKit): string {
  return [
    m.hook, m.amazonDescription, ...m.bullets, m.authorBio, ...m.adAngles, ...m.launchChecklist,
    ...m.aPlus.flatMap((a) => [a.title, a.body, a.imageIdea]),
    ...m.emails.flatMap((e) => [e.subject, e.body, e.sendWhen]),
    ...m.posts.flatMap((p) => [p.platform, p.text, ...p.hashtags]),
  ].join('\n');
}

/** Basato sul testo, non sull'origine: se l'autore sostituisce i segnaposto, il kit smette di risultare mock. */
export function marketingHasMock(m: MarketingKit): boolean {
  return containsMockText(marketingText(m));
}

/** Segnaposto che l'autore deve ancora sostituire o verificare. */
export function marketingPlaceholders(m: MarketingKit): number {
  return (marketingText(m).match(/\[DA (COMPLETARE|VERIFICARE)[^\]]*\]/g) ?? []).length;
}

export function toMarketingKit(fields: MarketingFields, provider: 'mock' | 'anthropic', now: string): MarketingKit {
  const trim = (a: string[]) => a.map((x) => x.trim()).filter(Boolean);
  return {
    generatedBy: provider, generatedAt: now, hook: fields.hook.trim(), amazonDescription: fields.amazonDescription.trim(), bullets: trim(fields.bullets), authorBio: fields.authorBio.trim(),
    aPlus: fields.aPlus.map((a) => ({ title: a.title.trim(), body: a.body.trim(), imageIdea: a.imageIdea.trim() })),
    emails: fields.emails.map((e) => ({ subject: e.subject.trim(), body: e.body.trim(), sendWhen: e.sendWhen.trim() })),
    posts: fields.posts.map((p) => ({ platform: p.platform.trim(), text: p.text.trim(), hashtags: trim(p.hashtags).map((h) => (h.startsWith('#') ? h : `#${h}`)) })),
    adAngles: trim(fields.adAngles), launchChecklist: trim(fields.launchChecklist),
  };
}

export function marketingToMarkdown(project: Pick<Project, 'title' | 'author'>, m: MarketingKit): string {
  const stato = marketingHasMock(m) ? '**BOZZA — contiene testo segnaposto (mock): non usare così com’è.**' : marketingPlaceholders(m) ? `Bozza: ci sono ${marketingPlaceholders(m)} segnaposto [DA COMPLETARE/VERIFICARE] da sistemare.` : 'Bozza da rivedere a mano.';
  return `# Kit marketing — ${project.title}

${stato}
Autore: ${project.author || '(da indicare)'} · Generato il ${m.generatedAt} (${m.generatedBy === 'mock' ? 'mock dichiarato' : m.generatedBy === 'anthropic' ? 'IA, da rivedere' : 'scritto a mano'}).

> Regole: nessuna testimonianza, recensione, premio, classifica o dato di vendita è stato inventato; se ne serve uno compare come [DA VERIFICARE]. Non promettere risultati o guadagni. Amazon vieta prezzi, sconti e richieste di recensioni nei contenuti del prodotto. L'autore è responsabile di ciò che pubblica.

## Frase di posizionamento
${m.hook}

## Descrizione per Amazon
${m.amazonDescription}

## Punti chiave
${m.bullets.filter(Boolean).map((b) => `- ${b}`).join('\n')}

## Contenuti A+ (4 moduli)
${m.aPlus.map((a, i) => `### Modulo ${i + 1}: ${a.title}\n${a.body}\n\n*Idea immagine (da far realizzare):* ${a.imageIdea}`).join('\n\n')}

## Pagina autore
${m.authorBio}

## Email di lancio (alla TUA lista di contatti che ha scelto di riceverle)
${m.emails.map((e, i) => `### Email ${i + 1} — ${e.sendWhen}\n**Oggetto:** ${e.subject}\n\n${e.body}`).join('\n\n')}

## Post per i social
${m.posts.map((p) => `### ${p.platform}\n${p.text}\n\n${p.hashtags.join(' ')}`).join('\n\n')}

## Angolazioni per annunci Sponsored Products (manuali)
${m.adAngles.filter(Boolean).map((a) => `- ${a}`).join('\n')}

## Checklist delle prime due settimane
${m.launchChecklist.filter(Boolean).map((c) => `- [ ] ${c}`).join('\n')}
`;
}
