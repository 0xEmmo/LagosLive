import type { MetadataRoute } from 'next';
import { appUrl, eventCanonicalUrl } from '@/lib/seo';
import { fetchUpcomingPartiesForSeo } from '@/lib/party-server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = appUrl();
  const staticPages: MetadataRoute.Sitemap = [
    { url: origin, changeFrequency: 'daily', priority: 1 },
    { url: `${origin}/events`, changeFrequency: 'hourly', priority: 0.95 },
    { url: `${origin}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${origin}/support`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${origin}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${origin}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${origin}/refund-policy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${origin}/payouts`, changeFrequency: 'monthly', priority: 0.4 },
  ];
  const events = await fetchUpcomingPartiesForSeo();
  return [
    ...staticPages,
    ...events.map((party) => ({
      url: eventCanonicalUrl(party),
      lastModified: party.startsAt ? new Date(party.startsAt) : undefined,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
