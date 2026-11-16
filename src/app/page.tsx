'use client';

import { ArrowRight, BookOpenCheck, Check, FileArchive, Lock, Megaphone, PenLine, Search, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Emblem, Wordmark } from '@/components/brand';
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

type Tone = 'cyan' | 'violet' | 'amber';
const TONES: Record<Tone, string> = {
  cyan: 'border-cyan/40 bg-cyan/10 text-cyan',
  violet: 'border-violet/50 bg-violet/15 text-[#b9a2ff]',
  amber: 'border-amber/40 bg-amber/10 text-amber',
};

const STEPS: { icon: typeof Search; tone: Tone; title: string; text: string }[] = [
  { icon: Search, tone: 'cyan', title: 'Scopri nicchie', text: 'Punteggio di opportunità spiegato, con provenienza e affidabilità separate. I dati DEMO restano a affidabilità 0%.' },
  { icon: PenLine, tone: 'violet', title: 'Brief e indice', text: 'La nicchia scelta compila il brief. L’indice nasce dal tuo pubblico e dal tuo obiettivo, non da un modello fisso.' },
  { icon: BookOpenCheck, tone: 'cyan', title: 'Scrittura e interni', text: 'Capitolo per capitolo, con cronologia, ripresa dopo interruzione e tetto di spesa. PDF impaginato con il numero di pagine reale.' },
  { icon: FileArchive, tone: 'violet', title: 'Copertina e kit', text: 'Copertina vettoriale originale con dorso calcolato sulle pagine vere. PDF, EPUB, DOCX e metadati in un unico ZIP.' },
  { icon: ShieldCheck, tone: 'cyan', title: 'Controlli', text: 'Segnaposto, fonti mancanti, font incorporati, geometria. Se un controllo critico fallisce, niente “pronto”.' },
  { icon: Megaphone, tone: 'amber', title: 'Ads e royalties', text: 'Piano manuale Sponsored Products, ACOS di pareggio e royalties da report che importi tu. Nessuna campagna avviata al posto tuo.' },
];

const CHECKS = ['Testo segnaposto o DEMO', 'Fonti non verificate', 'Revisione umana confermata', 'Dichiarazione IA coerente', 'Font incorporati nel PDF', 'Dorso dal numero pagine reale', 'Struttura EPUB e DOCX', 'Metadati e categorie'];

