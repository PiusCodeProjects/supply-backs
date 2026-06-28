'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { ShoppingBag, Truck, ShieldCheck, ArrowRight, CheckCircle, Clock } from 'lucide-react';

function orderStatusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING:         'badge-muted',
    ACCEPTED:        'badge-info',
    DISPATCHED:      'badge-info',
    DRIVER_ACCEPTED: 'badge-info',
    IN_TRANSIT:      'badge-warning',
    ARRIVED:         'badge-warning',
    DELIVERED:       'badge-success',
    COMPLETED:       'badge-success',
    CANCELLED:       'badge-danger',
    REFUNDED:        'badge-danger',
  };
  return map[status] ?? 'badge-muted';
}

function escrowBadge(status: string) {
  const map: Record<string, string> = {
    HELD:     'badge-warning',
    RELEASED: 'badge-success',
    REFUNDED: 'badge-danger',
  };
  return map[status] ?? 'badge-muted';
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/orders/contractor', { token: token! });
      setOrders(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRelease(id: string) {
    const token = getAccessToken();
    setReleasing(id);
    try {
      await apiRequest(`/orders/${id}/release-funds`, { method: 'PATCH', token: token! });
      await fetchOrders();
    } catch (err) {
      alert('Failed to release funds. Ensure order is marked as DELIVERED first.');
    } finally {
      setReleasing(null);
    }
  }

  const totalEscrow = orders.reduce((sum, o) => sum + (o.escrowStatus === 'HELD' ? Number(o.totalAmount) : 0), 0);
  const inTransit = orders.filter(o => o.status === 'IN_TRANSIT' || o.status === 'ARRIVED').length;
  const delivered = orders.filter(o => o.status === 'DELIVERED' || o.status === 'COMPLETED').length;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>Orders &amp; Escrow</h1>
          <p>Track your procurement orders and manage escrow fund releases.</p>
        </div>
        <Link href="/dashboard/shop" className="btn btn-primary" style={{ width: 'auto' }}>
          <ShoppingBag size={16} /> New Order
        </Link>
      </div>

      {/* Summary Stats */}
      {!loading && orders.length > 0 && (
        <div className="stats-grid" style={{ marginBottom: 28 }}>
          <div className="stat-card">
            <div className="stat-card-label">Total Orders</div>
            <div className="stat-card-value">{orders.length}</div>
            <div className="stat-card-change">All time</div>
            <div className="stat-icon"><ShoppingBag size={20} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">In Transit</div>
            <div className="stat-card-value">{inTransit}</div>
            <div className="stat-card-change">Active deliveries</div>
            <div className="stat-icon"><Truck size={20} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Delivered</div>
            <div className="stat-card-value success">{delivered}</div>
            <div className="stat-card-change">Awaiting release</div>
            <div className="stat-icon"><CheckCircle size={20} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Escrow Held</div>
            <div className="stat-card-value accent">GH₵{Math.round(totalEscrow).toLocaleString()}</div>
            <div className="stat-card-change">Pending release</div>
            <div className="stat-icon"><ShieldCheck size={20} /></div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
          <div className="spinner-light" />
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><ShoppingBag size={48} strokeWidth={1.2} /></div>
          <h3>No orders yet</h3>
          <p>Place your first order through the marketplace to start procuring materials with escrow protection.</p>
          <Link href="/dashboard/shop" className="btn btn-primary" style={{ width: 'auto', marginTop: 8 }}>
            Browse Marketplace <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Project</th>
                  <th>Supplier</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Escrow</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                        #{(o.id ?? '').slice(-8).toUpperCase() || '—'}
                      </span>
                      {o.deliveryDate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                          <Clock size={11} />
                          {new Date(o.deliveryDate).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {o.project?.name ?? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                          <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', fontSize: 10 }}>PERSONAL</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.shippingAddress ? o.shippingAddress.split('\n')[0].slice(0, 40) : 'Direct purchase'}</span>
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{o.supplier.supplierProfile.businessName}</td>
                    <td style={{ fontWeight: 700 }}>GH₵{Math.round(o.totalAmount).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <span className={`badge ${orderStatusBadge(o.status)}`}>{o.status.replace('_', ' ')}</span>
                        {o.bookedByContractor && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Direct Driver</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${escrowBadge(o.escrowStatus)}`}>{o.escrowStatus}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Link
                          href={`/dashboard/orders/${o.id}`}
                          className="btn btn-ghost btn-sm"
                          style={{ width: 'auto' }}
                        >
                          Track
                        </Link>
                        {o.escrowStatus === 'HELD' && (
                          <button
                            onClick={() => handleRelease(o.id)}
                            className="btn btn-sm"
                            style={{
                              width: 'auto',
                              background: o.status === 'DELIVERED' ? 'var(--accent-gradient)' : 'var(--bg-elevated)',
                              color: o.status === 'DELIVERED' ? '#000' : 'var(--text-muted)',
                              border: o.status === 'DELIVERED' ? 'none' : '1px solid var(--border-default)',
                              opacity: o.status === 'DELIVERED' ? 1 : 0.5,
                              fontWeight: 700,
                            }}
                            disabled={o.status !== 'DELIVERED' || releasing === o.id}
                          >
                            {releasing === o.id ? 'Releasing...' : 'Release Funds'}
                          </button>
                        )}
                        {o.escrowStatus === 'RELEASED' && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--success)' }}>
                            <CheckCircle size={14} /> Released
                          </span>
                        )}
                      </div>
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
