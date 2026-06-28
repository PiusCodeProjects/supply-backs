'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { usePendingOrders } from '@/contexts/PendingOrdersContext';
import {
  Package,
  Truck,
  CheckCircle,
  Clock,
  MapPin,
  User,
  ChevronRight,
  ShieldCheck,
  FileText,
  Camera,
  Signature,
  Zap,
  Eye,
  X,
  Radio,
  Store as StoreIcon,
} from 'lucide-react';

const OrderTrackingModal = dynamic(() => import('@/components/OrderTrackingModal'), { ssr: false });

export default function FulfillmentPage() {
  // Orders come from the shared PendingOrdersProvider — the sidebar badge and
  // this page now read from the same cache and any refresh() here keeps the
  // badge accurate immediately (no waiting for the 45s poll).
  const { orders, loading: ordersLoading, refresh: refreshOrders } = usePendingOrders();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [showAssign, setShowAssign] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [trackingOrder, setTrackingOrder] = useState<any>(null);

  const loading = ordersLoading || driversLoading;

  useEffect(() => {
    fetchDrivers();
  }, []);

  async function fetchDrivers() {
    const token = getAccessToken();
    if (!token) { setDriversLoading(false); return; }
    try {
      const userData = await apiRequest<any[]>('/users/fleet/my-drivers', { token });
      const activeDrivers = userData.filter((driver) => driver.status === 'ACTIVE');
      setDrivers(activeDrivers);
      if (activeDrivers.length > 0) setSelectedDriverId(activeDrivers[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setDriversLoading(false);
    }
  }

  async function handleAccept(order: any) {
    const token = getAccessToken();
    try {
      await apiRequest(`/orders/${order.id}/accept`, { method: 'PATCH', token: token! });
      // Contractor already chose pickup vs delivery upfront. If they chose
      // delivery and we have drivers available, jump straight to dispatch.
      const fulfillmentType = order?.fulfillmentType ?? 'DELIVERY';
      if (fulfillmentType === 'DELIVERY' && drivers.length > 0 && !order.bookedByContractor) {
        setShowAssign(order.id);
      }
      // Refresh shared orders cache → table updates here AND sidebar badge
      // recalculates without a separate fetch.
      refreshOrders();
    } catch (err) {
      alert('Failed to accept order');
    }
  }

  async function handleAssign() {
    if (!showAssign || !selectedDriverId) return;
    const token = getAccessToken();
    try {
      await apiRequest(`/orders/${showAssign}/assign-driver`, {
        method: 'PATCH',
        token: token!,
        body: { driverId: selectedDriverId }
      });
      setShowAssign(null);
      refreshOrders();
    } catch (err) {
      alert('Failed to assign driver');
    }
  }

  const isAnyModalOpen = !!showAssign || !!viewingOrder || !!trackingOrder;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'var(--info)';
      case 'ACCEPTED': return 'var(--accent)';
      case 'DISPATCHED': return '#3B82F6';
      case 'IN_TRANSIT': return '#F59E0B';
      case 'ARRIVED': return '#8B5CF6';
      case 'DELIVERED':
      case 'COMPLETED': return 'var(--success)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div className="fm-root fade-in">
      <div className={`fm-content-wrap ${isAnyModalOpen ? 'fm-blurred' : ''}`}>
       

        {loading ? (
          <div style={{ padding: 100, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : orders.length === 0 ? (
          <div className="card" style={{ padding: 80, textAlign: 'center', background: 'var(--bg-surface)' }}>
            <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>No Active Assignments</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>Incoming procurement requests will appear here in real-time.</p>
          </div>
        ) : (
          <div className="card" style={{ border: 'none', background: 'var(--bg-surface)', overflow: 'hidden' }}>
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Order Reference</th>
                  <th>Network Nodes</th>
                  <th>Shipment Items</th>
                  <th>Escrow Value</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Logistics</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} onClick={() => setViewingOrder(o)} style={{ cursor: 'pointer' }} className="hover-bg">
                    <td>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>#{(o.id ?? '').slice(-8).toUpperCase() || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2 }}>Secure ID</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <User size={12} style={{ opacity: 0.5 }} />
                          {o.contractor?.contractorProfile?.firstName ?? ''} {o.contractor?.contractorProfile?.lastName ?? ''}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={12} style={{ opacity: 0.5 }} />
                          {o.project?.name ?? (o.shippingAddress ? o.shippingAddress.split('\n')[0].slice(0, 36) : 'Personal purchase')}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {(o.items?.length ?? 0)} Category Items
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(o.items ?? []).map((i: any) => i?.catalogItem?.name ?? 'Item').join(', ')}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>GH₵ {(o.totalAmount ?? 0).toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: o.escrowStatus === 'RELEASED' ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
                        {o.escrowStatus === 'RELEASED' ? 'RELEASED' : 'SECURED'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '2px', background: getStatusColor(o.status) }} />
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {(o.status ?? '').replace(/_/g, ' ')}
                        </span>
                        {o.deliveryType === 'EXPRESS' && <Zap size={12} color="var(--accent)" />}
                        {(() => {
                          const ft = o.fulfillmentType ?? 'DELIVERY';
                          const Icon = ft === 'PICKUP' ? StoreIcon : Truck;
                          return (
                            <span
                              title={ft === 'PICKUP' ? 'Contractor will collect' : 'Supplier delivers'}
                              style={{
                                marginLeft: 4,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontSize: 9,
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                background: ft === 'PICKUP' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)',
                                color: ft === 'PICKUP' ? 'var(--accent)' : '#3B82F6',
                                border: ft === 'PICKUP' ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(59,130,246,0.3)',
                              }}
                            >
                              <Icon size={10} />
                              {ft === 'PICKUP' ? 'Pickup' : 'Delivery'}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                        {o.status === 'PENDING' && (
                          o.bookedByContractor ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <button onClick={(e) => { e.stopPropagation(); handleAccept(o); }} className="btn btn-primary !py-2 !px-4 !w-auto" style={{ fontSize: 12 }}>Accept</button>
                              <div style={{ fontSize: 9, color: '#60a5fa', fontWeight: 800, textTransform: 'uppercase' }}>Driver Pre-assigned</div>
                            </div>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); handleAccept(o); }} className="btn btn-primary !py-2 !px-4 !w-auto" style={{ fontSize: 12 }}>Accept</button>
                          )
                        )}
                         {o.status === 'ACCEPTED' && (
                          (o.fulfillmentType ?? 'DELIVERY') === 'PICKUP' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 }}>Ready for Pickup</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Contractor will collect</div>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowAssign(o.id); }}
                              className="btn btn-secondary !py-2 !px-4 !w-auto"
                              style={{ fontSize: 12 }}
                            >
                              Dispatch
                            </button>
                          )
                        )}
                        {['DISPATCHED', 'DRIVER_ACCEPTED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'COMPLETED'].includes(o.status) && (
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{o.driver?.driverProfile?.firstName || 'Assigned'}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              {o.status === 'DISPATCHED' ? 'Waiting for Driver' : `Unit: ${(o.id ?? '').slice(-4)}`}
                            </div>
                            {['DRIVER_ACCEPTED', 'IN_TRANSIT', 'ARRIVED'].includes(o.status) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setTrackingOrder(o); }}
                                className="btn btn-sm !py-1 !px-3 !w-auto"
                                style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(245,158,11,0.1)', color: 'var(--accent)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8 }}
                              >
                                <Radio size={10} />
                                Track Live
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Dispatch Modal ────────────────────────────────── */}
      {showAssign && typeof document !== 'undefined' && createPortal(
        <div className="fm-modal-overlay" onClick={() => setShowAssign(null)}>
          <div className="fm-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-modal-title">Logistics Dispatch</div>
                <div className="fm-modal-sub">Assign a verified driver to this mission</div>
              </div>
              <button className="fm-modal-close" onClick={() => setShowAssign(null)}>✕</button>
            </div>
            
            <div className="fm-modal-form">
              <div className="form-group">
                <label>Operational Driver Pool</label>
                {drivers.length === 0 ? (
                  <div style={{ padding: 20, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 16, border: '1px solid rgba(239, 68, 68, 0.2)', textAlign: 'center' }}>
                    <Truck size={32} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--danger)' }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>No Active Drivers Available</div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
                      You need at least one active driver in your fleet to dispatch this order.
                    </p>
                    <button 
                      onClick={() => window.location.href = '/dashboard/drivers'}
                      className="btn btn-primary btn-sm"
                      style={{ width: '100%', background: 'var(--danger)', color: '#fff' }}
                    >
                      Go to Fleet Management
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {drivers.map(d => (
                      <div 
                        key={d.id} 
                        onClick={() => setSelectedDriverId(d.id)}
                        style={{ 
                          padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border-subtle)',
                          background: selectedDriverId === d.id ? 'var(--bg-elevated)' : 'transparent',
                          borderColor: selectedDriverId === d.id ? 'var(--accent)' : 'var(--border-subtle)',
                          cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{d.driverProfile.firstName} {d.driverProfile.lastName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Status: Active</div>
                        </div>
                        {selectedDriverId === d.id && <CheckCircle size={16} color="var(--accent)" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="fm-modal-actions">
                <button onClick={() => setShowAssign(null)} className="btn btn-ghost !w-auto">Cancel</button>
                <button onClick={handleAssign} disabled={drivers.length === 0} className="btn btn-primary !w-auto px-8">Confirm Dispatch</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Order Detail / Fulfillment View (Mission Blueprint) ── */}
      {viewingOrder && typeof document !== 'undefined' && createPortal(
        <div className="fm-modal-overlay" onClick={() => setViewingOrder(null)}>
          <div className="fm-modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <div>
                <div className="fm-modal-title">Mission Blueprint</div>
                <div className="fm-modal-sub">Logistics Ref: #{(viewingOrder.id ?? '').slice(-8).toUpperCase() || '—'}</div>
              </div>
              <button className="fm-modal-close" onClick={() => setViewingOrder(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Status Banner */}
              <div style={{ 
                padding: '16px 20px', borderRadius: 16, 
                background: `linear-gradient(135deg, ${getStatusColor(viewingOrder.status)}22 0%, rgba(255,255,255,0) 100%)`,
                border: `1px solid ${getStatusColor(viewingOrder.status)}33`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {viewingOrder.status === 'COMPLETED' || viewingOrder.status === 'DELIVERED' ? (
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      <ShieldCheck size={24} />
                    </div>
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Clock size={24} color={getStatusColor(viewingOrder.status)} />
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: getStatusColor(viewingOrder.status) }}>Operational Status</div>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{(viewingOrder.status ?? '').replace(/_/g, ' ')}</div>
                  </div>
                </div>
                {(viewingOrder.status === 'COMPLETED' || viewingOrder.status === 'DELIVERED') && (
                  <div className="badge badge-success" style={{ padding: '8px 12px' }}>MISSION SUCCESS</div>
                )}
              </div>

              {/* Fulfilled Details / POD */}
              {(viewingOrder.podPhotoUrl || viewingOrder.podSignatureUrl) && (
                <div className="settings-group fade-in" style={{ margin: 0 }}>
                  <div className="settings-group-header" style={{ marginBottom: 12 }}>
                    <div className="settings-group-title" style={{ fontSize: 14 }}>Proof of Execution</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="fm-driver-order" style={{ background: 'var(--bg-elevated)', padding: 12 }}>
                      <div className="fm-driver-order-label">Delivery Signature</div>
                      <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginTop: 8 }}>
                        {viewingOrder.podSignatureUrl ? (
                          <img src={viewingOrder.podSignatureUrl} alt="Signature" style={{ maxHeight: '100%', maxWidth: '100%' }} />
                        ) : (
                          <div style={{ textAlign: 'center' }}>
                            <Signature size={20} style={{ opacity: 0.3 }} />
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>Digital Auth Active</div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="fm-driver-order" style={{ background: 'var(--bg-elevated)', padding: 12 }}>
                      <div className="fm-driver-order-label">Cargo Verification</div>
                      <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginTop: 8 }}>
                         {viewingOrder.podPhotoUrl ? (
                          <img src={viewingOrder.podPhotoUrl} alt="Cargo" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ textAlign: 'center' }}>
                            <Camera size={20} style={{ opacity: 0.3 }} />
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>Geo-Tagged Entry</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Timestamp: {viewingOrder.podTimestamp ? new Date(viewingOrder.podTimestamp).toLocaleString() : 'N/A'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: 11, fontWeight: 700 }}>
                      <MapPin size={10} />
                      COORDINATES VERIFIED
                    </div>
                  </div>
                </div>
              )}

              {/* Order Content */}
              <div className="settings-group" style={{ margin: 0 }}>
                <div className="settings-group-header" style={{ marginBottom: 12 }}>
                  <div className="settings-group-title" style={{ fontSize: 14 }}>Inventory Content</div>
                </div>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, overflow: 'hidden' }}>
                  {(viewingOrder.items ?? []).map((item: any, idx: number) => (
                    <div key={idx} style={{ padding: '12px 20px', borderBottom: idx === (viewingOrder.items?.length ?? 0) - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '2px', background: 'var(--accent)' }} />
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{item?.catalogItem?.name ?? 'Item'}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)' }}>x {item?.quantity ?? 0}</div>
                    </div>
                  ))}
                  <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Total Escrow Value</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>GH₵ {(viewingOrder.totalAmount ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="fm-modal-actions">
              <button onClick={() => setViewingOrder(null)} className="btn btn-primary px-8" style={{ width: '100%' }}>Close Blueprint</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Live Tracking Modal ───────────────────────────── */}
      {trackingOrder && (
        <OrderTrackingModal order={trackingOrder} onClose={() => setTrackingOrder(null)} />
      )}
    </div>
  );
}
