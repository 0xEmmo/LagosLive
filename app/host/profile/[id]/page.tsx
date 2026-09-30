import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Globe, Instagram, Music2, ShieldCheck } from 'lucide-react';
import PartyCard from '@/components/PartyCard';
import { createServerSupabase } from '@/lib/supabase/server';
import { partyFromRow } from '@/lib/party-server';
import { hostInitials, type PublicHostProfile } from '@/lib/host-profile';
import type { Party } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadHost(id: string): Promise<{ profile: PublicHostProfile; events: Party[] } | null> {
  const supabase = createServerSupabase();
  const { data: profileData, error: profileError } = await (supabase as any).rpc('get_public_host_profile', { p_host_id: id });
  if (profileError || !profileData?.id) return null;
  const profile: PublicHostProfile = {
    id: String(profileData.id), name: String(profileData.name), bio: profileData.bio ?? null,
    avatarUrl: profileData.avatar_url ?? null, instagramUrl: profileData.instagram_url ?? null,
    tiktokUrl: profileData.tiktok_url ?? null, xUrl: profileData.x_url ?? null,
    websiteUrl: profileData.website_url ?? null, isVerified: profileData.is_verified === true,
  };
  const { data: eventRows } = await supabase.from('parties').select('*').eq('created_by', id).eq('status', 'approved').is('cancelled_at', null).order('starts_at', { ascending: false });
  return { profile, events: (eventRows ?? []).map((row) => partyFromRow(row)) };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const data = await loadHost(params.id);
  if (!data) return {};
  return { title: `${data.profile.name} — Lagos Live`, description: data.profile.bio || `Discover events hosted by ${data.profile.name} on Lagos Live.` };
}

export default async function HostProfilePage({ params }: { params: { id: string } }) {
  const data = await loadHost(params.id);
  if (!data) notFound();
  const { profile, events } = data;
  const now = Date.now();
  const upcoming = events.filter((event) => new Date(event.startsAt).getTime() >= now);
  const past = events.filter((event) => new Date(event.startsAt).getTime() < now);
  const socials = [
    profile.instagramUrl ? { href: profile.instagramUrl.startsWith('http') ? profile.instagramUrl : `https://instagram.com/${profile.instagramUrl.replace(/^@/, '')}`, label: 'Instagram', icon: <Instagram size={16} /> } : null,
    profile.tiktokUrl ? { href: profile.tiktokUrl.startsWith('http') ? profile.tiktokUrl : `https://tiktok.com/@${profile.tiktokUrl.replace(/^@/, '')}`, label: 'TikTok', icon: <Music2 size={16} /> } : null,
    profile.xUrl ? { href: profile.xUrl.startsWith('http') ? profile.xUrl : `https://x.com/${profile.xUrl.replace(/^@/, '')}`, label: 'X', icon: <span className="text-sm font-bold">𝕏</span> } : null,
    profile.websiteUrl ? { href: profile.websiteUrl.startsWith('http') ? profile.websiteUrl : `https://${profile.websiteUrl}`, label: 'Website', icon: <Globe size={16} /> } : null,
  ].filter(Boolean) as Array<{ href: string; label: string; icon: ReactNode }>;

  return (
    <main className="mx-auto min-h-screen max-w-[900px] px-5 pb-16 pt-5">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm" style={{ color: '#A7A8B5' }}><ArrowLeft size={16} /> Back to events</Link>
      <section className="rounded-3xl p-6 md:p-8" style={{ background: 'linear-gradient(135deg, rgba(43,104,255,0.18), rgba(0,245,212,0.06) 55%, rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: 'linear-gradient(135deg, #2B68FF, #00D9FF)', color: '#FFFFFF' }}>
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt={`${profile.name} profile`} className="h-full w-full object-cover" /> : <span className="text-3xl font-bold">{hostInitials(profile.name)}</span>}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl tracking-[0.5px]" style={{ color: '#FFFFFF' }}>{profile.name}</h1>
              {profile.isVerified && <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase" style={{ background: 'rgba(0,245,212,0.12)', color: '#00F5D4' }}><ShieldCheck size={12} /> Verified Host</span>}
            </div>
            <p className="mt-2 max-w-[650px] text-sm leading-relaxed" style={{ color: '#C5C7D3' }}>{profile.bio || 'Creating memorable experiences in Lagos.'}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px]" style={{ color: '#A7A8B5' }}><span className="inline-flex items-center gap-1.5"><CalendarDays size={14} color="#79A3FF" /> {upcoming.length} upcoming</span><span>{events.length} hosted event{events.length === 1 ? '' : 's'}</span></div>
            {socials.length > 0 && <div className="mt-4 flex gap-2">{socials.map((social) => <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'rgba(255,255,255,0.1)', color: '#FFFFFF' }}>{social.icon}</a>)}</div>}
          </div>
        </div>
      </section>
      <section className="mt-10"><h2 className="mb-4 text-[12px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>Upcoming events</h2>{upcoming.length > 0 ? <div className="grid gap-4 sm:grid-cols-2">{upcoming.map((event) => <PartyCard key={event.id} party={event} index={event.id} />)}</div> : <div className="rounded-2xl p-6 text-sm" style={{ background: 'rgba(255,255,255,0.03)', color: '#6B6C80' }}>No upcoming events listed yet.</div>}</section>
      {past.length > 0 && <section className="mt-10"><h2 className="mb-4 text-[12px] font-bold uppercase tracking-[1.5px]" style={{ color: '#A7A8B5' }}>Previous events</h2><div className="grid gap-4 sm:grid-cols-2">{past.map((event) => <PartyCard key={event.id} party={event} index={event.id} />)}</div></section>}
    </main>
  );
}
