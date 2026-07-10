import Image from 'next/image';

interface PartyPhotoProps {
  src: string;
  alt: string;
  gradient: string;
  sizes: string;
  priority?: boolean;
}

/**
 * Applies a vibe-colored duotone grade to stock photography so every party image reads as
 * intentionally art-directed rather than a random, uncolor-graded stock photo.
 */
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
        style={{ filter: 'grayscale(0.85) contrast(1.15) brightness(0.9) saturate(1.05)' }}
      />
      <div className="pointer-events-none absolute inset-0" style={{ background: gradient, mixBlendMode: 'color', opacity: 0.85 }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: gradient, mixBlendMode: 'soft-light', opacity: 0.55 }} />
    </>
  );
}
