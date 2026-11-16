'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { Badge, Card, CardTitle, Empty, Progress } from '@/components/ui';
import { summarizeSales, totals } from '@/lib/ads/metrics';
import { STATUS_LABEL, projectPercent, projectSteps } from '@/lib/progress';
import { useLive } from '@/lib/store/context';
import { formatDateTime, formatMoney, wordCount } from '@/lib/utils';

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="animate-rise">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate2">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-slate2">{note}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const projects = useLive('projects');
  const niches = useLive('niches');
  const chapters = useLive('chapters');
  const exports = useLive('exports');
  const costs = useLive('costs');
  const activity = useLive('activity');
  const plans = useLive('adPlans');
  const sales = useLive('sales');
  const adRows = plans.data.flatMap((p) => p.reportRows);
  const ad = totals(adRows);
  const royalties = summarizeSales(sales.data);

  const written = chapters.data.filter((c) => wordCount(c.content) > 0);
  const reviewed = chapters.data.filter((c) => c.status === 'reviewed' || c.status === 'locked');
  const words = chapters.data.reduce((n, c) => n + wordCount(c.content), 0);
  const aiSpend = costs.data.reduce((n, c) => n + c.costUsd, 0);
  const realCalls = costs.data.filter((c) => c.provider === 'anthropic').length;
  const ready = exports.data.filter((e) => e.kdpReady).length;
  const recent = [...activity.data].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
  const sorted = [...projects.data].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <PageHeader title="Panoramica" subtitle="Solo numeri verificabili, calcolati dai tuoi dati salvati. Nessuna vendita o performance stimata viene mostrata come reale." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Progetti / libri" value={String(projects.data.length)} note={`${niches.data.length} nicchie salvate`} />
        <Kpi label="Capitoli scritti" value={`${written.length}/${chapters.data.length}`} note={`${reviewed.length} rivisti · ${words.toLocaleString('it-IT')} parole`} />
        <Kpi label="Esportazioni" value={String(exports.data.length)} note={`${ready} con stato “pronto”`} />
        <Kpi label="Spesa AI" value={formatMoney(aiSpend, 'USD')} note={realCalls ? `${realCalls} chiamate Anthropic reali` : 'nessuna chiamata a pagamento'} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate2">Spesa Ads (dai report importati)</p>
          {adRows.length === 0 ? (
            <>
              <p className="mt-1 text-sm text-ink">Dato non disponibile.</p>
              <p className="mt-1 text-xs text-slate2">Importa un report Sponsored Products nella scheda “Ads &amp; Royalties” di un progetto. Nessuna campagna è collegata né avviata da FOLYNTRA.</p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-2xl font-bold text-ink">{ad.spend.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate2">Somma nella valuta dei report · ACOS {ad.acosPct === null ? 'n/d' : `${ad.acosPct}%`} · {ad.orders} ordini · {plans.data.filter((p) => p.reportRows.length).length} libri con report</p>
            </>
          )}
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate2">Royalties reali e margine</p>
          {sales.data.length === 0 ? (
            <>
              <p className="mt-1 text-sm text-ink">Dato non disponibile.</p>
              <p className="mt-1 text-xs text-slate2">Servono i tuoi report KDP (import CSV nella scheda “Ads &amp; Royalties”). Gli scenari ipotetici restano separati e sempre etichettati.</p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-2xl font-bold text-ink">{royalties.byCurrency.map((c) => `${c.royalty.toLocaleString('it-IT', { minimumFractionDigits: 2 })} ${c.currency}`).join(' · ')}</p>
              <p className="mt-1 text-xs text-slate2">{royalties.units} copie dai report importati{royalties.byCurrency.length === 1 && adRows.length ? ` · dopo Ads: ${(royalties.byCurrency[0].royalty - ad.spend).toLocaleString('it-IT', { minimumFractionDigits: 2 })} ${royalties.byCurrency[0].currency}` : ''} · prima delle imposte</p>
            </>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardTitle action={<Link href="/nicchie" className="inline-flex items-center gap-1 text-sm font-medium text-cyan hover:underline">Nuovo libro da una nicchia <ArrowRight className="size-3.5" aria-hidden /></Link>}>Progetti</CardTitle>
          {projects.loading ? (
            <p className="text-sm text-slate2">Caricamento…</p>
          ) : sorted.length === 0 ? (
            <Empty title="Nessun progetto">Si parte sempre dalla ricerca: apri <Link href="/nicchie" className="font-medium text-cyan underline">Scopri nicchie</Link>, valuta un’ipotesi e crea il libro da lì.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {sorted.map((p) => {
                const steps = projectSteps(p, chapters.data.filter((c) => c.projectId === p.id), exports.data.filter((e) => e.projectId === p.id));
                const pct = projectPercent(steps);
                return (
                  <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                    <Link href={`/progetti/${p.id}`} className="group block">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 font-medium text-ink group-hover:underline">{p.title}</p>
                        <Badge tone="gold">{STATUS_LABEL[p.status]}</Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Progress value={pct} label={`Avanzamento di ${p.title}`} />
                        <span className="w-10 shrink-0 text-right text-xs font-semibold text-slate2">{pct}%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate2">{steps.map((s) => `${s.label}: ${s.detail}`).join(' · ')}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle>Attività recenti</CardTitle>
          {recent.length === 0 ? (
            <p className="text-sm text-slate2">Ancora nessuna attività registrata.</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="text-ink">{a.message}</p>
                  <p className="text-xs text-slate2">{formatDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
