'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Wordmark } from '@/components/brand';
import { Button, Field, Input, Notice } from '@/components/ui';
import { useApp } from '@/lib/store/context';

export default function LandingPage() {
  const { mode, userEmail, authReady, signIn, signUp } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'in' | 'up' | null>(null);
  const [message, setMessage] = useState<{ tone: 'bad' | 'ok'; text: string } | null>(null);

  async function submit(e: FormEvent, kind: 'in' | 'up') {
    e.preventDefault();
    setBusy(kind);
    setMessage(null);
    const error = kind === 'in' ? await signIn(email, password) : await signUp(email, password);
    setBusy(null);
    if (error) return setMessage({ tone: 'bad', text: error });
    if (kind === 'up') return setMessage({ tone: 'ok', text: 'Account creato. Se è richiesta la conferma, controlla la tua email e poi accedi.' });
    router.push('/dashboard');
  }

  return (
    <div className="min-h-dvh bg-midnight text-ivory">
      <div className="mx-auto grid min-h-dvh max-w-5xl items-center gap-10 px-5 py-12 lg:grid-cols-[1.15fr_1fr]">
        <div className="animate-rise">
          <p className="text-2xl"><Wordmark light /></p>
          <h1 className="mt-6 font-serif text-4xl font-bold leading-tight sm:text-5xl">Dalla nicchia al pacchetto KDP, senza salti.</h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-ivory/75">
            Ricerca di nicchia con punteggio trasparente, scrittura assistita capitolo per capitolo, copertina originale, PDF, EPUB, DOCX e kit di caricamento. Riduce il lavoro editoriale ripetitivo:
            non promette vendite.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-ivory/70">
            <li>• Ogni dato di mercato è etichettato: osservato, stimato, importato o DEMO.</li>
            <li>• Il contenuto generato da IA va dichiarato a KDP e controllato da te.</li>
            <li>• File preparati per upload manuale: Amazon verifica e approva la pubblicazione.</li>
          </ul>
        </div>

        <div className="animate-rise rounded-2xl bg-ivory p-6 text-ink shadow-2xl">
          {!authReady ? (
            <p className="text-sm text-slate2">Caricamento…</p>
          ) : mode === 'locale' ? (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-bold text-midnight">Modalità demo locale</h2>
              <Notice tone="demo">Supabase non è configurato: non c’è login e i dati restano solo in questo browser. Tutte le funzioni della Fase A sono utilizzabili.</Notice>
              <Link href="/dashboard" className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-midnight px-5 font-medium text-ivory hover:bg-ink">
                Entra nell’app <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          ) : userEmail ? (
            <div className="space-y-4">
              <h2 className="font-serif text-xl font-bold text-midnight">Bentornato</h2>
              <p className="text-sm text-slate2">Accesso effettuato come {userEmail}.</p>
              <Link href="/dashboard" className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-midnight px-5 font-medium text-ivory hover:bg-ink">
                Vai alla panoramica <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => void submit(e, 'in')}>
              <h2 className="font-serif text-xl font-bold text-midnight">Accedi</h2>
              <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
              <Field label="Password" hint="Minimo 8 caratteri.">{(id) => <Input id={id} type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
              {message && <Notice tone={message.tone}>{message.text}</Notice>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" className="flex-1" loading={busy === 'in'}>Accedi</Button>
                <Button variant="outline" className="flex-1" loading={busy === 'up'} disabled={!email || password.length < 8} onClick={(e) => void submit(e, 'up')}>Crea account</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
