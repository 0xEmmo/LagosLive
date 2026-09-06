'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LifeBuoy, ExternalLink, Settings, Search } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, Badge, TableShell, Cell, LoadingBlock, ErrorBlock, EmptyBlock, usePermissionGuard } from '@/components/ui/dashboard-ui';
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

const STATUS_FILTERS = ['all', 'open', 'in_progress', 'resolved', 'closed'];

export default function SupportPage() {
  const { user, ready } = usePermissionGuard('support.view');
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const filtered = tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.subject.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const statusCounts = STATUS_FILTERS.reduce((acc, s) => {
    acc[s] = s === 'all' ? tickets.length : tickets.filter((t) => t.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Support Tickets"
          subtitle="Manage and resolve user issues"
          right={
            <div className="flex items-center gap-2">
              <Link
                href="/admin/support/settings"
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#A7A8B5' }}
              >
                <Settings size={12} /> Settings
              </Link>
              <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: 'rgba(0,245,212,0.08)', border: '1px solid rgba(0,245,212,0.2)' }}>
                <LifeBuoy size={14} color="#00F5D4" />
                <span className="text-[12px] font-semibold" style={{ color: '#00F5D4' }}>{statusCounts.open} open</span>
              </div>
            </div>
          }
        />

        {/* Search and filters */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" color="#6B6C80" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets..."
              className="w-full rounded-xl py-2.5 pl-9 pr-4 text-[12px] outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
            />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-[10.5px] font-bold transition-all"
                style={
                  statusFilter === s
                    ? { background: 'rgba(255,45,149,0.12)', color: '#FF2D95' }
                    : { background: 'rgba(255,255,255,0.04)', color: '#6B6C80' }
                }
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')} ({statusCounts[s]})
              </button>
            ))}
          </div>
        </div>

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load support tickets." onRetry={() => setAttempt((a) => a + 1)} />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="No tickets" subtitle={search || statusFilter !== 'all' ? 'No tickets match your filters.' : 'Support tickets from users will appear here.'} />
        ) : (
          <TableShell head={['Subject', 'Category', 'Priority', 'Status', 'Updated', 'View']}>
            {filtered.map((t) => (
              <tr key={t.id}>
                <Cell>
                  <div className="max-w-[200px] truncate font-medium" style={{ color: '#FFFFFF' }}>{t.subject}</div>
                </Cell>
                <Cell>
                  <Badge
                    label={t.category}
                    bg="rgba(176,106,255,0.1)"
                    color="#B06AFF"
                  />
                </Cell>
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
                  <Link
                    href={`/admin/support/tickets/${t.id}`}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors hover:bg-white/5"
                    style={{ color: '#FF2D95' }}
                  >
                    View <ExternalLink size={11} />
                  </Link>
                </Cell>
              </tr>
            ))}
          </TableShell>
        )}
      </div>
    </AdminShell>
  );
}
