'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Night frequency: horizontal rolling slats that clear in beats.
const SLATS = Array.from({ length: 10 });

export default function EntryShutter() {
  const pathname = usePathname();
  const isEntryRoute =
    pathname === '/' ||
    pathname.startsWith('/party/') ||
    pathname.startsWith('/events/') ||
    pathname.startsWith('/checkout/');

  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(isEntryRoute);

  useEffect(() => {
    if (!isEntryRoute) {
      setVisible(false);
      return;
    }

    setVisible(true);
    setOpen(false);
    const frame = window.requestAnimationFrame(() => setOpen(true));
    const finish = window.setTimeout(() => setVisible(false), 950);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(finish);
    };
  }, [isEntryRoute]);

  if (!visible) return null;

  return (
    <div className={`entry-shutter${open ? ' entry-shutter--open' : ''}`} aria-hidden="true">
      <div className="entry-shutter__logo-lockup">
        <div className="entry-shutter__halo" />
        <img className="entry-shutter__logo" src="/Lagoslivelogo.png" alt="" />
        <span className="entry-shutter__caption">Good nights start here</span>
      </div>

      <div className="entry-shutter__slats">
        {SLATS.map((_, index) => (
          <span key={index} style={{ '--slat-index': index } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}
