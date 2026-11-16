'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 text-center leading-tight',
  {
    variants: {
      variant: {
        primary: 'bg-cyan text-onbrand shadow-[0_8px_24px_-10px_rgba(0,229,255,0.6)] hover:brightness-110',
        gold: 'bg-amber text-onbrand hover:brightness-105',
        outline: 'border border-line bg-card text-ink hover:border-cyan/60 hover:bg-card2',
        ghost: 'text-ink hover:bg-white/5',
        danger: 'border border-bad/40 bg-card text-bad hover:bg-bad/10',
      },
      size: { sm: 'min-h-9 px-3 py-1.5 text-sm', md: 'min-h-11 px-4 py-2 text-sm', lg: 'min-h-12 px-5 py-2.5 text-base' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, disabled, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-xl border border-line bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_12px_32px_-20px_rgba(0,0,0,0.8)] sm:p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className, action }: { children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className={cn('font-display text-lg font-bold text-ink', className)}>{children}</h2>
      {action}
    </div>
  );
}

const fieldBase = 'w-full rounded-lg border border-line bg-card2 px-3 py-2 text-[15px] text-ink placeholder:text-slate2/60 focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/30 disabled:bg-ivory disabled:text-slate2';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'min-h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-24 leading-relaxed', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'min-h-11 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-slate2">{hint}</p>}
    </div>
  );
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-white/10 text-ink',
      gold: 'bg-amber/20 text-amber',
      ok: 'bg-ok/15 text-ok',
      warn: 'bg-warn/15 text-warn',
      bad: 'bg-bad/15 text-bad',
      demo: 'bg-violet/25 text-[#d3c6ff] ring-1 ring-violet/50 tracking-wide',
      dark: 'bg-midnight text-ink ring-1 ring-line',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ tone, className, children }: { children: ReactNode; className?: string } & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>;
}

export function Progress({ value, label, className }: { value: number; label?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-white/10', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Avanzamento'}>
      <div className="h-full rounded-full bg-cyan transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'bad' | 'ok' | 'demo'; children: ReactNode; className?: string }) {
  const tones = { info: 'border-line bg-card2 text-ink', warn: 'border-warn/40 bg-warn/10 text-warn', bad: 'border-bad/40 bg-bad/10 text-bad', ok: 'border-ok/40 bg-ok/10 text-ok', demo: 'border-violet/50 bg-violet/15 text-[#d3c6ff]' };
  return <div className={cn('rounded-lg border px-3 py-2.5 text-sm leading-relaxed', tones[tone], className)} role={tone === 'bad' ? 'alert' : 'status'}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-card/50 px-4 py-8 text-center">
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-slate2">{children}</div>}
    </div>
  );
}

/* ---------- Toast ---------- */
interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'bad' | 'info';
}
const ToastCtx = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn('pointer-events-auto max-w-md animate-rise rounded-lg px-4 py-3 text-sm shadow-lg', t.tone === 'bad' ? 'bg-bad text-onbrand' : t.tone === 'ok' ? 'bg-ok text-onbrand' : 'border border-line bg-card2 text-ink')}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/** Valore locale con salvataggio ritardato: l'utente scrive, il salvataggio parte dopo una pausa. */
export function useDebouncedSave<T>(value: T, save: (v: T) => void | Promise<void>, delay = 700): { dirty: boolean } {
  const [saved, setSaved] = useState(value);
  const dirty = saved !== value;
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void Promise.resolve(save(value)).then(() => setSaved(value));
    }, delay);
    return () => clearTimeout(t);
  }, [value, dirty, delay, save]);
  return { dirty };
}
