'use client';

import { useParties } from '@/lib/hooks/useParties';
import HomeNavbar from '@/components/home/HomeNavbar';
import Hero from '@/components/home/Hero';
import AudienceSplit from '@/components/home/AudienceSplit';
import FeaturedEvents from '@/components/home/FeaturedEvents';
import OrganizerFeatures from '@/components/home/OrganizerFeatures';
import HowItWorks from '@/components/home/HowItWorks';
import HostCta from '@/components/home/HostCta';
import Pricing from '@/components/home/Pricing';
import Faq from '@/components/home/Faq';
import FinalCta from '@/components/home/FinalCta';

export default function HomePage() {
  const { parties, loading, error, retry } = useParties();

  return (
    <div className="animate-fade-in">
      <HomeNavbar />
      <main>
        <Hero parties={parties} loading={loading} />
        <AudienceSplit />
        <FeaturedEvents parties={parties} loading={loading} error={error} retry={retry} />
        <OrganizerFeatures />
        <HowItWorks />
        <HostCta />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
    </div>
  );
}