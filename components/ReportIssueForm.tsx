'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Send, CheckCircle } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';

const CATEGORIES = [
  { value: 'event', label: 'Event Issue' },
  { value: 'payments', label: 'Payments' },
  { value: 'refund', label: 'Refund' },
  { value: 'account', label: 'Account' },
  { value: 'technical', label: 'Technical' },
  { value: 'general', label: 'General' },
];

export default function ReportIssueForm() {
  const user = useLagosLiveStore((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [reference, setReference] = useState('');
  const [category, setCategory] = useState('event');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setError('Please fill in your name, email, subject and message.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/report-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, reference, category, subject, message }),
      });
      const data = (await res.json()) as { ok?: boolean; ticketId?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not submit your report. Please try again.');
      setTicketId(data.ticketId ?? null);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        className="flex flex-col items-center gap-4 rounded-2xl px-8 py-12 text-center"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <CheckCircle size={40} color="#00F5D4" />
        <div className="font-heading text-[18px] font-bold" style={{ color: '#FFFFFF' }}>
          Report received
        </div>
        <div className="text-[13px] leading-[1.7]" style={{ color: '#A7A8B5' }}>
          Thanks for flagging this. Our team will review your report and follow up by email.
          {ticketId != null && (
            <>
              <br />
              Reference <span className="font-semibold" style={{ color: '#FFFFFF' }}>#{ticketId}</span>
            </>
          )}
        </div>
        <Link
          href="/"
          className="mt-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
        >
          Back home
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Your name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="w-full rounded-xl px-4 py-3 text-[13px] outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            maxLength={120}
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl px-4 py-3 text-[13px] outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            maxLength={200}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
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

        <Field label="Order reference (optional)">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. LL-XXXXXX"
            className="w-full rounded-xl px-4 py-3 text-[13px] outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            maxLength={120}
          />
        </Field>
      </div>

      <Field label="Subject">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary of the issue"
          className="w-full rounded-xl px-4 py-3 text-[13px] outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
          maxLength={200}
        />
      </Field>

      <Field label="What happened?">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Share as much detail as you can — what you expected and what actually happened."
          rows={6}
          className="w-full resize-none rounded-xl px-4 py-3 text-[13px] outline-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
          maxLength={5000}
        />
      </Field>

      {error && (
        <div
          className="flex items-start gap-2 rounded-xl px-4 py-2.5 text-[12px]"
          style={{ background: 'rgba(255,45,149,0.1)', border: '1px solid rgba(255,45,149,0.25)', color: '#FF2D95' }}
        >
          <AlertTriangle size={14} className="mt-[1px] flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #FF2D95, #8A2BE2)', color: '#FFFFFF' }}
      >
        <Send size={15} strokeWidth={2.2} />
        {submitting ? 'Submitting...' : 'Submit report'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.9px]" style={{ color: '#6B6C80' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
