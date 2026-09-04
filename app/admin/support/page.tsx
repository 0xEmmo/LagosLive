'use client';

import { useEffect, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, Badge, TableShell, Cell, LoadingBlock, ErrorBlock, EmptyBlock, useRoleGuard } from '@/components/ui/dashboard-ui';
import { fetchSupportTickets, updateSupportTicket, type TicketRow } from '@/lib/admin-queries';

const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  low: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  normal: { bg: 'rgba(167,168,181,0.12)', color: '#A7A8B5' },
  high: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  urgent: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  open: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
  in_progress: { bg: 'rgba(176,106,255,0.12)', color: '#B06AFF' },
  resolved: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  closed: { bg: 'rgba(107,108,128,0.15)', color: '#6B6C80' },
};

const NEXT_STATUS: Record<string, string> = {
  open: 'in_progress',
  in_progress: 'resolved',
};

const ACTION_LABEL: Record<string, string> = {
  open: 'Start',
  in_progress: 'Resolve',
};

export default function SupportPage() {
  const { user, ready } = useRoleGuard('support');
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    fetchSupportTickets()
      .then((t) => {
        setTickets(t);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  if (!ready || !user) return null;

  const handleAdvance = async (ticket: TicketRow) => {
    const next = NEXT_STATUS[ticket.status];
    if (!next) return;
    try {
      await updateSupportTicket(ticket.id, { status: next });
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, status: next } : t)));
    } catch {
      /* silent */
    }
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Support Tickets"
          subtitle="Manage and resolve user issues"
          right={
            <div className="flex items-center gap-2">
              <LifeBuoy size={16} color="#00F5D4" />
              <span className="text-[12px] font-semibold" style={{ color: '#A7A8B5' }}>{tickets.filter((t) => t.status === 'open').length} open</span>
            </div>
          }
        />

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load support tickets." onRetry={() => setAttempt((a) => a + 1)} />
        ) : tickets.length === 0 ? (
          <EmptyBlock title="No tickets" subtitle="Support tickets from users will appear here." />
        ) : (
          <TableShell head={['Subject', 'Category', 'Priority', 'Status', 'Updated', 'Action']}>
            {tickets.map((t) => (
              <tr key={t.id}>
                <Cell>{t.subject}</Cell>
                <Cell>{t.category || '—'}</Cell>
                <Cell>
                  <Badge
                    label={t.priority}
                    bg={PRIORITY_STYLE[t.priority]?.bg ?? 'rgba(107,108,128,0.15)'}
                    color={PRIORITY_STYLE[t.priority]?.color ?? '#6B6C80'}
                  />
                </Cell>
                <Cell>
                  <Badge
                    label={t.status.replace('_', ' ')}
                    bg={STATUS_STYLE[t.status]?.bg ?? 'rgba(107,108,128,0.15)'}
                    color={STATUS_STYLE[t.status]?.color ?? '#6B6C80'}
                  />
                </Cell>
                <Cell>{new Date(t.updated_at).toLocaleDateString()}</Cell>
                <Cell>
                  {ACTION_LABEL[t.status] && (
                    <button
                      onClick={() => handleAdvance(t)}
                      className="rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
                      style={{ background: 'rgba(255,45,149,0.12)', border: '1px solid rgba(255,45,149,0.3)', color: '#FF2D95' }}
                    >
                      {ACTION_LABEL[t.status]}
                    </button>
                  )}
                </Cell>
              </tr>
            ))}
          </TableShell>
        )}
      </div>
    </AdminShell>
  );
}
