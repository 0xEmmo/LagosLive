import type { Metadata } from 'next';
import { InfoPage, InfoSection, InfoList, InfoNote, InfoContact } from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — Lagos Live',
  description:
    'Lagos Live refund and cancellation policy: what happens when an event is cancelled, how ticket refunds are handled, eligibility and processing.',
  alternates: { canonical: '/refund-policy' },
  openGraph: {
    title: 'Refund & Cancellation Policy — Lagos Live',
    description:
      'What happens when an event is cancelled, how ticket refunds are handled, eligibility and processing.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/refund-policy',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Refund & Cancellation Policy — Lagos Live',
    description: 'How refunds and event cancellations work on Lagos Live.',
  },
};

const CONTACT_EMAIL = 'lagosliveticket@gmail.com';

export default function RefundPolicyPage() {
  return (
    <InfoPage
      eyebrow="Help and support"
      title={<>Refund &amp; Cancellation <span className="gradient-text">Policy</span></>}
      subtitle="How refunds and event cancellations work on Lagos Live."
    >
      <InfoSection title="Event cancellation">
        <p>
          A host can cancel an event from their host dashboard, and a cancellation reason is required. When an
          event is cancelled:
        </p>
        <InfoList
          items={[
            'Every confirmed paid ticket is refunded automatically to the original payment method through Paystack — the full order amount, including the service fee.',
            'Free RSVPs are cancelled as well, with no charge.',
            'Buyers are notified by email.',
            'The event is removed from public listings and its tickets are no longer valid for entry.',
          ]}
        />
        <p>
          Cancellations are processed automatically and do not require the buyer to request anything.
        </p>
      </InfoSection>

      <InfoSection title="Ticket refunds">
        <p>
          Refunds are not self-service. To request a refund for a ticket, contact our support team with your order
          reference and the reason for your request. Every request is reviewed against the event&apos;s status and
          the ticket&apos;s usage before a decision is made.
        </p>
        <p>
          If you have an account, you can track a support request from the Support page. The statuses a refund can
          move through are:
        </p>
        <InfoList
          items={[
            'Requested — the request has been received and is awaiting review.',
            'Processing — the refund has been approved and is being sent back through Paystack.',
            'Refunded — the refund has been issued to the original payment method.',
            'Rejected — the request was not approved.',
          ]}
        />
      </InfoSection>

      <InfoSection title="How refund requests are handled">
        <p>
          Refund requests are handled by the Lagos Live support team. Where a refund is approved, it is issued
          through our payment provider (Paystack) back to the original payment method. If a refund attempt fails,
          it is marked as failed and our team retries it.
        </p>
        <InfoNote>
          Approved refunds are sent back through Paystack to the original payment method. Banks typically take a
          few business days — commonly 5–7 business days — to reflect a refund on your statement.
        </InfoNote>
      </InfoSection>

      <InfoSection title="Non-refundable circumstances">
        <p>
          The following are not eligible for a refund or are assessed at the discretion of the organizer and
          Lagos Live:
        </p>
        <InfoList
          items={[
            'Tickets that have already been checked in and used for entry.',
            'Free RSVP tickets, which carry no monetary value.',
            'Refund requests for events that are going ahead as advertised, which are reviewed on a case-by-case basis.',
            'No-shows and unused tickets where the event was not cancelled.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Host responsibilities">
        <InfoList
          items={[
            'Hosts must enter accurate event details and run the event as advertised.',
            'Hosts should communicate any changes to their event to attendees.',
            'If a host cancels an event, confirmed paid orders are refunded automatically.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Changes to this policy">
        <p>
          We may update this policy from time to time to reflect changes to the platform or applicable rules.
          The latest version will always be available on this page.
        </p>
      </InfoSection>

      <InfoContact email={CONTACT_EMAIL} />
    </InfoPage>
  );
}
