'use client';

import Link from 'next/link';
import { Instagram, ExternalLink, ShieldCheck, Music2 } from 'lucide-react';
import type { PublicHostProfile } from '@/lib/host-profile';
import { hostInitials, hostProfilePath } from '@/lib/host-profile';

export default function HostProfileCard({ profile, compact = false }: { profile: PublicHostProfile; compact?: boolean }) {
  const socials = [
    profile.instagramUrl ? { href: profile.instagramUrl.startsWith('http') ? profile.instagramUrl : `https://instagram.com/${profile.instagramUrl.replace(/^@/, '')}`, label: 'Instagram', icon: <Instagram size={14} /> } : null,
    profile.tiktokUrl ? { href: profile.tiktokUrl.startsWith('http') ? profile.tiktokUrl : `https://tiktok.com/@${profile.tiktokUrl.replace(/^@/, '')}`, label: 'TikTok', icon: <Music2 size={14} /> } : null,
    profile.xUrl ? { href: profile.xUrl.startsWith('http') ? profile.xUrl : `https://x.com/${profile.xUrl.replace(/^@/, '')}`, label: 'X', icon: <span className="text-[13px] font-bold">𝕏</span> } : null,
  ].filter(Boolean) as Array<{ href: string; label: string; icon: React.ReactNode }>;

  return (
    <div className={`rounded-2xl ${compact ? 'p-4' : 'p-5'}`} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <div className="flex items-start gap-3.5">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: 'linear-gradient(135deg, #2B68FF, #00D9FF)', color: '#FFFFFF' }}>
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt={`${profile.name} profile`} className="h-full w-full object-cover" /> : <span className="text-lg font-bold">{hostInitials(profile.name)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={hostProfilePath(profile.id)} className="truncate text-[15px] font-bold hover:underline" style={{ color: '#FFFFFF' }}>{profile.name}</Link>
            {profile.isVerified && <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.5px]" style={{ background: 'rgba(43,104,255,0.18)', color: '#8EACFF' }}><ShieldCheck size={11} /> Verified Host</span>}
          </div>
          <p className={`mt-1.5 text-[13px] leading-[1.6] ${compact ? 'line-clamp-2' : ''}`} style={{ color: '#A7A8B5' }}>{profile.bio || 'Creating memorable experiences in Lagos.'}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {socials.map((social) => <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: '#D5D6E0' }}>{social.icon}</a>)}
        </div>
        <Link href={hostProfilePath(profile.id)} className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#79A3FF' }}>View host profile <ExternalLink size={13} /></Link>
      </div>
    </div>
  );
}
