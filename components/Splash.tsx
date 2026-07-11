'use client';

import { useEffect, useState } from 'react';
import { useLagosLiveStore } from '@/lib/store';
import { brandAccent } from '@/lib/theme';

// Higgsfield-generated nightlife photo; the Ken Burns pan/zoom below fakes motion
// on a static image so the splash reads as "alive" without a real video asset.
const SPLASH_PHOTO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3GLGCL6FRDIn1tOUJe2QDaRO1tC/hf_20260711_051449_f2e2bb22-caea-49a4-86e8-acf2d31e01ce.png';

export default function Splash() {
  const theme = useLagosLiveStore((s) => s.theme);
  const accent = brandAccent(theme);
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
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#111111] transition-opacity duration-[450ms] ease-out"
      style={{ opacity: fading ? 0 : 1, pointerEvents: fading ? 'none' : 'auto' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SPLASH_PHOTO_URL}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full origin-center animate-ken-burns object-cover motion-reduce:animate-none"
      />
      <div className="absolute inset-0" style={{ background: 'rgba(17,17,17,0.62)' }} />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 35%, ${accent.from}59 0%, transparent 65%), radial-gradient(ellipse 60% 55% at 70% 75%, ${accent.to}66 0%, transparent 65%)`,
        }}
      />
      <div key={theme} className="relative flex animate-splash-mark-in flex-col items-center">
        <div
          className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] border-2"
          style={{
            background: `linear-gradient(135deg,${accent.from},${accent.to})`,
            borderColor: 'rgba(255,255,255,0.75)',
            boxShadow: `0 12px 40px ${accent.from}80`,
          }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
        <div
          className="font-display text-[32px] tracking-[4px]"
          style={{
            background: `linear-gradient(135deg,${accent.from},${accent.to})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          LAGOS LIVE
        </div>
        <div className="mt-2 text-xs font-medium uppercase tracking-[2px]" style={{ color: accent.muted }}>
          Afrobeats &amp; Nightlife, Tonight
        </div>
        <div className="relative mt-10 h-[3px] w-[120px] overflow-hidden rounded-full bg-[rgba(255,255,255,0.14)]">
          <div
            className="absolute left-0 top-0 h-full w-2/5 animate-splash-bar rounded-full"
            style={{ background: `linear-gradient(90deg,${accent.from},${accent.to})` }}
          />
        </div>
      </div>
    </div>
  );
}
