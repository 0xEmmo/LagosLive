'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ href, label = 'Back' }: { href?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (href ? router.push(href) : router.back())}
      className="flex items-center gap-1.5 rounded-[10px] border px-3.5 py-2 text-[13px] font-medium"
      style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border3)', color: 'var(--c-text-muted)' }}
    >
      <ArrowLeft size={13} strokeWidth={2.5} />
      {label}
    </button>
  );
}
