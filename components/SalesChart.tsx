'use client';

import { BarChart3 } from 'lucide-react';
import type { SalesPoint } from '@/lib/queries';

// Lightweight, dependency-free bar chart of tickets sold per day. Rendered
// with plain divs (no SVG math / distortion) so it stays crisp on mobile.

export default function SalesChart({ data }: { data: SalesPoint[] }) {
  const total = data.reduce((sum, d) => sum + d.tickets, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-8 text-center">
        <div className="flex h-[44px] w-[44px] items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <BarChart3 size={20} strokeWidth={1.5} color="#6B6C80" />
        </div>
        <div className="text-[13px] font-semibold" style={{ color: '#FFFFFF' }}>
          No ticket sales yet
        </div>
        <div className="max-w-[240px] text-xs" style={{ color: '#A7A8B5' }}>
          Once tickets sell, the last 14 days of sales show up here.
        </div>
      </div>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.tickets));
  const showLabel = (i: number) => data.length <= 8 || i % 2 === 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-[3px]">
        {data.map((d, i) => (
          <div
            key={`v-${i}`}
            className="flex-1 text-center text-[9px] font-bold"
            style={{ color: d.tickets > 0 ? '#FF7AB8' : 'transparent' }}
          >
            {d.tickets}
          </div>
        ))}
      </div>
      <div className="flex items-end gap-[3px]" style={{ height: 120 }}>
        {data.map((d, i) => {
          const height = d.tickets === 0 ? 2 : Math.max(5, Math.round((d.tickets / max) * 100));
          return (
            <div
              key={`b-${i}`}
              title={`${d.label}: ${d.tickets} ${d.tickets === 1 ? 'ticket' : 'tickets'}`}
              className="flex-1 rounded-t-[3px] transition-all duration-300"
              style={{
                height: `${height}%`,
                background: d.tickets > 0 ? 'linear-gradient(to top, #8A2BE2, #FF2D95)' : 'rgba(255,255,255,0.07)',
                boxShadow: d.tickets > 0 ? '0 0 12px rgba(255,45,149,0.25)' : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="flex gap-[3px] border-t pt-1.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {data.map((d, i) => (
          <div
            key={`l-${i}`}
            className="flex-1 overflow-hidden whitespace-nowrap text-center text-[8px] font-medium"
            style={{ color: '#6B6C80', visibility: showLabel(i) ? 'visible' : 'hidden' }}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
