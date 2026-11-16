'use client';

import { ClipboardCopy, Download, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardTitle, Empty, Field, Input, Notice, Textarea, useToast } from '@/components/ui';
import type { MarketingOutput } from '@/lib/ai/schemas';
import { marketingHasMock, marketingPlaceholders, marketingToMarkdown, toMarketingKit } from '@/lib/book/marketing';
import { callAi, downloadBlob } from '@/lib/client-api';
import { briefContext, logActivity, recordCost, spentUsd } from '@/lib/generation';
import { useApp, useStore } from '@/lib/store/context';
import type { MarketingKit } from '@/lib/types';
import { nowIso, slugify } from '@/lib/utils';
import type { TabProps } from './types';

/** Elenco di righe modificabile: il testo locale si conferma all'uscita dal campo, così si può andare a capo liberamente. */
function Lines({ label, value, onCommit, rows = 5 }: { label: string; value: string[]; onCommit: (v: string[]) => void; rows?: number }) {
  const [text, setText] = useState(value.join('\n'));
  return (
    <Field label={label} hint="Una voce per riga.">
      {(id) => <Textarea id={id} rows={rows} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onCommit(text.split('\n').map((l) => l.trim()).filter(Boolean))} />}
    </Field>
  );
}

function CopyButton({ text }: { text: string }) {
  const toast = useToast();
  return (
    <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(text).then(() => toast('Copiato negli appunti.', 'ok'), () => toast('Copia non riuscita: seleziona il testo a mano.', 'bad'))}>
      <ClipboardCopy className="size-4" aria-hidden /> Copia
    </Button>
  );
}

