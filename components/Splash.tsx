'use client';

import { useEffect, useState } from 'react';

export default function Splash() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1500);
    const hideTimer = setTimeout(() => setVisible(false), 1950);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#14111F] transition-opacity duration-[450ms] ease-out"
      style={{ opacity: fading ? 0 : 1, pointerEvents: fading ? 'none' : 'auto' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 35%, rgba(109,90,153,0.28) 0%, transparent 65%), radial-gradient(ellipse 60% 55% at 70% 75%, rgba(168,86,112,0.18) 0%, transparent 65%)',
        }}
      />
      <div className="relative flex animate-splash-mark-in flex-col items-center">
        <div
          className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[20px]"
          style={{
            background: 'linear-gradient(135deg,#6D5A99,#A85670)',
            boxShadow: '0 12px 40px rgba(109,90,153,0.4)',
          }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <div
          className="font-display text-[32px] tracking-[4px]"
          style={{
            background: 'linear-gradient(135deg,#6D5A99,#A85670)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          LAGOS LIVE
        </div>
        <div className="mt-2 text-xs font-medium uppercase tracking-[2px] text-[#8C86A0]">
          Afrobeats &amp; Nightlife, Tonight
        </div>
        <div className="relative mt-10 h-[3px] w-[120px] overflow-hidden rounded-full bg-[var(--c-border2)]">
          <div
            className="absolute left-0 top-0 h-full w-2/5 animate-splash-bar rounded-full"
            style={{ background: 'linear-gradient(90deg,#6D5A99,#A85670)' }}
          />
        </div>
      </div>
    </div>
  );
}
