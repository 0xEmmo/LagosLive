import type { Party, PartyFilters, SortBy } from './types';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isPartyTonight(p: Party, now = new Date()): boolean {
  return isSameLocalDay(new Date(p.startsAt), now);
}

export function isPartyThisWeekend(p: Party): boolean {
  return p.isWeekend;
}

// A "how hot is this event right now" signal built from real data already on
// the row: how much of its capacity is sold, how soon it starts, and how
// close it is to the viewer. Past events sink to the bottom. Used to power
// the "Trending" sort on the home page and /search.
export function trendingScore(p: Party, now = Date.now()): number {
  const msUntilStart = new Date(p.startsAt).getTime() - now;
  if (msUntilStart < 0) return -1;
  const soldRatio = p.capacity > 0 ? Math.min(1, (p.capacity - p.spotsLeft) / p.capacity) : 0;
  const soonFactor = Math.max(0, 1 - msUntilStart / (7 * ONE_WEEK_MS));
  const proximity = p.distance >= 0 ? Math.max(0, 1 - p.distance / 20) : 0;
  return soldRatio * 1.6 + soonFactor * 1.2 + proximity * 0.4;
}

export function sortByTrending(parties: Party[], now = Date.now()): Party[] {
  return [...parties].sort((a, b) => trendingScore(b, now) - trendingScore(a, now) || a.id - b.id);
}

export function filterAndSortParties(
  parties: Party[],
  searchQuery: string,
  filters: PartyFilters,
  sortBy: SortBy
): Party[] {
  let r = [...parties];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    r = r.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.organizer.toLowerCase().includes(q) ||
        p.vibe.toLowerCase().includes(q)
    );
  }

  if (filters.price === 'Free') r = r.filter((p) => p.feeNum === 0);
  else if (filters.price === '₦5k-10k') r = r.filter((p) => p.feeNum > 0 && p.feeNum <= 10000);
  else if (filters.price === '₦10k-20k') r = r.filter((p) => p.feeNum > 10000 && p.feeNum <= 20000);
  else if (filters.price === '₦20k+') r = r.filter((p) => p.feeNum > 20000);

  if (filters.vibe) r = r.filter((p) => p.vibe === filters.vibe);

  if (filters.location) {
    const q = filters.location.toLowerCase();
    r = r.filter((p) => p.location.toLowerCase().includes(q) || p.address.toLowerCase().includes(q));
  }

  if (filters.distance === '0-5km') r = r.filter((p) => p.distance <= 5);
  else if (filters.distance === '5-10km') r = r.filter((p) => p.distance > 5 && p.distance <= 10);
  else if (filters.distance === '10km+') r = r.filter((p) => p.distance > 10);

  const now = Date.now();
  if (filters.date === 'Tonight') r = r.filter((p) => isSameLocalDay(new Date(p.startsAt), new Date()));
  else if (filters.date === 'This Weekend') r = r.filter((p) => p.isWeekend);
  else if (filters.date === 'This Week') r = r.filter((p) => p.isThisWeek);
  else if (filters.date === 'Next Week') {
    r = r.filter((p) => {
      const t = new Date(p.startsAt).getTime();
      return t >= now + ONE_WEEK_MS && t < now + 2 * ONE_WEEK_MS;
    });
  }

  if (sortBy === 'trending') r = sortByTrending(r, now);
  else if (sortBy === 'date') r.sort((a, b) => a.id - b.id);
  else if (sortBy === 'price-asc') r.sort((a, b) => a.feeNum - b.feeNum);
  else if (sortBy === 'distance') r.sort((a, b) => a.distance - b.distance);

  return r;
}

export function formatNaira(n: number): string {
  return '₦' + Math.round(n).toLocaleString('en-NG');
}
