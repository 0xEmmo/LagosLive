import type { Metadata } from 'next';
import { InfoPage, InfoSection, InfoList, InfoNote, InfoContact } from '@/components/InfoPage';

export const metadata: Metadata = {
  title: 'Cookie Notice — Lagos Live',
  description:
    'The cookies and browser storage Lagos Live uses, what each is for, and how to manage them in your browser.',
  alternates: { canonical: '/cookies' },
  openGraph: {
    title: 'Cookie Notice — Lagos Live',
    description: 'The cookies and browser storage Lagos Live uses, and how to manage them.',
    type: 'website',
    siteName: 'Lagos Live',
    locale: 'en_NG',
    url: '/cookies',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cookie Notice — Lagos Live',
    description: 'The cookies and browser storage Lagos Live uses, and how to manage them.',
  },
};

const CONTACT_EMAIL = 'lagosliveticket@gmail.com';

export default function CookiesPage() {
  return (
    <InfoPage
      eyebrow="Legal"
      title={<>Cookie <span className="gradient-text">Notice</span></>}
      subtitle="The cookies and browser storage Lagos Live uses, and what they are for."
      updated="September 2026"
    >
      <InfoSection title="Essential cookies">
        <p>
          We use a session cookie to keep you signed in and to secure requests to your account. This cookie is
          essential — without it you would be signed out and some parts of the platform would not work. We do not
          use it for advertising.
        </p>
      </InfoSection>

      <InfoSection title="Preferences and browser storage">
        <p>
          Lagos Live stores certain preferences in your browser&apos;s local storage on your own device. These are
          used to remember choices and improve your experience, such as:
        </p>
        <InfoList
          items={[
            'Your light or dark theme preference.',
            'Events you have saved and event reminders you have set.',
            'Notices you have dismissed, so they do not reappear.',
            'The check-in gate you last used, to speed up scanning on event day.',
            'Bank details you choose to save locally when setting up your host profile.',
          ]}
        />
        <p>
          Some short-lived values are also kept in session storage for the duration of your visit, such as linking
          a guest order to your account. These are cleared when you close the tab.
        </p>
      </InfoSection>

      <InfoSection title="Payments">
        <p>
          When you pay for a ticket, Paystack may set its own cookies or similar technologies to process the
          payment securely. Those are governed by Paystack&apos;s own policies.
        </p>
      </InfoSection>

      <InfoSection title="Maps and address search">
        <p>
          When you view a map or use address autocomplete, requests are sent to Mapbox and Geoapify respectively.
          These providers may set their own cookies or similar technologies as part of serving those features.
        </p>
      </InfoSection>

      <InfoSection title="Advertising and analytics">
        <p>
          Lagos Live does not currently use advertising or marketing cookies, and does not run third-party
          analytics trackers.
        </p>
      </InfoSection>

      <InfoSection title="Managing cookies and storage">
        <InfoNote>
          Lagos Live does not currently provide an in-app cookie preference centre. You can control and clear
          cookies and site storage at any time through your browser settings. Clearing them may sign you out and
          reset saved preferences.
        </InfoNote>
      </InfoSection>

      <InfoSection title="Changes to this notice">
        <p>
          We may update this notice from time to time. The latest version will always be available on this page.
        </p>
      </InfoSection>

      <InfoContact email={CONTACT_EMAIL} />
    </InfoPage>
  );
}
