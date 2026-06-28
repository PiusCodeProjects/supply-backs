'use client';

import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { ShieldCheck, CheckCircle, Search } from 'lucide-react';

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#F59E0B', ACCEPTED: '#3B82F6', DISPATCHED: '#8B5CF6',
  DRIVER_ACCEPTED: '#06B6D4', IN_TRANSIT: '#F97316', ARRIVED: '#84CC16',
  DELIVERED: '#10B981', COMPLETED: '#10B981', CANCELLED: '#EF4444', REFUNDED: '#64748B',
};

export default function GlobalOrdersPage() {
  const [orders, setOrders]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/orders/admin', { token: token! });
      setOrders(data);
    } catch { /* handled */ } finally { setLoading(false); }
  }

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      o.id.toLowerCase().includes(q) ||
      (o.contractor?.contractorProfile?.firstName || '').toLowerCase().includes(q) ||
      (o.contractor?.contractorProfile?.lastName || '').toLowerCase().includes(q) ||
      (o.supplier?.supplierProfile?.businessName || '').toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q)
    );
  });

  const totalGMV    = orders.reduce((s, o) => s + o.totalAmount, 0);
  const escrowHeld  = orders.filter(o => o.escrowStatus === 'HELD').reduce((s, o) => s + o.totalAmount, 0);
  const released    = orders.filter(o => o.escrowStatus === 'RELEASED').reduce((s, o) => s + o.totalAmount, 0);
  const activeCount = orders.filter(o => !['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(o.status)).length;
  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Global Orders & Escrow</h1>
        <p>Monitor platform-wide procurement and fund security</p>
      </div>

      {/* KPI cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Total Volume',    value: `GH₵ ${fmt(totalGMV)}`,    color: 'var(--text-primary)' },
          { label: 'Escrow Held',     value: `GH₵ ${fmt(escrowHeld)}`,  color: 'var(--warning)' },
          { label: 'Released',        value: `GH₵ ${fmt(released)}`,    color: 'var(--success)' },
          { label: 'Active Orders',   value: activeCount,                color: 'var(--accent)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-card-label">{label}</div>
            <div className="stat-card-value" style={{ color, fontSize: 22 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="search-wrapper">
          <Search className="search-icon" size={15} />
          <input
            type="text"
            className="input search-input"
            placeholder="Search by ID, contractor, supplier, or status…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="page-loader"><div className="spinner" style={{ width: 32, height: 32 }} /> Loading orders…</div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Contractor</th>
                  <th>Supplier</th>
                  <th>Amount (GH₵)</th>
                  <th>Status</th>
                  <th>Escrow</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state"><p>{orders.length === 0 ? 'No orders on the platform yet.' : 'No orders match your search.'}</p></div></td></tr>
                ) : filtered.map(o => (
                  <tr key={o.id} className="hover-bg">
                    <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      #{o.id.slice(-8).toUpperCase()}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {o.contractor?.contractorProfile?.firstName} {o.contractor?.contractorProfile?.lastName}
                    </td>
                    <td style={{ fontSize: 13 }}>{o.supplier?.supplierProfile?.businessName || '—'}</td>
                    <td style={{ fontWeight: 700, fontSize: 13 }}>{fmt(o.totalAmount)}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 9px',
                        borderRadius: 100,
                        fontSize: 10.5,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 0.3,
                        background: `${STATUS_COLOR[o.status] || '#64748B'}1a`,
                        color: STATUS_COLOR[o.status] || 'var(--text-muted)',
                      }}>
                        {o.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {o.escrowStatus === 'HELD'
                          ? <ShieldCheck size={13} color="var(--warning)" />
                          : <CheckCircle size={13} color="var(--success)" />}
                        <span style={{ fontSize: 12, fontWeight: 600, color: o.escrowStatus === 'HELD' ? 'var(--warning)' : 'var(--success)' }}>
                          {o.escrowStatus}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
