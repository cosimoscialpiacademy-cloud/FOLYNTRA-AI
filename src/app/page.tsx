'use client';

import { ArrowRight, BookOpenCheck, FileArchive, Layers, PenLine, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Wordmark } from '@/components/brand';
import { Button, Field, Input, Notice } from '@/components/ui';
import { COVER_PRESETS, defaultCover } from '@/lib/defaults';
import { frontCoverSvg } from '@/lib/export/cover-svg';
import { useApp } from '@/lib/store/context';

const SAMPLES = [
  { title: 'Il giardino in un balcone', subtitle: 'Metodo semplice, stagione per stagione', author: 'Autore di esempio' },
  { title: 'Casa in ordine', subtitle: 'Routine da 15 minuti al giorno', author: 'Autore di esempio' },
  { title: 'Cucina di recupero', subtitle: 'Ricette per non sprecare', author: 'Autore di esempio' },
];
function sampleCover(i: number) {
  const p = COVER_PRESETS[i];
  const base = defaultCover(SAMPLES[i].title, SAMPLES[i].author);
  return frontCoverSvg({ ...base, ...SAMPLES[i], template: p.template, palette: p.palette, titleFont: p.titleFont, seed: 11 + i }, 6, 9);
}

const STEPS = [
  { icon: Search, title: 'Nicchia', text: 'Punteggio di opportunità spiegato, con provenienza e affidabilità separate. I dati DEMO restano a affidabilità 0%.' },
  { icon: PenLine, title: 'Brief e indice', text: 'La nicchia scelta compila il brief. L’indice nasce dal tuo pubblico e dal tuo obiettivo, non da un modello fisso.' },
  { icon: Layers, title: 'Scrittura per capitoli', text: 'Capitolo per capitolo, con cronologia, ripresa dopo interruzione e tetto di spesa che non si supera.' },
  { icon: BookOpenCheck, title: 'Cover e interni', text: 'Copertina vettoriale originale e PDF impaginato con il numero di pagine reale: il dorso si calcola da lì.' },
  { icon: ShieldCheck, title: 'Controlli', text: 'Segnaposto, fonti mancanti, font incorporati, geometria della copertina. Se un controllo critico fallisce, niente “pronto”.' },
  { icon: FileArchive, title: 'Kit KDP', text: 'PDF, copertina, EPUB, DOCX, metadati e checklist in un unico ZIP con impronte SHA-256. Il caricamento su KDP lo fai tu.' },
];

