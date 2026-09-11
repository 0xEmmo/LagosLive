import type { Metadata } from 'next';
import EventsPageView from '@/components/EventsPageView';

// Server metadata for the events marketplace; the interactive filter/search UI
// lives in <EventsPageView> (client) so it keeps its URL-param behaviour.
export const metadata: Metadata = {
  title: 'Events in Lagos — Lagos Live',
  description:
    'Browse upcoming events in Lagos — club nights, rooftop parties, concerts, festivals and more. Filter by date, price, vibe or area and grab your ticket on Lagos Live.',
  alternates: { canonical: '/events' },
  openGraph: {
    title: 'Events in Lagos — Lagos Live',
    description:
      'Discover what\u2019s on in Lagos — filter by date, price, vibe or area and pick up your ticket.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/events',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Events in Lagos — Lagos Live',
    description:
      'Discover what\u2019s on in Lagos — filter by date, price, vibe or area and pick up your ticket.',
  },
};

export default function EventsPage() {
  return <EventsPageView />;
}