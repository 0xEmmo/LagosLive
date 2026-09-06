'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, LifeBuoy, ShieldCheck } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { usePermissionGuard } from '@/components/ui/dashboard-ui';
import { supabase } from '@/lib/supabase/client';
import { fetchSupportMessages, createSupportMessage, updateSupportTicket, type SupportMessageRow, type TicketRow } from '@/lib/admin-queries';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  open: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  in_progress: { bg: 'rgba(176,106,255,0.12)', color: '#B06AFF' },
  resolved: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  closed: { bg: 'rgba(107,108,128,0.15)', color: '#6B6C80' },
};

const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  low: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  normal: { bg: 'rgba(167,168,181,0.12)', color: '#A7A8B5' },
  high: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  urgent: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

const CANNED_RESPONSES = [
  { label: 'We\'re looking into this', body: 'Thank you for reaching out. Our team is looking into this and we\'ll get back to you shortly.' },
  { label: 'Refund processing', body: 'Your refund request has been received and is being processed. You should see the refund within 5-7 business days.' },
  { label: 'Issue resolved', body: 'This issue has been resolved. Please let us know if you need any further assistance.' },
  { label: 'Need more info', body: 'Could you provide more details about this issue? This will help us resolve it faster.' },
];

export default function AdminTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, ready } = usePermissionGuard('support.view');
  const ticketId = Number(params.id);

  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    setStatus('loading');
    Promise.all([
      supabase.from('support_tickets').select('*').eq('id', ticketId).maybeSingle(),
      fetchSupportMessages(ticketId),
    ])
      .then(([ticketRes, msgs]) => {
        if (ticketRes.error) throw ticketRes.error;
        setTicket(ticketRes.data as TicketRow);
        setMessages(msgs);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, user, ticketId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !ticket) return;
    setSending(true);
    try {
      await createSupportMessage(ticket.id, newMessage.trim(), isInternal);
      const msgs = await fetchSupportMessages(ticket.id);
      setMessages(msgs);
      setNewMessage('');
      setIsInternal(false);
    } catch {
      /* silent */
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!ticket) return;
    try {
      await updateSupportTicket(ticket.id, { status: newStatus });
      setTicket({ ...ticket, status: newStatus });
    } catch {
      /* silent */
    }
  };

  const handleInsertCanned = (body: string) => {
    setNewMessage(body);
  };

  if (!ready || !user) return null;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[700px] p-5">
        <div className="mb-4 flex items-center gap-3">
          <Link href="/admin/support" className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#6B6C80' }}>
            <ArrowLeft size={14} /> Back
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <LifeBuoy size={16} color="#00F5D4" />
            <span className="font-heading text-[13px] font-bold" style={{ color: '#FFFFFF' }}>Ticket #{ticketId}</span>
          </div>
        </div>

        {status === 'loading' ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[80px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : status === 'error' || !ticket ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <div className="text-sm" style={{ color: '#A7A8B5' }}>Ticket not found.</div>
          </div>
        ) : (
          <>
            {/* Ticket header with controls */}
            <div className="mb-4 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 className="font-heading text-[16px] font-bold" style={{ color: '#FFFFFF' }}>{ticket.subject}</h2>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px]" style={{ color: '#6B6C80' }}>
                <span className="rounded-full px-2 py-0.5" style={{ background: PRIORITY_STYLE[ticket.priority]?.bg, color: PRIORITY_STYLE[ticket.priority]?.color }}>
                  {ticket.priority}
                </span>
                <span className="rounded-full px-2 py-0.5" style={{ background: STATUS_STYLE[ticket.status]?.bg, color: STATUS_STYLE[ticket.status]?.color }}>
                  {ticket.status.replace('_', ' ')}
                </span>
                <span>Category: {ticket.category}</span>
                <span>Created: {new Date(ticket.created_at).toLocaleDateString()}</span>
              </div>

              {/* Status controls */}
              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className="rounded-lg px-3 py-1.5 text-[10.5px] font-bold transition-all"
                    style={
                      ticket.status === s
                        ? { background: STATUS_STYLE[s].bg, color: STATUS_STYLE[s].color, border: `1px solid ${STATUS_STYLE[s].color}40` }
                        : { background: 'rgba(255,255,255,0.04)', color: '#6B6C80', border: '1px solid rgba(255,255,255,0.08)' }
                    }
                  >
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Original message */}
            <div className="mb-3 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.15)' }}>
                  <span className="text-[10px] font-bold" style={{ color: '#FF2D95' }}>U</span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>User</span>
                <span className="text-[10px]" style={{ color: '#6B6C80' }}>{new Date(ticket.created_at).toLocaleString()}</span>
              </div>
              <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#D5D6E0' }}>{ticket.body}</div>
            </div>

            {/* Messages thread */}
            <div className="flex flex-col gap-2">
              {messages.map((msg) => {
                const isStaffMsg = msg.author_id !== ticket.author_id;
                return (
                  <div
                    key={msg.id}
                    className="rounded-2xl p-4"
                    style={{
                      background: isStaffMsg ? 'rgba(0,245,212,0.04)' : 'rgba(255,45,149,0.06)',
                      border: `1px solid ${isStaffMsg ? 'rgba(0,245,212,0.12)' : 'rgba(255,45,149,0.15)'}`,
                      opacity: msg.is_internal ? 0.7 : 1,
                    }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-full"
                        style={{ background: isStaffMsg ? 'rgba(0,245,212,0.12)' : 'rgba(255,45,149,0.15)' }}
                      >
                        {isStaffMsg ? <ShieldCheck size={12} color="#00F5D4" /> : <span className="text-[10px] font-bold" style={{ color: '#FF2D95' }}>U</span>}
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>
                        {isStaffMsg ? 'Staff' : 'User'}
                      </span>
                      {msg.is_internal && (
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: 'rgba(255,214,0,0.12)', color: '#FFD600' }}>Internal</span>
                      )}
                      <span className="text-[10px]" style={{ color: '#6B6C80' }}>
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#D5D6E0' }}>
                      {msg.body}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Canned responses */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {CANNED_RESPONSES.map((cr) => (
                <button
                  key={cr.label}
                  onClick={() => handleInsertCanned(cr.body)}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-colors hover:bg-white/5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A7A8B5' }}
                >
                  {cr.label}
                </button>
              ))}
            </div>

            {/* Reply form */}
            <form onSubmit={handleSend} className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: '#6B6C80' }}>
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="accent-yellow-400"
                  />
                  Internal note
                </label>
              </div>
              <div className="flex gap-2">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={isInternal ? 'Internal note (only visible to staff)...' : 'Type your reply...'}
                  rows={3}
                  className="flex-1 resize-none rounded-xl px-4 py-3 text-[13px] outline-none"
                  style={{
                    background: isInternal ? 'rgba(255,214,0,0.04)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isInternal ? 'rgba(255,214,0,0.2)' : 'rgba(255,255,255,0.1)'}`,
                    color: '#FFFFFF',
                  }}
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="flex items-center justify-center self-end rounded-xl px-4 py-3 transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FF2D95, #8A2BE2)', color: '#FFFFFF' }}
                >
                  <Send size={16} strokeWidth={2.2} />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </AdminShell>
  );
}