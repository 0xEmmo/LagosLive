import type { Metadata } from 'next';
import { InfoPage, InfoSection, InfoList, InfoContact } from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'Terms & Conditions — Lagos Live',
  description:
    'The terms for using Lagos Live: accounts and guest purchases, event listings, ticket purchases, payments, refunds, organizer responsibilities and more.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms & Conditions — Lagos Live',
    description: 'The terms for using Lagos Live.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/terms',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms & Conditions — Lagos Live',
    description: 'The terms for using Lagos Live.',
  },
};

const CONTACT_EMAIL = 'lagosliveticket@gmail.com';

export default function TermsPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title={<>Terms &amp; <span className="gradient-text">Conditions</span></>}
      subtitle="These terms apply when you use Lagos Live, whether you are attending an event or hosting one."
      updated="September 2026"
    >
      <InfoSection title="Using Lagos Live">
        <p>
          By using Lagos Live you agree to these terms. You must use the platform lawfully and only for its
          intended purpose of discovering, listing, buying and managing event tickets. If you do not agree with
          these terms, please do not use the platform.
        </p>
      </InfoSection>

      <InfoSection title="Accounts and guest purchases">
        <InfoList
          items={[
            'You can create a free account with your name and email address, and you are responsible for keeping your login details secure.',
            'You can also buy tickets as a guest without an account. If you do, you must provide a valid email address so we can deliver your ticket, and you are responsible for the accuracy of the details you provide.',
            'You are responsible for activity that happens under your account.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Event organizers and listings">
        <InfoList
          items={[
            'Organizers are responsible for the events they list and for the accuracy of the event details, including the date, time, venue, ticket types and prices.',
            'Organizers must have the right and authority to host and sell tickets for the events they list.',
            'Listings may be reviewed, and Lagos Live may remove or restrict any listing or account that breaches these terms or appears misleading.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Ticket purchases">
        <InfoList
          items={[
            'When you buy a ticket, you enter into a transaction for admission to the organizer\u2019s event.',
            'Prices, fees and totals are shown before you confirm your purchase.',
            'Once a purchase is confirmed, a ticket (with a QR code) is issued for entry.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Ticket validity and entry">
        <InfoList
          items={[
            'A ticket is valid for the event and ticket tier it was issued for.',
            'Each ticket carries a unique QR code that is scanned once at entry; a ticket that has already been checked in cannot be used again.',
            'Entry is subject to the event\u2019s own rules, such as age restrictions, dress code and venue policies.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Payments and fees">
        <InfoList
          items={[
            'Payments are processed by our payment provider, Paystack.',
            'Paid tickets carry a service fee, which is shown before you confirm your purchase. Free events carry no charge.',
            'Organizer payouts are subject to a platform fee, which is shown in the payout summary before a payout is requested.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Refunds and cancellations">
        <p>
          Refunds and event cancellations are handled in line with our{' '}
          <a href="/refund-policy" className="font-semibold underline" style={{ color: '#00BFFF' }}>
            Refund &amp; Cancellation Policy
          </a>
          . In summary, when an event is cancelled by its organizer, confirmed paid orders are refunded
          automatically to the original payment method. Other refund requests are reviewed by our support team.
        </p>
      </InfoSection>

      <InfoSection title="Event changes and cancellations">
        <p>
          Organizers may change or cancel their events. Where an event is cancelled, Lagos Live processes refunds
          for confirmed paid orders and notifies affected buyers. Lagos Live is not responsible for other losses
          arising from an event change or cancellation.
        </p>
      </InfoSection>

      <InfoSection title="Prohibited activity">
        <InfoList
          items={[
            'Listing fake, misleading or unlawful events.',
            'Attempting to tamper with tickets, QR codes, check-in or payment systems.',
            'Using the platform to harass others, distribute malware, or break any applicable law.',
            'Accessing accounts or data that are not yours.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Intellectual property">
        <p>
          The Lagos Live name, branding and platform are owned by Lagos Live. Event content, descriptions and
          images remain the responsibility of the organizer who submitted them. You may not copy or reuse the
          platform or its branding without permission.
        </p>
      </InfoSection>

      <InfoSection title="Limitation of liability">
        <p>
          Lagos Live provides the platform on an &ldquo;as is&rdquo; basis. We are not the organizer of events
          listed on the platform and are not responsible for the conduct of organizers or attendees. To the extent
          permitted by law, Lagos Live is not liable for indirect or consequential losses arising from your use of
          the platform.
        </p>
      </InfoSection>

      <InfoSection title="Changes to the service and terms">
        <p>
          We may update, change or discontinue parts of the service, and we may update these terms from time to
          time. Continued use of the platform after changes means you accept the updated terms.
        </p>
      </InfoSection>

      <InfoContact email={CONTACT_EMAIL} />
    </InfoPage>
  );
}
