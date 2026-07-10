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
    { key: 'google', label: 'Google Maps', dot: '#6FA88A', action: () => window.open(googleMapsDirectionsUrl(party), '_blank') },
    { key: 'uber', label: 'Uber', dot: '#F1F5F9', action: () => window.open(uberDeepLink(party), '_blank') },
    { key: 'bolt', label: 'Bolt', dot: '#4FBF67', action: () => openWithFallback(boltDeepLink(party), BOLT_FALLBACK_URL) },
    { key: 'indrive', label: 'inDrive', dot: '#D9B380', action: () => openWithFallback(inDriveDeepLink(party), INDRIVE_FALLBACK_URL) },
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
        className="flex items-center gap-1.5 whitespace-nowrap rounded-2xl border px-[18px] py-4 text-[13px] font-semibold"
        style={{ background: 'rgba(182,151,99,0.1)', borderColor: 'rgba(182,151,99,0.32)', color: '#D4BE94' }}
      >
        <NavigationIcon size={14} strokeWidth={2.5} />
        Get There
        <ChevronDown size={13} strokeWidth={2.5} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-2xl border backdrop-blur-[22px]"
          style={{ background: 'rgba(20,17,31,0.96)', borderColor: 'var(--c-border3)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
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
