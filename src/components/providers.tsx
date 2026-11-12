'use client';

import { useEffect, type ReactNode } from 'react';
import { AppProvider } from '@/lib/store/context';
import { ToastProvider } from './ui';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);
  return (
    <AppProvider>
      <ToastProvider>{children}</ToastProvider>
    </AppProvider>
  );
}
