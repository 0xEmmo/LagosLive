import type { Party, Vibe } from './types';

export const GRADIENTS: Record<Vibe, string> = {
  Club: 'linear-gradient(135deg,#2E2447 0%,#5A4A82 50%,#8C5E72 100%)',
  Rooftop: 'linear-gradient(135deg,#1F3A3A 0%,#3D5A56 50%,#4A4563 100%)',
  Festival: 'linear-gradient(135deg,#3D2A1A 0%,#8C5A32 50%,#A8453B 100%)',
  Concert: 'linear-gradient(135deg,#1F3D30 0%,#3D6B52 50%,#3D5A54 100%)',
  'House Party': 'linear-gradient(135deg,#3D2038 0%,#8C4A62 50%,#A8814A 100%)',
  Lounge: 'linear-gradient(135deg,#1A1830 0%,#2E2A52 60%,#4A4470 100%)',
};

// Vibe accent color, background tint, and text tint (used for badges & map markers)
export const VC: Record<Vibe, string> = {
  Club: '#6D5A99',
  Rooftop: '#5E7A78',
  Festival: '#B8814A',
  Concert: '#5C8A6B',
  'House Party': '#A85670',
  Lounge: '#6B5B8C',
};

export const VCB: Record<Vibe, string> = {
  Club: 'rgba(109,90,153,0.18)',
  Rooftop: 'rgba(94,122,120,0.18)',
  Festival: 'rgba(184,129,74,0.18)',
  Concert: 'rgba(92,138,107,0.18)',
  'House Party': 'rgba(168,86,112,0.18)',
  Lounge: 'rgba(107,91,140,0.18)',
};

export const VCT: Record<Vibe, string> = {
  Club: '#A896C9',
  Rooftop: '#9BB8B0',
  Festival: '#D9B380',
  Concert: '#96C2A8',
  'House Party': '#C99AAE',
  Lounge: '#A69BC4',
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
  return d < 5 ? '#6FA88A' : d < 10 ? '#C2954F' : '#B85C5C';
}

export function distanceBg(d: number) {
  return d < 5 ? 'rgba(111,168,138,0.12)' : d < 10 ? 'rgba(194,149,79,0.12)' : 'rgba(184,92,92,0.12)';
}

export function distanceBorder(d: number) {
  return d < 5 ? 'rgba(111,168,138,0.35)' : d < 10 ? 'rgba(194,149,79,0.35)' : 'rgba(184,92,92,0.35)';
}

export function partyPhoto(id: number) {
  return `https://picsum.photos/seed/lagoslive-party-${id}/900/700`;
}

export function partyDetailPhoto(id: number, suffix: string) {
  return `https://picsum.photos/seed/lagoslive-detail-${id}-${suffix}/900/700`;
}

