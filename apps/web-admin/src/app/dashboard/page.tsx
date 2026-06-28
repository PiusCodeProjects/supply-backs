'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  Users, ShoppingCart, DollarSign, ShieldCheck, Clock,
  Building2, Truck, CheckCircle, XCircle, AlertTriangle,
  Package, RefreshCw, ArrowRight, FileText, Award, BarChart2,
} from 'lucide-react';

// Derive the API origin (without the trailing /api) for serving uploaded files.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api').replace(/\/api$/, '');

type Analytics = {
  orders: {
    total: number;
    byStatus: Record<string, number>;
    totalGMV: number;
    escrowHeld: number;
    escrowReleased: number;
    completedThisMonth: number;
    trend: { date: string; count: number; volume: number }[];
  };
  users: {
    total: number;
    contractors: number;
    suppliers: number;
    drivers: number;
    newThisMonth: number;
  };
  supplierVerification: Record<string, number>;
  topContractors: { name: string; totalSpend: number; orderCount: number }[];
  topSuppliers: { name: string; totalRevenue: number; orderCount: number }[];
  recentOrders: {
    id: string;
    status: string;
    totalAmount: number;
    escrowStatus: string;
    createdAt: string;
    contractorName: string;
    supplierName: string;
  }[];
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#F59E0B', ACCEPTED: '#3B82F6', DISPATCHED: '#8B5CF6',
  DRIVER_ACCEPTED: '#06B6D4', IN_TRANSIT: '#F97316', ARRIVED: '#84CC16',
  DELIVERED: '#10B981', COMPLETED: '#10B981', CANCELLED: '#EF4444', REFUNDED: '#64748B',
};

function fmt(n: number) { return Math.round(n).toLocaleString(); }

