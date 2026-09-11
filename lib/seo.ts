// Server-safe SEO helpers for event pages. Imported by server components and
// the client bundles that build share URLs. Everything here is derived from the
// event row and public env vars — no DB access, no secrets.

import type { Metadata } from 'next';
import type { Party } from './types';
import { formatNaira } from './filters';

// Default social preview image: a static, URL-safe copy of the brand logo used
// on every event page that has no cover photo of its own ({width}x{height} are
// the actual PNG dimensions).
export const DEFAULT_OG_IMAGE = '/og-default.png';
export const DEFAULT_OG_IMAGE_WIDTH = 1672;
export const DEFAULT_OG_IMAGE_HEIGHT = 941;

// The public origin shared by canonical URLs, share links and email CTAs.
// NEXT_PUBLIC_SITE_URL is the canonical production variable; NEXT_PUBLIC_APP_URL
// is kept as a back-compat alias, then the production host is the fallback.
// The trailing-slash strip keeps every caller safe from double slashes.
export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://lagoslive.com.ng'
  ).replace(/\/+$/, '');
}

// SQL/IP-agnostic slug for an event title: lowercase, non-alphanumerics become
// hyphens, leading/trailing hyphens trimmed. 'event' is the last-resort base.
export function slugify(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'event';
}

// The canonical URL a given event resolves to. Prefers the pretty /events/{slug}
// route; legacy events without a slug keep the stable /party/{id} route.
export function eventCanonicalUrl(party: Pick<Party, 'id' | 'slug'>): string {
  return party.slug ? `${appUrl()}/events/${party.slug}` : `${appUrl()}/party/${party.id}`;
}

// In-app path for an event (no origin) — used for Link/route jumps so cards and
// CTAs point at the same canonical location as the metadata.
export function partyPath(party: Pick<Party, 'id' | 'slug'>): string {
  return party.slug ? `/events/${party.slug}` : `/party/${party.id}`;
}

// Human-friendly event description for <title>/<meta>/social previews: keeps
// the organizer's description, trimmed to a preview length and backstopped by
// date/location so a short "About" never yields a sterile snippet.
export function eventSeoDescription(party: Party): string {
  const body = (party.description || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
  const when = `${party.date} @ ${party.location}`;
  const combined = body ? `${body} — ${when}` : `${party.title} on ${when}. Get your ticket on Lagos Live.`;
  return combined.length > 200 ? `${combined.slice(0, 197)}…` : combined;
}

function eventImage(party: Party): { url: string; width: number; height: number; alt: string } {
  if (party.coverUrl) {
    return { url: party.coverUrl, width: DEFAULT_OG_IMAGE_WIDTH, height: DEFAULT_OG_IMAGE_HEIGHT, alt: `${party.title} cover` };
  }
  return { url: DEFAULT_OG_IMAGE, width: DEFAULT_OG_IMAGE_WIDTH, height: DEFAULT_OG_IMAGE_HEIGHT, alt: 'Lagos Live' };
}

export function eventMetadata(party: Party): Metadata {
  const canonical = eventCanonicalUrl(party);
  const description = eventSeoDescription(party);
  const image = eventImage(party);
  return {
    title: `${party.title} — Lagos Live`,
    description,
    alternates: { canonical },
    openGraph: {
      title: party.title,
      description,
      type: 'website',
      siteName: 'Lagos Live',
      locale: 'en_NG',
      url: canonical,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: party.title,
      description,
      images: [image.url],
    },
    robots: { index: true, follow: true },
  };
}

// schema.org/Event structured data for the event detail pages. Serialized by
// the server into a <script type="application/ld+json"> block.
export function eventJsonLd(party: Party): Record<string, unknown> {
  const canonical = eventCanonicalUrl(party);
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: party.title,
    description: party.description || undefined,
    url: canonical,
    image: party.coverUrl ? [party.coverUrl, DEFAULT_OG_IMAGE] : [DEFAULT_OG_IMAGE],
    startDate: party.startsAt,
    endDate: party.endsAt,
    eventStatus: party.cancelledAt ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: party.location,
      address: { '@type': 'PostalAddress', streetAddress: party.address },
      geo: { '@type': 'GeoCoordinates', latitude: party.lat, longitude: party.lng },
    },
    organizer: {
      '@type': 'Organization',
      name: party.organizer,
    },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'NGN',
      lowPrice: party.feeNum,
      highPrice: party.feeNum,
      availability: party.spotsLeft > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      url: canonical,
    },
    ...(party.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(party.avgRating.toFixed(2)),
            reviewCount: party.reviewCount,
          },
        }
      : {}),
    ...(party.cancelledAt && party.cancellationReason
      ? { description: (party.description ? `${party.description} ` : '') + `[Cancelled: ${party.cancellationReason}]` }
      : {}),
  };
}

// Small shared helper: the "from ₦X" style fee label used on cards/share text.
export function eventFeeLabel(feeNum: number): string {
  return feeNum === 0 ? 'Free' : `From ${formatNaira(feeNum)}`;
}