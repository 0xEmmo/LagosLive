'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LifeBuoy, Send, ArrowLeft, CheckCircle } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'payments', label: 'Payments' },
  { value: 'event', label: 'Event Issue' },
  { value: 'account', label: 'Account' },
  { value: 'refund', label: 'Refund' },
  { value: 'technical', label: 'Technical' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function SupportPage() {
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('support_tickets').insert({
        author_id: user?.id ?? null,
        subject: subject.trim(),
        body: body.trim(),
        category,
        priority,
      });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit ticket. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-5" style={{ background: '#07070B' }}>
        <div className="flex flex-col items-center gap-4 rounded-2xl px-8 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 400, width: '100%' }}>
          <CheckCircle size={40} color="#00F5D4" />
          <div className="font-heading text-[18px] font-bold" style={{ color: '#FFFFFF' }}>Ticket Submitted</div>
          <div className="text-[13px]" style={{ color: '#A7A8B5' }}>
            We&apos;ve received your request and will get back to you shortly. You can track the status in your profile.
          </div>
          <div className="flex gap-2 mt-2">
            <Link
              href="/"
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
            >
              Home
            </Link>
            <Link
              href="/support"
              onClick={() => { setSubmitted(false); setSubject(''); setBody(''); }}
              className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
              style={{ background: 'rgba(255,45,149,0.12)', border: '1px solid rgba(255,45,149,0.3)', color: '#FF2D95' }}
            >
              New Ticket
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#07070B' }}>
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px]" style={{ background: 'rgba(7,7,11,0.85)', borderColor: 'rgba(255,255,255,0.04)' }}>
        <Link href="/" className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#6B6C80' }}>
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="flex items-center gap-2 ml-3">
          <LifeBuoy size={16} color="#00F5D4" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>Support</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[520px] flex-1 p-5">
        <div className="mb-5">
          <h1 className="font-heading text-[20px] font-bold" style={{ color: '#FFFFFF' }}>Get Help</h1>
          <p className="mt-1 text-[13px]" style={{ color: '#A7A8B5' }}>Submit a support ticket and our team will respond as soon as possible.</p>
        </div>

        {!user && (
          <div className="mb-4 rounded-xl px-4 py-3 text-[12px]" style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', color: '#FFD600' }}>
            You&apos;re submitting as a guest. <Link href="/login" className="font-semibold underline">Sign in</Link> to track your ticket status.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
              className="w-full rounded-xl px-4 py-3 text-[13px] outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              maxLength={200}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-[13px] outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-[13px] outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Message">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe your issue in detail..."
              rows={6}
              className="w-full resize-none rounded-xl px-4 py-3 text-[13px] outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            />
          </Field>

          {error && (
            <div className="rounded-xl px-4 py-2.5 text-[12px]" style={{ background: 'rgba(255,45,149,0.1)', border: '1px solid rgba(255,45,149,0.25)', color: '#FF2D95' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #FF2D95, #8A2BE2)', color: '#FFFFFF' }}
          >
            <Send size={15} strokeWidth={2.2} />
            {submitting ? 'Submitting...' : 'Submit Ticket'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>{label}</label>
      {children}
    </div>
  );
}
