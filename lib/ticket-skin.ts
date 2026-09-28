export type TicketSkinKind = 'silver' | 'gold' | 'early' | 'regular';

export interface TicketSkin {
  kind: TicketSkinKind;
  accent: string;
  frame: string;
  stubBackground: string;
  stubFallback: string;
  stubColor: string;
}

/** Shared ticket-tier styling for the on-site ticket and its email version. */
export function getTicketSkin(ticketTypeName: string, eventGradient: string): TicketSkin {
  const name = ticketTypeName.toLowerCase();
  if (/\bvvip\b|\bsilver\b/.test(name)) {
    return {
      kind: 'silver',
      accent: '#D4D9E2',
      frame: 'linear-gradient(135deg,#F1F4F8,#8F9AA9 55%,#E5EAF0)',
      stubBackground: 'linear-gradient(145deg,#F4F6FA 0%,#D0D7E0 55%,#AAB4C0 100%)',
      stubFallback: '#D0D7E0',
      stubColor: '#07152C',
    };
  }
  if (/\bvip\b|\bgold\b/.test(name)) {
    return {
      kind: 'gold',
      accent: '#FFD36A',
      frame: 'linear-gradient(135deg,#FFE9A8,#B77A19 55%,#F6CF73)',
      stubBackground: 'linear-gradient(145deg,#FFE9A8 0%,#F4C65E 52%,#C58A2A 100%)',
      stubFallback: '#F4C65E',
      stubColor: '#07152C',
    };
  }
  if (/early[\s-]?bird/.test(name)) {
    return {
      kind: 'early',
      accent: '#71E0BC',
      frame: 'linear-gradient(135deg,#71E0BC,#258D82 55%,#C1FFE9)',
      stubBackground: 'linear-gradient(145deg,#A7FFE5 0%,#56E2C4 100%)',
      stubFallback: '#56E2C4',
      stubColor: '#07152C',
    };
  }
  return {
    kind: 'regular',
    accent: '#FF8A68',
    frame: eventGradient,
    stubBackground: 'linear-gradient(145deg,#8AFFFF 0%,#45DCE9 100%)',
    stubFallback: '#45DCE9',
    stubColor: '#07152C',
  };
}
