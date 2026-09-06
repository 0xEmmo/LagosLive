'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ticket, Mail, KeyRound, Loader2 } from 'lucide-react';

// Guest ticket recovery form. Submits email + order reference to the
// rate-limited /api/tickets/find endpoint — it never reveals whether an order
// exists, and on success redirects to the token-gated ticket view.

export default function GuestFind() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim() || !orderRef.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/tickets/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), orderRef: orderRef.trim().toUpperCase() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; url?: string };
      if (res.ok && json.url) {
        router.push(json.url);
        return;
      }
      setMsg(json.error ?? 'We could not find a matching ticket. Check the details and try again.');
    } catch {
      setMsg('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col px-5 py-8">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(255,179,71,0.08)', border: '1px solid rgba(255,179,71,0.3)' }}>
          <Ticket size={30} strokeWidth={1.5} color="#FFB347" />
        </div>
        <h1 className="font-display mt-5 text-[28px] tracking-[0.5px]" style={{ color: '#FFFFFF' }}>Locate your ticket</h1>
        <p className="mt-2 max-w-[300px] text-sm" style={{ color: '#A7A8B5' }}>
          Enter the email you used to buy and the order reference from your payment confirmation.
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <div className="rounded-2xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>
            <Mail size={11} strokeWidth={2} /> Email
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full bg-transparent text-[14px] outline-none"
            style={{ color: '#FFFFFF' }}
          />
        </div>

        <div className="rounded-2xl px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color: '#6B6C80' }}>
            <KeyRound size={11} strokeWidth={2} /> Order reference
          </div>
          <input
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            placeholder="e.g. LL-XXXXXX"
            className="w-full bg-transparent text-[14px] uppercase outline-none"
            style={{ color: '#FFFFFF' }}
          />
        </div>

        <button
          type="submit"
          disabled={busy || !email.trim() || !orderRef.trim()}
          className="mt-1 flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #FFB347, #FF7A00)', color: '#0B0B10' }}
        >
          {busy ? <Loader2 size={16} strokeWidth={2.5} className="animate-spin" /> : 'Find my ticket'}
        </button>

        {msg && (
          <div className="rounded-2xl px-4 py-3 text-center text-[12.5px]" style={{ background: 'rgba(255,179,71,0.06)', border: '1px solid rgba(255,179,71,0.25)', color: '#FFD9A0' }}>
            {msg}
          </div>
        )}
      </form>

      <div className="mt-8 text-center text-[12px]" style={{ color: '#6B6C80' }}>
        Can&apos;t find it?{' '}
        <Link href="/support" className="font-semibold hover:underline" style={{ color: '#FFB347' }}>
          Contact support
        </Link>
      </div>
    </div>
  );
}