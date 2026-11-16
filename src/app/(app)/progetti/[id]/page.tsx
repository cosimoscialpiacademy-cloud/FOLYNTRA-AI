'use client';

import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BriefTab } from '@/components/project/brief-tab';
import { KitTab } from '@/components/project/kit-tab';
import { MarketingTab } from '@/components/project/marketing-tab';
import { SalesTab } from '@/components/project/sales-tab';
import { OutlineTab } from '@/components/project/outline-tab';
import { StudioTab } from '@/components/project/studio-tab';
import type { TabKey } from '@/components/project/types';
import { WriterTab } from '@/components/project/writer-tab';
import { Empty, Progress, useDebouncedSave } from '@/components/ui';
import { recoverInterruptedJobs } from '@/lib/generation';
import { projectPercent, projectSteps } from '@/lib/progress';
import { useLive, useStore } from '@/lib/store/context';
import type { Project } from '@/lib/types';
import { cn, nowIso } from '@/lib/utils';

function Workspace({ initial }: { initial: Project }) {
  const store = useStore();
  const [project, setProject] = useState(initial);
  const [tab, setTab] = useState<TabKey>(() => (typeof window !== 'undefined' && (['brief', 'indice', 'scrittura', 'studio', 'kit', 'marketing', 'vendite'] as const).find((t) => `#${t}` === window.location.hash)) || 'brief');
  const chapters = useLive('chapters', project.id);
  const exports = useLive('exports', project.id);
  const niches = useLive('niches');
  const [recovered, setRecovered] = useState(0);

  const save = useCallback(async (p: Project) => store.put('projects', p), [store]);
  const { dirty } = useDebouncedSave(project, save, 600);

  const update = useCallback((patch: Partial<Project>) => {
    setProject((p) => {
      const next: Project = { ...p, ...patch, updatedAt: nowIso() };
      // Titolo, sottotitolo e autore restano allineati alla copertina finché non vengono personalizzati lì.
      const cover = { ...next.cover };
      if (patch.title !== undefined && (p.cover.title === p.title || !p.cover.title)) cover.title = patch.title;
      if (patch.subtitle !== undefined && (p.cover.subtitle === p.subtitle || !p.cover.subtitle)) cover.subtitle = patch.subtitle;
      if (patch.author !== undefined && (p.cover.author === p.author || !p.cover.author)) cover.author = patch.author;
      if (!patch.cover) next.cover = cover;
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    recoverInterruptedJobs(store, initial.id).then((n) => active && setRecovered(n)).catch(() => undefined);
    return () => { active = false; };
  }, [store, initial.id]);

  const goTo = useCallback((t: TabKey) => {
    setTab(t);
    window.history.replaceState(null, '', `#${t}`);
    window.scrollTo({ top: 0 });
  }, []);

  const sorted = [...chapters.data].sort((a, b) => a.position - b.position);
  const steps = projectSteps(project, sorted, exports.data);
  const pct = projectPercent(steps);
  const niche = niches.data.find((n) => n.id === project.nicheId) ?? null;
  const props = { project, chapters: sorted, niche, update, goTo };

  return (
    <>
      <div className="mb-4">
        <Link href="/progetti" className="inline-flex items-center gap-1 text-sm text-slate2 hover:text-ink"><ArrowLeft className="size-3.5" aria-hidden /> Progetti</Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <h1 className="min-w-0 font-display text-2xl font-bold text-ink sm:text-3xl">{project.title}</h1>
          <span className="text-xs text-slate2" aria-live="polite">{dirty ? 'Salvataggio…' : 'Tutte le modifiche sono salvate'}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Progress value={pct} label="Avanzamento del progetto" />
          <span className="w-10 shrink-0 text-right text-xs font-semibold text-slate2">{pct}%</span>
        </div>
      </div>

      <div className="sticky top-[49px] z-10 -mx-4 mb-5 overflow-x-auto border-b border-line bg-ivory/95 px-4 backdrop-blur sm:-mx-6 sm:px-6" role="tablist" aria-label="Fasi del progetto">
        <div className="flex min-w-max gap-1">
          {steps.map((s, i) => (
            <button key={s.key} role="tab" aria-selected={tab === s.key} onClick={() => goTo(s.key)}
              className={cn('flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors', tab === s.key ? 'border-cyan text-ink' : 'border-transparent text-slate2 hover:text-ink')}>
              <span className={cn('grid size-5 place-items-center rounded-full text-[11px] font-bold', s.ratio >= 1 ? 'bg-ok text-onbrand' : tab === s.key ? 'bg-cyan text-onbrand' : 'bg-white/10 text-ink')}>
                {s.ratio >= 1 ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              {s.label}
            </button>
          ))}
          <button role="tab" aria-selected={tab === 'marketing'} onClick={() => goTo('marketing')}
            className={cn('flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors', tab === 'marketing' ? 'border-cyan text-ink' : 'border-transparent text-slate2 hover:text-ink')}>
            Marketing
          </button>
          <button role="tab" aria-selected={tab === 'vendite'} onClick={() => goTo('vendite')}
            className={cn('flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors', tab === 'vendite' ? 'border-cyan text-ink' : 'border-transparent text-slate2 hover:text-ink')}>
            Ads &amp; Royalties
          </button>
        </div>
      </div>

      {recovered > 0 && <p className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{recovered} generazione interrotta è stata recuperata: il testo parziale è salvato, puoi riprendere dalla scheda Scrittura.</p>}

      <div role="tabpanel">
        {tab === 'brief' && <BriefTab {...props} />}
        {tab === 'indice' && <OutlineTab {...props} />}
        {tab === 'scrittura' && <WriterTab {...props} />}
        {tab === 'studio' && <StudioTab {...props} />}
        {tab === 'kit' && <KitTab {...props} />}
        {tab === 'marketing' && <MarketingTab {...props} />}
        {tab === 'vendite' && <SalesTab {...props} />}
      </div>
    </>
  );
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const [state, setState] = useState<{ project: Project | null; loaded: boolean }>({ project: null, loaded: false });
  useEffect(() => {
    let active = true;
    store.get('projects', id).then((p) => active && setState({ project: p, loaded: true })).catch(() => active && setState({ project: null, loaded: true }));
    return () => { active = false; };
  }, [store, id]);

  if (!state.loaded) return <p className="text-sm text-slate2">Caricamento…</p>;
  if (!state.project) return <Empty title="Progetto non trovato">Potrebbe essere stato eliminato o appartenere a un altro dispositivo. <Link href="/progetti" className="font-medium text-cyan underline">Torna ai progetti</Link>.</Empty>;
  return <Workspace key={state.project.id} initial={state.project} />;
}
