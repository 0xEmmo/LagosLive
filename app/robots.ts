import type { MetadataRoute } from 'next';
import { appUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/host/',
        '/login',
        '/signup',
        '/profile',
        '/saved',
        '/tickets',
        '/ticket/',
        '/checkout/',
        '/check-in/',
        '/review/',
        '/payouts',
      ],
    },
    sitemap: `${appUrl()}/sitemap.xml`,
    host: appUrl(),
  };
}
