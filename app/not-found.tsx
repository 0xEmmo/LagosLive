import Link from 'next/link';
import { CalendarX2 } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full"
        style={{ background: 'rgba(255,90,46,0.08)', border: '1px solid rgba(255,90,46,0.18)' }}
      >
        <CalendarX2 size={32} strokeWidth={1.5} color="#FF5A2E" />
      </div>
      <div className="font-display text-[40px] tracking-[1px]" style={{ color: '#FFFFFF' }}>
        Party Not Found
      </div>
      <div className="max-w-[280px] text-sm" style={{ color: '#A7A8B5' }}>
        This event has sold out, been removed, or the link is wrong. Let&apos;s get you back to the night.
      </div>
      <Link href="/" className="btn-primary px-7 py-3 text-sm font-semibold">
        Back Home
      </Link>
    </div>
  );
}
