import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

// Shared shell for Lagos Live's public informational pages (payouts, policies,
// about, terms, cookies). Server-safe: no hooks or browser APIs, so pages can
// export their own `metadata` and render this directly.
export function InfoPage({
  eyebrow,
  title,
  subtitle,
  updated,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="animate-fade-in">
      <section className="w-full px-5 pb-8 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto max-w-[820px]">
          {eyebrow && (
            <div
              className="mb-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <span className="text-[10px] font-bold uppercase tracking-[1.2px]" style={{ color: '#A7A8B5' }}>
                {eyebrow}
              </span>
            </div>
          )}
          <h1 className="font-display text-[40px] leading-[1] tracking-[1px] md:text-[54px]" style={{ color: '#FFFFFF' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-[640px] text-[15px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
              {subtitle}
            </p>
          )}
          {updated && (
            <p className="mt-3 text-[12px]" style={{ color: '#6B6C80' }}>
              Last updated {updated}
            </p>
          )}
        </div>
      </section>

      <section className="w-full px-5 pb-20 md:px-8">
        <div className="mx-auto flex max-w-[820px] flex-col gap-5">{children}</div>
      </section>
    </main>
  );
}

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="rounded-[20px] p-6 md:p-7"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <h2 className="font-heading mb-3 text-[17px] font-bold" style={{ color: '#FFFFFF' }}>
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-[14px] leading-[1.85]" style={{ color: '#A7A8B5' }}>
        {children}
      </div>
    </section>
  );
}

export function InfoList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[14px] leading-[1.7]" style={{ color: '#C9CAD6' }}>
          <Check size={15} strokeWidth={2.5} className="mt-[3px] flex-shrink-0" style={{ color: '#00F5D4' }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-[14px] px-4 py-3 text-[13.5px] leading-[1.7]"
      style={{ background: 'rgba(0,245,212,0.06)', border: '1px solid rgba(0,245,212,0.2)', color: '#C9CAD6' }}
    >
      {children}
    </div>
  );
}

export function InfoContact({ email }: { email: string }) {
  return (
    <section
      className="rounded-[20px] p-6 md:p-7"
      style={{ background: 'linear-gradient(160deg, rgba(255,45,149,0.08), rgba(138,43,226,0.06))', border: '1px solid rgba(255,45,149,0.28)' }}
    >
      <h2 className="font-heading mb-2 text-[17px] font-bold" style={{ color: '#FFFFFF' }}>
        Questions?
      </h2>
      <p className="text-[14px] leading-[1.85]" style={{ color: '#A7A8B5' }}>
        Reach the Lagos Live team at{' '}
        <a href={`mailto:${email}`} className="font-semibold underline" style={{ color: '#00BFFF' }}>
          {email}
        </a>
        .
      </p>
    </section>
  );
}
