import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PartyDetailClient from '@/components/PartyDetailClient';
import { eventJsonLd, eventMetadata } from '@/lib/seo';
import { fetchPartyByIdForSeo } from '@/lib/party-server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return {};
  const party = await fetchPartyByIdForSeo(id);
  if (!party) return {};
  return eventMetadata(party);
}

export default async function PartyDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  // Server fetch drives the metadata/JSON-LD and seeds the client section so it
  // paints instantly; the client still refreshes viewport-aware details.
  const party = await fetchPartyByIdForSeo(id);
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