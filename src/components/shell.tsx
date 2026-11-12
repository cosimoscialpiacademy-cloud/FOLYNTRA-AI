'use client';

import { BookOpen, LayoutDashboard, LogOut, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useApp } from '@/lib/store/context';
import { cn } from '@/lib/utils';
import { Wordmark } from './brand';
import { Badge } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Panoramica', icon: LayoutDashboard },
  { href: '/nicchie', label: 'Scopri nicchie', icon: Search },
  { href: '/progetti', label: 'Progetti', icon: BookOpen },
  { href: '/impostazioni', label: 'Impostazioni', icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const { store, mode, userEmail, authReady, status, signOut } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const needsLogin = authReady && mode === 'supabase' && !userEmail;

  useEffect(() => {
    if (needsLogin) router.replace('/');
  }, [needsLogin, router]);

  if (!authReady || !store || needsLogin) {
    return <div className="grid min-h-dvh place-items-center text-sm text-slate2">Caricamento…</div>;
  }

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-midnight px-4 py-6 lg:flex">
        <Link href="/dashboard" className="px-2 text-xl"><Wordmark light /></Link>
        <p className="mt-1 px-2 text-xs text-ivory/50">Publishing Intelligence</p>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Navigazione principale">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', active(n.href) ? 'bg-ink text-gold' : 'text-ivory/75 hover:bg-ink/70 hover:text-ivory')}>
              <n.icon className="size-4.5" aria-hidden /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 px-2 text-xs text-ivory/60">
          {mode === 'supabase' ? (
            <>
              <p className="truncate" title={userEmail ?? ''}>{userEmail}</p>
              <button onClick={() => void signOut()} className="inline-flex items-center gap-1.5 text-ivory/80 hover:text-gold"><LogOut className="size-3.5" aria-hidden /> Esci</button>
            </>
          ) : (
            <p>Dati salvati solo in questo browser.</p>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ivory/95 px-4 py-2.5 backdrop-blur sm:px-6">
        <Link href="/dashboard" className="text-lg lg:hidden"><Wordmark /></Link>
        <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
          {mode === 'locale' && <Badge tone="demo">MODALITÀ DEMO LOCALE</Badge>}
          {status && (status.ai.mode === 'mock' ? <Badge tone="warn" className="max-w-full">AI: mock dichiarato</Badge> : <Badge tone="ok">AI: {status.ai.model}</Badge>)}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink bg-midnight pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navigazione principale">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}
            className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium', active(n.href) ? 'text-gold' : 'text-ivory/70')}>
            <n.icon className="size-5" aria-hidden />
            {n.label.replace('Scopri ', '').replace(/^n/, 'N')}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-serif text-2xl font-bold text-midnight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
