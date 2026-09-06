'use client';

import { useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import AdminShell from '@/components/admin-shell';
import { PageHeader, Badge, TableShell, Cell, LoadingBlock, ErrorBlock, EmptyBlock, usePermissionGuard } from '@/components/ui/dashboard-ui';
import { fetchAuditLogs, type AuditRow } from '@/lib/admin-queries';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  success: { bg: 'rgba(0,245,212,0.1)', color: '#00F5D4' },
  error: { bg: 'rgba(255,45,149,0.12)', color: '#FF2D95' },
  pending: { bg: 'rgba(255,214,0,0.1)', color: '#FFD600' },
};

export default function LogsPage() {
  const { user, ready } = usePermissionGuard('audit.view');
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    setStatus('loading');
    fetchAuditLogs()
      .then((l) => {
        setLogs(l);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [ready, attempt]);

  if (!ready || !user) return null;

  const q = search.toLowerCase();
  const filtered = q
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.target_type.toLowerCase().includes(q) ||
          (l.target_id && l.target_id.toLowerCase().includes(q)) ||
          (typeof l.details === 'string' ? l.details.toLowerCase().includes(q) : JSON.stringify(l.details).toLowerCase().includes(q))
      )
    : logs;

  return (
    <AdminShell>
      <div className="mx-auto max-w-[980px] p-5">
        <PageHeader
          title="Audit Logs"
          subtitle="System activity trail"
          right={
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6B6C80' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search action, target…"
                className="w-[200px] rounded-xl py-2 pl-8 pr-3 text-[12px] font-medium outline-none transition-colors placeholder:text-[#6B6C80]"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFFFFF' }}
              />
            </div>
          }
        />

        {status === 'loading' ? (
          <LoadingBlock />
        ) : status === 'error' ? (
          <ErrorBlock message="Couldn't load audit logs." onRetry={() => setAttempt((a) => a + 1)} />
        ) : filtered.length === 0 ? (
          <EmptyBlock title={q ? 'No matching logs' : 'No logs yet'} subtitle={q ? 'Try a different search term.' : 'Audit trail will populate as actions occur.'} />
        ) : (
          <TableShell head={['Time', 'Actor', 'Action', 'Target', 'Status', 'Details']}>
            {filtered.slice(0, 100).map((log) => (
              <tr key={log.id}>
                <Cell>
                  <span className="whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</span>
                </Cell>
                <Cell>
                  <span className="font-mono text-[11px]" style={{ color: '#A7A8B5' }}>{log.actor_id ? log.actor_id.slice(0, 8) + '…' : '—'}</span>
                </Cell>
                <Cell>
                  <Badge label={log.action} bg="rgba(176,106,255,0.12)" color="#B06AFF" />
                </Cell>
                <Cell>
                  <span className="text-[12px]" style={{ color: '#D5D6E0' }}>
                    {log.target_type}{log.target_id ? ` / ${log.target_id.slice(0, 8)}` : ''}
                  </span>
                </Cell>
                <Cell>
                  <Badge
                    label={log.status}
                    bg={STATUS_COLORS[log.status]?.bg ?? 'rgba(107,108,128,0.15)'}
                    color={STATUS_COLORS[log.status]?.color ?? '#6B6C80'}
                  />
                </Cell>
                <Cell>
                  <span className="max-w-[200px] truncate font-mono text-[11px]" style={{ color: '#6B6C80' }} title={JSON.stringify(log.details)}>
                    {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                  </span>
                </Cell>
              </tr>
            ))}
          </TableShell>
        )}
      </div>
    </AdminShell>
  );
}
