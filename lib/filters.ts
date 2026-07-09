import type { Party, PartyFilters, SortBy } from './types';

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
        p.organizer.toLowerCase().includes(q) ||
        p.vibe.toLowerCase().includes(q)
    );
  }

  if (filters.price === 'Free') r = r.filter((p) => p.feeNum === 0);
  else if (filters.price === '₦5k-10k') r = r.filter((p) => p.feeNum > 0 && p.feeNum <= 10000);
  else if (filters.price === '₦10k-20k') r = r.filter((p) => p.feeNum > 10000 && p.feeNum <= 20000);
  else if (filters.price === '₦20k+') r = r.filter((p) => p.feeNum > 20000);

  if (filters.vibe) r = r.filter((p) => p.vibe === filters.vibe);

  if (filters.distance === '0-5km') r = r.filter((p) => p.distance <= 5);
  else if (filters.distance === '5-10km') r = r.filter((p) => p.distance > 5 && p.distance <= 10);
  else if (filters.distance === '10km+') r = r.filter((p) => p.distance > 10);

  if (filters.date === 'This Weekend') r = r.filter((p) => p.isWeekend);
  else if (filters.date === 'This Week') r = r.filter((p) => p.isThisWeek);

  if (sortBy === 'date') r.sort((a, b) => a.id - b.id);
  else if (sortBy === 'price-asc') r.sort((a, b) => a.feeNum - b.feeNum);
  else if (sortBy === 'distance') r.sort((a, b) => a.distance - b.distance);

  return r;
}

export function formatNaira(n: number): string {
  return '₦' + Math.round(n).toLocaleString('en-NG');
}
