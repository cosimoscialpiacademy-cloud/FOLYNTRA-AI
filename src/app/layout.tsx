import type { Metadata, Viewport } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/700.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/700.css';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: { default: 'FOLYNTRA AI — Publishing Intelligence', template: '%s · FOLYNTRA AI' },
  description: 'Dalla nicchia al pacchetto KDP: ricerca, scrittura assistita, copertina, impaginazione ed esportazione.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  appleWebApp: { capable: true, title: 'FOLYNTRA AI', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#0D1424', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
