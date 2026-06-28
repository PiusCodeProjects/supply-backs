'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useSocket } from '@/contexts/SocketContext';
import {
  MapPin,
  Truck,
  Phone,
  Clock,
  Radio,
  Satellite,
  WifiOff,
} from 'lucide-react';

// Map is dynamically imported so Leaflet never runs during SSR. It's only
// rendered once we have a valid driver position — never with null coords.
const OrderTrackingMap = dynamic(() => import('./OrderTrackingMap'), {
  ssr: false,
  loading: () => null,
});

type Props = {
  order: any;
  onClose: () => void;
};

type DriverPos = { lat: number; lng: number };

function isValidLatLng(p: { lat?: number | null; lng?: number | null } | null | undefined): p is DriverPos {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    !Number.isNaN(p.lat) &&
    !Number.isNaN(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

export default function OrderTrackingModal({ order, onClose }: Props) {
  const socket = useSocket('tracking');
  const [driverPos, setDriverPos] = useState<DriverPos | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Hook into the shared tracking socket — join this order's room, listen for
  // GPS updates, reflect connection state in the UI.
  useEffect(() => {
    if (!order?.id) return;

    const joinRoom = () => {
      try {
        socket.emit('joinOrder', { orderId: order.id });
        setConnection('connected');
      } catch {
        setConnection('error');
      }
    };

    const onLocationUpdated = (data: { orderId: string; lat: number; lng: number }) => {
      if (data.orderId !== order.id) return;
      if (!isValidLatLng(data)) return;
      setDriverPos({ lat: data.lat, lng: data.lng });
      setLastUpdate(new Date());
    };

    const onConnectError = () => setConnection('error');
    const onDisconnect = () => setConnection('connecting');

    if (socket.connected) joinRoom();
    else setConnection('connecting');

    socket.on('connect', joinRoom);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('locationUpdated', onLocationUpdated);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('locationUpdated', onLocationUpdated);
    };
  }, [socket, order?.id]);

  const driverProfile = order?.driver?.driverProfile;
  const driverName = driverProfile
    ? `${driverProfile.firstName ?? ''} ${driverProfile.lastName ?? ''}`.trim() || 'Driver'
    : null;
  const driverPhone = order?.driver?.phone ?? null;
  const projectName = order?.project?.name ?? null;
  const projectLocation = order?.project?.location ?? order?.shippingAddress ?? null;
  const orderShortId = (order?.id ?? '').slice(-8).toUpperCase();
  const statusLabel = (order?.status ?? '').replace(/_/g, ' ');

  const destination: [number, number] | null = isValidLatLng(order?.project)
    ? [order.project.lat, order.project.lng]
    : null;

  // Recency hint — the driver app only broadcasts during a live leg, so we
  // consider the position "live" if we got an update in the last 60s.
  const isLive =
    !!lastUpdate && Date.now() - lastUpdate.getTime() < 60_000 && connection === 'connected';

  const hasMap = !!driverPos;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fm-modal-overlay" onClick={onClose}>
      <div
        className="fm-modal"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="otm-title"
      >
        <div className="fm-modal-header">
          <div>
            <div className="fm-modal-title" id="otm-title">Live Tracking</div>
            <div className="fm-modal-sub">
              Logistics Ref: #{orderShortId || '—'}
            </div>
          </div>
          <button className="fm-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Connection / state banner */}
          <StatusBanner
            connection={connection}
            hasMap={hasMap}
            isLive={isLive}
            driverName={driverName}
            lastUpdate={lastUpdate}
          />

          {/* Map surface — fixed height, with a friendly empty state. */}
          <div
            style={{
              position: 'relative',
              height: 280,
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              background: '#0b1528',
            }}
          >
            {hasMap ? (
              <OrderTrackingMap
                driver={[driverPos!.lat, driverPos!.lng]}
                destination={destination}
                driverLabel={driverName ?? 'Driver'}
                destinationLabel={projectName ?? 'Drop-off'}
                isLive={isLive}
              />
            ) : (
              <EmptyMap connection={connection} />
            )}
          </div>

          {/* Snapshot */}
          <div className="settings-group" style={{ margin: 0 }}>
            <div className="settings-group-header" style={{ marginBottom: 12 }}>
              <div className="settings-group-title" style={{ fontSize: 14 }}>Current Snapshot</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 16, overflow: 'hidden' }}>
              <SnapshotRow icon={<Clock size={15} />} label="Status" value={statusLabel || 'Pending'} />
              {driverName && <SnapshotRow icon={<Truck size={15} />} label="Driver" value={driverName} />}
              {projectLocation && (
                <SnapshotRow
                  icon={<MapPin size={15} />}
                  label="Drop-off"
                  value={projectLocation}
                  last={!driverPhone}
                />
              )}
              {driverPhone && (
                <SnapshotRow icon={<Phone size={15} />} label="Driver phone" value={driverPhone} last />
              )}
            </div>
          </div>
        </div>

        <div className="fm-modal-actions">
          {driverPhone ? (
            <>
              <button
                onClick={onClose}
                className="btn"
                style={{
                  flex: '0 0 auto',
                  padding: '0 22px',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                Close
              </button>
              <a
                href={`tel:${driverPhone}`}
                className="btn btn-primary px-8"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  textDecoration: 'none',
                }}
              >
                <Phone size={15} /> Call Driver
              </a>
            </>
          ) : (
            <button onClick={onClose} className="btn btn-primary px-8" style={{ width: '100%' }}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatusBanner({
  connection,
  hasMap,
  isLive,
  driverName,
  lastUpdate,
}: {
  connection: 'connecting' | 'connected' | 'error';
  hasMap: boolean;
  isLive: boolean;
  driverName: string | null;
  lastUpdate: Date | null;
}) {
  let tone: 'success' | 'info' | 'warn' | 'error';
  let eyebrow: string;
  let title: string;
  let detail: string;
  let Icon: typeof Radio;

  if (connection === 'error') {
    tone = 'error';
    eyebrow = 'Connection issue';
    title = "We can't reach the tracking service";
    detail = 'Status updates may be delayed. Try closing and reopening this view.';
    Icon = WifiOff;
  } else if (isLive) {
    tone = 'success';
    eyebrow = 'Live GPS';
    title = `${driverName ?? 'Driver'} is broadcasting`;
    detail = lastUpdate ? `Last update ${secondsAgo(lastUpdate)}s ago` : 'Receiving updates';
    Icon = Radio;
  } else if (hasMap) {
    tone = 'warn';
    eyebrow = 'Last known position';
    title = 'Driver is not broadcasting right now';
    detail = lastUpdate
      ? `We received an update at ${lastUpdate.toLocaleTimeString()}.`
      : 'Showing the most recent location we have for this order.';
    Icon = Satellite;
  } else {
    tone = 'info';
    eyebrow = 'Waiting for GPS';
    title = 'Driver has not started broadcasting';
    detail = 'Live coordinates appear once the driver begins the pickup or delivery leg.';
    Icon = Satellite;
  }

  const colors = {
    success: { fg: '#059669', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.25)' },
    info: { fg: '#2563eb', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.25)' },
    warn: { fg: '#b45309', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)' },
    error: { fg: '#b91c1c', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)' },
  }[tone];

  return (
    <div
      style={{
        padding: '14px 18px',
        borderRadius: 16,
        background: `linear-gradient(135deg, ${colors.bg} 0%, rgba(255,255,255,0) 100%)`,
        border: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: colors.bg,
          color: colors.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={20} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: colors.fg,
          }}
        >
          {eyebrow}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.1, marginTop: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function EmptyMap({ connection }: { connection: 'connecting' | 'connected' | 'error' }) {
  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.75)',
        gap: 14,
        textAlign: 'center',
        padding: 20,
        background:
          'radial-gradient(circle at 50% 30%, rgba(245, 158, 11, 0.08), transparent 60%), #0b1528',
      }}
    >
      {connection === 'error' ? (
        <>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.18)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WifiOff size={22} color="#fca5a5" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Can&apos;t reach tracking</div>
        </>
      ) : (
        <>
          <div className="otm-pulse">
            <div className="otm-pulse-ring" />
            <div className="otm-pulse-ring otm-pulse-ring-delay" />
            <div className="otm-pulse-core">
              <Satellite size={20} color="#fbbf24" />
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {connection === 'connecting' ? 'Connecting to tracking…' : 'Waiting for driver GPS'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', maxWidth: 280 }}>
            The map updates as soon as the driver starts the pickup or delivery leg.
          </div>
        </>
      )}

      <style jsx>{`
        .otm-pulse {
          position: relative;
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .otm-pulse-ring {
          position: absolute;
          inset: 0;
          border: 2px solid rgba(251, 191, 36, 0.4);
          border-radius: 50%;
          animation: otm-pulse 2s infinite;
        }
        .otm-pulse-ring-delay {
          animation-delay: 0.6s;
        }
        .otm-pulse-core {
          position: relative;
          z-index: 1;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(251, 191, 36, 0.15);
          border: 1px solid rgba(251, 191, 36, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @keyframes otm-pulse {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function SnapshotRow({
  icon,
  label,
  value,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: '12px 20px',
        borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>{icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          {label}
        </span>
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: 'var(--text-primary)',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function secondsAgo(when: Date) {
  return Math.max(0, Math.round((Date.now() - when.getTime()) / 1000));
}
