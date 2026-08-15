import Image from 'next/image';

interface PartyPhotoProps {
  src: string;
  alt: string;
  gradient: string;
  sizes: string;
  priority?: boolean;
}

export default function PartyPhoto({ src, alt, gradient, sizes, priority }: PartyPhotoProps) {
  return (
    <>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
        style={{ filter: 'grayscale(0.6) contrast(1.2) brightness(0.7) saturate(1.1)' }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ background: gradient, mixBlendMode: 'color', opacity: 0.75 }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: gradient, mixBlendMode: 'soft-light', opacity: 0.45 }} />
    </>
  );
}
