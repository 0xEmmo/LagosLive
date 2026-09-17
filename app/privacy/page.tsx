import type { Metadata } from 'next';
import { InfoPage, InfoSection, InfoList, InfoContact } from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — Lagos Live',
  description:
    'How Lagos Live collects, uses, shares and protects your information, including account, guest checkout, order and organizer data.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy — Lagos Live',
    description: 'How Lagos Live collects, uses and protects your information.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/privacy',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy — Lagos Live',
    description: 'How Lagos Live collects, uses and protects your information.',
  },
};

const CONTACT_EMAIL = 'lagosliveticket@gmail.com';

export default function PrivacyPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title={<>Privacy <span className="gradient-text">Policy</span></>}
      subtitle="How Lagos Live collects, uses and protects your information."
      updated="September 2026"
    >
      <InfoSection title="Information we collect">
        <InfoList
          items={[
            'Account information: when you create an account we collect your name and email address. Your password is handled securely by our authentication provider and is never stored by us in plain text.',
            'Guest checkout information: when you buy a ticket without creating an account, we collect the name, email address and, optionally, phone number you provide.',
            'Order and ticket information: the event, ticket type, quantity, amount, payment status, any promotional code used, and check-in status.',
            'Organizer information: the event details you create, your contact details, and the bank account details you provide to receive payouts. Only the last four digits of your account are displayed in payout records.',
            'Communications: support requests you submit and, if you subscribe, your email address and first name for our newsletter.',
          ]}
        />
      </InfoSection>

      <InfoSection title="How we use your information">
        <InfoList
          items={[
            'To provide the service — process orders, issue tickets and confirm entry at events.',
            'To process payments and payouts through our payment provider.',
            'To send transactional emails such as ticket confirmations, event reminders, event changes and payout updates. Where available, you can manage these from your notification preferences.',
            'To respond to support requests and resolve issues.',
            'To keep the platform secure, prevent fraud and misuse, and meet our legal obligations.',
          ]}
        />
      </InfoSection>

      <InfoSection title="Payments">
        <p>
          Payments are processed by Paystack. When you pay for a ticket, your payment details are handled by
          Paystack — we do not store your full card details. Paystack may set its own cookies or similar
          technologies during checkout, governed by its own privacy policy.
        </p>
      </InfoSection>

      <InfoSection title="Cookies and similar technologies">
        <p>
          We use a session cookie to keep you signed in, and browser storage on your device to remember
          preferences such as your theme, saved events and reminders. We do not currently use advertising or
          third-party analytics cookies. See our{' '}
          <a href="/cookies" className="font-semibold underline" style={{ color: '#00BFFF' }}>
            Cookie Notice
          </a>{' '}
          for details.
        </p>
      </InfoSection>

      <InfoSection title="Analytics">
        <p>
          Lagos Live does not currently run third-party advertising or analytics trackers. The analytics shown in
          our dashboards are generated from our own platform data so organizers and staff can understand event
          performance.
        </p>
      </InfoSection>

      <InfoSection title="Sharing with service providers">
        <p>
          We may share information with trusted third-party service providers that help us operate Lagos Live,
          including providers that support payment processing, email delivery, authentication, data storage, maps
          and address services. These providers process information on our behalf where necessary to provide their
          services. We do not sell your personal information.
        </p>
      </InfoSection>

      <InfoSection title="Security">
        <p>
          We take reasonable technical and organisational measures to protect your information, including access
          controls and encrypted connections. No method of transmission or storage is completely secure, so we
          cannot guarantee absolute security.
        </p>
      </InfoSection>

      <InfoSection title="Data retention">
        <p>
          We keep your information for as long as your account is active or as needed to provide the service. We
          may retain order, payment and related records for longer where required for accounting, tax, security or
          legal purposes, and support records for as long as needed to resolve and document requests.
        </p>
      </InfoSection>

      <InfoSection title="Your rights">
        <p>
          You can ask us to access, correct or delete the personal information we hold about you, or to object to
          certain processing. Contact us using the email below and we will respond. Some records may need to be
          retained for legal or financial reasons.
        </p>
      </InfoSection>

      <InfoSection title="Changes to this policy">
        <p>
          We may update this policy from time to time. The latest version will always be available on this page.
        </p>
      </InfoSection>

      <InfoContact email={CONTACT_EMAIL} />
    </InfoPage>
  );
}
