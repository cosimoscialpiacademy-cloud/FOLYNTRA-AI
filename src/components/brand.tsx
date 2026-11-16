import Image from 'next/image';

/** Emblema ufficiale (brand/logo-ufficiale.png, ritagliato senza modifiche): sfondo trasparente. */
export function Emblem({ className = '', size = 40, priority = false }: { className?: string; size?: number; priority?: boolean }) {
  return (
    <Image src="/brand/emblem.webp" alt="" width={size} height={Math.round(size * 0.849)} priority={priority} loading="eager" className={`h-auto select-none ${className}`} style={{ width: size }} draggable={false} />
  );
}

/** Logo orizzontale (come nella tavola di identità): emblema + FOLYNTRA AI, con slogan facoltativo. */
export function Wordmark({ className = '', tagline = false, size = 'md' }: { className?: string; tagline?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const dim = { sm: { e: 36, t: 'text-[1.02rem]' }, md: { e: 44, t: 'text-[1.3rem]' }, lg: { e: 64, t: 'text-3xl' } }[size];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="FOLYNTRA AI — Intelligenza Editoriale">
      <Emblem size={dim.e} priority />
      <span className="flex flex-col whitespace-nowrap leading-none">
        <span className={`font-display font-extrabold tracking-[0.01em] text-ink ${dim.t}`}>
          FOLYNTRA <span className="bg-gradient-to-r from-cyan to-violet bg-clip-text text-transparent">AI</span>
        </span>
        {tagline && <span className="mt-1.5 text-[0.56rem] font-medium uppercase tracking-[0.24em] text-slate2">Intelligenza Editoriale</span>}
      </span>
    </span>
  );
}
