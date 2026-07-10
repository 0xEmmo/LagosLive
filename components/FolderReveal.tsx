'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PARTIES, partyPhoto, VC } from '@/lib/data';
import PartyPhoto from './PartyPhoto';

const SEEN_KEY = 'll_seen_folder_reveal';
// One party per vibe (Club, Rooftop, Festival, House Party, Lounge) so the reveal shows
// 5 distinct vibes rather than just the first 5 parties in list order.
const HOT_PARTY_IDS = [1, 2, 3, 5, 6];
const HOT_PARTIES = HOT_PARTY_IDS.map((id) => PARTIES.find((p) => p.id === id)!);

const FOLDER_GRADIENT = 'linear-gradient(135deg,#552CB7 0%,#FB7DA8 100%)';

// Fan-out geometry per card (index 2 = center, frontmost).
const CARD_LAYOUT = [
  { rotate: -24, x: -118, y: -14, z: 3 },
  { rotate: -12, x: -62, y: -46, z: 4 },
  { rotate: 0, x: 0, y: -62, z: 5 },
  { rotate: 12, x: 62, y: -46, z: 4 },
  { rotate: 24, x: 118, y: -14, z: 3 },
];

type Phase = 'closed' | 'prompt' | 'burst';

export default function FolderReveal() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('closed');
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SEEN_KEY)) return;
    const t = setTimeout(() => setPhase('prompt'), 2100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase === 'closed') return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [phase]);

  const dismiss = () => {
    sessionStorage.setItem(SEEN_KEY, '1');
    setDismissing(true);
    setTimeout(() => setPhase('closed'), 350);
  };

  const openParty = (id: number) => {
    sessionStorage.setItem(SEEN_KEY, '1');
    setDismissing(true);
    setTimeout(() => {
      setPhase('closed');
      router.push(`/party/${id}`);
    }, 250);
  };

  if (phase === 'closed') return null;
  const expanded = phase === 'burst';

  return (
    <div
      className="fixed inset-0 z-[9990] flex flex-col overflow-hidden bg-[#0a0a0a] transition-opacity duration-300 ease-out"
      style={{ opacity: dismissing ? 0 : 1 }}
    >
      <style jsx>{`
        @keyframes fr-fade-up-plain {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fr-tap-pulse {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 12px 40px rgba(85, 44, 183, 0.45);
          }
          50% {
            transform: scale(1.06);
            box-shadow: 0 16px 56px rgba(85, 44, 183, 0.65), 0 0 60px rgba(251, 125, 168, 0.4);
          }
        }
        @keyframes fr-hint-flicker {
          0%,
          100% {
            opacity: 0.4;
            transform: translateY(0);
          }
          50% {
            opacity: 0.85;
            transform: translateY(-3px);
          }
        }
        .fr-fade-plain {
          animation: fr-fade-up-plain 0.5s ease-out both;
        }
        .fr-tap-hint {
          animation: fr-tap-pulse 1.8s ease-in-out infinite;
        }
        .fr-card {
          position: absolute;
          left: 50%;
          bottom: 96px;
          width: 108px;
          height: 146px;
          transition: transform 0.6s cubic-bezier(0.2, 0.9, 0.25, 1.15), opacity 0.35s ease;
          transform-origin: bottom center;
        }
      `}</style>

      {/* Skip control */}
      <button
        onClick={dismiss}
        className="absolute right-5 top-5 z-10 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold tracking-wide"
        style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.14)', color: '#9691A3' }}
      >
        Skip
      </button>

      {phase === 'prompt' && (
        <button onClick={() => setPhase('burst')} className="flex flex-1 flex-col items-center justify-center gap-6 px-8 active:scale-[0.97] transition-transform">
          <div className="relative flex h-[220px] w-full items-end justify-center">
            <div className="absolute bottom-[92px] flex gap-1.5">
              {HOT_PARTIES.map((p, i) => (
                <div
                  key={p.id}
                  className="rounded-t-[4px]"
                  style={{
                    width: 14,
                    height: [16, 24, 30, 24, 16][i],
                    background: VC[p.vibe],
                    opacity: 0.85,
                    transform: `rotate(${(i - 2) * 8}deg)`,
                    animation: 'fr-hint-flicker 2.2s ease-in-out infinite',
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </div>
            <FolderBody />
          </div>
          <div className="text-center">
            <div className="font-heading text-[15px] font-semibold" style={{ color: '#F1F1F1' }}>
              The Lagos Live Folder
            </div>
            <div className="mt-1.5 text-xs" style={{ color: '#6B6478' }}>
              Tap to see what&apos;s popping tonight
            </div>
          </div>
        </button>
      )}

      {phase === 'burst' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
          <div className="relative w-full flex-1" style={{ maxHeight: 480 }}>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
              <FolderBody open />
            </div>

            {HOT_PARTIES.map((p, i) => {
              const layout = CARD_LAYOUT[i];
              const accent = VC[p.vibe];
              return (
                <button
                  key={p.id}
                  onClick={() => openParty(p.id)}
                  className="fr-card overflow-hidden rounded-[14px] border-2 text-left"
                  style={{
                    zIndex: layout.z,
                    borderColor: accent,
                    boxShadow: `0 10px 30px rgba(0,0,0,0.5), 0 0 26px ${accent}66`,
                    transitionDelay: `${Math.abs(i - 2) * 0.08}s`,
                    transform: expanded
                      ? `translateX(-50%) translate(${layout.x}px, ${layout.y}px) rotate(${layout.rotate}deg) scale(1)`
                      : 'translateX(-50%) translate(0px, 0px) rotate(0deg) scale(0.3)',
                    opacity: expanded ? 1 : 0,
                  }}
                >
                  <div className="relative h-full w-full" style={{ background: p.gradient }}>
                    <PartyPhoto src={partyPhoto(p.id)} alt={p.title} gradient={p.gradient} sizes="108px" />
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 55%, transparent 75%)' }}
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2">
                      <span
                        className="mb-1 inline-block rounded-full px-1.5 py-[2px] font-heading"
                        style={{ fontSize: 6.5, fontWeight: 800, background: `${accent}33`, border: `1px solid ${accent}88`, color: accent }}
                      >
                        {p.vibe.toUpperCase()}
                      </span>
                      <div className="font-display leading-[0.95] tracking-[0.3px] text-white" style={{ fontSize: 11.5, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                        {p.title}
                      </div>
                      <div className="mt-0.5 font-heading text-[7px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {p.time}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="fr-fade-plain w-full px-6 text-center" style={{ animationDelay: '0.55s' }}>
            <div className="font-display text-xl tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
              HOT PARTIES TONIGHT
            </div>
            <div className="mt-1 text-xs" style={{ color: '#6B6478' }}>
              5 vibes, one tap away — Lagos Live
            </div>
          </div>

          <button
            onClick={dismiss}
            className="fr-fade-plain mt-1 rounded-full border px-5 py-2.5 text-[13px] font-semibold active:scale-95 transition-transform"
            style={{ animationDelay: '0.7s', background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.16)', color: '#F1F1F1' }}
          >
            Enter Lagos Live →
          </button>
        </div>
      )}
    </div>
  );
}

function FolderBody({ open = false }: { open?: boolean }) {
  return (
    <div className="relative" style={{ width: 156, height: 104 }}>
      <div
        className="absolute inset-0 rounded-[16px] border-2 flex items-end justify-center pb-2"
        style={{ background: FOLDER_GRADIENT, borderColor: 'rgba(255,255,255,0.85)', boxShadow: '0 12px 40px rgba(85,44,183,0.5), 0 0 44px rgba(251,125,168,0.32)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>
      {open && (
        <div
          className="absolute inset-x-0 bottom-0 rounded-b-[16px] rounded-t-[6px]"
          style={{ height: 46, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(2px)', borderTop: '1px solid rgba(255,255,255,0.4)' }}
        />
      )}
    </div>
  );
}
