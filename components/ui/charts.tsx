'use client';

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TooltipProps } from 'recharts';

const GRID_COLOR = 'rgba(255,255,255,0.05)';
const AXIS_COLOR = '#6B6C80';
const TOOLTIP_BG = '#171725';
const TOOLTIP_BORDER = 'rgba(255,255,255,0.1)';

const COLORS = ['#FF2D95', '#8A2BE2', '#00BFFF', '#00F5D4', '#FFD600', '#FF8A00', '#B06AFF', '#FFFFFF'];

interface DataPoint {
  label: string;
  value: number;
  [key: string]: string | number;
}

const TOOLTIP_STYLE = { background: TOOLTIP_BG, border: `1px solid ${TOOLTIP_BORDER}`, borderRadius: 12, fontSize: 12, color: '#D5D6E0' };
const LABEL_STYLE = { color: '#A7A8B5', fontSize: 10 };

function formatNairaValue(val: unknown) {
  const n = typeof val === 'number' ? val : Number(val) || 0;
  return `₦${n.toLocaleString()}`;
}

export function RevenueLineChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00F5D4" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#00F5D4" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={LABEL_STYLE}
        />
        <Area type="monotone" dataKey="value" stroke="#00F5D4" strokeWidth={2} fill="url(#revenueGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TicketsLineChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="ticketGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF2D95" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#FF2D95" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
        <Area type="monotone" dataKey="value" stroke="#FF2D95" strokeWidth={2} fill="url(#ticketGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 15, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: AXIS_COLOR }} tickLine={false} axisLine={false} width={100} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function VerticalBarChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PieChartDisplay({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return <EmptyChart />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width={160} height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span style={{ color: '#A7A8B5' }}>{d.label}</span>
            <span className="font-semibold" style={{ color: '#FFFFFF' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[120px] items-center justify-center text-[12px]" style={{ color: '#6B6C80' }}>
      No data to display
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="mb-3 text-[11px] font-bold uppercase tracking-[1px]" style={{ color: '#A7A8B5' }}>
        {title}
      </div>
      {children}
    </div>
  );
}
