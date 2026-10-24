'use client';

import { useState } from 'react';
import Image from 'next/image';

interface PartyPhotoProps {
  src: string | null;
  alt: string;
  gradient: string;
  sizes: string;
  priority?: boolean;
  tone?: 'default' | 'editorial';
}

export default function PartyPhoto({ src, alt, gradient, sizes, priority, tone = 'default' }: PartyPhotoProps) {
  const editorial = tone === 'editorial';
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const fallbackBackground = editorial
    ? 'linear-gradient(135deg, #10151e 0%, #182438 100%)'
    : `linear-gradient(135deg, rgba(8,19,45,0.76) 0%, rgba(19,45,99,0.56) 100%), ${gradient}`;

  if (!src || failedSrc === src) {
    return (
      <div
        className={`party-photo__fallback h-full w-full${editorial ? ' party-photo__fallback--editorial' : ''}`}
        role="img"
        aria-label={alt}
        style={{ background: fallbackBackground }}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className="party-photo__image object-cover"
      onError={() => setFailedSrc(src)}
    />
  );
}