export default function LandingPage() {
  const { mode, userEmail, authReady, status, signIn, signUp, unlock } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'in' | 'up' | 'code' | null>(null);
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

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy('code');
    setMessage(null);
    try {
      if (await unlock(code)) router.push('/dashboard');
      else setMessage({ tone: 'bad', text: 'Codice errato. Dopo 8 tentativi sbagliati l’accesso si blocca per 10 minuti.' });
    } catch (err) {
      setMessage({ tone: 'bad', text: err instanceof Error && err.message ? err.message : 'Server non raggiungibile: riprova.' });
    } finally {
      setBusy(null);
    }
  }

  const needsCode = mode === 'locale' && Boolean(status?.access.required && !status.access.valid);

  return (
    <div className="text-ink">
      {/* HERO */}
      <header className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(55% 60% at 80% 35%, rgba(136,92,246,0.28), transparent 70%), radial-gradient(40% 45% at 62% 80%, rgba(0,229,255,0.16), transparent 70%)' }} />
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-5 sm:pb-24">
          <nav className="flex items-center justify-between" aria-label="Principale">
            <Wordmark tagline />
            <a href="#accesso" className="rounded-full border border-cyan/50 px-4 py-2 text-sm font-medium text-cyan transition-colors hover:bg-cyan/10">Accedi</a>
          </nav>

          <div className="mt-12 grid items-center gap-12 lg:mt-16 lg:grid-cols-[1.05fr_1fr]">
            <div className="animate-rise">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Piattaforma per autori su Amazon KDP</p>
              <h1 className="mt-5 font-display text-[2.5rem] font-extrabold leading-[1.05] sm:text-[3.6rem]">
                Scopri nicchie.<br />Crea libri.<br />
                <span className="bg-gradient-to-r from-cyan to-violet bg-clip-text text-transparent">Pubblica con metodo.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/75">
                Dalla ricerca di nicchia con dati tracciabili al kit pronto da caricare: scrittura assistita dall’IA sotto il tuo controllo, copertina, interni, PDF, EPUB e DOCX.
                Nessuna promessa di vendite: un lavoro editoriale più rapido e più verificato.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href="#accesso" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-cyan px-6 font-semibold text-onbrand shadow-[0_10px_30px_-10px_rgba(0,229,255,0.7)] transition hover:brightness-110">Prova ora <ArrowRight className="size-4" aria-hidden /></a>
                <a href="#percorso" className="inline-flex min-h-12 items-center rounded-lg border border-line px-6 text-ink/90 transition-colors hover:border-cyan/60">Come funziona</a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink/75">
                {['Dati sempre etichettati', 'IA dichiarata', 'Controlli prima del kit'].map((t) => (
                  <li key={t} className="inline-flex items-center gap-2"><Check className="size-4 text-cyan" aria-hidden /> {t}</li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto h-[22rem] w-full max-w-md sm:h-[28rem]" aria-label="Tre copertine generate dal software">
              <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-cyan/25 to-violet/30 blur-3xl" />
              {[0, 1, 2].map((i) => {
                const pos = ['-left-[3%] top-16 w-[40%] -rotate-[9deg]', 'left-1/2 top-2 z-10 w-[46%] -translate-x-1/2', '-right-[3%] top-[4.5rem] w-[40%] rotate-[9deg]'][i];
                return <div key={i} className={`absolute overflow-hidden rounded-sm shadow-[0_28px_60px_-14px_rgba(0,0,0,0.85)] ring-1 ring-white/15 ${pos}`} style={{ aspectRatio: '6/9' }} dangerouslySetInnerHTML={{ __html: sampleCover(i) }} />;
              })}
              <p className="absolute -bottom-3 left-0 right-0 text-center text-xs text-ink/50">Copertine di esempio generate dal software: grafica vettoriale originale, nessuna immagine stock o IA.</p>
            </div>
          </div>
        </div>
      </header>

      {/* PERCORSO */}
      <section id="percorso" className="border-t border-line bg-midnight/60">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Il percorso</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold sm:text-4xl">Dalla nicchia al libro, in un solo flusso.</h2>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-card p-6 transition-colors hover:border-cyan/40">
                <div className="flex items-center justify-between">
                  <span className={`grid size-12 place-items-center rounded-xl border ${TONES[s.tone]}`}><s.icon className="size-6" aria-hidden /></span>
                  <span className="font-display text-sm font-semibold text-slate2">0{i + 1}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CONTROLLI */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber">Controllo qualità</p>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">“Pronto” significa che ha passato i controlli.</h2>
            <p className="mt-4 max-w-md leading-relaxed text-ink/70">
              Un file non viene mai segnato come pronto per decisione dell’interfaccia. Se resta un segnaposto, una fonte da verificare o una revisione umana non confermata, il kit esce come BOZZA e ti dice perché.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {CHECKS.map((c) => (
              <li key={c} className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-[15px]">
                <ShieldCheck className="size-5 shrink-0 text-cyan" aria-hidden /> {c}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ONESTÀ + ACCESSO */}
      <section id="accesso" className="border-t border-line bg-midnight/60">
        <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 py-16 sm:py-24 lg:grid-cols-[1fr_28rem]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan">Cosa è e cosa non è</p>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Strumento serio, promesse misurate.</h2>
            <ul className="mt-6 space-y-4 text-[15px] leading-relaxed text-slate2">
              <li><strong className="text-ink">Dati etichettati.</strong> Ogni numero di mercato è osservato, stimato, importato o DEMO. Mai inventato.</li>
              <li><strong className="text-ink">“Profittevole” è una probabilità.</strong> Il punteggio valuta un’opportunità, non garantisce vendite né guadagni.</li>
              <li><strong className="text-ink">IA dichiarata, revisione tua.</strong> Il software ti guida nella dichiarazione a KDP; la revisione umana resta obbligatoria.</li>
              <li><strong className="text-ink">Pubblicazione manuale.</strong> Non esiste un’API pubblica per pubblicare su KDP: prepari i file qui e li carichi tu.</li>
            </ul>
          </div>

          <div className="animate-rise rounded-2xl border border-cyan/30 bg-card p-6 shadow-[0_30px_80px_-30px_rgba(0,229,255,0.35)]">
            <div className="mb-4 flex justify-center"><Emblem size={72} /></div>
            {!authReady ? (
              <p className="text-center text-sm text-slate2">Caricamento…</p>
            ) : mode === 'locale' ? (
              needsCode ? (
                <form className="space-y-4" onSubmit={(e) => void submitCode(e)}>
                  <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Lock className="size-5 text-cyan" aria-hidden /> Accesso riservato</h2>
                  <p className="text-sm text-slate2">Questo server è protetto: inserisci il codice di accesso. Lo ricordo su questo dispositivo.</p>
                  <Field label="Codice di accesso">{(id) => <Input id={id} type="password" autoComplete="current-password" required minLength={8} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
                  {message && <Notice tone={message.tone}>{message.text}</Notice>}
                  <Button type="submit" className="w-full" size="lg" loading={busy === 'code'} disabled={code.trim().length < 8}>Sblocca <ArrowRight className="size-4" aria-hidden /></Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <h2 className="font-display text-xl font-bold">{status?.access.required ? 'Accesso sbloccato' : 'Modalità demo locale'}</h2>
                  <Notice tone={status?.access.required ? 'ok' : 'demo'}>
                    {status?.access.required ? 'Codice verificato. I dati dei libri restano solo in questo browser: fai periodicamente un backup da Impostazioni.' : 'Non c’è login e i dati restano solo in questo browser. Tutte le funzioni di base sono utilizzabili.'}
                  </Notice>
                  <Link href="/dashboard" className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-cyan px-5 font-semibold text-onbrand shadow-[0_10px_30px_-10px_rgba(0,229,255,0.7)] hover:brightness-110">
                    Entra nell’app <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              )
            ) : userEmail ? (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-bold">Bentornato</h2>
                <p className="text-sm text-slate2">Accesso effettuato come {userEmail}.</p>
                <Link href="/dashboard" className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-cyan px-5 font-semibold text-onbrand hover:brightness-110">
                  Vai alla panoramica <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={(e) => void submit(e, 'in')}>
                <h2 className="font-display text-xl font-bold">Accedi</h2>
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

      <footer className="border-t border-line px-5 py-8 text-center text-xs text-ink/50">FOLYNTRA AI · Intelligenza Editoriale. Non affiliato ad Amazon. KDP è un marchio di Amazon.</footer>
    </div>
  );
}
