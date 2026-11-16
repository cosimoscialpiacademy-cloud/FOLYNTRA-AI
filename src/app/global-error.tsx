'use client';

/** Ultima rete di sicurezza (errori nel layout): stesso messaggio, senza dipendere dai componenti dell'app. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="it">
      <body style={{ background: '#0b1220', color: '#f7f4ed', fontFamily: 'system-ui, sans-serif', display: 'grid', minHeight: '100vh', placeItems: 'center', margin: 0, padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 22 }}>L’app non si è caricata</h1>
          <p style={{ opacity: 0.8, fontSize: 14 }}>I tuoi dati sono salvati nel browser. Ricarica la pagina; se si ripete, scrivimi il testo qui sotto.</p>
          <code style={{ display: 'block', fontSize: 12, opacity: 0.7, margin: '12px 0', wordBreak: 'break-word' }}>{error.name}: {error.message.slice(0, 300)}</code>
          <button onClick={() => window.location.reload()} style={{ background: '#5de0e6', color: '#04121a', border: 0, borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>Ricarica</button>
        </div>
      </body>
    </html>
  );
}
