'use client';

import { useEffect, useRef, useState } from 'react';
import { Navigation as NavigationIcon, ChevronDown } from 'lucide-react';
import type { Party } from '@/lib/types';
import {
  googleMapsDirectionsUrl,
  uberDeepLink,
  boltDeepLink,
  BOLT_FALLBACK_URL,
  inDriveDeepLink,
  INDRIVE_FALLBACK_URL,
  openWithFallback,
} from '@/lib/rideLinks';

function rideOptions(party: Party) {
  return [
    { key: 'google', label: 'Google Maps', dot: '#00F5D4', action: () => window.open(googleMapsDirectionsUrl(party), '_blank') },
    { key: 'uber', label: 'Uber', dot: '#FF2D95', action: () => window.open(uberDeepLink(party), '_blank') },
    { key: 'bolt', label: 'Bolt', dot: '#00BFFF', action: () => openWithFallback(boltDeepLink(party), BOLT_FALLBACK_URL) },
    { key: 'indrive', label: 'inDrive', dot: '#FFD600', action: () => openWithFallback(inDriveDeepLink(party), INDRIVE_FALLBACK_URL) },
  ];
}

export default function GetThereMenu({ party }: { party: Party }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-2xl px-[18px] py-4 text-[13px] font-semibold transition-all duration-200 active:scale-[0.97]"
        style={{
          background: 'rgba(0,191,255,0.08)',
          border: '1px solid rgba(0,191,255,0.2)',
          color: '#00BFFF',
        }}
      >
        <NavigationIcon size={14} strokeWidth={2} />
        Get There
        <ChevronDown size={13} strokeWidth={2} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
      </button>
      <div
        className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-2xl transition-all duration-150 ease-out"
        style={{
          background: '#171725',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          transformOrigin: 'top right',
          opacity: open ? 1 : 0,
          transform: open ? 'scale(1)' : 'scale(0.95)',
          visibility: open ? 'visible' : 'hidden',
        }}
      >
        {rideOptions(party).map((opt) => (
          <button
            key={opt.key}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              opt.action();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] font-medium transition-colors duration-150 hover:bg-[rgba(255,255,255,0.04)] active:scale-[0.97]"
            style={{ color: '#FFFFFF' }}
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: opt.dot }} />
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
