'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';

export function SiteLogo({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  if (pathname !== '/') {
    return (
      <span className={`inline-flex items-baseline font-display text-[25px] leading-none tracking-[1.4px] ${className}`} style={{ color: '#F4F7FF' }}>
        LAGOS LIVE<span style={{ color: '#75A1FF' }}>.</span>
      </span>
    );
  }

  return (
    <Image
      src="/Lagoslivelogo.png"
      alt="Lagos Live"
      width={1536}
      height={1024}
      className={`h-auto w-auto max-h-[52px] ${className}`}
      priority
    />
  );
}

export function LogoMark({ size = 33 }: { size?: number }) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-[9px]"
      style={{ width: size, height: size, background: 'linear-gradient(135deg,#1559F7,#75A1FF)' }}
    >
      <svg width={size * 0.48} height={size * 0.48} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </div>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span
      className="font-display tracking-[3.5px]"
      style={{
        fontSize: size,
        background: 'linear-gradient(135deg,#1559F7,#75A1FF)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      LAGOS LIVE
    </span>
  );
}
