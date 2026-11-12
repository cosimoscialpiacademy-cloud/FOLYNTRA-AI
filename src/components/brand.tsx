export function Wordmark({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 font-serif font-bold tracking-wide ${light ? 'text-ivory' : 'text-midnight'} ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[0.95em] translate-y-[0.12em]" aria-hidden>
        <path d="M4 3h13l3 3v15H4z" fill="none" stroke="#D7B574" strokeWidth="1.6" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke="#D7B574" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      FOLYNTRA <span className="text-gold">AI</span>
    </span>
  );
}
