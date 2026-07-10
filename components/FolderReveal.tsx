'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PARTIES } from '@/lib/data';

const SEEN_KEY = 'll_seen_folder_reveal';
// One party per vibe (Club, Rooftop, Festival, House Party, Lounge) so the reveal shows
// 5 distinct vibes rather than just the first 5 parties in list order.
const HOT_PARTY_IDS = [1, 2, 3, 5, 6];
const HOT_PARTIES = HOT_PARTY_IDS.map((id) => PARTIES.find((p) => p.id === id)!);

// Vivid, saturated ray colors — deliberately more neon/punchy than the app's muted card
// palette, matching the high-energy "hype reveal" moment this component is for.
const RAY_GRADIENTS = [
  'linear-gradient(180deg,#FF7F50 0%,#FF1493 55%,#B0116B 100%)',
  'linear-gradient(180deg,#9D4EDD 0%,#FF006E 55%,#5A2A8A 100%)',
  'linear-gradient(180deg,#FFFB00 0%,#FFD60A 55%,#C79A00 100%)',
  'linear-gradient(180deg,#00D9FF 0%,#0096FF 55%,#0067AE 100%)',
  'linear-gradient(180deg,#FF8C42 0%,#FF006E 55%,#A8003F 100%)',
];
const FOLDER_GRADIENT = 'linear-gradient(135deg,#8B5CF6 0%,#D6409F 100%)';

// Percentage-based fan geometry (converted from the original 760x610px design so it scales
// responsively instead of being pinned to one canvas width).
const TOP_EDGES = [0, 20, 40, 60, 80, 100];
const BOTTOM_EDGES = [40.13, 44.08, 48.03, 51.97, 55.92, 59.87];

function rayClipPath(i: number, expanded: boolean) {
  if (!expanded) return 'polygon(50% 100%,50% 100%,50% 100%,50% 100%)';
  return `polygon(${TOP_EDGES[i]}% 0%,${TOP_EDGES[i + 1]}% 0%,${BOTTOM_EDGES[i + 1]}% 100%,${BOTTOM_EDGES[i]}% 100%)`;
}

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

  return (
    <div
      className="fixed inset-0 z-[9990] flex flex-col overflow-hidden bg-[#0a0a0a] transition-opacity duration-300 ease-out"
      style={{ opacity: dismissing ? 0 : 1 }}
    >
      <style jsx>{`
        @keyframes fr-fade-up {
          0% {
            opacity: 0;
            transform: translate(-50%, 8px);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
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
        @keyframes fr-divider-grow {
          0% {
            opacity: 0;
            transform: scaleY(0);
          }
          100% {
            opacity: 0.7;
            transform: scaleY(1);
          }
        }
        @keyframes fr-tap-pulse {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 12px 40px rgba(139, 92, 246, 0.45);
          }
          50% {
            transform: scale(1.06);
            box-shadow: 0 16px 56px rgba(139, 92, 246, 0.65), 0 0 60px rgba(214, 64, 159, 0.4);
          }
        }
        @keyframes fr-hint-flicker {
          0%,
          100% {
            opacity: 0.35;
          }
          50% {
            opacity: 0.7;
          }
        }
        .fr-ray {
          position: absolute;
          inset: 0;
          transition: clip-path 0.75s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease;
        }
        .fr-divider {
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.85);
          animation: fr-divider-grow 0.9s ease-out both;
          transform-origin: bottom center;
        }
        .fr-ray-text {
          animation: fr-fade-up 0.5s ease-out both;
        }
        .fr-fade-plain {
          animation: fr-fade-up-plain 0.5s ease-out both;
        }
        .fr-tap-hint {
          animation: fr-tap-pulse 1.8s ease-in-out infinite;
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
            <div className="absolute bottom-[86px] flex gap-2.5" style={{ opacity: 0.75 }}>
              {['#FF7F50', '#9D4EDD', '#FFD60A', '#00D9FF', '#FF8C42'].map((color, i) => (
                <div
                  key={i}
                  style={{
                    width: 2.5,
                    height: [60, 80, 90, 80, 60][i],
                    background: `linear-gradient(to top, ${color}, transparent)`,
                    transform: `rotate(${(i - 2) * 9}deg)`,
                    animation: 'fr-hint-flicker 2.4s ease-in-out infinite',
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
            <div
              className="fr-tap-hint flex h-[76px] w-[76px] items-center justify-center rounded-[20px] border-2"
              style={{ background: FOLDER_GRADIENT, borderColor: 'rgba(255,255,255,0.85)' }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
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
        <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8">
          <div className="relative w-full flex-1" style={{ maxHeight: 560 }}>
            {HOT_PARTIES.map((p, i) => {
              const dark = i === 2; // yellow ray reads better with dark text
              const centerPct = (TOP_EDGES[i] + TOP_EDGES[i + 1]) / 2;
              return (
                <div
                  key={p.id}
                  className="fr-ray"
                  style={{
                    background: RAY_GRADIENTS[i],
                    clipPath: rayClipPath(i, true),
                    transitionDelay: `${Math.abs(i - 2) * 0.06}s`,
                  }}
                >
                  <button
                    onClick={() => openParty(p.id)}
                    className="fr-ray-text absolute top-[13%] w-[19%] min-w-[56px] -translate-x-1/2 text-center"
                    style={{ left: `${centerPct}%`, animationDelay: `${0.4 + i * 0.02}s` }}
                  >
                    <div
                      className="font-display leading-[0.95] tracking-[0.4px]"
                      style={{
                        fontSize: 13,
                        color: dark ? '#1a1a1a' : 'white',
                        textShadow: dark ? 'none' : '0 2px 10px rgba(0,0,0,0.35)',
                      }}
                    >
                      {p.title}
                    </div>
                    <div
                      className="mt-1.5 font-heading"
                      style={{ fontSize: 8.5, fontWeight: 700, color: dark ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.92)' }}
                    >
                      {p.time}
                    </div>
                    <span
                      className="mt-2 inline-block rounded-full px-2 py-[3px] font-heading"
                      style={{
                        fontSize: 7.5,
                        fontWeight: 800,
                        background: dark ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.18)',
                        border: `1px solid ${dark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)'}`,
                        color: dark ? '#1a1a1a' : 'white',
                      }}
                    >
                      {p.vibe.toUpperCase()}
                    </span>
                  </button>
                </div>
              );
            })}

            {TOP_EDGES.map((edge, i) => (
              <div
                key={i}
                className="fr-divider"
                style={{ clipPath: `polygon(${edge}% 0%,${edge + 0.4}% 0%,${BOTTOM_EDGES[i] + 0.4}% 100%,${BOTTOM_EDGES[i]}% 100%)`, animationDelay: `${0.3 + i * 0.02}s` }}
              />
            ))}

            <div
              className="absolute bottom-0 left-1/2 z-[5] flex h-[68px] w-[68px] -translate-x-1/2 items-center justify-center rounded-[18px] border-2"
              style={{ background: FOLDER_GRADIENT, borderColor: 'rgba(255,255,255,0.85)', boxShadow: '0 12px 40px rgba(139,92,246,0.55), 0 0 44px rgba(214,64,159,0.35)' }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </div>
          </div>

          <div className="fr-fade-plain w-full px-6 text-center" style={{ animationDelay: '0.65s' }}>
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
            style={{ animationDelay: '0.8s', background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.16)', color: '#F1F1F1' }}
          >
            Enter Lagos Live →
          </button>
        </div>
      )}
    </div>
  );
}
