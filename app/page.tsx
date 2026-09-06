'use client';

import { useTrendingEvents } from '@/lib/hooks/useTrendingEvents';
import Hero from '@/components/home/Hero';
import AudienceSplit from '@/components/home/AudienceSplit';
import TrendingEvents from '@/components/home/TrendingEvents';
import OrganizerFeatures from '@/components/home/OrganizerFeatures';
import HowItWorks from '@/components/home/HowItWorks';
import HostCta from '@/components/home/HostCta';
import Pricing from '@/components/home/Pricing';
import Faq from '@/components/home/Faq';
import FinalCta from '@/components/home/FinalCta';

export default function HomePage() {
  const { entries, loading } = useTrendingEvents();
  const parties = entries.map((e) => e.party);

  return (
    <div className="animate-fade-in">
      <main>
        <Hero parties={parties} loading={loading} />
        <AudienceSplit />
        <TrendingEvents entries={entries} loading={loading} />
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