export function MarketingTab({ project, niche, update }: TabProps) {
  const store = useStore();
  const { getToken, status } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const m = project.marketing ?? null;
  const setM = (patch: Partial<MarketingKit>) => m && update({ marketing: { ...m, ...patch } });

  async function generate() {
    if (m && !window.confirm('Rigenerare il kit sostituisce tutti i testi attuali, comprese le tue modifiche. Continuare?')) return;
    setBusy(true);
    try {
      const done = await callAi({ task: 'marketing', input: { brief: briefContext(project, niche), authorName: project.author, currentDescription: project.kdp.description.slice(0, 7500) }, projectId: project.id, spentUsd: await spentUsd(store, project.id), budgetUsd: project.budgetUsd }, { token: await getToken() });
      update({ marketing: toMarketingKit(done.data as MarketingOutput, done.provider, nowIso()) });
      await recordCost(store, project.id, 'Kit marketing', done);
      await logActivity(store, project.id, `Kit marketing generato (${done.provider === 'mock' ? 'mock dichiarato' : done.model}).`);
      toast(done.provider === 'mock' ? 'Bozza segnaposto (mock): serve la chiave AI per un testo reale.' : 'Kit marketing pronto: rivedi ogni testo prima di usarlo.', done.provider === 'mock' ? 'info' : 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Generazione non riuscita.', 'bad');
    } finally {
      setBusy(false);
    }
  }

  const mock = m ? marketingHasMock(m) : false;
  const pending = m ? marketingPlaceholders(m) : 0;
  const md = m ? marketingToMarkdown(project, m) : '';

  return (
    <div className="space-y-4">
      <Notice tone="info">
        Bozze per il tuo lancio, da <strong>rivedere e firmare tu</strong>. Non contengono testimonianze, recensioni, classifiche o dati di vendita inventati: dove servirebbero compare un segnaposto <strong>[DA VERIFICARE]</strong>. Non promettere risultati o guadagni. Amazon vieta prezzi, sconti e richieste di recensioni nei contenuti del prodotto.
      </Notice>

      <Card>
        <CardTitle action={<Button variant="gold" onClick={() => void generate()} loading={busy}><Sparkles className="size-4" aria-hidden /> {m ? 'Rigenera kit' : 'Genera kit marketing'}</Button>}>Kit marketing</CardTitle>
        {status?.ai.mode === 'mock' && <p className="mb-2 text-xs text-warn">AI non collegata: il kit sarà un segnaposto dichiarato (mock), costo zero. {status.ai.reason}</p>}
        {!m ? (
          <Empty title="Nessun kit ancora">Genera descrizione Amazon, 4 moduli A+, pagina autore, 3 email di lancio, 6 post social, angolazioni per annunci manuali e checklist di due settimane. Serve il brief compilato.</Empty>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={mock ? 'demo' : 'ok'}>{mock ? 'TESTO DEMO (mock)' : m.generatedBy === 'anthropic' ? 'Bozza IA da rivedere' : 'Testo tuo'}</Badge>
            {pending > 0 && <Badge tone="warn">{pending} segnaposto da sistemare</Badge>}
            <span className="text-slate2">Generato il {new Date(m.generatedAt).toLocaleString('it-IT')}</span>
            <span className="ml-auto flex gap-2">
              <CopyButton text={md} />
              <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `kit-marketing-${slugify(project.title)}.md`)}><Download className="size-4" aria-hidden /> Scarica .md</Button>
            </span>
          </div>
        )}
      </Card>

      {m && (
        <>
          <Card>
            <CardTitle>Descrizione e punti chiave</CardTitle>
            <div className="space-y-3">
              <Field label="Frase di posizionamento">{(id) => <Input id={id} value={m.hook} onChange={(e) => setM({ hook: e.target.value })} />}</Field>
              <Field label="Descrizione per Amazon">{(id) => <Textarea id={id} rows={9} value={m.amazonDescription} onChange={(e) => setM({ amazonDescription: e.target.value })} />}</Field>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={m.amazonDescription} />
                <Button size="sm" variant="outline" onClick={() => { update({ kdp: { ...project.kdp, description: m.amazonDescription } }); toast('Usata come descrizione KDP (scheda KDP Kit).', 'ok'); }}>Usa come descrizione KDP</Button>
              </div>
              <Lines label="Punti chiave «cosa trovi nel libro»" value={m.bullets} onCommit={(bullets) => setM({ bullets })} />
            </div>
          </Card>

          <Card>
            <CardTitle>Contenuti A+ (4 moduli)</CardTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {m.aPlus.map((a, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-line bg-card2 p-3">
                  <Field label={`Modulo ${i + 1} · titolo`}>{(id) => <Input id={id} value={a.title} onChange={(e) => setM({ aPlus: m.aPlus.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />}</Field>
                  <Field label="Testo">{(id) => <Textarea id={id} rows={4} value={a.body} onChange={(e) => setM({ aPlus: m.aPlus.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />}</Field>
                  <Field label="Idea immagine (da far realizzare)">{(id) => <Input id={id} value={a.imageIdea} onChange={(e) => setM({ aPlus: m.aPlus.map((x, j) => (j === i ? { ...x, imageIdea: e.target.value } : x)) })} />}</Field>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Pagina autore</CardTitle>
            <Field label="Biografia" hint="Completa i segnaposto con fatti veri: nessuna qualifica è stata inventata.">{(id) => <Textarea id={id} rows={5} value={m.authorBio} onChange={(e) => setM({ authorBio: e.target.value })} />}</Field>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton text={m.authorBio} />
              <Button size="sm" variant="outline" onClick={() => { update({ matter: { ...project.matter, authorBio: m.authorBio } }); toast('Usata come biografia nel libro (pagine finali).', 'ok'); }}>Usa nel libro</Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Email di lancio</CardTitle>
            <p className="mb-3 text-xs text-slate2">Da inviare solo a persone che hanno scelto di ricevere le tue email.</p>
            <div className="space-y-3">
              {m.emails.map((e, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-line bg-card2 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label={`Email ${i + 1} · oggetto`}>{(id) => <Input id={id} value={e.subject} onChange={(ev) => setM({ emails: m.emails.map((x, j) => (j === i ? { ...x, subject: ev.target.value } : x)) })} />}</Field>
                    <Field label="Quando inviarla">{(id) => <Input id={id} value={e.sendWhen} onChange={(ev) => setM({ emails: m.emails.map((x, j) => (j === i ? { ...x, sendWhen: ev.target.value } : x)) })} />}</Field>
                  </div>
                  <Field label="Testo">{(id) => <Textarea id={id} rows={5} value={e.body} onChange={(ev) => setM({ emails: m.emails.map((x, j) => (j === i ? { ...x, body: ev.target.value } : x)) })} />}</Field>
                  <CopyButton text={`${e.subject}\n\n${e.body}`} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Post per i social</CardTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {m.posts.map((p, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-line bg-card2 p-3">
                  <Field label={p.platform}>{(id) => <Textarea id={id} rows={4} value={p.text} onChange={(ev) => setM({ posts: m.posts.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)) })} />}</Field>
                  <p className="text-xs text-cyan">{p.hashtags.join(' ')}</p>
                  <CopyButton text={`${p.text}\n\n${p.hashtags.join(' ')}`} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Annunci manuali e checklist</CardTitle>
            <p className="mb-3 text-xs text-slate2">FOLYNTRA non crea né avvia campagne: queste sono idee da usare nella scheda «Ads &amp; Royalties» o direttamente su Amazon Ads.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Lines label="Angolazioni per Sponsored Products" value={m.adAngles} onCommit={(adAngles) => setM({ adAngles })} rows={7} />
              <Lines label="Checklist delle prime due settimane" value={m.launchChecklist} onCommit={(launchChecklist) => setM({ launchChecklist })} rows={7} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
