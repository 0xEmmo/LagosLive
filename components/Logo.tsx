export function LogoMark({ size = 33 }: { size?: number }) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-[9px]"
      style={{ width: size, height: size, background: 'linear-gradient(135deg,#6D5A99,#A85670)' }}
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
        background: 'linear-gradient(135deg,#6D5A99,#A85670)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      LAGOS LIVE
    </span>
  );
}
