'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';
import type { HostVerificationStatus } from '@/lib/host-verification-types';

export default function ReviewForm({
  userId,
  businessName,
  status,
  canVerify,
}: {
  userId: string;
  businessName: string;
  status: HostVerificationStatus;
  canVerify: boolean;
}) {
  const router = useRouter();
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!canVerify) {
    return (
      <div className="text-[12.5px]" style={{ color: '#A7A8B5' }}>
        View-only access. To approve or reject this application you need the hosts.verify permission.
      </div>
    );
  }

  if (status !== 'pending' && status !== 'rejected' && status !== 'resubmit_requested') {
    return (
      <div className="text-[12.5px]" style={{ color: '#A7A8B5' }}>
        This request is already resolved and no longer needs a review decision.
      </div>
    );
  }

  const submit = async (decision: 'verify' | 'reject') => {
    if (busy) return;
    const finalReason = decision === 'reject' ? reason.trim() : '';
    if (decision === 'reject') {
      if (!finalReason) {
        setError('Add a reason before rejecting — the host will see it.');
        return;
      }
      if (!window.confirm(`Reject ${businessName}'s verification?\n\nThe host will see: ${finalReason}`)) return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/host-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, decision, reason: decision === 'reject' ? finalReason : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      showToast(decision === 'verify' ? 'Host verified' : 'Verification rejected', `${businessName} updated.`);
      router.push('/admin/host-verification');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: 'rgba(255,45,149,0.08)', border: '1px solid rgba(255,45,149,0.25)', color: '#FF2D95' }}>
          {error}
        </div>
      )}

      {rejecting && (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            disabled={busy}
            placeholder="Reason the host will see (required to reject)..."
            className="w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => submit('reject')}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
              style={{ background: 'rgba(255,45,149,0.1)', borderColor: 'rgba(255,45,149,0.35)', color: '#FF2D95' }}
            >
              <X size={13} /> {busy ? 'Rejecting...' : 'Confirm rejection'}
            </button>
            <button
              onClick={() => {
                setRejecting(false);
                setReason('');
                setError('');
              }}
              disabled={busy}
              className="rounded-[9px] border px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!rejecting && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => submit('verify')}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'rgba(0,245,212,0.08)', borderColor: 'rgba(0,245,212,0.3)', color: '#00F5D4' }}
          >
            <Check size={13} /> {busy ? 'Working...' : 'Approve'}
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: 'rgba(255,45,149,0.1)', borderColor: 'rgba(255,45,149,0.35)', color: '#FF2D95' }}
          >
            <X size={13} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}