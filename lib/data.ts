import type { Vibe } from './types';

export const GRADIENTS: Record<Vibe, string> = {
  Club: 'linear-gradient(135deg,#FF2D95 0%,#8A2BE2 100%)',
  Rooftop: 'linear-gradient(135deg,#00BFFF 0%,#8A2BE2 100%)',
  Festival: 'linear-gradient(135deg,#FFD600 0%,#FF8A00 100%)',
  Concert: 'linear-gradient(135deg,#FF8A00 0%,#FF2D95 100%)',
  'House Party': 'linear-gradient(135deg,#00F5D4 0%,#00BFFF 100%)',
  Lounge: 'linear-gradient(135deg,#8A2BE2 0%,#00BFFF 100%)',
};

export const VC: Record<Vibe, string> = {
  Club: '#FF2D95',
  Rooftop: '#00BFFF',
  Festival: '#FFD600',
  Concert: '#FF8A00',
  'House Party': '#00F5D4',
  Lounge: '#8A2BE2',
};

export const VCB: Record<Vibe, string> = {
  Club: 'rgba(255,45,149,0.15)',
  Rooftop: 'rgba(0,191,255,0.12)',
  Festival: 'rgba(255,214,0,0.18)',
  Concert: 'rgba(255,138,0,0.15)',
  'House Party': 'rgba(0,245,212,0.12)',
  Lounge: 'rgba(138,43,226,0.15)',
};

export const VCT: Record<Vibe, string> = {
  Club: '#FF2D95',
  Rooftop: '#00BFFF',
  Festival: '#FFD600',
  Concert: '#FF8A00',
  'House Party': '#00F5D4',
  Lounge: '#8A2BE2',
};

export const VIBE_LABEL: Record<Vibe, string> = {
  Club: 'CL',
  Rooftop: 'RT',
  Festival: 'FT',
  Concert: 'CO',
  'House Party': 'HP',
  Lounge: 'LG',
};

export const ALL_VIBES: Vibe[] = ['Club', 'Rooftop', 'Festival', 'Concert', 'House Party', 'Lounge'];

export function distanceColor(d: number) {
  return d < 5 ? '#00F5D4' : d < 10 ? '#FFD600' : '#FF8A00';
}

export function distanceBg(d: number) {
  return d < 5 ? 'rgba(0,245,212,0.1)' : d < 10 ? 'rgba(255,214,0,0.1)' : 'rgba(255,138,0,0.1)';
}

export function distanceBorder(d: number) {
  return d < 5 ? 'rgba(0,245,212,0.3)' : d < 10 ? 'rgba(255,214,0,0.3)' : 'rgba(255,138,0,0.3)';
}

// Canonical cover source for an event. Returns the host-uploaded cover URL, or
// null so callers render a deliberate gradient-only fallback — never a random
// placeholder or a broken image.
export function partyPhoto(id: number, coverUrl?: string | null) {
  void id;
  return coverUrl ?? null;
}

// Where the homepage "Host an Event" CTAs point. Signed-in users jump straight
// into the create-event flow; guests go to /host, whose existing guard routes
// them to sign in with the destination preserved (matches the app's HomeHeader).
export function hostStartHref(user?: { id: string } | null): string {
  return user ? '/host/new' : '/host';
}
