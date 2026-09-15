'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { CSSProperties } from 'react';

const SPOTIFY_PLAYLIST_URL =
  'https://open.spotify.com/playlist/1GSP7SCHTQOeDtax41ZWho?si=MS8WKhT5S5iWvX9xqOW-Lw';

function SpotifyIcon({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

export default function LagosLiveSound() {
  return (
    <section className="relative overflow-hidden px-5 pb-14 pt-10 md:px-8 md:pb-20 md:pt-14">
      {/* Subtle ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 50% 60% at 80% 50%, rgba(138,43,226,0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative z-[1] mx-auto max-w-[1100px]">
        {/* Desktop: two-column. Mobile: stacked. */}
        <div className="flex flex-col-reverse items-center gap-10 md:flex-row md:items-center md:gap-14">
          {/* LEFT — Copy */}
          <div className="flex-1 text-center md:text-left">
            {/* Eyebrow */}
            <div className="mb-3 flex items-center justify-center gap-2 md:justify-start">
              <div
                className="h-5 w-[3px] rounded-sm"
                style={{ background: 'linear-gradient(to bottom, #FF2D95, #8A2BE2)' }}
              />
              <span
                className="text-[11px] font-bold uppercase tracking-[2.5px]"
                style={{ color: '#8A2BE2' }}
              >
                The Lagos Live Sound
              </span>
            </div>

            {/* Heading */}
            <h2
              className="font-display mb-4 text-[34px] leading-[1] tracking-[1px] md:text-[46px]"
              style={{ color: '#FFFFFF' }}
            >
              The sounds of the{' '}
              <span className="gradient-text">city</span>
            </h2>

            {/* Description */}
            <p
              className="mx-auto mb-8 max-w-[420px] text-[14.5px] leading-[1.7] md:mx-0"
              style={{ color: '#A7A8B5' }}
            >
              Discover the music behind Lagos nights, parties, concerts and culture.
            </p>

            {/* CTA */}
            <Link
              href={SPOTIFY_PLAYLIST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-[14px] px-7 py-3.5 text-sm font-bold text-white transition-all duration-200 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #1DB954, #8A2BE2)',
                boxShadow: '0 10px 40px rgba(138,43,226,0.25)',
              }}
            >
              <SpotifyIcon className="h-[18px] w-[18px]" />
              Listen on Spotify
              <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
          </div>

          {/* RIGHT — Playlist artwork card */}
          <div className="flex w-full max-w-[360px] flex-shrink-0 md:max-w-[400px]">
            <div
              className="relative aspect-square w-full overflow-hidden rounded-[24px]"
              style={{
                background: 'linear-gradient(145deg, #171725 0%, #1a1028 40%, #12101f 100%)',
                border: '1px solid rgba(138,43,226,0.2)',
                boxShadow:
                  '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(138,43,226,0.12)',
              }}
            >
              {/* Inner gradient overlay */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(circle at 30% 25%, rgba(138,43,226,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 75%, rgba(255,45,149,0.1) 0%, transparent 50%)',
                }}
              />

              {/* Content */}
              <div className="relative z-[1] flex h-full flex-col items-center justify-center px-8 text-center">
                {/* Spotify icon mark */}
                <div
                  className="mb-5 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{
                    background: 'rgba(138,43,226,0.18)',
                    border: '1px solid rgba(138,43,226,0.3)',
                  }}
                >
                  <SpotifyIcon className="h-7 w-7" style={{ color: '#8A2BE2' }} />
                </div>

                <div
                  className="font-display mb-2 text-[28px] leading-[1] tracking-[1px]"
                  style={{ color: '#FFFFFF' }}
                >
                  LAGOS LIVE
                </div>
                <div
                  className="font-display text-[16px] tracking-[3px] uppercase"
                  style={{ color: '#8A2BE2' }}
                >
                  The Sound
                </div>

                {/* Decorative bottom bar */}
                <div className="mt-6 flex items-center gap-1.5">
                  <div
                    className="h-[3px] w-6 rounded-full"
                    style={{ background: 'linear-gradient(90deg, #FF2D95, #8A2BE2)' }}
                  />
                  <div
                    className="h-[3px] w-3 rounded-full"
                    style={{ background: 'rgba(138,43,226,0.4)' }}
                  />
                  <div
                    className="h-[3px] w-1.5 rounded-full"
                    style={{ background: 'rgba(138,43,226,0.2)' }}
                  />
                </div>
              </div>

              {/* Corner accent lines */}
              <div
                className="pointer-events-none absolute left-4 top-4 h-8 w-8 rounded-tl-[10px]"
                style={{ borderLeft: '2px solid rgba(138,43,226,0.25)', borderTop: '2px solid rgba(138,43,226,0.25)' }}
              />
              <div
                className="pointer-events-none absolute bottom-4 right-4 h-8 w-8 rounded-br-[10px]"
                style={{ borderRight: '2px solid rgba(138,43,226,0.25)', borderBottom: '2px solid rgba(138,43,226,0.25)' }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
