'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api';
import { getUser, getAccessToken, isAuthenticated } from '@/lib/auth';
import {
  Package,
  CheckCircle,
  Clock,
  Wallet,
  TrendingUp,
  ClipboardList,
  Truck,
  ArrowRight,
} from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
  PENDING:         'badge-warning',
  ACCEPTED:        'badge-info',
  DISPATCHED:      'badge-info',
  DRIVER_ACCEPTED: 'badge-info',
  IN_TRANSIT:      'badge-accent',
  ARRIVED:         'badge-accent',
  DELIVERED:       'badge-success',
  COMPLETED:       'badge-success',
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency', currency: 'GHS',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(val).replace('GHS', 'GH₵');
}

function StatSkeleton() {
  return (
    <div className="skeleton-stat">
      <div className="skeleton skeleton-text sm" style={{ width: '55%' }} />
      <div className="skeleton skeleton-text lg" style={{ width: '35%', marginTop: 8 }} />
      <div className="skeleton skeleton-text sm" style={{ width: '65%', marginTop: 6 }} />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="skeleton-row">
      <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="skeleton skeleton-text" style={{ width: '40%' }} />
        <div className="skeleton skeleton-text sm" style={{ width: '58%' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <div className="skeleton skeleton-text" style={{ width: 72 }} />
        <div className="skeleton skeleton-text sm" style={{ width: 52 }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) { window.location.href = '/login'; return; }
    setUser(getUser());
    fetchData();
  }, []);

  async function fetchData() {
    const token = getAccessToken();
    try {
      const [statsData, ordersData] = await Promise.all([
        apiRequest<any>('/orders/supplier/stats', { token: token! }),
        apiRequest<any[]>('/orders/supplier', { token: token! }),
      ]);
      setStats(statsData);
      setRecentOrders(Array.isArray(ordersData) ? ordersData.slice(0, 6) : []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  const businessName = user?.supplierProfile?.businessName || '';
  const isPending = user?.status === 'PENDING_VERIFICATION';

  const statItems = [
    {
      label: 'Active Orders',
      value: loading ? null : String(stats?.activeCount || 0),
      note: stats?.activeCount ? `${stats.activeCount} in progress` : 'No active orders',
      color: '',
      Icon: Package,
    },
    {
      label: 'Escrow Held',
      value: loading ? null : formatCurrency(stats?.pendingEscrow || 0),
      note: 'Secured in escrow',
      color: 'accent',
      Icon: Wallet,
    },
    {
      label: 'Total Earned',
      value: loading ? null : formatCurrency(stats?.totalEarned || 0),
      note: 'Lifetime revenue',
      color: 'success',
      Icon: TrendingUp,
    },
    {
      label: 'Completed',
      value: loading ? null : String(stats?.completedCount || 0),
      note: `${stats?.completedCount || 0} deliveries done`,
      color: '',
      Icon: CheckCircle,
    },
  ];

  return (
    <div className="fade-in dashboard-shell">

      {/* ── Pending banner ───────────────────────────────────────────────── */}
      {isPending && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <Clock size={16} style={{ flexShrink: 0 }} />
          <div>
            <strong>Identity Verification In Progress</strong>
            <br />
            <span style={{ fontSize: 13 }}>Your business credentials are being reviewed. This typically takes 24–48 hours.</span>
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="dashboard-kicker">Supplier workspace</div>
          <h1>{businessName ? `Welcome back, ${businessName}` : 'Welcome to CSCP'}</h1>
          <p>Manage your catalog, fulfill orders, and track your fleet — all in one operational hub.</p>
          <div className="dashboard-hero-actions">
            <Link href="/dashboard/fulfillment" className="btn btn-primary" style={{ width: 'auto' }}>
              View Fulfillment
            </Link>
            <Link href="/dashboard/inventory" className="btn btn-ghost" style={{ width: 'auto' }}>
              Manage Inventory
            </Link>
          </div>
        </div>

        <div className="dashboard-hero-panel">
          {loading ? (
            <>
              <div className="skeleton skeleton-text sm" style={{ width: '50%' }} />
              <div className="skeleton skeleton-text lg" style={{ width: '70%', marginTop: 10 }} />
              <div className="skeleton skeleton-text sm" style={{ width: '90%', marginTop: 8 }} />
            </>
          ) : (
            <>
              <div className="dashboard-hero-panel-label">Escrow status</div>
              <div
                className="dashboard-hero-panel-value"
                style={{ color: (stats?.pendingEscrow || 0) > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}
              >
                {formatCurrency(stats?.pendingEscrow || 0)}
              </div>
              <p>
                {(stats?.pendingEscrow || 0) > 0
                  ? `Funds secured in escrow across ${stats?.activeCount || 0} active order${(stats?.activeCount || 0) !== 1 ? 's' : ''}.`
                  : 'No funds currently held in escrow. Accept orders to get started.'}
              </p>
              <Link
                href="/dashboard/payments"
                style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}
              >
                View Earnings <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div className="stats-grid">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : statItems.map(({ label, value, note, color, Icon }) => (
            <div key={label} className="stat-card">
              <div className="stat-icon"><Icon size={22} /></div>
              <div className="stat-card-label">{label}</div>
              <div className={`stat-card-value ${color}`}>{value}</div>
              <div className="stat-card-change">{note}</div>
            </div>
          ))}
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div className="quick-actions-grid">
        {[
          {
            href: '/dashboard/inventory',
            icon: Package,
            title: 'Inventory',
            desc: 'Add products, update stock levels, and sync with the master catalog.',
          },
          {
            href: '/dashboard/fulfillment',
            icon: ClipboardList,
            title: 'Order Fulfillment',
            desc: 'Accept incoming orders and assign drivers for dispatch.',
          },
          {
            href: '/dashboard/drivers',
            icon: Truck,
            title: 'Fleet Management',
            desc: 'Monitor your drivers on the live GPS map and manage assignments.',
          },
        ].map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}>
            <div className="card quick-action">
              <div className="quick-action-header">
                <div className="qa-icon"><Icon size={22} /></div>
                <div className="quick-action-heading"><h3>{title}</h3></div>
              </div>
              <p className="quick-action-description">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Recent Orders ─────────────────────────────────────────────────── */}
      <div className="section-block">
        <div className="section-header">
          <div>
            <div className="section-label">Activity</div>
            <h2>Recent Orders</h2>
          </div>
          <Link
            href="/dashboard/fulfillment"
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div>
            {Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)}
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 24px' }}>
            <Package size={40} style={{ opacity: 0.15 }} />
            <h3>No orders yet</h3>
            <p>Incoming orders from contractors will appear here once your catalog is live.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Contractor</th>
                  <th>Items</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>#{order.id.slice(-8).toUpperCase()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{order.project?.name}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {order.contractor?.contractorProfile?.firstName} {order.contractor?.contractorProfile?.lastName}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}</td>
                    <td style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(order.totalAmount)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[order.status] || 'badge-muted'}`}>
                        {order.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
