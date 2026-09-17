import type { Metadata } from 'next';
import { InfoPage, InfoSection, InfoList, InfoContact } from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'About Lagos Live',
  description:
    'Lagos Live is an event discovery and ticketing platform that makes it easy to find what is happening in Lagos and for organizers to create, sell and manage events.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Lagos Live',
    description:
      'Discover what is happening in Lagos, or create, sell and manage your next event.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/about',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Lagos Live',
    description: 'Discover events in Lagos, or host and sell tickets for your own.',
  },
};

const CONTACT_EMAIL = 'lagosliveticket@gmail.com';

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="Company"
      title={<>About <span className="gradient-text">Lagos Live</span></>}
      subtitle="The home of Lagos events — for both the people going out and the people putting the night together."
    >
      <InfoSection title="What we do">
        <p>
          Lagos Live is an event discovery and ticketing platform built to make it easier for people to discover
          what&apos;s happening in Lagos, and for organizers to create, sell and manage their events. Whether
          you&apos;re looking for a plan tonight or running your next big show, everything happens in one place.
        </p>
      </InfoSection>

      <InfoSection title="What you can do on Lagos Live">
        <InfoList
          items={[
            'Discover events — browse club nights, rooftop parties, concerts, festivals and more, and explore them on a map.',
            'Buy tickets — pay online or RSVP free, with guest checkout available so an account is not required.',
            'Create and manage events — organizers add details, ticket tiers, pricing and promo codes from one dashboard.',
            'Track sales — organizers see live ticket sales and revenue for each event.',
            'Check guests in — every ticket carries a QR code for fast scanning at the door.',
            'Get paid — organizers request payouts to their bank account as confirmed sales add up.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Our approach">
        <p>
          We keep things simple and honest. Free events are free to host, and paid tickets carry a small service
          fee. Organizers get clear tools, transparent figures and a straightforward way to get paid, while
          attendees get a fast, reliable way to find and buy tickets to Lagos&apos; best events.
        </p>
      </InfoSection>

      <InfoContact email={CONTACT_EMAIL} />
    </InfoPage>
  );
}
