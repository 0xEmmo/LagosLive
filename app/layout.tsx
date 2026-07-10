import type { Metadata } from 'next';
import { Bebas_Neue, Montserrat, Inter } from 'next/font/google';
import './globals.css';
import ThemeEffect from '@/components/ThemeEffect';
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
  weight: ['500', '600', '700'],
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

export const metadata: Metadata = {
  title: 'Lagos Live — Afrobeats & Nightlife, Tonight',
  description: 'Discover the hottest parties, clubs & events across Lagos — right now.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${bebasNeue.variable} ${montserrat.variable} ${inter.variable}`}>
      <body className="font-heading" style={{ paddingBottom: '84px' }}>
        <ThemeEffect />
        <Splash />
        <Toast />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
