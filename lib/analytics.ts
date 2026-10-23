export const ANALYTICS_EVENT_NAMES = [
  'session_started',
  'page_view',
  'page_exit',
  'buy_ticket_clicked',
  'checkout_started',
  'purchase_completed',
  'ticket_opened',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
export type AnalyticsAudience = 'guest' | 'signed_in';
export type AnalyticsDevice = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export interface AnalyticsSummary {
  rangeDays: number;
  from: string | null;
  to: string;
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;
  averageSessionSeconds: number;
  totalTimeSeconds: number;
  bounceRate: number;
  guestPageViews: number;
  signedInPageViews: number;
  funnel: {
    buyTicketClicks: number;
    checkoutStarts: number;
    purchases: number;
  };
  daily: Array<{ label: string; pageViews: number; visitors: number }>;
  topPages: Array<{ label: string; value: number }>;
  devices: Array<{ label: string; value: number }>;
  interactions: Array<{ label: string; value: number }>;
}

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value);
}

/** Keep analytics paths route-only: no query strings, hashes, emails, or free text. */
export function normalizeAnalyticsPath(value: unknown): string {
  if (typeof value !== 'string' || !value) return '/';
  const raw = value.startsWith('/') ? value : `/${value}`;
  const path = raw.split(/[?#]/, 1)[0] || '/';
  return path.slice(0, 240);
}
