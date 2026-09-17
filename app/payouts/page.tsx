import type { Metadata } from 'next';
import { InfoPage, InfoSection, InfoList, InfoNote, InfoContact } from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'How payouts work — Lagos Live',
  description:
    'How Lagos Live host payouts work: earning from confirmed ticket sales, your available balance, the ₦1,000 minimum payout, the platform fee and how to request a payout.',
  alternates: { canonical: '/payouts' },
  openGraph: {
    title: 'How payouts work — Lagos Live',
    description:
      'Earn from confirmed ticket sales, request a payout once you reach ₦1,000, and track it from your host dashboard.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/payouts',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How payouts work — Lagos Live',
    description: 'Earn from confirmed ticket sales, request a payout once you reach ₦1,000.',
  },
};

const CONTACT_EMAIL = 'lagosliveticket@gmail.com';

export default function PayoutsPage() {
  return (
    <InfoPage
      eyebrow="For organizers"
      title={<>How payouts <span className="gradient-text">work</span></>}
      subtitle="Everything you need to know about getting paid for tickets sold on Lagos Live."
    >
      <InfoSection title="How you earn">
        <p>
          You earn from ticket sales for the events you host. Every confirmed sale counts towards your gross
          revenue, which is tracked in the Payouts section of your host dashboard. Free events do not generate
          revenue, and free RSVPs never carry a charge.
        </p>
      </InfoSection>

      <InfoSection title="When your balance becomes available">
        <p>
          An order only counts once its payment is confirmed. Your available balance is your confirmed ticket
          revenue minus any payout amounts you have already requested, that are processing, approved or paid.
        </p>
        <InfoNote>
          Payouts are not a subscription. There is no monthly plan, upgrade or paid tier required to receive your
          earnings — hosting and requesting a payout are free.
        </InfoNote>
      </InfoSection>

      <InfoSection title="Minimum payout">
        <p>
          The minimum payout request is <strong style={{ color: '#FFFFFF' }}>₦1,000</strong>. Until your
          available balance reaches ₦1,000, the payout request button stays disabled.
        </p>
      </InfoSection>

      <InfoSection title="How to request a payout">
        <InfoList
          items={[
            'Verify your host account from the host dashboard. Payouts are only available to verified, active hosts.',
            'Open your host dashboard and go to Payouts.',
            'When your available balance is at least ₦1,000, choose Request.',
            'Review the payout summary — it shows your gross revenue, the platform fee and the amount you will receive — then confirm.',
          ]}
        />
      </InfoSection>

      <InfoSection title="What happens after requesting a payout">
        <p>
          Your request is created and reviewed by the Lagos Live team. A request moves through these states:
        </p>
        <InfoList
          items={[
            'Pending — submitted and waiting for review.',
            'Processing — being prepared for payment.',
            'Approved — approved and queued for payment.',
            'Paid — sent to your bank. Once paid, funds should reach your account within a few business days.',
          ]}
        />
        <p>
          A request may also be Rejected. You can follow the status and history of every request in your Payouts
          page.
        </p>
      </InfoSection>

      <InfoSection title="Important payout notes">
        <InfoList
          items={[
            'A 15% platform fee is applied to the amount you request; the payout summary shows the fee and your net amount before you confirm.',
            'Payouts require a verified host account and an active account status.',
            'A payout request covers the most recent 30-day period of activity.',
            'If an event is cancelled, confirmed orders are refunded to buyers — refunded amounts no longer count as earned revenue.',
            'The available balance you see already subtracts any outstanding or completed payout requests.',
          ]}
        />
      </InfoSection>

      <InfoContact email={CONTACT_EMAIL} />
    </InfoPage>
  );
}
