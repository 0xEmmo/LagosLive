import type { Metadata } from 'next';
import { InfoPage, InfoSection, InfoList, InfoContact } from '@/components/InfoPage';
import ReportIssueForm from '@/components/ReportIssueForm';

export const metadata: Metadata = {
  title: 'Report an issue — Lagos Live',
  description:
    'Report a problem with an event, ticket, payment or your Lagos Live account. Our team reviews every report and follows up by email.',
  alternates: { canonical: '/report-issue' },
  openGraph: {
    title: 'Report an issue — Lagos Live',
    description: 'Report a problem with an event, ticket, payment or account. We follow up by email.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/report-issue',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Report an issue — Lagos Live',
    description: 'Report a problem with an event, ticket, payment or account.',
  },
};

const CONTACT_EMAIL = 'lagosliveticket@gmail.com';

export default function ReportIssuePage() {
  return (
    <InfoPage
      eyebrow="Help and support"
      title={<>Report an <span className="gradient-text">issue</span></>}
      subtitle="Tell us what went wrong and our team will look into it. We follow up by email, usually within a couple of business days."
    >
      <InfoSection title="Before you report">
        <InfoList
          items={[
            'For refund requests and event cancellations, see our Refund & Cancellation Policy first.',
            'If you have it, include your order reference — it helps us find your purchase faster.',
            'If you are signed in, your name and email are filled in for you.',
          ]}
        />
      </InfoSection>

      <ReportIssueForm />

      <InfoContact email={CONTACT_EMAIL} />
    </InfoPage>
  );
}