const CHECKS = ['Testo segnaposto o DEMO', 'Fonti non verificate', 'Revisione umana confermata', 'Dichiarazione IA coerente', 'Font incorporati nel PDF', 'Dorso dal numero pagine reale', 'Struttura EPUB e DOCX', 'Metadati e categorie'];

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
    <div className="bg-midnight text-ivory">
      {/* HERO */}
      <header className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 55% at 78% 30%, rgba(215,181,116,0.16), transparent 70%), radial-gradient(40% 40% at 8% 90%, rgba(215,181,116,0.07), transparent 70%)' }} />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-6 sm:pb-24">
          <nav className="flex items-center justify-between" aria-label="Principale">
            <p className="text-xl"><Wordmark light /></p>
            <a href="#accesso" className="rounded-full border border-gold/40 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10">Accedi</a>
          </nav>

          <div className="mt-14 grid items-center gap-12 lg:mt-20 lg:grid-cols-[1.05fr_1fr]">
            <div className="animate-rise">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Publishing Intelligence · per Amazon KDP</p>
              <h1 className="mt-5 font-serif text-[2.6rem] font-bold leading-[1.05] sm:text-6xl">
                Dal mercato al libro finito. <span className="text-gold">Con i controlli che contano.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ivory/75">
                Scegli una nicchia con dati tracciabili, scrivi con l’IA sotto il tuo controllo, e ottieni PDF, copertina, EPUB e DOCX pronti da caricare.
                Nessuna promessa di vendite: solo un lavoro editoriale più rapido e più verificato.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href="#accesso" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-gold px-6 font-semibold text-midnight transition-colors hover:bg-[#e3c78d]">Provala ora <ArrowRight className="size-4" aria-hidden /></a>
                <a href="#percorso" className="inline-flex min-h-12 items-center rounded-lg border border-ivory/20 px-6 text-ivory/90 transition-colors hover:border-ivory/40">Come funziona</a>
              </div>
            </div>

            <div className="relative mx-auto h-[22rem] w-full max-w-md sm:h-[27rem]" aria-label="Tre copertine generate dal software">
              {[0, 1, 2].map((i) => {
                const pos = [
                  '-left-[3%] top-14 w-[40%] -rotate-[9deg]',
                  'left-1/2 top-0 z-10 w-[46%] -translate-x-1/2',
                  '-right-[3%] top-16 w-[40%] rotate-[9deg]',
                ][i];
                return (
                  <div key={i} className={`absolute overflow-hidden rounded-sm shadow-[0_24px_50px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/10 ${pos}`} style={{ aspectRatio: '6/9' }} dangerouslySetInnerHTML={{ __html: sampleCover(i) }} />
                );
              })}
              <p className="absolute -bottom-2 left-0 right-0 text-center text-xs text-ivory/50">Copertine di esempio generate dal software: grafica vettoriale originale, nessuna immagine stock o IA.</p>
            </div>
          </div>
        </div>
      </header>

      {/* PERCORSO */}
      <section id="percorso" className="bg-ivory text-ink">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-golddeep">Il percorso</p>
          <h2 className="mt-3 max-w-2xl font-serif text-3xl font-bold text-midnight sm:text-4xl">Sei passi, un solo flusso. Niente fogli sparsi.</h2>
          <ol className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative border-t border-line pt-6">
                <span className="absolute -top-px left-0 h-px w-12 bg-gold" aria-hidden />
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-midnight text-gold"><s.icon className="size-5" aria-hidden /></span>
                  <span className="font-serif text-sm text-slate2">0{i + 1}</span>
                </div>
                <h3 className="mt-4 font-serif text-xl font-bold text-midnight">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CONTROLLI */}
      <section className="bg-midnight">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">Controllo qualità</p>
            <h2 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">“Pronto” significa che ha passato i controlli.</h2>
            <p className="mt-4 max-w-md leading-relaxed text-ivory/70">
              Un file non viene mai segnato come pronto per decisione dell’interfaccia. Se resta un segnaposto, una fonte da verificare o una revisione umana non confermata, il kit esce come BOZZA e ti dice perché.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {CHECKS.map((c) => (
              <li key={c} className="flex items-center gap-3 rounded-lg border border-ivory/10 bg-white/[0.04] px-4 py-3 text-[15px]">
                <ShieldCheck className="size-4.5 shrink-0 text-gold" aria-hidden /> {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ONESTÀ + ACCESSO */}
      <section id="accesso" className="bg-ivory text-ink">
        <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1fr_28rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-golddeep">Cosa è e cosa non è</p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-midnight sm:text-4xl">Strumento serio, promesse misurate.</h2>
            <ul className="mt-6 space-y-4 text-[15px] leading-relaxed text-slate2">
              <li><strong className="text-ink">Dati etichettati.</strong> Ogni numero di mercato è osservato, stimato, importato o DEMO. Mai inventato.</li>
              <li><strong className="text-ink">“Profittevole” è una probabilità.</strong> Il punteggio valuta un’opportunità, non garantisce vendite né guadagni.</li>
              <li><strong className="text-ink">IA dichiarata, revisione tua.</strong> Il software ti guida nella dichiarazione a KDP; la revisione umana resta obbligatoria.</li>
              <li><strong className="text-ink">Pubblicazione manuale.</strong> Non esiste un’API pubblica per pubblicare su KDP: prepari i file qui e li carichi tu.</li>
            </ul>
          </div>

          <div className="animate-rise rounded-2xl border border-line bg-white p-6 shadow-[0_20px_50px_-20px_rgba(13,20,36,0.35)]">
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
      </section>

      <footer className="bg-midnight px-5 py-8 text-center text-xs text-ivory/50">FOLYNTRA AI · Strumento editoriale. Non affiliato ad Amazon. KDP è un marchio di Amazon.</footer>
    </div>
  );
}
