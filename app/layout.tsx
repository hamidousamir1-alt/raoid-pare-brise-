import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from './pwa-register';

export const metadata: Metadata = {
  title: 'Rapid Pare-Brise CRM',
  description: 'Pilotage commercial B2B Rapid Pare-Brise',
  applicationName: 'Rapid PB CRM',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Rapid PB CRM', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = { themeColor: '#07111f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><PwaRegister/>{children}</body></html>;
}