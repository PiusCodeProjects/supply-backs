'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { io, Socket } from 'socket.io-client';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

const FleetMap = dynamic(() => import('@/components/FleetMap'), {
  ssr: false,
  loading: () => (
    <div className="fleet-map-loading">
      <div className="spinner" />
      <span>Loading Map...</span>
    </div>
  ),
});

const STATUS_COLORS: Record<string, string> = {
  live: '#10B981',
  mission: '#3B82F6',
  idle: '#475569',
};

export default function FleetManagement() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<string | null>(null);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', password: '', licenseNo: '' });

  const liveCount    = drivers.filter(d => d.isLive).length;
  const missionCount = drivers.filter(d => d.driverOrders?.length > 0).length;
  const idleCount    = drivers.length - missionCount;

  useEffect(() => {
    fetchDrivers();
    fetchPendingOrders();
    initSocket();
    return () => { socketRef.current?.disconnect(); };
  }, []);

  async function fetchPendingOrders() {
    try {
      const data = await apiRequest<any[]>('/orders/supplier', { token: getAccessToken()! });
      setPendingOrders(data.filter(o => o.status === 'ACCEPTED'));
    } catch (e) {
      console.error('Pending orders fetch error:', e);
    }
  }

  async function fetchDrivers() {
    setLoading(true);
    try {
      const data = await apiRequest<any[]>('/users/fleet/my-drivers', { token: getAccessToken()! });
      setDrivers(data.map(d => ({
        ...d,
        lat: d.driverOrders?.[0]?.project?.lat || null,
        lng: d.driverOrders?.[0]?.project?.lng || null,
        isLive: false,
      })));
    } catch (e) {
      console.error('Fleet fetch error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function initSocket() {
    const token = getAccessToken();
    if (!token) return;
    const socket = io('http://localhost:4001/tracking', {
      auth: { token }, transports: ['websocket'], reconnection: true,
    });
    socket.on('locationUpdated', (data: { orderId: string; lat: number; lng: number }) => {
      setDrivers(prev => prev.map(d => {
        const hasOrder = d.driverOrders?.some((o: any) => o.id === data.orderId);
        return hasOrder ? { ...d, lat: data.lat, lng: data.lng, isLive: true } : d;
      }));
    });
    socketRef.current = socket;
  }

  async function handleAddDriver(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setAddError('');
    try {
      await apiRequest('/auth/register/driver', { method: 'POST', token: getAccessToken()!, body: form });
      setShowAddModal(false);
      setForm({ firstName: '', lastName: '', phone: '', password: '', licenseNo: '' });
      fetchDrivers();
    } catch (err: any) {
      setAddError(err.message || 'Failed to register driver');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveDriver(id: string) {
    if (!confirm('Are you sure you want to remove this driver from your fleet?')) return;
    try {
      await apiRequest(`/users/fleet/drivers/${id}`, { method: 'DELETE', token: getAccessToken()! });
      fetchDrivers();
    } catch (e) {
      console.error('Remove driver error:', e);
      alert('Failed to remove driver');
    }
  }

  async function handleAssignMission(orderId: string) {
    if (!showAssignModal) return;
    try {
      await apiRequest(`/orders/${orderId}/assign-driver`, {
        method: 'PATCH',
        token: getAccessToken()!,
        body: { driverId: showAssignModal }
      });
      setShowAssignModal(null);
      fetchDrivers();
      fetchPendingOrders();
    } catch (e) {
      console.error('Assign mission error:', e);
      alert('Failed to assign mission');
    }
  }

  const selectedDriver = drivers.find(d => d.id === selectedId) || null;

  function getDriverStatus(d: any) {
    if (d.isLive) return { label: 'Live GPS', color: STATUS_COLORS.live, dot: 'live' };
    if (d.driverOrders?.length > 0) return { label: 'On Mission', color: STATUS_COLORS.mission, dot: 'mission' };
    return { label: 'Idle', color: STATUS_COLORS.idle, dot: 'idle' };
  }

  const isAnyModalOpen = showAddModal || !!showAssignModal;
  
  return (
    <div className="fm-root fade-in">
      <div className={`fm-content-wrap ${isAnyModalOpen ? 'fm-blurred' : ''}`}>
        {/* ── Header ─────────────────────────────────────────── */}
        <div
          className="fm-header"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginBottom: 24,
            paddingBottom: 24,
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <button
            className="btn btn-primary fm-add-btn"
            onClick={() => setShowAddModal(true)}
            style={{ width: 'auto' }}
          >
            + Add Driver
          </button>
        </div>

        {/* ── KPI Row ────────────────────────────────────────── */}
        <div className="fm-kpis">
          <div className="fm-kpi">
            <div className="fm-kpi-value">{drivers.length}</div>
            <div className="fm-kpi-label">Total Drivers</div>
          </div>
          <div className="fm-kpi fm-kpi--green">
            <div className="fm-kpi-value" style={{ color: 'var(--success)' }}>{liveCount}</div>
            <div className="fm-kpi-label">Live GPS</div>
          </div>
          <div className="fm-kpi fm-kpi--blue">
            <div className="fm-kpi-value" style={{ color: 'var(--info)' }}>{missionCount}</div>
            <div className="fm-kpi-label">On Mission</div>
          </div>
          <div className="fm-kpi">
            <div className="fm-kpi-value" style={{ color: 'var(--text-secondary)' }}>{idleCount}</div>
            <div className="fm-kpi-label">Idle</div>
          </div>
        </div>

        {/* ── Main Split ─────────────────────────────────────── */}
        <div className="fm-body">

          {/* Left – Driver Roster */}
          <div className="fm-roster">
            <div className="fm-roster-header">
              <span>Driver Roster</span>
              <button className="fm-refresh-btn" onClick={fetchDrivers} title="Refresh">↻</button>
            </div>

            <div className="fm-roster-list">
              {loading ? (
                <div className="fm-empty"><div className="spinner" /></div>
              ) : drivers.length === 0 ? (
                <div className="fm-empty">
                  <div className="fm-empty-icon">🚚</div>
                  <p>No drivers yet.</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddModal(true)}>Add First Driver</button>
                </div>
              ) : drivers.map(d => {
                const status = getDriverStatus(d);
                const order  = d.driverOrders?.[0];
                const isSelected = d.id === selectedId;
                return (
                  <div
                    key={d.id}
                    className={`fm-driver-card ${isSelected ? 'fm-driver-card--selected' : ''}`}
                    onClick={() => setSelectedId(isSelected ? null : d.id)}
                  >
                    {/* Avatar + Name */}
                    <div className="fm-driver-top">
                      <div className="fm-driver-avatar" style={{ background: `${status.color}20`, border: `2px solid ${status.color}40` }}>
                        {d.driverProfile?.firstName?.[0]}{d.driverProfile?.lastName?.[0]}
                      </div>
                      <div className="fm-driver-info">
                        <div className="fm-driver-name">
                          {d.driverProfile?.firstName} {d.driverProfile?.lastName}
                        </div>
                        <div className="fm-driver-phone">
                          {d.phone}
                          <a 
                            href={`tel:${d.phone}`} 
                            className="fm-call-link"
                            onClick={(e) => e.stopPropagation()}
                            title="Call Driver"
                          >
                            📞
                          </a>
                        </div>
                      </div>
                      <div className="fm-driver-status-badge" style={{ background: `${status.color}18`, color: status.color, border: `1px solid ${status.color}30` }}>
                        {status.label === 'Live GPS' && <span className="fm-live-dot" />}
                        {status.label}
                      </div>
                    </div>

                    {/* Current Order */}
                    {order ? (
                      <div className="fm-driver-order">
                        <div className="fm-driver-order-label">Current Delivery</div>
                        <div className="fm-driver-order-name">{order.project?.name || 'Unknown Project'}</div>
                        <div className="fm-driver-order-loc">📍 {order.project?.location || '—'}</div>
                        <div className="fm-driver-order-status">
                          <span style={{ background: '#3B82F620', color: '#3B82F6', border: '1px solid #3B82F630', borderRadius: 6, fontSize: 10, fontWeight: 700, padding: '2px 8px', textTransform: 'uppercase' }}>
                            {order.status?.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="fm-driver-idle-tag">
                        No active delivery
                        <button 
                          className="btn btn-sm btn-ghost" 
                          style={{ marginTop: 8, width: '100%', fontSize: 10, color: 'var(--accent)' }}
                          onClick={(e) => { e.stopPropagation(); setShowAssignModal(d.id); }}
                        >
                          + Assign Mission
                        </button>
                      </div>
                    )}

                    {/* Quick Actions */}
                    {isSelected && (
                      <div className="fm-driver-actions">
                        <button 
                          className="btn btn-sm btn-danger" 
                          style={{ width: '100%', fontSize: 10, padding: '4px' }}
                          onClick={(e) => { e.stopPropagation(); handleRemoveDriver(d.id); }}
                        >
                          Remove Driver
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right – Map */}
          <div className="fm-map-panel">
            {/* Map overlays */}
            <div className="fm-map-badge">
              {liveCount > 0
                ? <><span className="fm-live-dot" /> {liveCount} Live Signal{liveCount > 1 ? 's' : ''}</>
                : 'No live signals'}
            </div>

            {/* Map legend */}
            <div className="fm-map-legend">
              <div className="legend-item">
                <span className="legend-icon" style={{background:'#10B981'}}></span> Live GPS
              </div>
              <div className="legend-item">
                <span className="legend-icon" style={{background:'#F59E0B'}}></span> Selected
              </div>
              <div className="legend-item">
                <span className="legend-icon" style={{background:'#3B82F6'}}></span> Idle
              </div>
            </div>

            {selectedDriver && (
              <div className="fm-map-selected">
                <div className="fm-map-selected-name">{selectedDriver.driverProfile?.firstName} {selectedDriver.driverProfile?.lastName}</div>
                {selectedDriver.lat
                  ? <div style={{ fontSize: 10, opacity: 0.6, fontFamily: 'monospace' }}>{selectedDriver.lat.toFixed(5)}, {selectedDriver.lng.toFixed(5)}</div>
                  : <div style={{ fontSize: 11, opacity: 0.5 }}>No GPS data</div>}
              </div>
            )}

            <FleetMap drivers={drivers} selectedDriverId={selectedId} />
          </div>
        </div>
      </div>

      {/* ── Add Driver Modal ───────────────────────────────── */}
      {showAddModal && (
        <div className="fm-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="fm-modal" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-modal-title">Register New Driver</div>
                <div className="fm-modal-sub">Add a driver to your fleet</div>
              </div>
              <button className="fm-modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {addError && <div className="alert alert-danger" style={{ margin: '0 0 16px' }}>{addError}</div>}

            <form onSubmit={handleAddDriver} className="fm-modal-form">
              <div className="fm-form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input className="input" type="text" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="John" />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input className="input" type="text" required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="Doe" />
                </div>
              </div>
              <div className="form-group">
                <label>Phone / Login ID</label>
                <input className="input" type="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+233 XX XXX XXXX" />
              </div>
              <div className="form-group">
                <label>License Number</label>
                <input className="input" type="text" required value={form.licenseNo} onChange={e => setForm({ ...form, licenseNo: e.target.value })} placeholder="GH-LIC-XXXXX" />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input className="input" type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Set a secure password" />
              </div>
              <div className="fm-modal-actions">
                <button type="button" className="btn btn-ghost !w-auto" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary !w-auto px-8" disabled={submitting}>
                  {submitting ? <><div className="spinner" /> Registering...</> : 'Register Driver'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Assign Mission Modal ─────────────────────────── */}
      {showAssignModal && (
        <div className="fm-modal-overlay" onClick={() => setShowAssignModal(null)}>
          <div className="fm-modal" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-modal-title">Assign Mission</div>
                <div className="fm-modal-sub">Dispatch this driver to a project</div>
              </div>
              <button className="fm-modal-close" onClick={() => setShowAssignModal(null)}>✕</button>
            </div>

            <div className="fm-modal-body" style={{ maxHeight: '300px', overflowY: 'auto', padding: '0 4px' }}>
              {pendingOrders.length === 0 ? (
                <div className="fm-empty">
                  <p>No pending missions to assign.</p>
                </div>
              ) : (
                pendingOrders.map(o => (
                  <div 
                    key={o.id} 
                    className="fm-driver-order" 
                    style={{ marginBottom: 12, cursor: 'pointer', border: '1px solid var(--border-default)' }}
                    onClick={() => handleAssignMission(o.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700 }}>#{o.id.slice(-8).toUpperCase()}</div>
                      <div className="badge badge-info" style={{ fontSize: 9 }}>{o.items.length} items</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{o.project.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📍 {o.project.location}</div>
                  </div>
                ))
              )}
            </div>
            
            <div className="fm-modal-actions">
              <button className="btn btn-ghost !w-auto" onClick={() => setShowAssignModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
