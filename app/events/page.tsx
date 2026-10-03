import type { Metadata } from 'next';
import Link from 'next/link';
import EventsPageView from '@/components/EventsPageView';
import { fetchUpcomingPartiesForSeo } from '@/lib/party-server';
import { partyPath } from '@/lib/seo';

// Server metadata for the events marketplace; the interactive filter/search UI
// lives in <EventsPageView> (client) so it keeps its URL-param behaviour.
export const metadata: Metadata = {
  title: 'Events in Lagos Today & This Weekend — Lagos Live',
  description:
    'Find events in Lagos today, this weekend and beyond — parties, club nights, rooftop events, concerts, festivals and more. Browse tickets by area, date, price and vibe.',
  keywords: ['events in Lagos', 'Lagos events today', 'Lagos parties this weekend', 'concerts in Lagos', 'Lagos nightlife'],
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

export default async function EventsPage() {
  const events = await fetchUpcomingPartiesForSeo(24);
  return (
    <>
      <section className="mx-auto w-full max-w-[1200px] px-5 pb-2 pt-6 md:px-8 md:pt-8">
        <h2 className="font-display text-[32px] leading-none tracking-[0.5px] md:text-[42px]">Find things to do in Lagos</h2>
        <p className="mt-3 max-w-[760px] text-[14px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
          Discover the best parties, concerts, festivals, rooftop nights and fun things to do in Lagos. Explore upcoming events in Victoria Island, Lekki, Ikoyi, Yaba, Ikeja and across the city, then get your tickets on Lagos Live.
        </p>
        {events.length > 0 && (
          <nav aria-label="Upcoming Lagos events" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
            {events.slice(0, 12).map((event) => (
              <Link key={event.id} href={partyPath(event)} className="underline-offset-4 hover:underline" style={{ color: '#7EA5FF' }}>
                {event.title}
              </Link>
            ))}
          </nav>
        )}
      </section>
      <EventsPageView />
    </>
  );
}
