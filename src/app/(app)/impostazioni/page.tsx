'use client';

import { Download, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { PageHeader } from '@/components/shell';
import { Badge, Button, Card, CardTitle, Notice, useToast } from '@/components/ui';
import { downloadBlob } from '@/lib/client-api';
import { MODEL_PRICING } from '@/lib/ai/pricing';
import { useApp, useStore } from '@/lib/store/context';
import { COLLECTIONS } from '@/lib/store/types';
import type { CollectionName } from '@/lib/types';

function Row({ label, ok, children }: { label: string; ok: boolean | 'off'; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-midnight">{label}</p>
        <p className="text-sm text-slate2">{children}</p>
      </div>
      {ok === 'off' ? <Badge>Non attivo</Badge> : ok ? <Badge tone="ok">Attivo</Badge> : <Badge tone="warn">Non configurato</Badge>}
    </li>
  );
}

export default function SettingsPage() {
  const { status, mode, userEmail } = useApp();
  const store = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportData() {
    const dump: Record<string, unknown[]> = {};
    for (const c of COLLECTIONS) dump[c] = await store.list(c);
    downloadBlob(new Blob([JSON.stringify({ app: 'FOLYNTRA AI', version: 1, exportedAt: new Date().toISOString(), data: dump }, null, 2)], { type: 'application/json' }), `folyntra-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importData(file: File | undefined) {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as { app?: string; data?: Record<string, { id?: string }[]> };
      if (json.app !== 'FOLYNTRA AI' || !json.data) throw new Error('Il file non è un backup FOLYNTRA valido.');
      let n = 0;
      for (const c of COLLECTIONS) {
        for (const doc of json.data[c] ?? []) {
          if (typeof doc.id !== 'string') continue;
          await store.put(c as CollectionName, doc as never);
          n += 1;
        }
      }
      toast(`Backup importato: ${n} elementi.`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import non riuscito.', 'bad');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function wipe() {
    if (!window.confirm('Eliminare TUTTI i dati (nicchie, progetti, capitoli, esportazioni)? L’operazione non è reversibile: fai prima un backup.')) return;
    for (const c of COLLECTIONS) for (const d of await store.list(c)) await store.remove(c, d.id);
    toast('Tutti i dati sono stati eliminati.', 'ok');
  }

  return (
    <>
      <PageHeader title="Impostazioni" subtitle="Stato reale delle integrazioni. Le chiavi si configurano solo come variabili d’ambiente sul server: mai nel browser, mai nel repository." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Integrazioni</CardTitle>
          {!status ? (
            <p className="text-sm text-slate2">Lettura dello stato del server…</p>
          ) : (
            <ul className="divide-y divide-line">
              <Row label="AI Anthropic" ok={status.ai.mode === 'anthropic'}>
                {status.ai.mode === 'anthropic' ? `Modello ${status.ai.model}. Tetto server ${status.ai.maxUsdPerBook} $ per libro.` : `Mock dichiarato attivo. ${status.ai.reason} Servono ANTHROPIC_API_KEY ed ENABLE_EXTERNAL_PAID_APIS=true.`}
              </Row>
              <Row label="Supabase (login e database)" ok={status.supabase}>
                {status.supabase ? `Dati su Supabase con RLS per utente${userEmail ? ` (${userEmail})` : ''}.` : 'Non configurato: i dati restano in questo browser (IndexedDB). Servono NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY e lo schema supabase-schema.sql.'}
              </Row>
              <Row label="Renderer PDF e copertine (Chromium)" ok={status.renderer}>
                {status.renderer ? 'Chromium trovato: PDF interno, PDF copertina e JPEG disponibili.' : 'Chromium non trovato sul server: imposta CHROMIUM_EXECUTABLE_PATH.'}
              </Row>
              <Row label="epubcheck" ok={status.epubcheck}>
                {status.epubcheck ? 'La validazione epubcheck viene eseguita a ogni esportazione.' : 'Non configurato (EPUBCHECK_JAR): l’EPUB riceve solo la verifica strutturale interna e il report lo dichiara.'}
              </Row>
              <Row label="Keepa" ok="off">Fase B. {status.providers.keepa ? 'Chiave presente, ma l’adapter non è ancora attivo.' : 'Richiede abbonamento e chiave: nessuna chiamata viene fatta.'}</Row>
              <Row label="Google Trends API" ok="off">Accesso alpha limitato: per ora solo import manuale dei dati.</Row>
              <Row label="Amazon Ads API" ok="off">Fase C, solo dopo approvazione Amazon e consenso OAuth. Nessuna campagna viene creata o spesa.</Row>
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Dati</CardTitle>
            {mode === 'locale' ? <Notice tone="demo">Modalità demo locale: tutto è salvato solo in questo browser. Cambiando dispositivo o cancellando i dati di navigazione il lavoro si perde: esporta un backup.</Notice> : <Notice>Dati salvati sul tuo progetto Supabase, visibili solo al tuo account.</Notice>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void exportData()}><Download className="size-4" aria-hidden /> Esporta backup JSON</Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void importData(e.target.files?.[0])} />
              <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" aria-hidden /> Importa backup</Button>
              <Button variant="danger" onClick={() => void wipe()}><Trash2 className="size-4" aria-hidden /> Elimina tutti i dati</Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Costi AI di riferimento</CardTitle>
            <p className="mb-2 text-sm text-slate2">USD per milione di token (listino Anthropic, aggiornabile in <code>src/lib/ai/pricing.ts</code>). Il modello si sceglie con ANTHROPIC_MODEL.</p>
            <ul className="divide-y divide-line text-sm">
              {Object.entries(MODEL_PRICING).map(([id, p]) => (
                <li key={id} className="flex justify-between gap-2 py-1.5"><span>{p.label} <span className="text-xs text-slate2">{id}</span></span><span className="text-slate2">{p.input} $ in · {p.output} $ out</span></li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>Non ancora disponibili</CardTitle>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate2">
              <li><strong className="text-ink">Fase B:</strong> adapter Keepa, import trend, contenuti A+, pagina autore, email e post di lancio, altri bonus. (Ads planner e import royalties sono già nella scheda “Ads &amp; Royalties” di ogni progetto.)</li>
              <li><strong className="text-ink">Fase C:</strong> Amazon Ads API (previa approvazione), abbonamenti e team, traduzioni, illustrazioni, fiction.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
