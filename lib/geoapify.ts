// Geoapify address autocomplete + forward geocoding.
//
// This code runs in the browser, so the key is necessarily public. It is read
// from the environment as NEXT_PUBLIC_GEOAPIFY_API_KEY. The legacy
// NEXT_PUBLIC_GEOAPIFY_KEY name is also honoured so existing deployments keep
// working. Never hardcode the key here.

export const GEOAPIFY_API_KEY =
  process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_KEY || '';

// Central Lagos (Victoria Island) as "lon,lat" — used to bias matches toward
// Lagos. The country filter keeps every result inside Nigeria.
const LAGOS_PROXIMITY = '3.4219,6.4281';
const COUNTRY_FILTER = 'countrycode:ng';

export interface GeoPlace {
  id: string;
  formatted: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
}

export type GeoapifyErrorCode = 'missing-key' | 'network' | 'api-error';

export class GeoapifyError extends Error {
  code: GeoapifyErrorCode;

  constructor(code: GeoapifyErrorCode) {
    super(code);
    this.name = 'GeoapifyError';
    this.code = code;
  }
}

interface GeoapifyResult {
  place_id?: string;
  formatted?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  lat?: number;
  lon?: number;
}

export function hasGeoapifyKey(): boolean {
  return GEOAPIFY_API_KEY.length > 0;
}

// Geoapify returns lat/lon as numbers with format=json, but a missing coordinate
// comes back as 0/0 (the Atlantic off Africa) — treat that as "not located" so
// we never persist a sentinel.
function normalize(raw: GeoapifyResult): GeoPlace | null {
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  const formatted = (raw.formatted || raw.address_line1 || '').trim();
  if (!formatted) return null;
  return {
    id: raw.place_id || formatted,
    formatted,
    line1: (raw.address_line1 || raw.formatted || '').trim(),
    line2: (raw.address_line2 || '').trim(),
    city: (raw.city || '').trim(),
    state: (raw.state || '').trim(),
    lat,
    lon,
  };
}

function buildUrl(endpoint: 'autocomplete' | 'search', text: string, limit: number): string {
  const params = new URLSearchParams({
    text,
    apiKey: GEOAPIFY_API_KEY,
    format: 'json',
    lang: 'en',
    limit: String(limit),
    filter: COUNTRY_FILTER,
    bias: `proximity:${LAGOS_PROXIMITY}`,
  });
  return `https://api.geoapify.com/v1/geocode/${endpoint}?${params.toString()}`;
}

async function fetchPlaces(
  endpoint: 'autocomplete' | 'search',
  text: string,
  limit: number,
  signal?: AbortSignal
): Promise<GeoPlace[]> {
  if (!hasGeoapifyKey()) throw new GeoapifyError('missing-key');

  let res: Response;
  try {
    res = await fetch(buildUrl(endpoint, text, limit), {
      signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new GeoapifyError('network');
  }

  if (!res.ok) throw new GeoapifyError('api-error');

  const data = (await res.json().catch(() => null)) as { results?: GeoapifyResult[] } | null;
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .map(normalize)
    .filter((place): place is GeoPlace => place !== null);
}

export function autocompletePlaces(text: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  return fetchPlaces('autocomplete', text, 6, signal);
}

export async function geocodePlace(text: string, signal?: AbortSignal): Promise<GeoPlace | null> {
  const places = await fetchPlaces('search', text, 1, signal);
  return places[0] ?? null;
}
