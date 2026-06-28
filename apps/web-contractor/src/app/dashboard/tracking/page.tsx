'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { io, Socket } from 'socket.io-client';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { MapPin, Truck, Radio, Navigation, Package, Clock, CheckCircle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const TrackingMap = dynamic(() => import('@/components/TrackingMap'), { ssr: false });

const SOCKET_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api').replace(/\/api$/, '');

const TRACKABLE_STATUSES = ['DISPATCHED', 'DRIVER_ACCEPTED', 'IN_TRANSIT', 'ARRIVED'];

type DriverPos = { lat: number; lng: number; isLive: boolean; updatedAt: Date };

// Personal-purchase orders ride on shippingAddress + recipientName and have
// no project attached. Project orders fill .project.{name,location,lat,lng}.
// These helpers keep the UI happy for both.
function dropoffName(o: any): string {
  return o?.project?.name || o?.recipientName || 'Delivery';
}
function dropoffLocation(o: any): string {
  return o?.project?.location || o?.shippingAddress || '';
}

export default function TrackingPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [driverPositions, setDriverPositions] = useState<Record<string, DriverPos>>({});
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const joinedRoomsRef = useRef<Set<string>>(new Set());

  const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? null;
  const selectedPos = selectedOrderId ? driverPositions[selectedOrderId] ?? null : null;

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    initSocket();
    return () => {
      clearInterval(interval);
      socketRef.current?.disconnect();
    };
  }, []);

  // When orders change, join rooms for all trackable ones
  useEffect(() => {
    if (!socketRef.current?.connected) return;
    joinTrackableRooms();
  }, [orders]);

  async function fetchOrders() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/orders/contractor', { token: token! });
      const trackable = data.filter(o => TRACKABLE_STATUSES.includes(o.status) || o.status === 'DELIVERED');
      setOrders(trackable);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function initSocket() {
    const token = getAccessToken();
    if (!token) return;

    const socket = io(`${SOCKET_BASE}/tracking`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      joinTrackableRooms();
    });

    socket.on('locationUpdated', (data: { orderId: string; lat: number; lng: number; timestamp: string }) => {
      setDriverPositions(prev => ({
        ...prev,
        [data.orderId]: { lat: data.lat, lng: data.lng, isLive: true, updatedAt: new Date(data.timestamp) },
      }));
    });

    socketRef.current = socket;
  }

  function joinTrackableRooms() {
    const socket = socketRef.current;
    if (!socket) return;
    orders
      .filter(o => TRACKABLE_STATUSES.includes(o.status))
      .forEach(o => {
        if (!joinedRoomsRef.current.has(o.id)) {
          socket.emit('joinOrder', { orderId: o.id });
          joinedRoomsRef.current.add(o.id);
        }
      });
  }

  function selectOrder(order: any) {
    setSelectedOrderId(order.id);
    // Join room if not already joined
    if (socketRef.current && !joinedRoomsRef.current.has(order.id)) {
      socketRef.current.emit('joinOrder', { orderId: order.id });
      joinedRoomsRef.current.add(order.id);
    }
  }

  function getStatusBadge(status: string) {
    const map: Record<string, string> = {
      DISPATCHED: 'badge-info',
      DRIVER_ACCEPTED: 'badge-warning',
      IN_TRANSIT: 'badge-accent',
      ARRIVED: 'badge-success',
      DELIVERED: 'badge-success',
    };
    return map[status] ?? 'badge-default';
  }

  function getStatusIcon(status: string) {
    if (status === 'IN_TRANSIT') return <Truck size={14} className="inline mr-1" />;
    if (status === 'ARRIVED' || status === 'DELIVERED') return <CheckCircle size={14} className="inline mr-1" />;
    if (status === 'DISPATCHED' || status === 'DRIVER_ACCEPTED') return <Navigation size={14} className="inline mr-1" />;
    return <Clock size={14} className="inline mr-1" />;
  }

  const destinationPosition: [number, number] | null =
    selectedOrder?.project?.lat && selectedOrder?.project?.lng
      ? [selectedOrder.project.lat, selectedOrder.project.lng]
      : null;

  const driverName = selectedOrder?.driver
    ? `${selectedOrder.driver.driverProfile?.firstName ?? ''} ${selectedOrder.driver.driverProfile?.lastName ?? ''}`.trim()
    : undefined;

  const liveCount = Object.values(driverPositions).filter(p => p.isLive).length;

  return (
    <div
      className="fade-in tracking-shell"
      style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, height: 'calc(100vh - 128px)' }}
    >
      {/* Sidebar */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Truck size={18} color="var(--accent)" />
            <span style={{ fontWeight: 600 }}>Active Deliveries</span>
          </div>
          {liveCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', display: 'inline-block', boxShadow: '0 0 6px var(--success)' }} />
              {liveCount} LIVE
            </div>
          )}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 12 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : orders.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              <Package size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
              <p>No deliveries currently in transit.</p>
            </div>
          ) : (
            orders.map(o => {
              const pos = driverPositions[o.id];
              const isSelected = selectedOrderId === o.id;
              return (
                <div
                  key={o.id}
                  onClick={() => selectOrder(o)}
                  style={{
                    padding: 14,
                    marginBottom: 10,
                    borderRadius: 12,
                    cursor: 'pointer',
                    border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                    background: isSelected ? 'var(--accent-muted)' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>
                      #{(o.id ?? '').slice(-8).toUpperCase() || '—'}
                    </div>
                    {pos?.isLive && o.status === 'IN_TRANSIT' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 900, color: 'var(--success)', textTransform: 'uppercase' }}>
                        <Radio size={10} />
                        Live GPS
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{dropoffName(o)}</div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <MapPin size={11} /> {dropoffLocation(o) || 'Address pending'}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`badge ${getStatusBadge(o.status)}`} style={{ fontSize: 9 }}>
                      {getStatusIcon(o.status)}
                      {o.status.replace(/_/g, ' ')}
                    </span>
                    {o.driver && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {o.driver.driverProfile?.firstName}
                      </span>
                    )}
                  </div>

                  {pos && (
                    <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', opacity: 0.7 }}>
                      {pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Map Panel */}
      <div className="card" style={{ position: 'relative', overflow: 'hidden', padding: 0 }}>
        {selectedOrder ? (
          <>
            {/* Map header overlay */}
            <div style={{
              position: 'absolute', top: 16, left: 16, zIndex: 1000,
              background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
              borderRadius: 12, padding: '10px 16px', color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 2 }}>
                Tracking Order
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{dropoffName(selectedOrder)}</div>
              {driverName && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Driver: {driverName}</div>}
            </div>

            {/* Live indicator */}
            {selectedPos?.isLive && selectedOrder.status === 'IN_TRANSIT' && (
              <div style={{
                position: 'absolute', top: 16, right: 16, zIndex: 1000,
                background: 'rgba(16,185,129,0.15)', backdropFilter: 'blur(8px)',
                borderRadius: 100, padding: '6px 14px', color: 'var(--success)',
                border: '1px solid rgba(16,185,129,0.3)',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase',
              }}>
                <Radio size={12} />
                Broadcasting Live
              </div>
            )}

            {/* No GPS yet overlay */}
            {!selectedPos && TRACKABLE_STATUSES.includes(selectedOrder.status) && (
              <div style={{
                position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
                padding: '8px 20px', borderRadius: 100, fontSize: 12, color: '#fff',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                Waiting for driver GPS signal...
              </div>
            )}

            <TrackingMap
              driverPosition={selectedPos ? [selectedPos.lat, selectedPos.lng] : null}
              destinationPosition={destinationPosition}
              destinationLabel={dropoffName(selectedOrder)}
              isLive={selectedPos?.isLive ?? false}
              driverName={driverName}
            />
          </>
        ) : (
          <div style={{
            height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', gap: 12,
          }}>
            <MapPin size={48} style={{ opacity: 0.15 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {orders.length > 0 ? 'Select a delivery from the sidebar to track it' : 'No active deliveries'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
