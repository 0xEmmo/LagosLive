'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, LifeBuoy } from 'lucide-react';
import { useLagosLiveStore } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import { fetchSupportMessages, createSupportMessage, type SupportMessageRow, type TicketRow } from '@/lib/admin-queries';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  open: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  in_progress: { bg: 'rgba(176,106,255,0.12)', color: '#B06AFF' },
  resolved: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  closed: { bg: 'rgba(107,108,128,0.15)', color: '#6B6C80' },
};

export default function SupportTicketPage() {
  const params = useParams();
  const router = useRouter();
  const user = useLagosLiveStore((s) => s.user);
  const authLoading = useLagosLiveStore((s) => s.authLoading);
  const ticketId = Number(params.id);

  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login?next=%2Fsupport');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !ticketId) return;
    setStatus('loading');
    Promise.all([
      supabase.from('support_tickets').select('*').eq('id', ticketId).maybeSingle(),
      fetchSupportMessages(ticketId),
    ])
      .then(([ticketRes, msgs]) => {
        if (ticketRes.error) throw ticketRes.error;
        if (!ticketRes.data) { setStatus('error'); return; }
        // Access check: author or staff
        const t = ticketRes.data as TicketRow;
        const isAuthor = t.author_id === user.id;
        const isStaff = ['support', 'admin', 'super_admin'].includes(user.role);
        if (!isAuthor && !isStaff) { setStatus('error'); return; }
        setTicket(t);
        setMessages(msgs);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [user, ticketId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !ticket) return;
    setSending(true);
    try {
      await createSupportMessage(ticket.id, newMessage.trim(), false);
      // Re-fetch messages
      const msgs = await fetchSupportMessages(ticket.id);
      setMessages(msgs);
      setNewMessage('');
    } catch {
      /* silent */
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#07070B' }}>
      <div className="sticky top-0 z-40 flex items-center gap-3 border-b px-5 py-3.5 backdrop-blur-[22px]" style={{ background: 'rgba(7,7,11,0.85)', borderColor: 'rgba(255,255,255,0.04)' }}>
        <Link href="/support" className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: '#6B6C80' }}>
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="flex items-center gap-2 ml-3">
          <LifeBuoy size={16} color="#00F5D4" />
          <span className="font-heading text-[13px] font-bold uppercase tracking-[1px]" style={{ color: '#FFFFFF' }}>
            Ticket #{ticketId}
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[600px] flex-1 flex flex-col p-5">
        {status === 'loading' ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[80px] animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,138,0,0.2)' }}>
            <div className="text-sm" style={{ color: '#A7A8B5' }}>Ticket not found or access denied.</div>
          </div>
        ) : ticket ? (
          <>
            {/* Ticket header */}
            <div className="mb-4 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-heading text-[16px] font-bold" style={{ color: '#FFFFFF' }}>{ticket.subject}</h2>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
                  style={{ background: STATUS_STYLE[ticket.status]?.bg ?? 'rgba(107,108,128,0.15)', color: STATUS_STYLE[ticket.status]?.color ?? '#6B6C80' }}
                >
                  {ticket.status.replace('_', ' ')}
                </span>
              </div>
              <div className="mt-2 flex gap-3 text-[11px]" style={{ color: '#6B6C80' }}>
                <span>Category: {ticket.category}</span>
                <span>Priority: {ticket.priority}</span>
                <span>Created: {new Date(ticket.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Original message */}
            <div className="mb-3 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: 'rgba(255,45,149,0.15)' }}>
                  <span className="text-[10px] font-bold" style={{ color: '#FF2D95' }}>U</span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>You</span>
                <span className="text-[10px]" style={{ color: '#6B6C80' }}>{new Date(ticket.created_at).toLocaleString()}</span>
              </div>
              <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: '#D5D6E0' }}>{ticket.body}</div>
            </div>

            {/* Messages */}
            <div className="flex flex-1 flex-col gap-2">
              {messages.map((msg) => {
                const isOwn = msg.author_id === user.id;
                const isStaff = msg.author_id !== user.id;
                return (
                  <div
                    key={msg.id}
                    className="rounded-2xl p-4"
                    style={{
                      background: isOwn ? 'rgba(255,45,149,0.06)' : 'rgba(0,245,212,0.04)',
                      border: `1px solid ${isOwn ? 'rgba(255,45,149,0.15)' : 'rgba(0,245,212,0.12)'}`,
                    }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-full"
                        style={{ background: isOwn ? 'rgba(255,45,149,0.15)' : 'rgba(0,245,212,0.12)' }}
                      >
                        <span className="text-[10px] font-bold" style={{ color: isOwn ? '#FF2D95' : '#00F5D4' }}>
                          {isOwn ? 'U' : 'S'}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: '#A7A8B5' }}>
                        {isOwn ? 'You' : 'Support'}
                      </span>
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

            {/* Reply form */}
            {ticket.status !== 'closed' && (
              <form onSubmit={handleSend} className="mt-4 flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your reply..."
                  className="flex-1 rounded-xl px-4 py-3 text-[13px] outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="flex items-center justify-center rounded-xl px-4 py-3 transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FF2D95, #8A2BE2)', color: '#FFFFFF' }}
                >
                  <Send size={16} strokeWidth={2.2} />
                </button>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
