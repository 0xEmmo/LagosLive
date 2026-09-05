'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Mail, X, PartyPopper } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useLagosLiveStore } from '@/lib/store';

const STORAGE_KEY = 'll_newsletter_dismissed';
const SHOW_DELAY_MS = 15000;

export default function NewsletterModal() {
  const showToast = useLagosLiveStore((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Enter a valid email', 'We need a valid email to send you event updates.');
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('newsletter_subscribers')
        .upsert({ email: email.trim().toLowerCase(), first_name: firstName.trim() || null }, { onConflict: 'email', ignoreDuplicates: true });
      if (error) throw error;
      showToast("You're in!", 'Get ready for weekly event drops from Lagos Live.');
      close();
    } catch (err) {
      console.error('[newsletter] subscribe error', err);
      showToast('Could not subscribe', 'That email might already be subscribed. Try another.');
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-4 sm:items-center"
      style={{ background: 'rgba(5,5,10,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={close}
    >
      <div
        className="relative w-full max-w-[380px] animate-[modalUp_0.35s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden rounded-3xl p-6"
        style={{ background: '#12121C', border: '1px solid rgba(255,45,149,0.25)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#A7A8B5' }}
        >
          <X size={15} strokeWidth={2} />
        </button>

        <div
          className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', boxShadow: '0 10px 28px rgba(255,45,149,0.4)' }}
        >
          <Mail size={22} strokeWidth={2} color="#FFFFFF" />
        </div>

        <h2 className="font-display text-[24px] leading-none tracking-[0.5px]" style={{ color: '#FFFFFF' }}>
          Never miss the vibe
        </h2>
        <p className="mt-2 text-[13px] leading-[1.6]" style={{ color: '#A7A8B5' }}>
          Join the Lagos Live newsletter for this week&apos;s hottest parties, clubs &amp; festivals — straight to your inbox.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2.5">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name (optional)"
            className="w-full rounded-[11px] px-4 py-3 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
            autoComplete="email"
            className="w-full rounded-[11px] px-4 py-3 text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-[11px] py-3.5 text-[13px] font-bold uppercase tracking-[0.5px] transition-all duration-200 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#FF2D95,#8A2BE2)', color: '#FFFFFF', boxShadow: '0 10px 28px rgba(255,45,149,0.3)' }}
          >
            {isLoading ? <Loader2 size={15} strokeWidth={2.5} className="animate-spin" /> : <PartyPopper size={15} strokeWidth={2} />}
            {isLoading ? 'Subscribing…' : 'Subscribe'}
          </button>
        </form>

        <p className="mt-3.5 text-center text-[11px]" style={{ color: '#6B6C80' }}>
          No spam — just the best Lagos events. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}