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
    { key: 'google', label: 'Google Maps', dot: '#00995E', action: () => window.open(googleMapsDirectionsUrl(party), '_blank') },
    { key: 'uber', label: 'Uber', dot: '#1A140F', action: () => window.open(uberDeepLink(party), '_blank') },
    { key: 'bolt', label: 'Bolt', dot: '#058CD7', action: () => openWithFallback(boltDeepLink(party), BOLT_FALLBACK_URL) },
    { key: 'indrive', label: 'inDrive', dot: '#FFC567', action: () => openWithFallback(inDriveDeepLink(party), INDRIVE_FALLBACK_URL) },
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
        className="flex items-center gap-1.5 whitespace-nowrap rounded-2xl border-2 px-[18px] py-4 text-[13px] font-semibold"
        style={{ background: 'rgba(255,197,103,0.22)', borderColor: '#1A140F', color: '#8A5A00' }}
      >
        <NavigationIcon size={14} strokeWidth={2.5} />
        Get There
        <ChevronDown size={13} strokeWidth={2.5} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-2xl border-2"
          style={{ background: 'var(--c-surface)', borderColor: '#1A140F', boxShadow: '5px 5px 0 rgba(26,20,15,0.4)' }}
        >
          {rideOptions(party).map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                opt.action();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] font-medium"
              style={{ color: 'var(--c-text)' }}
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: opt.dot }} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
