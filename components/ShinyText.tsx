'use client';

interface ShinyTextProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  shimmerWidthPx?: number;
}

// The sweep only reads as a highlight because the wrapped text needs a translucent
// `color` (e.g. rgba(85,44,183,0.75)) — full-opacity text would fully occlude the
// gradient this clips to the glyph shapes, per MagicUI's animated-shiny-text recipe.
export default function ShinyText({ children, className = '', style, shimmerWidthPx = 100 }: ShinyTextProps) {
  return (
    <span
      className={`animate-shiny-text bg-clip-text bg-no-repeat [background-position:0_0] ${className}`}
      style={{
        ['--shiny-width' as string]: `${shimmerWidthPx}px`,
        backgroundSize: `${shimmerWidthPx}px 100%`,
        backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 50%, transparent)',
        WebkitBackgroundClip: 'text',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
