import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import '@/styles/globals.css';
import { Providers } from './providers';
import PwaRegister from '@/components/PwaRegister';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'GeoTracker - Real-time Location Tracking',
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
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050510',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Share+Tech+Mono&display=swap"
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
