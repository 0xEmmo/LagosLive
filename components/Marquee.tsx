'use client';

interface MarqueeProps {
  children: React.ReactNode;
  pauseOnHover?: boolean;
  reverse?: boolean;
  durationSeconds?: number;
  gapPx?: number;
  className?: string;
}

// Duplicates the row so the loop is seamless: while row A scrolls fully out of view,
// its clone (row B) is already in the exact position it started from.
export default function Marquee({
  children,
  pauseOnHover = true,
  reverse = false,
  durationSeconds = 32,
  gapPx = 12,
  className = '',
}: MarqueeProps) {
  return (
    <div
      className={`group flex overflow-hidden ${className}`}
      style={{ ['--gap' as string]: `${gapPx}px`, gap: `${gapPx}px` }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`flex shrink-0 animate-marquee items-center ${pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''}`}
          style={{
            gap: `${gapPx}px`,
            ['--gap' as string]: `${gapPx}px`,
            ['--duration' as string]: `${durationSeconds}s`,
            animationDirection: reverse ? 'reverse' : 'normal',
          }}
          aria-hidden={i === 1}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
