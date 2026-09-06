import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, Montserrat, Inter } from 'next/font/google';
import './globals.css';
import ThemeEffect from '@/components/ThemeEffect';
import AuthListener from '@/components/AuthListener';
import ReminderScheduler from '@/components/ReminderScheduler';
import NewsletterModal from '@/components/NewsletterModal';
import Toast from '@/components/Toast';
import BottomNav from '@/components/BottomNav';
import AppHeader from '@/components/home/HomeNavbar';
import Footer from '@/components/Footer';

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
  title: 'Lagos Live — Discover & Host Events in Lagos',
  description: 'Discover what\u2019s happening in Lagos, or create, sell and manage your next event with Lagos Live — the home of Lagos events.',
  manifest: '/manifest.json',
  openGraph: {
    title: 'Lagos Live — Discover & Host Events in Lagos',
    description: 'Find your next plan or host your own event, sell tickets, check guests in and get paid.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lagos Live — Discover & Host Events in Lagos',
    description: 'Find your next plan or host your own event, sell tickets, check guests in and get paid.',
  },
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
        <Toast />
        <NewsletterModal />
        <AppHeader />
        {children}
        <Footer />
        <BottomNav />
      </body>
    </html>
  );
}
