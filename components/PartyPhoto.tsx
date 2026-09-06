import Image from 'next/image';

interface PartyPhotoProps {
  src: string | null;
  alt: string;
  gradient: string;
  sizes: string;
  priority?: boolean;
}

export default function PartyPhoto({ src, alt, gradient, sizes, priority }: PartyPhotoProps) {
  if (!src) {
    // No uploaded cover: render the event's gradient alone as a deliberate
    // Lagos Live fallback (no broken image, no random stock photo).
    return <div className="h-full w-full" style={{ background: gradient }} />;
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
        style={{ filter: 'grayscale(0.6) contrast(1.2) brightness(0.7) saturate(1.1)' }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ background: gradient, mixBlendMode: 'color', opacity: 0.75 }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: gradient, mixBlendMode: 'soft-light', opacity: 0.45 }} />
    </>
  );
}