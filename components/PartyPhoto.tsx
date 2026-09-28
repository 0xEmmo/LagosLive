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
      />
    </>
  );
}