export const PARTIES: Party[] = [
  { id: 1, title: 'PULSE LAGOS', date: 'Sat, Jul 5', time: '10 PM – 4 AM', location: 'Quilox Club, Victoria Island', address: '15 Ozumba Mbadiwe Ave, Victoria Island, Lagos', lat: 6.4281, lng: 3.4219, fee: '₦15,000', feeNum: 15000, distance: 2.3, vibe: 'Club', capacity: 1000, spotsLeft: 423, ageRestriction: '18+', dressCode: 'Smart Casual', organizer: 'Flytime Music', instagram: '@flytime_music', whatsapp: '+2348012345678', description: "Lagos's most electrifying club night featuring top DJs spinning Afrobeats, Amapiano & more. 3 floors of pure energy — VIP tables available.", gradient: GRADIENTS.Club, isWeekend: true, isThisWeek: true },
  { id: 2, title: 'SKYBAR SESSIONS', date: 'Fri, Jul 4', time: '8 PM – 2 AM', location: 'Eko Pearl Rooftop, VI', address: 'Block A, Eko Pearl Towers, Eko Atlantic, Lagos', lat: 6.4250, lng: 3.4150, fee: '₦10,000', feeNum: 10000, distance: 1.8, vibe: 'Rooftop', capacity: 400, spotsLeft: 87, ageRestriction: '21+', dressCode: 'Cocktail Attire', organizer: 'Rooftop Republic', instagram: '@rooftoprepublic', whatsapp: '+2348098765432', description: 'Unwind 30 floors above Lagos with live Afrojuju fusion, premium cocktails and an unbeatable panoramic view of the Atlantic coastline.', gradient: GRADIENTS.Rooftop, isWeekend: false, isThisWeek: true },
  { id: 3, title: 'DETTY SUMMER', date: 'Sat, Jul 5', time: '4 PM – 12 AM', location: 'Eko Atlantic City, VI', address: 'Eko Atlantic City, Victoria Island Extension, Lagos', lat: 6.4071, lng: 3.4052, fee: '₦25,000', feeNum: 25000, distance: 3.2, vibe: 'Festival', capacity: 5000, spotsLeft: 1243, ageRestriction: '16+', dressCode: 'Anything Goes', organizer: 'BigDreamerz', instagram: '@bigdreamerz', whatsapp: '+2348055512345', description: 'The ultimate summer festival with 10+ Afrobeats artists, food trucks, art installations and surprise headline acts. Biggest party of the year.', gradient: GRADIENTS.Festival, isWeekend: true, isThisWeek: true },
  { id: 4, title: 'UNPLUGGED VI', date: 'Sun, Jul 6', time: '7 PM – 11 PM', location: 'Terra Kulture, Victoria Island', address: 'Plot 1376 Tiamiyu Savage St, Victoria Island, Lagos', lat: 6.4350, lng: 3.4210, fee: '₦8,000', feeNum: 8000, distance: 2.8, vibe: 'Concert', capacity: 500, spotsLeft: 312, ageRestriction: 'All Ages', dressCode: 'Smart Casual', organizer: 'Terra Kulture Events', instagram: '@terra_kulture', whatsapp: '+2347011234567', description: "Intimate acoustic concert featuring Nigeria's finest singer-songwriters. Spoken word, jazz, and highlife in a beautiful garden setting.", gradient: GRADIENTS.Concert, isWeekend: true, isThisWeek: true },
  { id: 5, title: 'LEKKI HEAT', date: 'Sat, Jul 5', time: '9 PM – 5 AM', location: 'Lekki Phase 1, Lekki', address: 'Close 10, Lekki Phase 1, Lagos', lat: 6.4500, lng: 3.4800, fee: 'Free', feeNum: 0, distance: 5.2, vibe: 'House Party', capacity: 150, spotsLeft: 43, ageRestriction: '18+', dressCode: 'Casual', organizer: 'The Lekki Collective', instagram: '@lekkicollective', whatsapp: '+2348031234567', description: 'The most exclusive free house party in Lekki. RSVP required. Good music, good food, great people. Strictly by invitation only.', gradient: GRADIENTS['House Party'], isWeekend: true, isThisWeek: true },
  { id: 6, title: 'MIDNIGHT LOUNGE', date: 'Fri, Jul 4', time: '9 PM – 3 AM', location: 'The Wheatbaker, Ikoyi', address: '4 Lawrence Road, Ikoyi, Lagos', lat: 6.4474, lng: 3.4314, fee: '₦12,000', feeNum: 12000, distance: 4.8, vibe: 'Lounge', capacity: 200, spotsLeft: 67, ageRestriction: '21+', dressCode: 'Smart Elegant', organizer: 'Shelly Entertainment', instagram: '@shellyentertainment', whatsapp: '+2348067891234', description: 'Ultra-premium lounge experience with live jazz, signature cocktails and an intimate atmosphere for the discerning Lagos socialite.', gradient: GRADIENTS.Lounge, isWeekend: false, isThisWeek: true },
  { id: 7, title: 'AFROWAVE', date: 'Sat, Jul 5', time: '11 PM – 6 AM', location: 'Club 57, Ikeja GRA', address: '57 Mobolaji Bank Anthony Way, Ikeja, Lagos', lat: 6.6018, lng: 3.3515, fee: '₦7,000', feeNum: 7000, distance: 12.3, vibe: 'Club', capacity: 600, spotsLeft: 289, ageRestriction: '18+', dressCode: 'Anything Goes', organizer: 'Afrowave Promotions', instagram: '@afrowave_ng', whatsapp: '+2348023456789', description: "Mainland's hottest club night! Multiple rooms, different sounds — Afrobeats, Hip Hop, Dancehall. 2 for 1 drinks before midnight.", gradient: GRADIENTS.Club, isWeekend: true, isThisWeek: true },
  { id: 8, title: 'STELLAR CONCERT', date: 'Sat, Jul 5', time: '8 PM – 12 AM', location: 'Eko Hotel & Suites, VI', address: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos', lat: 6.4330, lng: 3.4213, fee: '₦30,000', feeNum: 30000, distance: 2.1, vibe: 'Concert', capacity: 3000, spotsLeft: 876, ageRestriction: 'All Ages', dressCode: 'Cocktail', organizer: 'Kennis Music', instagram: '@kennismusic', whatsapp: '+2348034567890', description: 'Premium concert experience with A-list Afrobeats artists at the iconic Eko Hotel. VIP, VVIP and Regular packages available.', gradient: GRADIENTS.Concert, isWeekend: true, isThisWeek: true },
  { id: 9, title: 'MAINLAND MADNESS', date: 'Sun, Jul 6', time: '3 PM – 10 PM', location: 'National Arts Theatre, Surulere', address: 'King George V Rd, Surulere, Lagos', lat: 6.5008, lng: 3.3658, fee: '₦5,000', feeNum: 5000, distance: 8.7, vibe: 'Festival', capacity: 2000, spotsLeft: 567, ageRestriction: 'All Ages', dressCode: 'Street Style', organizer: 'Mainland Republic', instagram: '@mainlandrepublic', whatsapp: '+2348045678901', description: 'A cultural festival celebrating mainland Lagos — music, food, art and fashion. From Fuji to Afrobeats, everything is here.', gradient: GRADIENTS.Festival, isWeekend: true, isThisWeek: true },
  { id: 10, title: 'ALTÉ PICNIC', date: 'Sun, Jul 6', time: '2 PM – 8 PM', location: 'University of Lagos, Yaba', address: 'University Road, Akoka, Yaba, Lagos', lat: 6.5156, lng: 3.3793, fee: 'Free', feeNum: 0, distance: 7.4, vibe: 'House Party', capacity: 300, spotsLeft: 128, ageRestriction: 'All Ages', dressCode: 'Creative/Artistic', organizer: 'Alté Nation', instagram: '@alte_nation', whatsapp: '+2348056789012', description: 'A free-spirited picnic for Lagos creatives. Live art, experimental music, poetry, and the best jollof in the city. BYOB welcome.', gradient: GRADIENTS['House Party'], isWeekend: true, isThisWeek: true },
  { id: 11, title: 'HARBOUR NIGHTS', date: 'Fri, Jul 4', time: '8 PM – 2 AM', location: 'Harbour Point, Victoria Island', address: '4 Wilmot Point Rd, Victoria Island, Lagos', lat: 6.4200, lng: 3.4150, fee: '₦15,000', feeNum: 15000, distance: 3.0, vibe: 'Lounge', capacity: 300, spotsLeft: 89, ageRestriction: '25+', dressCode: 'Smart Elegant', organizer: 'Harbour Social Club', instagram: '@harboursocialclub', whatsapp: '+2348067890123', description: 'Exclusive seafront lounge night with panoramic Lagos Harbour views. House & Afro House music. Tables must be reserved in advance.', gradient: GRADIENTS.Lounge, isWeekend: false, isThisWeek: true },
  { id: 12, title: 'VIBEZ 57', date: 'Fri, Jul 4', time: '11 PM – 5 AM', location: 'Club 57, Victoria Island', address: '57 Adeola Odeku St, Victoria Island, Lagos', lat: 6.4320, lng: 3.4200, fee: '₦10,000', feeNum: 10000, distance: 2.5, vibe: 'Club', capacity: 700, spotsLeft: 234, ageRestriction: '18+', dressCode: 'Smart Casual', organizer: 'Vibez Entertainment', instagram: '@vibez_entertainment', whatsapp: '+2348078901234', description: "Friday night at VI's most iconic club. Resident DJs + international guest act. Ladies free before midnight with RSVP.", gradient: GRADIENTS.Club, isWeekend: false, isThisWeek: true },
  { id: 13, title: 'GENESIS ROOFTOP', date: 'Sat, Jul 5', time: '6 PM – 2 AM', location: 'Oniru Private Estate, Lekki', address: 'Oniru Estate, Victoria Island Extension, Lagos', lat: 6.4450, lng: 3.4650, fee: '₦20,000', feeNum: 20000, distance: 5.8, vibe: 'Rooftop', capacity: 250, spotsLeft: 41, ageRestriction: '21+', dressCode: 'Cocktail', organizer: 'Genesis Events', instagram: '@genesis_events_ng', whatsapp: '+2348089012345', description: "Watch the Lagos sunset from a stunning rooftop while the city's best DJs play Afro House and Soulful House all night.", gradient: GRADIENTS.Rooftop, isWeekend: true, isThisWeek: true },
  { id: 14, title: 'AFRO CARNIVAL', date: 'Sun, Jul 6', time: '12 PM – 8 PM', location: 'Tafawa Balewa Square, Lagos Island', address: 'Tafawa Balewa Square, Lagos Island, Lagos', lat: 6.4552, lng: 3.3875, fee: '₦3,000', feeNum: 3000, distance: 6.2, vibe: 'Festival', capacity: 8000, spotsLeft: 3421, ageRestriction: 'All Ages', dressCode: 'Colourful/African', organizer: 'Lagos Carnival Committee', instagram: '@lagoscarnival', whatsapp: '+2348090123456', description: 'The biggest family festival in Lagos! Masquerades, live bands, food, crafts and cultural displays from all Nigerian states.', gradient: GRADIENTS.Festival, isWeekend: true, isThisWeek: true },
  { id: 15, title: 'GLOW LOUNGE', date: 'Fri, Jul 4', time: '9 PM – 3 AM', location: 'Gbagada Express, Gbagada', address: 'Gbagada Express Way, Gbagada, Lagos', lat: 6.5587, lng: 3.3854, fee: '₦8,000', feeNum: 8000, distance: 11.5, vibe: 'Lounge', capacity: 200, spotsLeft: 112, ageRestriction: '18+', dressCode: 'Smart Casual', organizer: 'Glow Hospitality', instagram: '@glowlounge_lagos', whatsapp: '+2348001234567', description: "Gbagada's premier lounge experience. Afrobeats, R&B and Soul music with quality cocktails and small chops. Hookah available.", gradient: GRADIENTS.Lounge, isWeekend: false, isThisWeek: true },
  { id: 16, title: 'DARK ROOM', date: 'Fri, Jul 4', time: '10 PM – 6 AM', location: 'The Bunker Club, Ikeja', address: 'Allen Avenue, Ikeja, Lagos', lat: 6.6021, lng: 3.3502, fee: '₦12,000', feeNum: 12000, distance: 13.1, vibe: 'Club', capacity: 400, spotsLeft: 78, ageRestriction: '18+', dressCode: 'All Black', organizer: 'Underground Lagos', instagram: '@undergroundlagos', whatsapp: '+2348012345670', description: "Lagos's most talked-about underground club night. Strictly Afro House, Deep House and Techno. Dress code strictly enforced — all black.", gradient: GRADIENTS.Club, isWeekend: false, isThisWeek: true },
  { id: 17, title: 'VILLA BASH', date: 'Sat, Jul 5', time: '8 PM – 4 AM', location: 'Chisco Area, Ajah', address: 'Off Lekki-Epe Expressway, Ajah, Lagos', lat: 6.4679, lng: 3.5946, fee: 'Free', feeNum: 0, distance: 14.2, vibe: 'House Party', capacity: 200, spotsLeft: 34, ageRestriction: '18+', dressCode: 'Casual', organizer: 'Ajah Vibes Collective', instagram: '@ajahvibes', whatsapp: '+2348023456780', description: 'The legendary Villa Bash returns! 4 rooms of music, outdoor BBQ, pool access and an all-star DJ lineup. RSVP is essential.', gradient: GRADIENTS['House Party'], isWeekend: true, isThisWeek: true },
  { id: 18, title: 'CHILL NIGHT', date: 'Sat, Jul 5', time: '6 PM – 10 PM', location: 'Muri Okunola Park, VI', address: 'Muri Okunola St, Victoria Island, Lagos', lat: 6.4320, lng: 3.4140, fee: '₦5,000', feeNum: 5000, distance: 2.6, vibe: 'Concert', capacity: 600, spotsLeft: 220, ageRestriction: 'All Ages', dressCode: 'Comfortable', organizer: 'Park Sessions Lagos', instagram: '@parksessions', whatsapp: '+2348034567891', description: "An outdoor concert in one of VI's most beautiful parks. Bring a blanket, order food, and enjoy incredible live music under the stars.", gradient: GRADIENTS.Concert, isWeekend: true, isThisWeek: true },
  { id: 19, title: 'UNDERGROUND HEAT', date: 'Sat, Jul 5', time: '11 PM – 6 AM', location: 'Freedom Park, Surulere', address: '37 Hospital Rd, Surulere, Lagos', lat: 6.4553, lng: 3.3880, fee: '₦6,000', feeNum: 6000, distance: 8.3, vibe: 'Club', capacity: 500, spotsLeft: 167, ageRestriction: '18+', dressCode: 'Street Fashion', organizer: 'Heat Republic', instagram: '@heatrepublic', whatsapp: '+2348045678902', description: "The wildest club night on the mainland. Pure Afrobeats energy from Lagos's finest selectors. No pretence, just vibes.", gradient: GRADIENTS.Club, isWeekend: true, isThisWeek: true },
  { id: 20, title: 'JAZZ & JOLLOF', date: 'Sun, Jul 6', time: '6 PM – 11 PM', location: 'Bogobiri House, Ikoyi', address: '9 Maitama Sule St, Ikoyi, Lagos', lat: 6.4461, lng: 3.4330, fee: '₦9,000', feeNum: 9000, distance: 6.5, vibe: 'Lounge', capacity: 100, spotsLeft: 22, ageRestriction: '21+', dressCode: 'Smart Casual', organizer: 'Bogobiri Events', instagram: '@bogobirihouse', whatsapp: '+2348056789013', description: 'The most intimate Sunday evening in Lagos. Live jazz, spoken word poetry and the legendary Bogobiri Jollof. Very limited seats.', gradient: GRADIENTS.Lounge, isWeekend: true, isThisWeek: true },
  { id: 21, title: 'TROPIKA', date: 'Sat, Jul 5', time: '5 PM – 1 AM', location: 'Hard Rock Cafe, Victoria Island', address: 'Plot 1649 Ozumba Mbadiwe Ave, Victoria Island, Lagos', lat: 6.4265, lng: 3.4185, fee: '₦18,000', feeNum: 18000, distance: 2.0, vibe: 'Rooftop', capacity: 600, spotsLeft: 201, ageRestriction: '18+', dressCode: 'Tropical/Summer', organizer: 'Tropika Events', instagram: '@tropika_events', whatsapp: '+2348067890124', description: 'A tropical paradise on the VI waterfront. Soca, Afrobeats and Caribbean vibes. Palm trees, cocktails and pure island energy.', gradient: GRADIENTS.Rooftop, isWeekend: true, isThisWeek: true },
  { id: 22, title: 'ECHO ISLAND', date: 'Sat, Jul 5', time: '10 PM – 6 AM', location: 'The Wall Club, Lekki Phase 1', address: 'Freedom Way, Lekki Phase 1, Lagos', lat: 6.4477, lng: 3.5252, fee: '₦13,000', feeNum: 13000, distance: 9.1, vibe: 'Club', capacity: 800, spotsLeft: 312, ageRestriction: '18+', dressCode: 'Rave/Creative', organizer: 'Echo Collective', instagram: '@echo_collective', whatsapp: '+2348078901235', description: "Lekki's most electric rave. 2 floors, 6 DJs, immersive LED installations. Amapiano, Afro Tech and experimental sounds all night.", gradient: GRADIENTS.Club, isWeekend: true, isThisWeek: true },
];

export function getPartyById(id: number): Party | undefined {
  return PARTIES.find((p) => p.id === id);
}
