'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Errori dopo un aggiornamento dell'app: la scheda aperta chiede file vecchi che non esistono più. Un ricaricamento li risolve. */
const STALE = /chunk|loading css|dynamically imported module|failed to fetch|importing a module|ChunkLoad|Load failed/i;

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = STALE.test(`${error.name} ${error.message}`);
  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem('folyntra-reloaded') !== '1') {
        sessionStorage.setItem('folyntra-reloaded', '1');
        window.location.reload();
      }
    } catch {
      /* sessionStorage non disponibile: resta il pulsante manuale */
    }
  }, [stale]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">{stale ? 'L’app è stata aggiornata' : 'Qualcosa è andato storto in questa pagina'}</h1>
      <p className="text-sm text-slate2">
        {stale ? 'Questa scheda usava una versione precedente. Ricarica per passare a quella nuova: i tuoi libri e le tue nicchie sono salvati nel browser e non si perdono.' : 'I tuoi dati sono salvati nel browser e non si perdono. Prova a ricaricare; se si ripete, scrivimi il testo qui sotto.'}
      </p>
      {!stale && <code className="max-w-full break-words rounded-lg border border-line bg-card px-3 py-2 text-left text-xs text-slate2">{error.name}: {error.message.slice(0, 300)}{error.digest ? ` · ${error.digest}` : ''}</code>}
      <div className="flex flex-wrap justify-center gap-2">
        <button className="rounded-lg bg-cyan px-4 py-2 text-sm font-semibold text-onbrand" onClick={() => { try { sessionStorage.removeItem('folyntra-reloaded'); } catch { /* ok */ } window.location.reload(); }}>Ricarica</button>
        <button className="rounded-lg border border-line px-4 py-2 text-sm text-ink" onClick={() => reset()}>Riprova</button>
        <Link className="rounded-lg border border-line px-4 py-2 text-sm text-ink" href="/progetti">Torna ai progetti</Link>
      </div>
    </main>
  );
}
