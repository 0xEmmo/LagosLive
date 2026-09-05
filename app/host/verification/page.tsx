'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Clock, CheckCircle2, XCircle, AlertTriangle, Loader2, Building2, Link2 } from 'lucide-react';
import BackButton from '@/components/BackButton';
import HostBottomNav from '@/components/HostBottomNav';
import { useLagosLiveStore, type User } from '@/lib/store';

type VerifStatus = User['hostVerificationStatus'];

const STATUS_META: Record<VerifStatus, { label: string; bg: string; color: string; icon: 'check' | 'clock' | 'x' | 'off' }> = {
  unverified: { label: 'Not verified', bg: 'rgba(255,214,0,0.08)', color: '#FFD600', icon: 'off' },
  pending: { label: 'Pending review', bg: 'rgba(176,106,255,0.1)', color: '#B06AFF', icon: 'clock' },
  verified: { label: 'Verified host', bg: 'rgba(0,245,212,0.08)', color: '#00F5D4', icon: 'check' },
  rejected: { label: 'Rejected', bg: 'rgba(255,138,0,0.08)', color: '#FF8A00', icon: 'x' },
};

function StatusIcon({ kind }: { kind: (typeof STATUS_META)[VerifStatus]['icon'] }) {
  if (kind === 'check') return <CheckCircle2 size={18} strokeWidth={2.2} color="#00F5D4" />;
  if (kind === 'clock') return <Clock size={18} strokeWidth={2.2} color="#B06AFF" />;
  if (kind === 'x') return <XCircle size={18} strokeWidth={2.2} color="#FF8A00" />;
  return <ShieldCheck size={18} strokeWidth={2.2} color="#FFD600" />;
}

export default function HostVerificationPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const refreshUser = useLagosLiveStore((s) => s.refreshUser);
  const showToast = useLagosLiveStore((s) => s.showToast);

  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fhost%2Fverification');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) {
      setBusinessName(user.businessName ?? '');
      setWebsite(user.website ?? '');
    }
  }, [user]);

  const status = user?.hostVerificationStatus ?? 'unverified';
  const meta = STATUS_META[status];
  const canRequest = status === 'unverified' || status === 'rejected';
  const suspended = user?.accountStatus === 'suspended' || user?.accountStatus === 'banned';

  const submit = async () => {
    if (!businessName.trim()) {
      setError('Add a business name so we know who operates your events.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/host/verification/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: businessName, website }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Could not submit your request.');
      await refreshUser();
      showToast('Request submitted', 'Our team will review your details shortly.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={26} strokeWidth={2} color="#FF9B3E" className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[520px] animate-fade-in pb-24">
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px] backdrop-saturate-150" style={{ background: 'var(--c-header)', borderColor: 'rgba(255,255,255,0.04)' }}>
        <BackButton href="/host" />
        <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Host Verification</span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {/* Status hero */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: meta.bg, border: '1px solid rgba(255,255,255,0.08)' }}>
              <StatusIcon kind={meta.icon} />
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-bold" style={{ color: '#FFFFFF' }}>{meta.label}</div>
              {status === 'verified' && user.businessName && (
                <div className="text-[12px]" style={{ color: '#A7A8B5' }}>{user.businessName}{user.website ? ` · ${user.website}` : ''}</div>
              )}
            </div>
          </div>

          {status === 'verified' && (
            <div className="mt-4 rounded-xl p-3.5 text-[12.5px] leading-[1.6]" style={{ background: 'rgba(0,245,212,0.06)', border: '1px solid rgba(0,245,212,0.16)', color: '#A7A8B5' }}>
              <span style={{ color: '#00F5D4', fontWeight: 700 }}>✓ Verified Host.</span> Your events carry the verified badge, and you can request payouts.
            </div>
          )}

          {status === 'pending' && (
            <div className="mt-4 rounded-xl p-3.5 text-[12.5px] leading-[1.6]" style={{ background: 'rgba(176,106,255,0.06)', border: '1px solid rgba(176,106,255,0.18)', color: '#A7A8B5' }}>
              We&apos;re reviewing <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{user.businessName ?? 'your details'}</span>. You&apos;ll get an update by email — usually within a business day.
            </div>
          )}

          {status === 'rejected' && user.hostVerificationReason && (
            <div className="mt-4 rounded-xl border p-3.5 text-[12.5px] leading-[1.6]" style={{ background: 'rgba(255,138,0,0.06)', borderColor: 'rgba(255,138,0,0.2)', color: '#A7A8B5' }}>
              <span style={{ color: '#FF8A00', fontWeight: 700 }}>Why:</span> {user.hostVerificationReason}
            </div>
          )}

          {suspended && (
            <div className="mt-4 rounded-xl border p-3.5 text-[12.5px] leading-[1.6]" style={{ background: 'rgba(255,90,46,0.07)', borderColor: 'rgba(255,90,46,0.2)', color: '#A7A8B5' }}>
              <span className="flex items-center gap-1.5" style={{ color: '#FF5A2E', fontWeight: 700 }}><AlertTriangle size={13} strokeWidth={2.2} /> Account suspended</span>
              Your account is suspended. Contact <Link href="mailto:support@lagoslive.ng" className="underline">support@lagoslive.ng</Link>.
            </div>
          )}
        </div>

        {/* Why verify */}
        <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-2.5 text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Why verify?</div>
          <ul className="flex flex-col gap-2 text-[12.5px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
            <li className="flex gap-2"><span style={{ color: '#FF9B3E' }}>1.</span> The <span style={{ color: '#00F5D4' }}>✓ Verified Host</span> badge shows buyers you&apos;re a real operator.</li>
            <li className="flex gap-2"><span style={{ color: '#FF9B3E' }}>2.</span> Only verified, active hosts can request payouts.</li>
            <li className="flex gap-2"><span style={{ color: '#FF9B3E' }}>3.</span> Approved events from verified hosts get reviewed first.</li>
          </ul>
        </div>

        {/* Request form */}
        {canRequest && !suspended && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="mb-3 text-[13px] font-bold" style={{ color: '#FFFFFF' }}>
              {status === 'rejected' ? 'Re-apply for verification' : 'Request verification'}
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Business name</label>
                <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Building2 size={14} color="#6B6C80" />
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Waka Waka Events" className="w-full bg-transparent text-[13px] outline-none" style={{ color: '#FFFFFF' }} />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>Website or social link (optional)</label>
                <div className="flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Link2 size={14} color="#6B6C80" />
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://instagram.com/..." className="w-full bg-transparent text-[13px] outline-none" style={{ color: '#FFFFFF' }} />
                </div>
              </div>
              {error && <div className="text-[12px]" style={{ color: '#FF8A00' }}>{error}</div>}
              <button onClick={submit} disabled={submitting} className="w-full rounded-xl py-3 text-[13px] font-bold transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #FF9B3E, #FF6A00)', color: '#FFFFFF', boxShadow: '0 6px 24px rgba(255,106,0,0.25)' }}>
                {submitting ? 'Submitting...' : 'Submit for review'}
              </button>
            </div>
          </div>
        )}
      </div>
      <HostBottomNav />
    </div>
  );
}