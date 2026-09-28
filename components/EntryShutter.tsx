'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const RINGS = Array.from({ length: 3 });
const DURATION_MS = 650;

export default function EntryShutter() {
  const pathname = usePathname();
  const shouldPlayRef = useRef(pathname === '/');
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(pathname === '/');

  useEffect(() => {
    if (!shouldPlayRef.current) return;
    setVisible(true);
    setOpen(false);
    const frame = window.requestAnimationFrame(() => setOpen(true));
    const finish = window.setTimeout(() => setVisible(false), DURATION_MS);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(finish);
    };
  }, []);

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
        <Image className="entry-shutter__logo" src="/LagosLiveLogo.webp" alt="" width={384} height={256} priority />
        <span className="entry-shutter__caption">Good nights start here</span>
        <span className="entry-shutter__progress"><span /></span>
      </div>
    </div>
  );
}
