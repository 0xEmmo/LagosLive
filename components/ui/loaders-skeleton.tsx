// Reusable skeleton loaders that mirror the app's actual UI (event cards,
// event detail, search, map, checkout) instead of a bare spinner. Built on
// Tailwind's built-in `animate-pulse` so no extra animation library is needed.
import { Loader2 } from 'lucide-react';

const CARD_BG = '#171725';
const CARD_BORDER = 'rgba(255,255,255,0.06)';
const BAR_DIM = 'rgba(255,255,255,0.06)';
const BAR_MID = 'rgba(255,255,255,0.08)';
const BAR_HI = 'rgba(255,255,255,0.13)';

function Bar({ className = '', height = 4, width = '100%', color = BAR_MID }: { className?: string; height?: number; width?: string | number; color?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ height, width, background: color }}
    />
  );
}

const shimmerBase = {
  background: BAR_MID,
  border: `1px solid ${CARD_BORDER}`,
};

// Generic pulse block used by every skeleton variant.
export function LoaderSkeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse ${className}`} style={style ?? shimmerBase} />;
}

// --- Event card skeleton (used by home, search, saved) -----------------------
export function EventCardSkeleton({ imageHeight = 200 }: { imageHeight?: number }) {
  return (
    <div
      className="animate-pulse overflow-hidden rounded-[20px]"
      style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
    >
      <div className="w-full" style={{ height: imageHeight, background: BAR_DIM }}>
        <div className="flex h-full items-start justify-between p-3">
          <Bar width={70} height={20} color={BAR_HI} />
          <Bar width={70} height={32} color={BAR_HI} />
        </div>
      </div>
      <div className="p-4">
        <Bar className="mb-2.5" width="75%" height={16} color={BAR_HI} />
        <Bar className="mb-1.5" width="55%" height={12} />
        <Bar className="mb-3" width="65%" height={12} />
        <div className="flex items-center justify-between">
          <Bar width={70} height={16} color={BAR_HI} />
          <Bar width={90} height={26} color={BAR_MID} />
        </div>
      </div>
    </div>
  );
}

export function EventCardGridSkeleton({ count = 4, imageHeight = 200 }: { count?: number; imageHeight?: number }) {
  return (
    <div className="grid gap-4 px-5 pb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} imageHeight={imageHeight} />
      ))}
    </div>
  );
}

// --- Event detail skeleton ----------------------------------------------------
export function EventDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] animate-pulse">
      <div
        className="sticky top-0 z-40 flex items-center justify-between border-b px-5 py-3.5"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="h-9 w-16 rounded-[10px]" style={{ background: BAR_MID }} />
        <div className="flex gap-2">
          <div className="h-[38px] w-[38px] rounded-[10px]" style={{ background: BAR_MID }} />
          <div className="h-[38px] w-[38px] rounded-[10px]" style={{ background: BAR_MID }} />
          <div className="h-[38px] w-[38px] rounded-[10px]" style={{ background: BAR_MID }} />
        </div>
      </div>
      <div className="w-full" style={{ height: 320, background: BAR_DIM }} />
      <div className="px-5 pt-[28px]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <Bar width="60%" height={40} color={BAR_HI} />
          <Bar width={80} height={52} color={BAR_MID} />
        </div>
        <div className="mb-5 flex gap-3">
          <Bar width="100%" height={52} color={BAR_HI} />
          <Bar width={140} height={52} color={BAR_MID} />
        </div>
        <div className="mb-6 flex flex-col gap-3">
          <Bar height={58} />
          <Bar height={58} />
          <Bar height={58} />
        </div>
        <div className="mb-5 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="mb-6">
          <Bar className="mb-3" width={120} height={12} />
          <Bar className="mb-2" height={13} />
          <Bar className="mb-2" height={13} />
          <Bar width="70%" height={13} />
        </div>
      </div>
    </div>
  );
}

// --- Search result skeleton ----------------------------------------------------
export function SearchSkeleton({ count = 4, imageHeight = 200 }: { count?: number; imageHeight?: number }) {
  return (
    <div
      className="grid gap-4 px-5 py-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} imageHeight={imageHeight} />
      ))}
    </div>
  );
}

// Lightweight inline card used while filter results settle (keeps page structure).
export function InlineCardSkeleton({ count = 3, height = 72 }: { count?: number; height?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <LoaderSkeleton key={i} style={{ height, background: 'rgba(255,255,255,0.04)', border: `1px solid ${CARD_BORDER}` }} />
      ))}
    </div>
  );
}

// --- Checkout skeleton ---------------------------------------------------------
export function CheckoutSkeleton() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[520px] flex-col animate-pulse">
      <div
        className="sticky top-0 z-40 flex items-center gap-2.5 border-b px-5 py-4"
        style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="h-9 w-9 rounded-[10px]" style={{ background: BAR_MID }} />
        <div className="h-4 w-24 rounded" style={{ background: BAR_MID }} />
        <div className="ml-auto h-6 w-20 rounded-full" style={{ background: BAR_MID }} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-[22px] flex gap-3 rounded-2xl p-3" style={shimmerBase}>
          <div className="h-16 w-16 flex-shrink-0 rounded-[10px]" style={{ background: BAR_DIM }} />
          <div className="flex-1">
            <Bar className="mb-2" width="70%" height={14} color={BAR_HI} />
            <Bar className="mb-1.5" width="50%" height={11} />
            <Bar width="60%" height={11} />
          </div>
        </div>
        <Bar className="mb-2.5" width={120} height={12} />
        <div className="mb-6 flex flex-col gap-2.5">
          <div className="h-[72px] rounded-2xl" style={shimmerBase} />
          <div className="h-[72px] rounded-2xl" style={shimmerBase} />
        </div>
        <Bar className="mb-2.5" width={90} height={12} />
        <div className="mb-6 flex items-center gap-[18px]">
          <div className="h-[38px] w-[38px] rounded-[10px]" style={{ background: BAR_MID }} />
          <div className="h-6 w-6 rounded" style={{ background: BAR_HI }} />
          <div className="h-[38px] w-[38px] rounded-[10px]" style={{ background: BAR_MID }} />
        </div>
        <Bar className="mb-2.5" width={80} height={12} />
        <div className="mb-6 h-[56px] rounded-2xl" style={{ background: BAR_MID }} />
        <div className="mb-auto rounded-2xl p-4" style={shimmerBase}>
          <Bar className="mb-2" height={13} />
          <Bar className="mb-2" height={13} />
          <Bar className="mb-2" height={13} />
          <Bar width="60%" height={16} color={BAR_HI} />
        </div>
        <div className="mt-5 h-[52px] w-full rounded-[14px]" style={{ background: 'rgba(255,45,149,0.18)' }} />
      </div>
    </div>
  );
}

// --- Map skeleton ---------------------------------------------------------
export function MapSkeleton() {
  return (
    <div className="relative" style={{ height: 'calc(100vh - 84px)' }}>
      <div className="h-full w-full animate-pulse" style={{ background: BAR_DIM }} />
      <div className="absolute left-3.5 right-3.5 top-3.5 z-[1000]">
        <div
          className="flex h-[48px] items-center gap-2.5 rounded-2xl px-4"
          style={{ background: 'rgba(7,7,11,0.92)', border: `1px solid ${CARD_BORDER}` }}
        >
          <Loader2 size={16} strokeWidth={2} color="#6B6C80" className="animate-spin" />
          <div className="flex-1 text-sm" style={{ color: '#6B6C80' }}>
            Loading map…
          </div>
        </div>
      </div>
    </div>
  );
}
