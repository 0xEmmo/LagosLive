import type { Vibe } from './types';

// Retro pop palette applied 1:1 across the six vibes: purple, blue, yellow, green, pink, coral
export const GRADIENTS: Record<Vibe, string> = {
  Club: 'linear-gradient(135deg,#7C4FE0 0%,#552CB7 100%)',
  Rooftop: 'linear-gradient(135deg,#3EC6FF 0%,#058CD7 100%)',
  Festival: 'linear-gradient(135deg,#FFDD8F 0%,#FFC567 100%)',
  Concert: 'linear-gradient(135deg,#3DCB8F 0%,#00995E 100%)',
  'House Party': 'linear-gradient(135deg,#FFA8C8 0%,#FB7DA8 100%)',
  Lounge: 'linear-gradient(135deg,#FF8B78 0%,#FD5A46 100%)',
};

// Vibe accent color, background tint, and text tint (used for badges & map markers)
export const VC: Record<Vibe, string> = {
  Club: '#552CB7',
  Rooftop: '#058CD7',
  Festival: '#FFC567',
  Concert: '#00995E',
  'House Party': '#FB7DA8',
  Lounge: '#FD5A46',
};

export const VCB: Record<Vibe, string> = {
  Club: 'rgba(85,44,183,0.14)',
  Rooftop: 'rgba(5,140,215,0.14)',
  Festival: 'rgba(255,197,103,0.3)',
  Concert: 'rgba(0,153,94,0.14)',
  'House Party': 'rgba(251,125,168,0.18)',
  Lounge: 'rgba(253,90,70,0.14)',
};

// Text color used on top of VCB tints — darkened where the raw VC is too light to read (yellow/pink)
export const VCT: Record<Vibe, string> = {
  Club: '#552CB7',
  Rooftop: '#058CD7',
  Festival: '#9A6A00',
  Concert: '#00995E',
  'House Party': '#C23F72',
  Lounge: '#D6402C',
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
  return d < 5 ? '#00995E' : d < 10 ? '#B8860B' : '#D6402C';
}

export function distanceBg(d: number) {
  return d < 5 ? 'rgba(0,153,94,0.12)' : d < 10 ? 'rgba(184,134,11,0.12)' : 'rgba(214,64,44,0.12)';
}

export function distanceBorder(d: number) {
  return d < 5 ? 'rgba(0,153,94,0.35)' : d < 10 ? 'rgba(184,134,11,0.35)' : 'rgba(214,64,44,0.35)';
}

export function partyPhoto(id: number) {
  return `https://picsum.photos/seed/lagoslive-party-${id}/900/700`;
}

export function partyDetailPhoto(id: number, suffix: string) {
  return `https://picsum.photos/seed/lagoslive-detail-${id}-${suffix}/900/700`;
}

