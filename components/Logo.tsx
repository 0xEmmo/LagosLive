'use client';

import Image from 'next/image';

const LOGO_SRC = '/LagosLiveLogo.webp';
const LOGO_WIDTH = 384;
const LOGO_HEIGHT = 256;

export function SiteLogo({
  className = '',
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={LOGO_SRC}
      alt="Lagos Live"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      sizes="66px"
      className={`block h-auto w-auto max-h-[44px] max-w-[66px] object-contain ${className}`}
      priority={priority}
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
    <Image
      src={LOGO_SRC}
      alt="Lagos Live"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      sizes={`${Math.ceil(size * 1.5)}px`}
      className="block shrink-0 object-contain"
      style={{ width: size * 1.5, height: size }}
    />
  );
}
