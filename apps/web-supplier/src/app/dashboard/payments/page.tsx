'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface EarningsStats {
  totalEarned: number;
  pendingEscrow: number;
  completedCount: number;
  activeCount: number;
  recentTransactions: any[];
}

export default function EarningsPage() {
  const [stats, setStats] = useState<EarningsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [filterRange, setFilterRange] = useState('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    const startTime = Date.now();
    const token = getAccessToken();
    try {
      const data = await apiRequest<EarningsStats>('/orders/supplier/stats', { token: token! });
      
      // Artificial delay to ensure a smooth "mechanical" refresh feel (min 800ms)
      const elapsed = Date.now() - startTime;
      const minDuration = 800;
      if (elapsed < minDuration) {
        await new Promise(resolve => setTimeout(resolve, minDuration - elapsed));
      }
      
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleExport = () => {
    const headers = 'Order Reference,Execution Date,Order Status,Escrow State,Total Amount\n';
    const rows = stats?.recentTransactions.map(tx => 
      `${tx.id},${new Date(tx.createdAt).toLocaleDateString()},${tx.status},${tx.escrowStatus},${tx.totalAmount}`
    ).join('\n');
    
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      maximumFractionDigits: 0
    }).format(val);
  };

  const isAnyModalOpen = !!selectedTx;

  if (loading && !stats) {
    return (
      <div className="fm-root fade-in">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="fm-root fade-in">
      <div className={`fm-content-wrap ${isAnyModalOpen ? 'fm-blurred' : ''}`}>
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="fm-header">
          <div>
           <button className="btn btn-ghost !w-auto" onClick={handleExport} disabled={!stats?.recentTransactions.length}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            
            <button className="btn btn-secondary !w-auto" onClick={fetchStats} disabled={loading}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? 'animate-spin' : ''} style={{ marginRight: 8 }}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ── KPI Grid ───────────────────────────────────────── */}
        <div className="fm-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="fm-kpi" style={{ borderLeft: '4px solid var(--success)', background: 'linear-gradient(145deg, var(--bg-surface) 0%, rgba(16,185,129,0.05) 100%)' }}>
            <div className="fm-kpi-value" style={{ color: 'var(--success)' }}>
              {fmtCurrency(stats?.totalEarned || 0)}
            </div>
            <div className="fm-kpi-label">Total Revenue</div>
          </div>
          <div className="fm-kpi" style={{ borderLeft: '4px solid #F59E0B', background: 'linear-gradient(145deg, var(--bg-surface) 0%, rgba(245,158,11,0.05) 100%)' }}>
            <div className="fm-kpi-value" style={{ color: '#F59E0B' }}>
              {fmtCurrency(stats?.pendingEscrow || 0)}
            </div>
            <div className="fm-kpi-label">Pending Escrow</div>
          </div>
          <div className="fm-kpi" style={{ borderLeft: '4px solid var(--info)' }}>
            <div className="fm-kpi-value">{stats?.completedCount || 0}</div>
            <div className="fm-kpi-label">Completed Deliveries</div>
          </div>
          <div className="fm-kpi">
            <div className="fm-kpi-value" style={{ opacity: 0.6 }}>{stats?.activeCount || 0}</div>
            <div className="fm-kpi-label">Ongoing Missions</div>
          </div>
        </div>

        {/* ── Transaction History ─────────────────────────────── */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: 'none', background: 'var(--bg-surface)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', padding: '16px 24px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title" style={{ fontSize: 16, fontWeight: 800 }}>Recent Transactions</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Filter Period</div>
              <div style={{ position: 'relative' }}>
                <button 
                  className="btn btn-secondary !py-0 !px-4 !w-auto"
                  style={{ 
                    height: '36px', minWidth: '160px', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)',
                    fontSize: 13, fontWeight: 600
                  }}
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                >
                  <span>{
                    filterRange === 'all' ? 'All History' : 
                    filterRange === '30' ? 'Last 30 Days' : 
                    filterRange === '7' ? 'Last 7 Days' : 'Today'
                  }</span>
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transform: showFilterMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {showFilterMenu && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setShowFilterMenu(false)} />
                    <div style={{ 
                      position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 101,
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                      borderRadius: 12, width: '100%', overflow: 'hidden',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.5)', animation: 'fm-slide-up 0.2s ease'
                    }}>
                      {[
                        { val: 'all', lab: 'All History' },
                        { val: '30', lab: 'Last 30 Days' },
                        { val: '7', lab: 'Last 7 Days' },
                        { val: 'today', lab: 'Today' }
                      ].map(opt => (
                        <div 
                          key={opt.val}
                          style={{ 
                            padding: '10px 16px', fontSize: 13, cursor: 'pointer',
                            background: filterRange === opt.val ? 'rgba(255,255,255,0.05)' : 'transparent',
                            color: filterRange === opt.val ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: filterRange === opt.val ? 700 : 400,
                            borderLeft: filterRange === opt.val ? '3px solid var(--info)' : '3px solid transparent'
                          }}
                          className="hover-bg"
                          onClick={() => {
                            setFilterRange(opt.val);
                            setShowFilterMenu(false);
                          }}
                        >
                          {opt.lab}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Order Reference</th>
                  <th>Execution Date</th>
                  <th>Order Status</th>
                  <th>Escrow State</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {!stats?.recentTransactions || stats.recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16, opacity: 0.3 }}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                      <p>No transactions found for this period.</p>
                    </td>
                  </tr>
                ) : stats.recentTransactions.map(tx => (
                  <tr 
                    key={tx.id} 
                    style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                    onClick={() => setSelectedTx(tx)}
                    className="hover-bg"
                  >
                    <td>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>#{tx.id.slice(-8).toUpperCase()}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Secure Protocol</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{new Date(tx.createdAt).toLocaleDateString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td>
                      <span className={`badge badge-${tx.status === 'COMPLETED' ? 'success' : 'info'}`} style={{ fontSize: 10, padding: '4px 10px' }}>
                        {tx.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ 
                          width: 8, height: 8, borderRadius: '2px', 
                          background: tx.escrowStatus === 'RELEASED' ? 'var(--success)' : '#F59E0B' 
                        }} />
                        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{tx.escrowStatus}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: tx.escrowStatus === 'RELEASED' ? 'var(--success)' : 'var(--text-primary)' }}>
                        {fmtCurrency(tx.totalAmount)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Governance Footer ────────────────────────────────── */}
        <div style={{ 
          marginTop: 'auto', padding: '16px 24px', 
          background: 'rgba(255,255,255,0.02)', borderRadius: 12, 
          border: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 16
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong>Escrow Governance:</strong> Financial settlements are governed by the Falcon Escrow Protocol. Funds are secured in institutional-grade project escrow and released only upon verified delivery confirmation.
          </div>
        </div>
      </div>

      {/* ── Transaction Detail Modal ──────────────────────── */}
      {selectedTx && (
        <div className="fm-modal-overlay" onClick={() => setSelectedTx(null)}>
          <div className="fm-modal" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-modal-title">Financial Audit Details</div>
                <div className="fm-modal-sub">Ref: {selectedTx.id.toUpperCase()}</div>
              </div>
              <button className="fm-modal-close" onClick={() => setSelectedTx(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="fm-driver-order" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="fm-driver-order-label">Settlement Amount</div>
                  <div className="fm-driver-order-name" style={{ fontSize: 18, color: 'var(--text-primary)' }}>
                    {fmtCurrency(selectedTx.totalAmount)}
                  </div>
                </div>
                <div className="fm-driver-order" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="fm-driver-order-label">Escrow Status</div>
                  <div className="fm-driver-order-name" style={{ fontWeight: 800, color: selectedTx.escrowStatus === 'RELEASED' ? 'var(--success)' : '#F59E0B' }}>
                    {selectedTx.escrowStatus}
                  </div>
                </div>
              </div>

              <div className="fm-driver-order" style={{ gap: 8, background: 'var(--bg-surface)' }}>
                <div className="fm-driver-order-label">Audit Timeline</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Initialized:</span>
                  <span style={{ fontWeight: 600 }}>{new Date(selectedTx.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status Protocol:</span>
                  <span style={{ fontWeight: 800, color: 'var(--info)' }}>{selectedTx.status}</span>
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 12, border: '1px dashed var(--border-subtle)' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                  This transaction has been verified through the institutional escrow network. 
                  Data integrity is maintained via the CSCP Governance framework.
                </p>
              </div>
            </div>

            <div className="fm-modal-actions">
              <button className="btn btn-primary px-8" style={{ width: '100%' }} onClick={() => setSelectedTx(null)}>Close Audit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
