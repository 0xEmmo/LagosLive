import type { Party } from './types';

// Google Maps' `dir` endpoint is a stable, officially documented universal link.
export function googleMapsDirectionsUrl(party: Party) {
  return `https://www.google.com/maps/dir/?api=1&destination=${party.lat},${party.lng}&destination_place_id=`;
}

// Uber's `m.uber.com/ul` universal link is officially documented and works both as an
// app deep link and a web fallback: https://developer.uber.com/docs/deep-linking
export function uberDeepLink(party: Party) {
  const params = new URLSearchParams({
    action: 'setPickup',
    pickup: 'my_location',
    'dropoff[latitude]': String(party.lat),
    'dropoff[longitude]': String(party.lng),
    'dropoff[nickname]': party.title,
    'dropoff[formatted_address]': party.address,
  });
  return `https://m.uber.com/ul/?${params.toString()}`;
}

// Bolt and inDrive don't publish an official destination-prefilling deep link, so these are
// best-effort custom-scheme guesses paired with openWithFallback() below, which redirects to
// the app's own site if the scheme doesn't open anything within ~1.2s.
export function boltDeepLink(party: Party) {
  const params = new URLSearchParams({
    pickup_address: 'Current Location',
    destination_latitude: String(party.lat),
    destination_longitude: String(party.lng),
    destination_address: party.address,
  });
  return `bolt://ride?${params.toString()}`;
}
export const BOLT_FALLBACK_URL = 'https://bolt.eu/en/rides/';

export function inDriveDeepLink(party: Party) {
  const params = new URLSearchParams({
    dest_lat: String(party.lat),
    dest_lng: String(party.lng),
    dest_addr: party.address,
  });
  return `indrive://ride?${params.toString()}`;
}
export const INDRIVE_FALLBACK_URL = 'https://indrive.com/en/';

// Tries a custom-scheme app link; if the app isn't installed (page stays visible), redirects
// to fallbackUrl instead of leaving the user on a dead click.
export function openWithFallback(schemeUrl: string, fallbackUrl: string) {
  const timer = setTimeout(() => {
    window.location.href = fallbackUrl;
  }, 1300);
  const cancel = () => clearTimeout(timer);
  document.addEventListener('visibilitychange', cancel, { once: true });
  window.addEventListener('pagehide', cancel, { once: true });
  window.location.href = schemeUrl;
}
