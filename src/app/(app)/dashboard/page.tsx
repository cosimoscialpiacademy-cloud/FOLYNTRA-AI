'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { Badge, Card, CardTitle, Empty, Progress } from '@/components/ui';
import { STATUS_LABEL, projectPercent, projectSteps } from '@/lib/progress';
import { useLive } from '@/lib/store/context';
import { formatDateTime, formatMoney, wordCount } from '@/lib/utils';

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="animate-rise">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate2">{label}</p>
      <p className="mt-1 font-serif text-3xl font-bold text-midnight">{value}</p>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-slate2">Spesa Ads</p>
          <p className="mt-1 text-sm text-ink">Dato non disponibile.</p>
          <p className="mt-1 text-xs text-slate2">L’import dei report Amazon Ads arriva con la Fase B. Nessuna campagna è collegata.</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate2">Royalties e margini netti</p>
          <p className="mt-1 text-sm text-ink">Dato non disponibile.</p>
          <p className="mt-1 text-xs text-slate2">Servono i report KDP reali (import CSV, Fase B). Gli scenari ipotetici sono nelle schede nicchia e nel KDP Kit, sempre etichettati.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardTitle action={<Link href="/nicchie" className="inline-flex items-center gap-1 text-sm font-medium text-golddeep hover:underline">Nuovo libro da una nicchia <ArrowRight className="size-3.5" aria-hidden /></Link>}>Progetti</CardTitle>
          {projects.loading ? (
            <p className="text-sm text-slate2">Caricamento…</p>
          ) : sorted.length === 0 ? (
            <Empty title="Nessun progetto">Si parte sempre dalla ricerca: apri <Link href="/nicchie" className="font-medium text-golddeep underline">Scopri nicchie</Link>, valuta un’ipotesi e crea il libro da lì.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {sorted.map((p) => {
                const steps = projectSteps(p, chapters.data.filter((c) => c.projectId === p.id), exports.data.filter((e) => e.projectId === p.id));
                const pct = projectPercent(steps);
                return (
                  <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                    <Link href={`/progetti/${p.id}`} className="group block">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 font-medium text-midnight group-hover:underline">{p.title}</p>
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
