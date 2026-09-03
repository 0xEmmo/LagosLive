import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Montserrat, Inter } from 'next/font/google';
import './globals.css';
import ThemeEffect from '@/components/ThemeEffect';
import AuthListener from '@/components/AuthListener';
import ReminderScheduler from '@/components/ReminderScheduler';
import Splash from '@/components/Splash';
import Toast from '@/components/Toast';
import BottomNav from '@/components/BottomNav';

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
});

const montserrat = Montserrat({
  weight: ['500', '600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
});

const inter = Inter({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#07070B',
};

export const metadata: Metadata = {
  title: 'Lagos Live — Afrobeats & Nightlife, Tonight',
  description: 'Discover the hottest parties, clubs & events across Lagos — right now.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Lagos Live',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'icon', url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${bebasNeue.variable} ${montserrat.variable} ${inter.variable}`}>
      <body className="font-heading bg-bg" style={{ paddingBottom: '84px' }}>
        <div className="fixed inset-0 z-[-1] bg-noise">
          <div className="absolute inset-0 bg-glow-top" />
          <div className="absolute inset-0 bg-glow-right" />
          <div className="absolute inset-0 bg-glow-bottom" />
        </div>
        <ThemeEffect />
        <AuthListener />
        <ReminderScheduler />
        <Splash />
        <Toast />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
