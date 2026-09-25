'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const RINGS = Array.from({ length: 4 });
const DURATION_MS = 6000;

export default function EntryShutter() {
  const pathname = usePathname();
  const isEntryRoute =
    pathname === '/' ||
    pathname.startsWith('/party/') ||
    pathname.startsWith('/events/') ||
    pathname.startsWith('/checkout/');

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(isEntryRoute);
  const playedRef = useRef(false);

  useEffect(() => {
    if (!isEntryRoute) {
      if (playedRef.current) setVisible(false);
      return;
    }

    if (playedRef.current) return;
    playedRef.current = true;

    setVisible(true);
    setOpen(false);
    const frame = window.requestAnimationFrame(() => setOpen(true));
    const finish = window.setTimeout(() => setVisible(false), DURATION_MS);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(finish);
    };
  }, [isEntryRoute]);

  if (!visible) return null;

  return (
    <div className={`entry-shutter${open ? ' entry-shutter--open' : ''}`} aria-hidden="true">
      <div className="entry-shutter__rings">
        {RINGS.map((_, index) => (
          <span key={index} style={{ '--ring-index': index } as React.CSSProperties} />
        ))}
      </div>

      <div className="entry-shutter__logo-lockup">
        <div className="entry-shutter__halo" />
        <img className="entry-shutter__logo" src="/Lagoslivelogo.png" alt="" />
        <span className="entry-shutter__caption">Good nights start here</span>
      </div>
    </div>
  );
}
