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

  if (!src) {
    return (
      <div
        className="h-full w-full"
        style={{ background: editorial ? 'linear-gradient(135deg, #10151e 0%, #182438 100%)' : gradient }}
      />
    );
  }

  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        style={{ filter: editorial ? 'contrast(1.08) brightness(0.78) saturate(0.9)' : 'grayscale(0.6) contrast(1.2) brightness(0.7) saturate(1.1)' }}
      />
      {!editorial && (
        <>
          <div className="pointer-events-none absolute inset-0" style={{ background: gradient, mixBlendMode: 'color', opacity: 0.75 }} />
          <div className="pointer-events-none absolute inset-0" style={{ background: gradient, mixBlendMode: 'soft-light', opacity: 0.45 }} />
        </>
      )}
    </>
  );
}
