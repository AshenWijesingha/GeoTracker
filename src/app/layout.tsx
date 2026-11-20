import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import '@/styles/globals.css';
import { Providers } from './providers';
import PwaRegister from '@/components/PwaRegister';
import { THEME_INIT_SCRIPT } from '@/lib/theme-script';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'GeoTracker',
  description:
    'Consent-based real-time location sharing with live maps, SOS alerts, battery monitoring, chat and history export.',
  applicationName: 'GeoTracker',
  manifest: `${basePath}/manifest.json`,
  icons: {
    icon: [
      { url: `${basePath}/icons/icon.svg`, type: 'image/svg+xml' },
      { url: `${basePath}/icons/favicon-32.png`, sizes: '32x32', type: 'image/png' },
    ],
    apple: `${basePath}/icons/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    title: 'GeoTracker',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0e13' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
