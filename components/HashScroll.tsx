'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Ensures footer links like /#pricing, /#faq and /#how-it-works scroll to the
// matching homepage section even when the user is navigating in from another
// route. Next.js does not reliably honour a hash on cross-route navigation, so
// after every pathname change we look up the element and scroll once it exists
// (retrying briefly to cover lazily-rendered sections). Renders nothing.
export default function HashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    const id = decodeURIComponent(hash.slice(1));
    let frame = 0;
    let tries = 0;

    const scrollToTarget = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (tries++ < 30) frame = window.requestAnimationFrame(scrollToTarget);
    };

    const timer = window.setTimeout(scrollToTarget, 60);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
