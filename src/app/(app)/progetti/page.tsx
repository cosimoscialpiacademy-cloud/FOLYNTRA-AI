'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import { Badge, Button, Card, Empty, Progress, useToast } from '@/components/ui';
import { MARKETPLACES } from '@/lib/kdp/specs';
import { STATUS_LABEL, projectPercent, projectSteps } from '@/lib/progress';
import { useLive, useStore } from '@/lib/store/context';
import { formatDate } from '@/lib/utils';

export default function ProjectsPage() {
  const store = useStore();
  const toast = useToast();
  const projects = useLive('projects');
  const chapters = useLive('chapters');
  const exports = useLive('exports');

  async function removeProject(id: string, title: string) {
    if (!window.confirm(`Eliminare definitivamente «${title}» con capitoli, versioni ed esportazioni registrate?`)) return;
    for (const c of ['chapters', 'revisions', 'jobs', 'costs', 'exports', 'activity', 'adPlans', 'sales'] as const) {
      for (const d of await store.list(c, { projectId: id })) await store.remove(c, d.id);
    }
    await store.remove('projects', id);
    toast('Progetto eliminato.', 'ok');
  }

  const sorted = [...projects.data].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <>
      <PageHeader title="Progetti" subtitle="Ogni libro nasce da una nicchia valutata." action={<Link href="/nicchie" className="inline-flex min-h-11 items-center rounded-lg bg-midnight px-4 text-sm font-medium text-ink hover:bg-ink">Nuovo libro da una nicchia</Link>} />
      {projects.loading ? (
        <p className="text-sm text-slate2">Caricamento…</p>
      ) : sorted.length === 0 ? (
        <Empty title="Nessun progetto">Apri <Link href="/nicchie" className="font-medium text-cyan underline">Scopri nicchie</Link> e crea il primo libro.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((p) => {
            const steps = projectSteps(p, chapters.data.filter((c) => c.projectId === p.id), exports.data.filter((e) => e.projectId === p.id));
            const pct = projectPercent(steps);
            return (
              <Card key={p.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/progetti/${p.id}`} className="min-w-0 font-display text-lg font-bold text-ink hover:underline">{p.title}</Link>
                  <Badge tone="gold">{STATUS_LABEL[p.status]}</Badge>
                </div>
                <p className="text-xs text-slate2">{MARKETPLACES[p.marketplace].label} · aggiornato il {formatDate(p.updatedAt)}</p>
                <div className="flex items-center gap-3">
                  <Progress value={pct} label={`Avanzamento di ${p.title}`} />
                  <span className="w-10 shrink-0 text-right text-xs font-semibold text-slate2">{pct}%</span>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <Link href={`/progetti/${p.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-sm font-medium hover:bg-ivory">Apri</Link>
                  <Button variant="ghost" size="sm" onClick={() => void removeProject(p.id, p.title)} aria-label={`Elimina ${p.title}`}><Trash2 className="size-4" aria-hidden /> Elimina</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
