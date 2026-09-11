import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PartyDetailClient from '@/components/PartyDetailClient';
import { eventJsonLd, eventMetadata } from '@/lib/seo';
import { fetchPartyBySlugForSeo } from '@/lib/party-server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const party = await fetchPartyBySlugForSeo(params.slug);
  if (!party) return {};
  return eventMetadata(party);
}

export default async function EventSlugPage({ params }: { params: { slug: string } }) {
  // The canonical, shareable event URL. Resolves the pretty slug to the same
  // client section the /party/[id] route renders.
  const party = await fetchPartyBySlugForSeo(params.slug);
  if (!party) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd(party)) }}
      />
      <PartyDetailClient partyId={party.id} initialParty={party} />
    </>
  );
}