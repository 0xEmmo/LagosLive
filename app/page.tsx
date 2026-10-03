import type { Metadata } from 'next';
import HomeLandingPage from '@/components/home/HomeLandingPage';
import { appUrl, DEFAULT_OG_IMAGE } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Things to Do in Lagos — Events, Parties & Fun | Lagos Live',
  description:
    'Find parties, concerts, festivals, rooftop nights and things to do in Lagos. Discover upcoming events, buy tickets and plan your next night out with Lagos Live.',
  keywords: ['things to do in Lagos', 'events in Lagos', 'parties in Lagos', 'Lagos nightlife', 'where to have fun in Lagos', 'Lagos events today'],
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Things to Do in Lagos — Events, Parties & Fun',
    description: 'Discover parties, concerts, festivals and fun things to do across Lagos.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1672, height: 941, alt: 'Lagos Live events and nightlife' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Things to Do in Lagos — Events, Parties & Fun',
    description: 'Find your next Lagos party, concert, festival or night out.',
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function HomePage() {
  const origin = appUrl();
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Lagos Live',
      url: origin,
      logo: `${origin}/LagosLiveLogo.webp`,
      sameAs: [origin],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Lagos Live',
      url: origin,
      description: 'Discover events, parties and things to do in Lagos.',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${origin}/events?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <HomeLandingPage />
    </>
  );
}
