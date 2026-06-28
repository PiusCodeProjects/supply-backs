'use client';

import { useEffect, useState } from 'react';
import { getUser, getAccessToken } from '@/lib/auth';
import { authApi, apiRequest } from '@/lib/api';
import Link from 'next/link';
import {
  ShoppingBag, Truck, ShieldCheck, CheckCircle,
  FolderOpen, Package, Store, ArrowRight,
  AlertTriangle, Clock, MapPin, Sparkles,
  TrendingUp, LayoutGrid,
} from 'lucide-react';

// ─── Badge mapping (all backend enum values) ────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
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

const ESCROW_BADGE: Record<string, string> = {
  HELD:     'badge-warning',
  RELEASED: 'badge-success',
  REFUNDED: 'badge-danger',
};

const INACTIVE_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REFUNDED']);
const DONE_STATUSES     = new Set(['DELIVERED', 'COMPLETED']);

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val).replace('GHS', 'GH₵');
}

// ─── Skeleton helpers ────────────────────────────────────────────────────────
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
        <div className="skeleton skeleton-text" style={{ width: '42%' }} />
        <div className="skeleton skeleton-text sm" style={{ width: '60%' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <div className="skeleton skeleton-text" style={{ width: 70 }} />
        <div className="skeleton skeleton-text sm" style={{ width: 50 }} />
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [user,     setUser]     = useState<any>(null);
  const [profile,  setProfile]  = useState<any>(null);
  const [orders,   setOrders]   = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setUser(getUser());
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }

    Promise.all([
      authApi.getProfile(token).catch(() => null),
      apiRequest<any[]>('/orders/contractor', { token }).catch(() => [] as any[]),
      apiRequest<any[]>('/projects',           { token }).catch(() => [] as any[]),
    ]).then(([p, o, proj]) => {
      if (p) setProfile(p);
      setOrders(Array.isArray(o)    ? o    : []);
      setProjects(Array.isArray(proj) ? proj : []);
    }).finally(() => setLoading(false));
  }, []);

  // profile is authoritative for isVerified (freshest data)
  const isVerified = Boolean(profile?.isVerified ?? user?.isVerified);
  const firstName  = profile?.contractorProfile?.firstName || user?.contractorProfile?.firstName || '';
  const company    = profile?.contractorProfile?.company   || '';

  // ── Derived stats ──────────────────────────────────────────────────────────
  const activeOrders    = orders.filter(o => !INACTIVE_STATUSES.has(o.status)).length;
  const inTransit       = orders.filter(o => o.status === 'IN_TRANSIT' || o.status === 'ARRIVED').length;
  const completed       = orders.filter(o => DONE_STATUSES.has(o.status)).length;
  const escrowHeld      = orders
    .filter(o => o.escrowStatus === 'HELD')
    .reduce((s, o) => s + Number(o.totalAmount), 0);

  // Orders that need the contractor to release funds
  const awaitingRelease = orders.filter(
    o => o.status === 'DELIVERED' && o.escrowStatus === 'HELD',
  );

  // Quick step completion
  const hasProjects      = projects.length > 0;
  const hasRequirements  = projects.some((p: any) => p._count?.requirements > 0);
  const hasOrders        = orders.length > 0;

  // Recent orders (already desc-sorted by backend)
  const recentOrders = orders.slice(0, 5);

  const stats = [
    {
      label: 'Active Orders',
      value: String(activeOrders),
      note:  activeOrders === 0 ? 'No orders yet' : `${activeOrders} in progress`,
      color: '',
      Icon:  ShoppingBag,
    },
    {
      label: 'In Transit',
      value: String(inTransit),
      note:  inTransit === 0 ? 'No deliveries' : 'En route to site',
      color: '',
      Icon:  Truck,
    },
    {
      label: 'Escrow Held',
      value: escrowHeld > 0 ? formatCurrency(escrowHeld) : 'GH₵0',
      note:  escrowHeld > 0 ? 'Awaiting your release' : 'Fund your first order',
      color: 'accent',
      Icon:  ShieldCheck,
    },
    {
      label: 'Completed',
      value: String(completed),
      note:  completed === 0 ? 'None delivered yet' : `${completed} delivered`,
      color: 'success',
      Icon:  CheckCircle,
    },
  ];

  return (
    <div className="fade-in dashboard-shell">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="dashboard-kicker">Contractor workspace</div>
          <h1>
            {firstName ? `Welcome back, ${firstName}` : 'Welcome to CSCP'}
          </h1>
          <p>
            {company || 'Contractor Portal'} · A clear view of project planning,
            procurement, and escrow activity.
          </p>
          <div className="dashboard-hero-actions">
            <Link href="/dashboard/projects" className="btn btn-primary" style={{ width: 'auto' }}>
              {hasProjects ? 'My Projects' : 'Start a project'}
            </Link>
            <Link href="/dashboard/shop" className="btn btn-ghost" style={{ width: 'auto' }}>
              Browse shop
            </Link>
          </div>
        </div>

        <div className="dashboard-hero-panel">
          {loading ? (
            <>
              <div className="skeleton skeleton-text sm" style={{ width: '50%' }} />
              <div className="skeleton skeleton-text lg" style={{ width: '70%', marginTop: 10 }} />
              <div className="skeleton skeleton-text sm" style={{ width: '90%', marginTop: 8 }} />
              <div className="skeleton skeleton-text sm" style={{ width: '90%', marginTop: 6 }} />
            </>
          ) : (
            <>
              <div className="dashboard-hero-panel-label">Account status</div>
              <div
                className="dashboard-hero-panel-value"
                style={{ color: isVerified ? 'var(--success)' : 'var(--warning)' }}
              >
                {isVerified ? 'Verified ✓' : 'Action needed'}
              </div>
              <p>
                {isVerified
                  ? `${projects.length} project${projects.length !== 1 ? 's' : ''} · ${orders.length} order${orders.length !== 1 ? 's' : ''} · ${formatCurrency(escrowHeld)} held in escrow.`
                  : 'Verify your phone to unlock ordering, escrow, and supplier messaging.'}
              </p>
              {!isVerified && user?.id && (
                <Link href={`/verify-otp?userId=${user.id}`} className="dashboard-hero-panel-link">
                  Verify now →
                </Link>
              )}
              {isVerified && !hasProjects && (
                <Link href="/dashboard/projects" className="dashboard-hero-panel-link">
                  Create first project →
                </Link>
              )}
              {isVerified && awaitingRelease.length > 0 && (
                <Link href="/dashboard/orders" className="dashboard-hero-panel-link" style={{ color: 'var(--success)' }}>
                  {awaitingRelease.length} order{awaitingRelease.length !== 1 ? 's' : ''} ready to release →
                </Link>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Verification banner ──────────────────────────────────────────── */}
      {!loading && user && !isVerified && (
        <div className="alert alert-warning dashboard-alert" role="alert">
          <span className="alert-icon"><AlertTriangle size={16} /></span>
          <div>
            <strong>Phone verification required</strong><br />
            <span style={{ fontSize: 13 }}>
              You need to verify your phone to place orders.{' '}
              <Link href={`/verify-otp?userId=${user.id}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                Verify now
              </Link>
            </span>
          </div>
        </div>
      )}

      {/* ── Escrow release alert ─────────────────────────────────────────── */}
      {!loading && awaitingRelease.length > 0 && (
        <div className="alert alert-success dashboard-alert" role="alert">
          <span className="alert-icon"><ShieldCheck size={16} /></span>
          <div>
            <strong>{awaitingRelease.length} order{awaitingRelease.length !== 1 ? 's' : ''} delivered — release funds to your supplier</strong><br />
            <span style={{ fontSize: 13 }}>
              Once you confirm receipt on site, release the escrow payment.{' '}
              <Link href="/dashboard/orders" style={{ color: 'var(--success)', fontWeight: 600 }}>
                Review now →
              </Link>
            </span>
          </div>
        </div>
      )}

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="section-block">
        <div className="section-header">
          <div>
            <div className="section-label">Overview</div>
            <h2>Current activity</h2>
          </div>
          {!loading && hasOrders && (
            <Link href="/dashboard/orders" className="btn btn-ghost btn-sm" style={{ width: 'auto' }}>
              All orders <ArrowRight size={14} />
            </Link>
          )}
        </div>

        <div className="stats-grid">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
            : stats.map(({ label, value, note, color, Icon }) => (
                <div key={label} className="stat-card">
                  <div className="stat-card-label">{label}</div>
                  <div className={`stat-card-value${color ? ` ${color}` : ''}`}>{value}</div>
                  <div className="stat-card-change">{note}</div>
                  <div className="stat-icon" aria-hidden><Icon size={20} /></div>
                </div>
              ))}
        </div>
      </div>

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="section-block">
        <div className="section-header">
          <div>
            <div className="section-label">Quick actions</div>
            <h2>What to do next</h2>
          </div>
        </div>

        <div className="quick-actions-grid">
          {[
            {
              Icon:  FolderOpen,
              title: 'Step 1: Create Project',
              desc:  'Define your construction site and core project details.',
              href:  '/dashboard/projects',
              phase: 'FOUNDATION',
              done:  hasProjects,
            },
            {
              Icon:  Package,
              title: 'Step 2: Plan Materials',
              desc:  'Use smart templates to define exactly what your project needs.',
              href:  hasProjects
                       ? `/dashboard/projects/${projects[0]?.id}`
                       : '/dashboard/projects',
              phase: 'PLANNING',
              done:  hasRequirements,
            },
            {
              Icon:  Store,
              title: 'Step 3: Procure Smart',
              desc:  'Compare suppliers and place orders with escrow protection.',
              href:  '/dashboard/shop',
              phase: 'PROCUREMENT',
              done:  hasOrders,
            },
          ].map(({ Icon, title, desc, href, phase, done }) => (
            <Link key={title} href={href}>
              <div className="card quick-action">
                <div className="quick-action-header">
                  <div className="qa-icon" aria-hidden>
                    <Icon size={24} />
                  </div>
                  <div className="quick-action-heading">
                    <h3>{title}</h3>
                    <span className={`badge ${done ? 'badge-success' : 'badge-muted'}`}>
                      {done ? 'Done' : phase}
                    </span>
                  </div>
                </div>
                <p className="quick-action-description">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Projects summary (only when user has projects) ───────────────── */}
      {!loading && hasProjects && (
        <div className="section-block">
          <div className="section-header">
            <div>
              <div className="section-label">Sites</div>
              <h2>Active projects</h2>
            </div>
            <Link href="/dashboard/projects" className="btn btn-ghost btn-sm" style={{ width: 'auto' }}>
              All projects <ArrowRight size={14} />
            </Link>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {projects.slice(0, 3).map((p: any) => (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  className="card"
                  style={{
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    transition: 'var(--transition)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = 'var(--border-default)';
                    el.style.transform = 'translateY(-2px)';
                    el.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = 'var(--border-subtle)';
                    el.style.transform = '';
                    el.style.boxShadow = '';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: 'var(--accent-muted)', color: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <LayoutGrid size={16} />
                    </div>
                    <span className="badge badge-success" style={{ fontSize: 10 }}>{p.status}</span>
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} /> {p.location}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{p._count?.requirements ?? 0}</strong> materials
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{p._count?.orders ?? 0}</strong> orders
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent activity ───────────────────────────────────────────────── */}
      <div className="section-block">
        <div className="card activity-card">
          <div className="card-header">
            <div>
              <div className="section-label">Recent activity</div>
              <span className="card-title">Latest procurement events</span>
            </div>
            {!loading && hasOrders && (
              <Link href="/dashboard/orders" className="btn btn-ghost btn-sm" style={{ width: 'auto' }}>
                View all <ArrowRight size={14} />
              </Link>
            )}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="card-body activity-empty-state">
              <div className="empty-state-illustration" aria-hidden>
                <Sparkles size={44} strokeWidth={1.2} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>No activity yet</h3>
              <p>Create a project, plan your materials, then place your first order to see activity here.</p>
              <Link href="/dashboard/projects" className="btn btn-primary" style={{ width: 'auto', marginTop: 4 }}>
                Get started <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentOrders.map((o: any, idx: number) => {
                const isLast = idx === recentOrders.length - 1;
                const statusBadge = STATUS_BADGE[o.status] ?? 'badge-muted';
                const escrowBadge = ESCROW_BADGE[o.escrowStatus] ?? 'badge-muted';

                return (
                  <Link
                    key={o.id}
                    href={`/dashboard/orders/${o.id}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '44px 1fr auto',
                      gap: 16,
                      alignItems: 'center',
                      padding: '16px 24px',
                      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                      textDecoration: 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 10,
                      background: o.status === 'IN_TRANSIT' || o.status === 'ARRIVED'
                        ? 'rgba(245,158,11,0.15)'
                        : DONE_STATUSES.has(o.status)
                          ? 'rgba(16,185,129,0.12)'
                          : 'var(--bg-elevated)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: o.status === 'IN_TRANSIT' || o.status === 'ARRIVED'
                        ? 'var(--warning)'
                        : DONE_STATUSES.has(o.status)
                          ? 'var(--success)'
                          : 'var(--text-muted)',
                      flexShrink: 0,
                    }}>
                      {DONE_STATUSES.has(o.status) ? <CheckCircle size={18} /> : <Truck size={18} />}
                    </div>

                    {/* Info */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--accent)' }}>
                          #{(o.id ?? '').slice(-8).toUpperCase() || '—'}
                        </span>
                        <span className={`badge ${statusBadge}`} style={{ fontSize: 10 }}>
                          {o.status.replace(/_/g, ' ')}
                        </span>
                        <span className={`badge ${escrowBadge}`} style={{ fontSize: 10 }}>
                          {o.escrowStatus}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <MapPin size={11} /> {o.project?.name}
                        </span>
                        <span style={{ color: 'var(--border-strong)' }}>·</span>
                        <span>{o.supplier?.supplierProfile?.businessName}</span>
                      </div>
                    </div>

                    {/* Amount + date */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {formatCurrency(Number(o.totalAmount))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)', justifyContent: 'flex-end', marginTop: 3 }}>
                        <Clock size={11} />
                        {new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
