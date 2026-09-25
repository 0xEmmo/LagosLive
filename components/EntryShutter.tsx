'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

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
    const finish = window.setTimeout(() => setVisible(false), 1700);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(finish);
    };
  }, [isEntryRoute]);

  if (!visible) return null;

  return (
    <div
      className={`entry-shutter${open ? ' entry-shutter--open' : ''}`}
      aria-hidden="true"
    >
      <div className="entry-shutter__logo-lockup">
        <div className="entry-shutter__halo" />
        <Image
          className="entry-shutter__logo"
          src="/icon-512.png"
          alt=""
          width={512}
          height={512}
          priority
        />
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