function TrendChart({ trend }: { trend: { date: string; count: number; volume: number }[] }) {
  const maxCount = Math.max(...trend.map(t => t.count), 1);
  const maxVol   = Math.max(...trend.map(t => t.volume), 1);
  const W = trend.length * 12;
  return (
    <div style={{ width: '100%', padding: '0 4px' }}>
      <svg viewBox={`0 0 ${W} 60`} style={{ width: '100%', height: 60, display: 'block' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3B82F6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          fill="url(#volGrad)" stroke="#3B82F6" strokeWidth="1.5" strokeLinejoin="round"
          points={[`6,60`, ...trend.map((t, i) => `${i * 12 + 6},${60 - (t.volume / maxVol) * 56}`), `${(trend.length - 1) * 12 + 6},60`].join(' ')}
        />
      </svg>
      <div style={{ display: 'flex', gap: 2, height: 44, alignItems: 'flex-end', marginTop: 4 }}>
        {trend.map((t) => (
          <div
            key={t.date}
            title={`${t.date}: ${t.count} orders · GH₵${fmt(t.volume)}`}
            style={{
              flex: 1,
              height: Math.max(t.count > 0 ? 4 : 2, (t.count / maxCount) * 40),
              background: t.count > 0 ? 'linear-gradient(180deg,#60A5FA,#3B82F6)' : 'var(--border-subtle)',
              borderRadius: '3px 3px 0 0',
              transition: 'height 0.3s ease',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 6 }}>
        {trend.map((t, i) => (
          <div key={t.date} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
            {i % 7 === 0 ? t.date.slice(5) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function LeaderRow({ rank, name, primary, sub }: { rank: number; name: string; primary: string; sub: string }) {
  const rankColors = ['#F59E0B', '#94A3B8', '#CD7F32'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: rankColors[rank - 1] || 'var(--text-muted)', flexShrink: 0 }}>
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{primary}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [pending,   setPending]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [docViewer, setDocViewer] = useState<any | null>(null);

  async function load(silent = false) {
    const token = getAccessToken();
    if (!token) { window.location.href = '/login'; return; }
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [ana, pend] = await Promise.all([
        apiRequest<Analytics>('/orders/admin/analytics', { token }),
        apiRequest<any[]>('/users/suppliers/pending', { token }),
      ]);
      setAnalytics(ana);
      setPending(pend);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleVerify(id: string, action: 'APPROVED' | 'REJECTED', reason?: string) {
    const token = getAccessToken();
    setActionLoading(id);
    try {
      await apiRequest(`/users/${id}/verify-supplier`, {
        method: 'PATCH', token: token!,
        body: { action, rejectionReason: reason },
      });
      setPending(prev => prev.filter(s => s.id !== id));
      load(true);
    } catch {
      alert('Action failed. Please try again.');
    } finally {
      setActionLoading(null);
      setRejectModal(null);
      setRejectReason('');
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
      <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading command center…</div>
    </div>
  );

  if (!analytics) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>Couldn't load analytics</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360, textAlign: 'center' }}>
        The analytics service didn't respond. This usually means the API is restarting. Try again in a moment.
      </div>
      <button onClick={() => load()} className="btn btn-primary" style={{ width: 'auto' }}>
        Retry
      </button>
    </div>
  );

  const ana = analytics;
  const activeOrders = Object.entries(ana.orders.byStatus)
    .filter(([s]) => !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(s))
    .reduce((sum, [, v]) => sum + v, 0);
  const activeDeliveries = (ana.orders.byStatus['DRIVER_ACCEPTED'] || 0)
    + (ana.orders.byStatus['IN_TRANSIT'] || 0)
    + (ana.orders.byStatus['ARRIVED'] || 0);
  const pendingOrders = ana.orders.byStatus['PENDING'] || 0;
  const maxStatus = Math.max(...Object.values(ana.orders.byStatus), 1);

  const alerts: { type: 'warn' | 'info' | 'success'; msg: string; href: string }[] = [];
  if (pending.length > 0)
    alerts.push({ type: 'warn', msg: `${pending.length} supplier${pending.length > 1 ? 's' : ''} awaiting verification`, href: '/dashboard/suppliers' });
  if (pendingOrders > 0)
    alerts.push({ type: 'info', msg: `${pendingOrders} order${pendingOrders > 1 ? 's' : ''} awaiting supplier acceptance`, href: '/dashboard/orders' });
  if (activeDeliveries > 0)
    alerts.push({ type: 'info', msg: `${activeDeliveries} active deliver${activeDeliveries > 1 ? 'ies' : 'y'} in progress`, href: '/dashboard/orders' });
  if (ana.orders.escrowHeld > 0)
    alerts.push({ type: 'success', msg: `GH₵${fmt(ana.orders.escrowHeld)} secured in escrow`, href: '/dashboard/orders' });

  const ALERT_STYLE: Record<string, { bg: string; border: string; icon: JSX.Element }> = {
    warn:    { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)',  icon: <AlertTriangle size={14} color="#F59E0B" /> },
    info:    { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  icon: <Package size={14} color="#3B82F6" /> },
    success: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', icon: <ShieldCheck size={14} color="#10B981" /> },
  };

  return (
    <div className="fade-in">

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.8 }}>Admin Command Center</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 3 }}>
            System-wide monitoring and governance
            {lastRefresh && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>· {lastRefresh.toLocaleTimeString()}</span>}
          </p>
        </div>
        <button
          onClick={() => load(true)} disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
        >
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
        {([
          { label: 'Total Users',      value: ana.users.total,                      sub: `+${ana.users.newThisMonth} this month`,              color: '#3B82F6', icon: <Users size={18} /> },
          { label: 'Active Orders',    value: activeOrders,                          sub: `${ana.orders.total} total all-time`,                  color: '#8B5CF6', icon: <ShoppingCart size={18} /> },
          { label: 'Platform GMV',     value: `GH₵${fmt(ana.orders.totalGMV)}`,     sub: `${ana.orders.completedThisMonth} completed this month`, color: '#10B981', icon: <DollarSign size={18} /> },
          { label: 'Escrow Held',      value: `GH₵${fmt(ana.orders.escrowHeld)}`,   sub: 'Secured funds',                                       color: '#F59E0B', icon: <ShieldCheck size={18} /> },
          { label: 'Released Funds',   value: `GH₵${fmt(ana.orders.escrowReleased)}`, sub: 'Paid to suppliers',                                color: '#10B981', icon: <CheckCircle size={18} /> },
        ] as const).map(({ label, value, sub, color, icon }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', padding: '16px 18px', borderRadius: 14, border: '1px solid var(--border-subtle)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
              <div style={{ color, opacity: 0.7 }}>{icon}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.35 }} />
          </div>
        ))}
      </div>

      {/* ── 30-Day Trend + Order Status ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <BarChart2 size={15} color="var(--accent)" /> 30-Day Order Activity
            </span>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#3B82F6', display: 'inline-block' }} /> Volume
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: '#60A5FA', display: 'inline-block' }} /> Orders
              </span>
            </div>
          </div>
          <div style={{ padding: '18px 22px 14px' }}>
            <TrendChart trend={ana.orders.trend} />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ShoppingCart size={15} color="var(--accent)" /> Order Status
            </span>
          </div>
          <div style={{ padding: '18px 22px' }}>
            {Object.entries(ana.orders.byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{status}</span>
                  <span style={{ color: STATUS_COLOR[status] || 'var(--accent)', fontWeight: 700 }}>{count}</span>
                </div>
                <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${(count / maxStatus) * 100}%`, background: STATUS_COLOR[status] || 'var(--accent)', borderRadius: 3, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
            {Object.keys(ana.orders.byStatus).length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No orders yet</div>
            )}
          </div>
        </div>
      </div>

      {/* ── User Breakdown + Supplier Verification + Escrow Flow ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* User breakdown */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Users size={15} color="var(--accent)" /> User Breakdown</span>
          </div>
          <div style={{ padding: '18px 22px' }}>
            {[
              { label: 'Contractors', value: ana.users.contractors, icon: <ShoppingCart size={14} />, color: '#3B82F6' },
              { label: 'Suppliers',   value: ana.users.suppliers,   icon: <Building2 size={14} />,    color: '#10B981' },
              { label: 'Drivers',     value: ana.users.drivers,     icon: <Truck size={14} />,         color: '#F59E0B' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color }}>
                  {icon}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 72, height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${ana.users.total > 0 ? (value / ana.users.total) * 100 : 0}%`, background: color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color, minWidth: 24, textAlign: 'right' }}>{value}</span>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>New users this month</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent)' }}>{ana.users.newThisMonth}</div>
            </div>
          </div>
        </div>

        {/* Supplier verification */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><ShieldCheck size={15} color="var(--accent)" /> Supplier Registry</span>
          </div>
          <div style={{ padding: '18px 22px' }}>
            {[
              { key: 'PENDING',  label: 'Awaiting Review', color: '#F59E0B' },
              { key: 'APPROVED', label: 'Approved',        color: '#10B981' },
              { key: 'REJECTED', label: 'Rejected',        color: '#EF4444' },
            ].map(({ key, label, color }) => {
              const count = ana.supplierVerification[key] || 0;
              const total = Object.values(ana.supplierVerification).reduce((a, b) => a + b, 0) || 1;
              return (
                <div key={key} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
                    <span style={{ color, fontWeight: 800 }}>{count}</span>
                  </div>
                  <div style={{ height: 7, background: 'var(--bg-elevated)', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${(count / total) * 100}%`, background: color, borderRadius: 4, transition: 'width 0.6s' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
              {[
                { label: 'In Queue', v: ana.supplierVerification['PENDING']  || 0, color: '#F59E0B' },
                { label: 'Live',     v: ana.supplierVerification['APPROVED'] || 0, color: '#10B981' },
                { label: 'Declined', v: ana.supplierVerification['REJECTED'] || 0, color: '#EF4444' },
              ].map(({ label, v, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color }}>{v}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Escrow flow */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><DollarSign size={15} color="var(--accent)" /> Escrow Flow</span>
          </div>
          <div style={{ padding: '18px 22px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Total Platform GMV</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>GH₵ {fmt(ana.orders.totalGMV)}</div>
            </div>
            {ana.orders.totalGMV > 0 && (
              <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
                <div style={{ width: `${(ana.orders.escrowReleased / ana.orders.totalGMV) * 100}%`, background: '#10B981' }} title="Released" />
                <div style={{ width: `${(ana.orders.escrowHeld / ana.orders.totalGMV) * 100}%`, background: '#F59E0B' }} title="Held" />
              </div>
            )}
            {[
              { label: 'Released to Suppliers', value: ana.orders.escrowReleased, color: '#10B981' },
              { label: 'Currently Held',         value: ana.orders.escrowHeld,     color: '#F59E0B' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color }}>GH₵ {fmt(value)}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Release Rate</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#10B981' }}>
                {ana.orders.totalGMV > 0 ? Math.round((ana.orders.escrowReleased / ana.orders.totalGMV) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Leaderboards + Live Alerts ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Leaderboards stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header">
              <span className="card-title"><Award size={15} color="#F59E0B" /> Top Contractors by Spend</span>
            </div>
            <div style={{ padding: '6px 24px 16px' }}>
              {(ana.topContractors || []).length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No data yet</div>
              ) : (ana.topContractors || []).slice(0, 5).map((c, i) => (
                <LeaderRow key={c.name + i} rank={i + 1} name={c.name} primary={`GH₵ ${fmt(c.totalSpend)}`} sub={`${c.orderCount} order${c.orderCount !== 1 ? 's' : ''}`} />
              ))}
            </div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-header">
              <span className="card-title"><Award size={15} color="#10B981" /> Top Suppliers by Revenue</span>
            </div>
            <div style={{ padding: '6px 24px 16px' }}>
              {(ana.topSuppliers || []).length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No data yet</div>
              ) : (ana.topSuppliers || []).slice(0, 5).map((s, i) => (
                <LeaderRow key={s.name + i} rank={i + 1} name={s.name} primary={`GH₵ ${fmt(s.totalRevenue)}`} sub={`${s.orderCount} order${s.orderCount !== 1 ? 's' : ''}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Live Alerts */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <span className="card-title"><AlertTriangle size={15} color="var(--warning)" /> Live Alerts</span>
          </div>
          <div style={{ padding: '14px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', padding: '20px 0' }}>
                <CheckCircle size={32} color="var(--success)" opacity={0.35} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>All clear</div>
                <div style={{ fontSize: 11, textAlign: 'center' }}>No pending actions required</div>
              </div>
            ) : (
              alerts.map((a, i) => {
                const s = ALERT_STYLE[a.type];
                return (
                  <a key={i} href={a.href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, textDecoration: 'none' }}>
                    {s.icon}
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{a.msg}</span>
                    <ArrowRight size={11} color="var(--text-muted)" />
                  </a>
                );
              })
            )}
          </div>
          {/* Pending review count summary */}
          {pending.length > 0 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-subtle)' }}>
              <a href="/dashboard/suppliers" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                <span>{pending.length} supplier{pending.length > 1 ? 's' : ''} need review</span>
                <ArrowRight size={13} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── Pending Verifications ── */}
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div className="card-header">
          <span className="card-title">
            <Building2 size={15} color="var(--accent)" />
            Pending Verifications
            {pending.length > 0 && (
              <span style={{ background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 100 }}>{pending.length}</span>
            )}
          </span>
          <a href="/dashboard/suppliers" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>View all →</a>
        </div>

        {pending.length === 0 ? (
          <div style={{ padding: '36px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <CheckCircle size={32} style={{ marginBottom: 8, opacity: 0.25 }} />
            <div style={{ fontSize: 13 }}>No pending applications</div>
          </div>
        ) : (
          <div>
            {pending.slice(0, 5).map(s => {
              const docs: string[] = JSON.parse(s.supplierProfile?.documents || '[]');
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={18} color="var(--accent)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.supplierProfile?.businessName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.email || s.phone} · {new Date(s.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {docs.length > 0 && (
                      <button
                        onClick={() => setDocViewer(s)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 7, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}
                      >
                        <FileText size={11} /> Docs
                      </button>
                    )}
                    <button
                      onClick={() => handleVerify(s.id, 'APPROVED')}
                      disabled={actionLoading === s.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 7, color: '#10B981', fontSize: 11, fontWeight: 700 }}
                    >
                      {actionLoading === s.id ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <><CheckCircle size={11} /> Approve</>}
                    </button>
                    <button
                      onClick={() => setRejectModal({ id: s.id, name: s.supplierProfile?.businessName })}
                      disabled={actionLoading === s.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, color: '#EF4444', fontSize: 11, fontWeight: 700 }}
                    >
                      <XCircle size={11} /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
            {pending.length > 5 && (
              <div style={{ padding: '10px 22px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                +{pending.length - 5} more — <a href="/dashboard/suppliers" style={{ color: 'var(--accent)' }}>view all</a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Recent Orders ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-header">
          <span className="card-title"><Clock size={15} color="var(--accent)" /> Recent Orders</span>
          <a href="/dashboard/orders" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>View all →</a>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                {['Order ID', 'Contractor', 'Supplier', 'Amount (GH₵)', 'Status', 'Escrow', 'Date'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ana.recentOrders.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No orders yet</td></tr>
              ) : ana.recentOrders.map(o => (
                <tr key={o.id} className="hover-bg">
                  <td style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>#{o.id.slice(-8).toUpperCase()}</td>
                  <td>{o.contractorName}</td>
                  <td>{o.supplierName}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(o.totalAmount)}</td>
                  <td>
                    <span style={{ padding: '3px 9px', borderRadius: 100, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: `${STATUS_COLOR[o.status] || '#64748B'}1a`, color: STATUS_COLOR[o.status] || 'var(--text-muted)' }}>
                      {o.status}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, color: o.escrowStatus === 'HELD' ? '#F59E0B' : '#10B981' }}>{o.escrowStatus}</span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Document Viewer Modal ── */}
      {docViewer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border-default)', width: '80%', maxWidth: 900, height: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>{docViewer.supplierProfile?.businessName} — Documents</div>
              <button onClick={() => setDocViewer(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}><XCircle size={20} /></button>
            </div>
            <iframe src={`${API_BASE}${JSON.parse(docViewer.supplierProfile?.documents || '[]')[0] || ''}`} style={{ flex: 1, border: 'none', background: '#111' }} />
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { handleVerify(docViewer.id, 'REJECTED'); setDocViewer(null); }} style={{ padding: '8px 18px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#EF4444', fontSize: 13, fontWeight: 700 }}>Reject Supplier</button>
              <button onClick={() => { handleVerify(docViewer.id, 'APPROVED'); setDocViewer(null); }} style={{ padding: '8px 18px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10B981', fontSize: 13, fontWeight: 700 }}>Approve Supplier</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Reason Modal ── */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border-default)', padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Reject Supplier</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>
              Provide a rejection reason for <strong>{rejectModal.name}</strong>.
            </div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Incomplete documentation, unverifiable business address…"
              style={{ width: '100%', minHeight: 90, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-primary)', padding: 12, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }} style={{ padding: '8px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button
                onClick={() => { if (rejectReason.trim()) handleVerify(rejectModal.id, 'REJECTED', rejectReason.trim()); }}
                disabled={!rejectReason.trim() || actionLoading === rejectModal.id}
                style={{ padding: '8px 18px', background: rejectReason.trim() ? 'rgba(239,68,68,0.15)' : 'var(--bg-elevated)', border: `1px solid ${rejectReason.trim() ? 'rgba(239,68,68,0.4)' : 'var(--border-subtle)'}`, borderRadius: 8, color: rejectReason.trim() ? '#EF4444' : 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}
              >
                {actionLoading === rejectModal.id ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
