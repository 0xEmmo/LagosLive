'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, X } from 'lucide-react';

const POPULAR_TAGS = ['Rooftop', 'Club Night', 'Festival', 'Afrobeats', 'Comedy', 'Brunch'];

export default function HomeSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const submit = (q: string) => {
    const clean = q.trim();
    router.push(clean ? `/explore?q=${encodeURIComponent(clean)}` : '/explore');
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(query);
  };

  return (
    <div className="px-5 pb-4">
      <form
        onSubmit={onFormSubmit}
        className="flex items-center gap-2.5 rounded-xl px-4 py-[12px] transition-all duration-200"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,45,149,0.3)';
          e.currentTarget.style.boxShadow = '0 0 24px rgba(255,45,149,0.08)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <Search size={17} strokeWidth={2} style={{ color: '#6B6C80' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events, venues, artists..."
          className="flex-1 bg-transparent text-[15px] outline-none"
          style={{ color: '#FFFFFF' }}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={14} strokeWidth={2} style={{ color: '#6B6C80' }} />
          </button>
        )}
        <button
          type="submit"
          className="rounded-[8px] px-[11px] py-1 text-[12px] font-bold transition-all duration-200 active:scale-95"
          style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF' }}
        >
          Search
        </button>
      </form>

      <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
        <span className="flex flex-shrink-0 items-center gap-1 text-[11px]" style={{ color: '#6B6C80' }}>
          <TrendingUp size={11} strokeWidth={2} />
          Popular
        </span>
        {POPULAR_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => submit(tag)}
            className="whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium transition-all duration-200 active:scale-95"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}