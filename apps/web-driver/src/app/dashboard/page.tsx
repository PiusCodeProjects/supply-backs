'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { createTrackingSocket } from '@/lib/trackingSocket';
import {
  CheckCircle, Clock, Hand, LocateFixed, MapPin, Navigation,
  Package, Phone, Radio, Truck, Home, BarChart3, User, Power,
  ChevronRight, ChevronUp, ChevronDown, TrendingUp, Wallet,
  ShieldCheck, Camera, X, Edit2, ArrowRight, Warehouse, Building2,
} from 'lucide-react';

const DriverMap = dynamic(() => import('@/components/DriverMap'), { ssr: false });
// Notifications: dispatch alerts (new mission, supplier accepted, etc.) land
// here. Without this surface the driver would only see updates via the order
// list refresh — slow + easy to miss while moving.
const DriverNotifications = dynamic(() => import('@/components/NotificationCenter'), { ssr: false });

type ViewState = 'home' | 'earnings' | 'missions' | 'account';

const STATUS_COLOR: Record<string, string> = {
  DISPATCHED:      '#f59e0b',
  ACCEPTED:        '#f59e0b',
  DRIVER_ACCEPTED: '#3b82f6',
  IN_TRANSIT:      '#10b981',
  ARRIVED:         '#a855f7',
};

const STATUS_LABEL: Record<string, string> = {
  DISPATCHED:      'Awaiting Accept',
  ACCEPTED:        'Awaiting Accept',
  DRIVER_ACCEPTED: 'Ready to Depart',
  IN_TRANSIT:      'En Route',
  ARRIVED:         'Arrived',
};

function getInitials(name: string) {
  if (!name) return 'D';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Great-circle distance in kilometres. Good enough for in-city ETA, which is
// dominated by traffic anyway — we use a constant 30 km/h city average below.
function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const AVG_CITY_KMH = 30;

function formatEta(km: number) {
  const minutes = Math.max(1, Math.round((km / AVG_CITY_KMH) * 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function DriverDashboard() {
  return (
    <Suspense fallback={null}>
      <DriverDashboardContent />
    </Suspense>
  );
}

function DriverDashboardContent() {
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState<ViewState>(
    (searchParams.get('view') as ViewState) || 'home'
  );
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  // Swipe state for the bottom sheet — built with pointer events so it works
  // for touch + mouse + pen. Drivers can flick the handle down to collapse or
  // up to expand without precise tapping (one-handed, eyes-on-the-road).
  const [sheetDrag, setSheetDrag] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDragRef = useRef<{ startY: number; startTime: number; lastY: number; lastTime: number; baseMinimized: boolean } | null>(null);
  const podPhotoInputRef = useRef<HTMLInputElement>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  // GPS state — surfaced to the UI so the driver knows when location is
  // blocked. Without this they'd just see the map sitting on whatever the
  // fallback is (previously, the delivery destination).
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationFetching, setLocationFetching] = useState(true);
  const [broadcasting, setBroadcasting] = useState<string | null>(null);
  const [podModal, setPodModal] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [podData, setPodData] = useState({ photo: null as string | null, signature: '' });
  const socketRef = useRef<Socket | null>(null);
  // The ambient watch keeps the map dot alive whenever the app is open. The
  // broadcast watch only runs during a live leg and is what emits to the
  // tracking socket. Previously these shared a single ref, so toggling the
  // broadcast off also killed ambient GPS and froze the map.
  const ambientWatchRef = useRef<number | null>(null);
  const broadcastWatchRef = useRef<number | null>(null);
  const [feeEditingOrderId, setFeeEditingOrderId] = useState<string | null>(null);
  const [feeInput, setFeeInput] = useState<number>(0);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState<number>(0);
  const [savingRate, setSavingRate] = useState(false);

  const completedOrders = deliveries.filter(d => ['DELIVERED', 'COMPLETED'].includes(d.status));
  const totalEarnings = completedOrders.reduce((sum, d) =>
    sum + (d.bookedByContractor && d.driverFee != null ? d.driverFee : d.totalAmount * 0.1), 0
  );
  const tripsToday = completedOrders.filter(d =>
    new Date(d.updatedAt).toDateString() === new Date().toDateString()
  ).length;
  const pendingMissions = deliveries.filter(d => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(d.status));
  const activeDelivery = deliveries.find(d =>
    ['ACCEPTED', 'DISPATCHED', 'DRIVER_ACCEPTED', 'IN_TRANSIT', 'ARRIVED'].includes(d.status)
  ) || null;

  // Single mount effect: open the shared tracking socket once, kick off the
  // initial fetch, start ambient GPS, and run a 30 s safety-net refresh. The
  // broadcast-on-leg-change logic is in its own effect below.
  useEffect(() => {
    initData();
    startLocationTracking();
    const socket = createTrackingSocket();
    if (socket) {
      socket.on('connect', () => {
        // Re-join whichever order is in flight after a reconnect.
        if (broadcasting) socket.emit('joinOrder', { orderId: broadcasting });
      });
      socketRef.current = socket;
    }
    const interval = setInterval(fetchDeliveries, 30000);
    return () => {
      if (ambientWatchRef.current !== null) navigator.geolocation.clearWatch(ambientWatchRef.current);
      if (broadcastWatchRef.current !== null) navigator.geolocation.clearWatch(broadcastWatchRef.current);
      socketRef.current?.disconnect();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Broadcast GPS the moment the driver is actively on a leg that warrants it
  // — going to pick up (DRIVER_ACCEPTED) or making the delivery (IN_TRANSIT).
  // Stop the second the leg ends. Mirrors how Uber/Bolt drivers stay visible
  // to dispatch only while a trip is live.
  useEffect(() => {
    const liveStatuses = ['DRIVER_ACCEPTED', 'IN_TRANSIT'];
    if (activeDelivery && isOnline && liveStatuses.includes(activeDelivery.status)) {
      if (broadcasting !== activeDelivery.id) startBroadcasting(activeDelivery.id);
    } else if (broadcasting) {
      stopBroadcasting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDelivery?.id, activeDelivery?.status, isOnline]);

  async function initData() {
    setLoading(true);
    try {
      const token = getAccessToken();
      if (!token) { window.location.href = '/login'; return; }
      const [ordersData, profileData] = await Promise.all([
        apiRequest<any[]>('/orders/driver', { token }),
        apiRequest<any>('/profile', { token }),
      ]);
      setDeliveries(ordersData);
      setProfile(profileData);
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        const { clearAuth } = require('@/lib/auth');
        clearAuth();
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchDeliveries() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/orders/driver', { token: token! });
      setDeliveries(data);
    } catch (err: any) {
      if (err.message === 'Unauthorized') {
        const { clearAuth } = require('@/lib/auth');
        clearAuth();
        window.location.href = '/login';
      }
    }
  }

  async function updateStatus(id: string, endpoint: string, body?: any) {
    const token = getAccessToken();
    try {
      await apiRequest(`/orders/${id}/${endpoint}`, { method: 'PATCH', token: token!, body });
      initData();
      setPodModal(null);
    } catch { alert("We couldn't update the delivery status. Please check your connection and try again."); }
  }

  async function submitDriverFee(orderId: string, fee: number) {
    const token = getAccessToken();
    try {
      await apiRequest(`/orders/${orderId}/set-driver-fee`, { method: 'PATCH', token: token!, body: { fee } });
      setFeeEditingOrderId(null);
      fetchDeliveries();
    } catch { alert("We couldn't save your fee. Please check your connection and try again."); }
  }

  async function saveRate() {
    const token = getAccessToken();
    setSavingRate(true);
    try {
      const updated = await apiRequest<any>('/profile', { method: 'PATCH', token: token!, body: { ratePerTrip: rateInput } });
      setProfile((p: any) => ({ ...p, driverProfile: { ...p.driverProfile, ratePerTrip: updated.ratePerTrip } }));
      setEditingRate(false);
    } catch { alert("We couldn't save your rate. Please check your connection and try again."); }
    finally { setSavingRate(false); }
  }

  // Two-stage location acquisition: a fast cached fix first (so the map
  // jumps to the driver in ~1s on most devices) then a high-accuracy watch
  // for live updates. We surface PERMISSION_DENIED / POSITION_UNAVAILABLE
  // through `locationError` so the driver sees what's wrong; previously the
  // watch errored silently to the console, the map fell back to the delivery
  // destination, and a driver in Kumasi could see an Accra-centered map.
  function startLocationTracking() {
    if (!navigator.geolocation) {
      setLocationFetching(false);
      setLocationError("Your device doesn't support location services.");
      return;
    }

    setLocationFetching(true);
    setLocationError(null);

    // Cancel any prior ambient watch (e.g. user tapped "Retry location").
    if (ambientWatchRef.current !== null) {
      navigator.geolocation.clearWatch(ambientWatchRef.current);
      ambientWatchRef.current = null;
    }

    const onError = (err: GeolocationPositionError) => {
      setLocationFetching(false);
      if (err.code === err.PERMISSION_DENIED) {
        setLocationError(
          'Location access is blocked. Please enable location for this site in your browser settings, then refresh.',
        );
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setLocationError(
          "We can't determine your location. Make sure GPS is on and try moving to an open area.",
        );
      } else if (err.code === err.TIMEOUT) {
        setLocationError(
          "Getting your location is taking longer than expected. Tap Retry once you have a clearer view of the sky.",
        );
      }
    };

    // 1. Quick low-accuracy fix to populate the map fast.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentPosition([pos.coords.latitude, pos.coords.longitude]);
        setLocationFetching(false);
        setLocationError(null);
      },
      onError,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );

    // 2. Live high-accuracy watch. Updates as the driver moves.
    ambientWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPosition([pos.coords.latitude, pos.coords.longitude]);
        setLocationFetching(false);
        setLocationError(null);
      },
      onError,
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
  }

  // Downscale + re-encode in the browser so a multi-megapixel phone photo
  // doesn't balloon the request body. 1280px on the long edge + JPEG 0.82
  // is plenty for a drop-off proof while keeping the payload light.
  async function processPodPhoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('canvas-unsupported'));
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => reject(new Error('image-load-failed'));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error('file-read-failed'));
      reader.readAsDataURL(file);
    });
  }

  async function onPodPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('That file does not look like an image. Please choose a photo.');
      e.target.value = '';
      return;
    }
    setPhotoProcessing(true);
    try {
      const dataUrl = await processPodPhoto(file);
      setPodData((prev) => ({ ...prev, photo: dataUrl }));
    } catch {
      alert("We couldn't read that photo. Please try taking it again.");
    } finally {
      setPhotoProcessing(false);
      e.target.value = ''; // let the driver re-pick the same file later
    }
  }

  async function handlePodSubmit(id: string, data: any) {
    const token = getAccessToken();
    try {
      await apiRequest(`/orders/${id}/driver-submit-pod`, { method: 'PATCH', token: token!, body: data });
      fetchDeliveries();
    } catch { alert("We couldn't submit the proof of delivery. Please check your connection and try again."); }
  }

  function stopBroadcasting() {
    if (broadcastWatchRef.current !== null) {
      navigator.geolocation.clearWatch(broadcastWatchRef.current);
      broadcastWatchRef.current = null;
    }
    setBroadcasting(null);
  }

  function startBroadcasting(orderId: string) {
    if (!navigator.geolocation) { alert("Location services aren't available on this device. Please enable them in your settings to start a trip."); return; }
    stopBroadcasting();
    setBroadcasting(orderId);
    navigator.geolocation.getCurrentPosition(pos => {
      setCurrentPosition([pos.coords.latitude, pos.coords.longitude]);
      socketRef.current?.emit('updateLocation', { orderId, lat: pos.coords.latitude, lng: pos.coords.longitude });
    });
    broadcastWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        setCurrentPosition([pos.coords.latitude, pos.coords.longitude]);
        socketRef.current?.emit('updateLocation', { orderId, lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      err => console.error('GPS Watch Error:', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
    socketRef.current?.emit('joinOrder', { orderId });
  }

  // ── Real-data derivations for the active trip ────────────────────────────
  // These pull straight from the /orders/driver payload so the trip card
  // always reflects the supplier → contractor route the dispatcher set up.
  const supplierName = activeDelivery?.supplier?.supplierProfile?.businessName || 'Supplier';
  const contractorProfile = activeDelivery?.contractor?.contractorProfile;
  const contractorName = contractorProfile
    ? `${contractorProfile.firstName} ${contractorProfile.lastName}`.trim()
    : (activeDelivery?.recipientName || 'Customer');
  // Personal-purchase orders ride on shippingAddress + recipientName/Phone;
  // project orders ride on project.name/location. Fall back gracefully.
  const dropoffName = activeDelivery?.project?.name || activeDelivery?.recipientName || 'Customer drop-off';
  const dropoffAddress = activeDelivery?.project?.location || activeDelivery?.shippingAddress || '';
  const dropoffPhone = activeDelivery?.recipientPhone || contractorProfile?.user?.phone || null;
  const orderItems: any[] = activeDelivery?.items || [];

  // Pre-pickup the active leg is "pickup"; once IN_TRANSIT it becomes "delivery".
  const activeLeg: 'pickup' | 'delivery' | null = activeDelivery
    ? (['ACCEPTED', 'DISPATCHED', 'DRIVER_ACCEPTED'].includes(activeDelivery.status) ? 'pickup'
      : ['IN_TRANSIT', 'ARRIVED'].includes(activeDelivery.status) ? 'delivery'
      : null)
    : null;

  // Supplier coordinates aren't stored on SupplierProfile yet, so pickup
  // shows as text-only and the map falls back to the dropoff pin alone.
  // (Add `lat`/`lng` to SupplierProfile to unlock a true two-pin route.)
  const pickupPosition: [number, number] | null = null;
  const destinationPosition: [number, number] | null = activeDelivery?.project?.lat && activeDelivery?.project?.lng
    ? [activeDelivery.project.lat, activeDelivery.project.lng] : null;

  const legHeaderLabel = activeLeg === 'pickup' ? 'Heading to pickup' : activeLeg === 'delivery' ? 'Delivering to site' : 'Standby';
  // Real ETA: distance from the driver to the active leg's target, divided by
  // a city-average speed. Falls back to "GPS needed" / "Loc pending" when one
  // of the two coordinates is missing (e.g. supplier coords not in DB yet).
  const legTarget: [number, number] | null = activeLeg === 'pickup'
    ? pickupPosition
    : activeLeg === 'delivery'
      ? destinationPosition
      : null;
  const distanceKm = currentPosition && legTarget ? haversineKm(currentPosition, legTarget) : null;
  const etaLabel = !activeDelivery
    ? 'Standby'
    : !currentPosition
      ? 'GPS needed'
      : distanceKm == null
        ? 'Loc pending'
        : formatEta(distanceKm);
  const distanceLabel = distanceKm != null ? `${distanceKm.toFixed(1)} km away` : null;

  // ─── Home View ─────────────────────────────────────────────────────────────
  const renderHome = () => (
    <div className="home-view">
      <div className="map-stage-container">
        <div className="map-stage">
          <DriverMap
            currentPosition={currentPosition}
            pickupPosition={pickupPosition}
            pickupLabel={supplierName}
            pickupAddress={undefined}
            destinationPosition={destinationPosition}
            destinationLabel={dropoffName}
            destinationAddress={dropoffAddress}
            activeLeg={activeLeg}
            broadcasting={broadcasting === activeDelivery?.id}
          />
          <div className="map-vignette" />
        </div>
      </div>

      {/* Top bar — single tidy row: brand on left, notification + status on right */}
      <div className="top-overlay">
        <div className="glass-pill brand-pill">
          <Truck size={16} color="#f59e0b" />
          <span style={{ fontWeight: 900, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>CSCP Driver</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="glass-pill" style={{ padding: 6, background: 'rgba(255,255,255,0.92)', color: '#0a0a0a' }}>
            <DriverNotifications />
          </div>
          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`status-chip glass-pill ${isOnline ? 'online' : 'offline'}`}
            aria-label={isOnline ? 'Go offline' : 'Go online'}
          >
            <div className="status-indicator"><div className="dot" /><div className="ring" /></div>
            <span className="status-text">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </button>
        </div>
      </div>

      {/* Location status banner — only shown when GPS is unavailable so the
          driver knows the map isn't centered on them yet. */}
      {(locationError || (locationFetching && !currentPosition)) && (
        <div
          style={{
            position: 'absolute',
            top: 76,
            left: 16,
            right: 16,
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            background: locationError ? 'rgba(239, 68, 68, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            color: locationError ? '#fff' : 'var(--text)',
            border: `1px solid ${locationError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(11, 15, 23, 0.08)'}`,
            borderRadius: 14,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 12px 28px rgba(11, 15, 23, 0.18)',
            animation: 'fadeIn 0.25s ease-out',
          }}
        >
          {locationError ? (
            <>
              <LocateFixed size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{locationError}</span>
              <button
                onClick={startLocationTracking}
                style={{
                  flexShrink: 0,
                  background: 'rgba(255, 255, 255, 0.18)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: 999,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-dim)' }}>
                Getting your location…
              </span>
            </>
          )}
        </div>
      )}

      {/* Floating broadcast indicator — only when a live trip is broadcasting */}
      {broadcasting && (
        <div
          className="glass-pill"
          style={{
            position: 'absolute',
            top: 84,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'rgba(16,185,129,0.95)',
            border: '1px solid rgba(16,185,129,0.4)',
            color: '#fff',
            padding: '6px 14px',
            gap: 6,
            boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
          }}
        >
          <Radio size={12} />
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>Live tracking</span>
        </div>
      )}

      {/* Floating recenter button — sits above the sheet, easy thumb reach */}
      <button
        onClick={() => { if (currentPosition) setCurrentPosition([...currentPosition]); }}
        aria-label="Recenter map"
        className="recenter-fab"
      >
        <LocateFixed size={20} />
      </button>

      {/* Bottom sheet — swipe down to collapse, swipe up to expand. A short
          tap on the handle still toggles, so the gesture is forgiving. */}
      <div
        className={`bottom-sheet ${isMinimized ? 'minimized' : ''} ${sheetDragging ? 'dragging' : ''}`}
        style={
          sheetDragging
            ? {
                transform: isMinimized
                  ? `translateY(calc(100% - 130px + ${sheetDrag}px))`
                  : `translateY(${sheetDrag}px)`,
                transition: 'none',
              }
            : undefined
        }
      >
        <div
          className="sheet-header sheet-swipe"
          role="button"
          tabIndex={0}
          aria-label={isMinimized ? 'Expand trip details' : 'Collapse trip details'}
          aria-expanded={!isMinimized}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            sheetDragRef.current = {
              startY: e.clientY,
              startTime: performance.now(),
              lastY: e.clientY,
              lastTime: performance.now(),
              baseMinimized: isMinimized,
            };
            setSheetDragging(true);
            setSheetDrag(0);
          }}
          onPointerMove={(e) => {
            const ref = sheetDragRef.current;
            if (!ref) return;
            const delta = e.clientY - ref.startY;
            // Rubber-band when dragging beyond the natural ends so the motion
            // still feels alive instead of dead-stopping.
            let clamped = delta;
            if (!ref.baseMinimized && delta < 0) clamped = delta * 0.25;
            if (ref.baseMinimized && delta > 0) clamped = delta * 0.25;
            setSheetDrag(clamped);
            ref.lastY = e.clientY;
            ref.lastTime = performance.now();
          }}
          onPointerUp={(e) => {
            const ref = sheetDragRef.current;
            if (!ref) return;
            const totalDelta = e.clientY - ref.startY;
            const recentDelta = e.clientY - ref.lastY;
            const recentTime = performance.now() - ref.lastTime;
            const velocity = recentTime > 0 ? recentDelta / Math.max(recentTime, 1) : 0;

            let nextMinimized = ref.baseMinimized;
            // Fast flick beats slow drag — respect direction immediately.
            if (Math.abs(velocity) > 0.5) {
              nextMinimized = velocity > 0;
            } else if (Math.abs(totalDelta) < 8) {
              // Treat as a tap → toggle.
              nextMinimized = !ref.baseMinimized;
            } else if (Math.abs(totalDelta) > 60) {
              nextMinimized = totalDelta > 0;
            }

            setIsMinimized(nextMinimized);
            setSheetDragging(false);
            setSheetDrag(0);
            sheetDragRef.current = null;
          }}
          onPointerCancel={() => {
            setSheetDragging(false);
            setSheetDrag(0);
            sheetDragRef.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsMinimized((v) => !v);
            }
          }}
        >
          <div className="sheet-handle" />
          <div className="minimize-btn" aria-hidden>
            {isMinimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {!isMinimized && (
          <div className="sheet-content">
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner" /></div>
            ) : !activeDelivery ? (
              <div className="sheet-empty">
                {isOnline ? (
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="pulse-container" style={{ marginBottom: 20 }}>
                      <div className="pulse-ring" /><div className="pulse-ring" />
                      <div className="pulse-center"><Radio size={28} color="#f59e0b" /></div>
                    </div>
                    <p style={{ fontWeight: 900, fontSize: 20, marginBottom: 4 }}>Finding deliveries…</p>
                    <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 28 }}>Stay in area for more frequent requests.</p>
                    <div style={{ display: 'flex', gap: 24, background: 'rgba(0,0,0,0.04)', borderRadius: 20, padding: '16px 32px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#6b7280', letterSpacing: 1, marginBottom: 4 }}>Earnings</div>
                        <div style={{ fontWeight: 900, fontSize: 22 }}>GH₵ {totalEarnings.toFixed(2)}</div>
                      </div>
                      <div style={{ width: 1, background: 'rgba(0,0,0,0.08)' }} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#6b7280', letterSpacing: 1, marginBottom: 4 }}>Trips</div>
                        <div style={{ fontWeight: 900, fontSize: 22 }}>{tripsToday}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <Power size={32} color="#ef4444" />
                    </div>
                    <p style={{ fontWeight: 900, fontSize: 20, marginBottom: 6 }}>You're Offline</p>
                    <p style={{ color: '#6b7280', fontSize: 14 }}>Go online to receive delivery requests.</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                {/* Leg header + ETA */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: activeLeg === 'pickup' ? 'rgba(59,130,246,0.12)' : activeLeg === 'delivery' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                      color: activeLeg === 'pickup' ? '#3b82f6' : activeLeg === 'delivery' ? '#10b981' : '#f59e0b',
                      borderRadius: 99, padding: '4px 12px', fontSize: 10, fontWeight: 900,
                      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                      {legHeaderLabel}
                    </div>
                    <h2 style={{ fontWeight: 900, fontSize: 20, letterSpacing: -0.5, lineHeight: 1.1 }}>
                      {STATUS_LABEL[activeDelivery.status] || activeDelivery.status}
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                      Order #{activeDelivery.id.slice(-8).toUpperCase()} · GH₵ {activeDelivery.totalAmount?.toFixed(2)} cargo value
                      {distanceLabel && <> · {distanceLabel}</>}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center', background: '#f3f4f6', borderRadius: 16, padding: '10px 16px', minWidth: 70 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>ETA</div>
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{etaLabel}</div>
                  </div>
                </div>

                {/* Two-leg journey: pickup → dropoff */}
                <div style={{ background: '#f9fafb', borderRadius: 16, padding: '14px 16px', marginBottom: 16, position: 'relative' }}>
                  {/* Pickup row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14, opacity: activeLeg === 'delivery' ? 0.55 : 1 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Warehouse size={16} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 1 }}>Pickup at supplier</div>
                      <div style={{ fontWeight: 800, fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{supplierName}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Collect order #{activeDelivery.id.slice(-8).toUpperCase()}</div>
                    </div>
                    {activeLeg === 'pickup' && (
                      <div style={{ fontSize: 9, fontWeight: 900, color: '#3b82f6', textTransform: 'uppercase', background: 'rgba(59,130,246,0.12)', padding: '3px 8px', borderRadius: 99, alignSelf: 'flex-start' }}>Now</div>
                    )}
                  </div>

                  {/* Connector */}
                  <div style={{ position: 'absolute', left: 31, top: 52, width: 2, height: 26, background: 'repeating-linear-gradient(180deg, #d1d5db 0 3px, transparent 3px 6px)' }} />

                  {/* Dropoff row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, opacity: activeLeg === 'pickup' ? 0.7 : 1 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Building2 size={16} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: 1 }}>Deliver to {activeDelivery.project ? 'site' : 'recipient'}</div>
                      <div style={{ fontWeight: 800, fontSize: 14, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dropoffName}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={11} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dropoffAddress || 'Address pending'}</span>
                      </div>
                    </div>
                    {activeLeg === 'delivery' && (
                      <div style={{ fontSize: 9, fontWeight: 900, color: '#10b981', textTransform: 'uppercase', background: 'rgba(16,185,129,0.12)', padding: '3px 8px', borderRadius: 99, alignSelf: 'flex-start' }}>Now</div>
                    )}
                  </div>
                </div>

                {/* Customer contact + pay */}
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, marginBottom: 16 }}>
                  <div style={{ flex: 1, background: '#f9fafb', borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fff', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12, color: '#374151', flexShrink: 0 }}>
                      {getInitials(contractorName)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Customer</div>
                      <div style={{ fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contractorName}</div>
                    </div>
                    {dropoffPhone && (
                      <a href={`tel:${dropoffPhone}`} title={`Call ${dropoffPhone}`} style={{ width: 36, height: 36, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, textDecoration: 'none' }}>
                        <Phone size={16} />
                      </a>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', background: '#0a0a0a', color: '#fff', borderRadius: 14, padding: '10px 16px', minWidth: 110 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Pay</div>
                    <div style={{ fontWeight: 900, fontSize: 18, marginTop: 2 }}>
                      GH₵ {activeDelivery.bookedByContractor && activeDelivery.driverFee != null
                        ? Number(activeDelivery.driverFee).toFixed(2)
                        : (activeDelivery.totalAmount * 0.1).toFixed(2)}
                    </div>
                    {activeDelivery.bookedByContractor && (
                      <div style={{ fontSize: 9, color: '#60a5fa', fontWeight: 800, textTransform: 'uppercase', marginTop: 2 }}>Direct</div>
                    )}
                  </div>
                </div>

                {/* Items in the load — so the driver knows what they're carrying */}
                {orderItems.length > 0 && (
                  <div style={{ background: '#f9fafb', borderRadius: 14, padding: '10px 14px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Package size={12} /> Load
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700 }}>
                        {orderItems.length} {orderItems.length === 1 ? 'item' : 'items'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {orderItems.slice(0, 4).map((it: any) => (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: '#111' }}>
                            {it.catalogItem?.name || 'Item'}
                          </span>
                          <span style={{ fontWeight: 800, color: '#374151', flexShrink: 0, marginLeft: 12 }}>
                            × {it.quantity}
                          </span>
                        </div>
                      ))}
                      {orderItems.length > 4 && (
                        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700 }}>+{orderItems.length - 4} more</div>
                      )}
                    </div>
                  </div>
                )}

                {/* CTA buttons — match the current journey leg */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['ACCEPTED', 'DISPATCHED'].includes(activeDelivery.status) && (
                    <button onClick={() => updateStatus(activeDelivery.id, 'driver-accept')} className="primary-action">
                      <Hand size={20} /> Accept &amp; head to {supplierName}
                    </button>
                  )}
                  {activeDelivery.status === 'DRIVER_ACCEPTED' && (
                    <button onClick={() => updateStatus(activeDelivery.id, 'driver-start-trip')} className="primary-action">
                      <Truck size={20} /> Loaded — start delivery
                    </button>
                  )}
                  {activeDelivery.status === 'IN_TRANSIT' && (
                    <>
                      <button
                        onClick={() => broadcasting === activeDelivery.id ? stopBroadcasting() : startBroadcasting(activeDelivery.id)}
                        className="secondary-action"
                        style={broadcasting === activeDelivery.id ? { background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)', color: '#10b981' } : {}}
                      >
                        <Navigation size={20} /> {broadcasting === activeDelivery.id ? 'Live tracking on' : 'Start navigation'}
                      </button>
                      <button onClick={() => updateStatus(activeDelivery.id, 'driver-arrive')} className="success-action">
                        <CheckCircle size={20} /> Arrived at {activeDelivery.project ? 'site' : 'drop-off'}
                      </button>
                    </>
                  )}
                  {activeDelivery.status === 'ARRIVED' && (
                    <button onClick={() => setPodModal(activeDelivery.id)} className="primary-action">
                      <Camera size={20} /> Submit Proof of Delivery
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Earnings View ──────────────────────────────────────────────────────────
  const renderEarnings = () => (
    <div className="driver-page">
      <div className="driver-page__header">
        <p className="driver-page__eyebrow">Overview</p>
        <h2 className="driver-page__title">Earnings</h2>
      </div>

      {/* Hero balance card */}
      <div
        style={{
          margin: '0 24px 20px',
          background: 'linear-gradient(135deg, #0b0f17 0%, #1f2937 100%)',
          borderRadius: 24,
          padding: '28px 24px',
          position: 'relative',
          overflow: 'hidden',
          color: '#fff',
          boxShadow: '0 20px 40px rgba(11, 15, 23, 0.2)',
        }}
      >
        <div style={{ position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', filter: 'blur(8px)' }} />
        <div style={{ position: 'absolute', bottom: -30, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(245,158,11,0.06)' }} />
        <div style={{ position: 'relative' }}>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, margin: 0, marginBottom: 8 }}>Total Earnings</p>
          <p style={{ fontWeight: 900, fontSize: 44, letterSpacing: -1.5, lineHeight: 1, margin: 0 }}>GH₵ {totalEarnings.toFixed(2)}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 99, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>
              {tripsToday} trips today
            </div>
            <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 99, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
              {completedOrders.length} total
            </div>
          </div>
        </div>
      </div>

      {/* Payout method */}
      <div className="driver-card" style={{ margin: '0 24px 28px', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ffcc00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11, color: '#0b0f17', flexShrink: 0, letterSpacing: 0.5 }}>MTN</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2 }}>Payout Method</div>
          <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14.5, marginTop: 2 }}>+233 ••• ••• 45</div>
        </div>
        <button
          onClick={() => alert("We've sent your cash-out request to CSCP Finance. You'll see the payout in 1–2 working days.")}
          style={{ background: '#0b0f17', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 16px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Wallet size={14} /> Withdraw
        </button>
      </div>

      {/* Trip history */}
      <div style={{ padding: '0 24px' }}>
        <p className="driver-section-label">Trip History</p>
        {completedOrders.length === 0 ? (
          <div className="driver-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div className="driver-icon-tile" style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px' }}>
              <Clock size={24} color="#9ca3af" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 800, fontSize: 15, margin: '0 0 4px' }}>No trips yet</p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: 0 }}>Completed deliveries will appear here.</p>
          </div>
        ) : (
          <div className="driver-card" style={{ padding: 0, overflow: 'hidden' }}>
            {completedOrders.map((d, i) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 18px',
                  borderBottom: i < completedOrders.length - 1 ? '1px solid rgba(11, 15, 23, 0.05)' : 'none',
                }}
              >
                <div className="driver-icon-tile" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <Truck size={18} color="#f59e0b" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.project?.name || 'Delivery'}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>{new Date(d.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 900, fontSize: 16 }}>
                    GH₵ {(d.bookedByContractor && d.driverFee != null ? d.driverFee : d.totalAmount * 0.1).toFixed(2)}
                  </div>
                  {d.bookedByContractor && (
                    <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Direct</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Missions View ──────────────────────────────────────────────────────────
  const renderMissions = () => (
    <div className="driver-page">
      <div className="driver-page__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 24 }}>
        <div>
          <p className="driver-page__eyebrow">Assigned Tasks</p>
          <h2 className="driver-page__title">Missions</h2>
        </div>
        <button
          onClick={fetchDeliveries}
          aria-label="Refresh missions"
          style={{ width: 42, height: 42, borderRadius: 12, background: '#fff', border: '1px solid rgba(11,15,23,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: loading ? '#f59e0b' : 'var(--text-dim)', boxShadow: '0 2px 8px rgba(11, 15, 23, 0.04)' }}
        >
          <Radio size={18} className={loading ? 'animate-pulse' : ''} />
        </button>
      </div>

      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pendingMissions.length === 0 ? (
          <div className="driver-card" style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div className="driver-icon-tile" style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 14px' }}>
              <Package size={28} color="#9ca3af" />
            </div>
            <p style={{ color: 'var(--text)', fontWeight: 800, fontSize: 16, margin: '0 0 6px' }}>No active missions</p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, margin: 0 }}>New deliveries from suppliers will appear here.</p>
          </div>
        ) : pendingMissions.map(order => {
          const statusColor = STATUS_COLOR[order.status] || '#9ca3af';
          const isNew = ['DISPATCHED', 'ACCEPTED'].includes(order.status);
          const cardSupplier = order.supplier?.supplierProfile?.businessName || 'Supplier';
          const cardDropName = order.project?.name || order.recipientName || 'Drop-off';
          const cardDropAddress = order.project?.location || order.shippingAddress || '';
          return (
            <div
              key={order.id}
              onClick={() => { setActiveView('home'); setIsMinimized(false); }}
              className="driver-card"
              style={{
                cursor: 'pointer',
                padding: '18px 20px',
                borderColor: isNew ? 'rgba(245, 158, 11, 0.3)' : undefined,
                background: isNew ? 'linear-gradient(180deg, rgba(245,158,11,0.04), #fff)' : '#fff',
              }}
            >
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `${statusColor}15`, border: `1px solid ${statusColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {['IN_TRANSIT', 'ARRIVED'].includes(order.status) ? <Truck size={20} color={statusColor} /> : <Package size={20} color={statusColor} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: 14 }}>#{order.id.slice(-8).toUpperCase()}</span>
                    <span style={{
                      background: `${statusColor}18`, color: statusColor,
                      borderRadius: 99, padding: '2px 8px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      {STATUS_LABEL[order.status] || order.status.replace(/_/g, ' ')}
                    </span>
                    {order.bookedByContractor && (
                      <span style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', borderRadius: 99, padding: '2px 8px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>
                        Direct
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cardDropName}</div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 900, fontSize: 16 }}>
                    GH₵ {(order.bookedByContractor && order.driverFee != null ? Number(order.driverFee) : order.totalAmount * 0.1).toFixed(0)}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>

              {/* Pickup → drop-off mini-journey */}
              <div style={{ paddingTop: 12, borderTop: '1px solid rgba(11, 15, 23, 0.06)', marginBottom: order.bookedByContractor ? 10 : 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Warehouse size={13} color="#3b82f6" />
                  <span style={{ color: 'var(--text-dim)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Pickup: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{cardSupplier}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={13} color="#10b981" />
                  <span style={{ color: 'var(--text-dim)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Drop-off: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{cardDropAddress || cardDropName}</span>
                  </span>
                </div>
              </div>

              {/* Driver fee edit for direct bookings */}
              {order.bookedByContractor && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(11, 15, 23, 0.06)' }} onClick={e => e.stopPropagation()}>
                  {feeEditingOrderId === order.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Your Fee GH₵</span>
                      <input
                        type="number" min={0}
                        value={feeInput}
                        onChange={e => setFeeInput(Math.max(0, Number(e.target.value)))}
                        style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '6px 10px', color: 'var(--text)', fontSize: 13, fontWeight: 700, width: 80, textAlign: 'center', outline: 'none' }}
                      />
                      <button onClick={() => submitDriverFee(order.id, feeInput)} style={{ background: '#0b0f17', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setFeeEditingOrderId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} aria-label="Cancel"><X size={14} /></button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Wallet size={12} color="#f59e0b" />
                        <span style={{ color: 'var(--text-dim)', fontSize: 11.5, fontWeight: 600 }}>Agreed fee:</span>
                        <span style={{ color: '#0b0f17', fontWeight: 900, fontSize: 13 }}>
                          {order.driverFee != null ? `GH₵ ${Number(order.driverFee).toFixed(2)}` : 'Not set'}
                        </span>
                      </div>
                      <button onClick={() => { setFeeInput(order.driverFee ?? 0); setFeeEditingOrderId(order.id); }} aria-label="Edit fee" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                        <Edit2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {(['DISPATCHED', 'ACCEPTED'].includes(order.status) || order.status === 'DRIVER_ACCEPTED') && (
                <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                  {['DISPATCHED', 'ACCEPTED'].includes(order.status) && (
                    <button
                      onClick={e => { e.stopPropagation(); updateStatus(order.id, 'driver-accept'); }}
                      style={{ flex: 1, background: '#0b0f17', color: '#fff', border: 'none', borderRadius: 14, padding: '12px 0', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 8px 20px rgba(11, 15, 23, 0.18)' }}
                    >
                      <Hand size={15} /> Accept Task
                    </button>
                  )}
                  {order.status === 'DRIVER_ACCEPTED' && (
                    <button
                      onClick={e => { e.stopPropagation(); updateStatus(order.id, 'driver-start-trip'); }}
                      style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 14, padding: '12px 0', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 8px 20px rgba(16, 185, 129, 0.25)' }}
                    >
                      <Truck size={15} /> Start Trip
                    </button>
                  )}
                  <button onClick={e => { e.stopPropagation(); setActiveView('home'); setIsMinimized(false); }} aria-label="Open mission" style={{ width: 44, background: '#fff', border: '1px solid rgba(11, 15, 23, 0.08)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-dim)', flexShrink: 0 }}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ─── Account View ───────────────────────────────────────────────────────────
  const renderAccount = () => {
    const dp = profile?.driverProfile;
    const fullName = dp ? `${dp.firstName} ${dp.lastName}` : 'Driver';
    const initials = getInitials(fullName);
    const currentRate = dp?.ratePerTrip ?? null;

    return (
      <div className="driver-page">
        <div className="driver-page__header">
          <p className="driver-page__eyebrow">Profile</p>
          <h2 className="driver-page__title">Account</h2>
        </div>

        {/* Avatar card */}
        <div className="driver-card" style={{ margin: '0 24px 20px', padding: '22px 20px', display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, color: '#fff', flexShrink: 0, boxShadow: '0 8px 20px rgba(245, 158, 11, 0.25)' }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text)', fontWeight: 900, fontSize: 19, letterSpacing: -0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <ShieldCheck size={14} color="#10b981" />
              <span style={{ color: '#059669', fontSize: 12, fontWeight: 700 }}>Verified partner</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ color: 'var(--text)', fontWeight: 900, fontSize: 22, letterSpacing: -0.5 }}>{completedOrders.length}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>Trips</div>
          </div>
        </div>

        {/* Settings card */}
        <div className="driver-card" style={{ margin: '0 24px 20px', padding: 0, overflow: 'hidden' }}>
          {[
            { icon: <User size={18} color="#6b7280" />, label: 'Phone', value: profile?.phone || '—' },
            ...(dp?.licenseNo ? [{ icon: <Truck size={18} color="#6b7280" />, label: 'License No.', value: dp.licenseNo }] : []),
          ].map((item, idx) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderBottom: '1px solid rgba(11, 15, 23, 0.05)' }}>
              <div className="driver-icon-tile">{item.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2 }}>{item.label}</div>
                <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15 }}>{item.value}</div>
              </div>
            </div>
          ))}

          {/* Rate per trip — editable */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderBottom: '1px solid rgba(11, 15, 23, 0.05)' }}>
            <div className="driver-icon-tile" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <Wallet size={18} color="#f59e0b" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2 }}>Rate per Trip</div>
              {editingRate ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ color: 'var(--text-dim)', fontSize: 13, fontWeight: 700 }}>GH₵</span>
                  <input
                    type="number" min={0} step={1} value={rateInput}
                    onChange={e => setRateInput(Number(e.target.value))}
                    autoFocus
                    style={{ width: 80, padding: '7px 10px', borderRadius: 10, background: '#f9fafb', border: '1px solid #e5e7eb', color: 'var(--text)', fontSize: 14, fontWeight: 700, outline: 'none' }}
                  />
                  <button onClick={saveRate} disabled={savingRate} style={{ background: '#0b0f17', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    {savingRate ? '…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingRate(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} aria-label="Cancel">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15 }}>
                  {currentRate != null ? `GH₵ ${currentRate.toLocaleString()}` : <span style={{ color: 'var(--text-muted)' }}>Not set</span>}
                </div>
              )}
            </div>
            {!editingRate && (
              <button onClick={() => { setRateInput(currentRate ?? 0); setEditingRate(true); }} aria-label="Edit rate" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <Edit2 size={16} />
              </button>
            )}
          </div>

          {/* Earnings summary row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
            <div className="driver-icon-tile" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <TrendingUp size={18} color="#10b981" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2 }}>Lifetime Earnings</div>
              <div style={{ color: '#059669', fontWeight: 900, fontSize: 15 }}>GH₵ {totalEarnings.toFixed(2)}</div>
            </div>
            <button onClick={() => setActiveView('earnings')} style={{ background: '#fff', border: '1px solid rgba(11, 15, 23, 0.08)', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              Details <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* Sign out */}
        <div style={{ padding: '8px 24px 0' }}>
          <button
            onClick={() => { const { clearAuth } = require('@/lib/auth'); clearAuth(); window.location.href = '/login'; }}
            style={{ width: '100%', padding: '16px', background: '#fff', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#dc2626', borderRadius: 16, fontWeight: 800, fontSize: 14.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}
          >
            <Power size={18} /> Sign out
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="driver-dashboard">
      {activeView === 'home'     && renderHome()}
      {activeView === 'earnings' && renderEarnings()}
      {activeView === 'missions' && renderMissions()}
      {activeView === 'account'  && renderAccount()}

      {/* Bottom nav */}
      <nav className="bottom-nav">
        <button onClick={() => setActiveView('home')} className={`nav-item ${activeView === 'home' ? 'active' : ''}`}>
          <Home size={22} />
          <span className="nav-label">Home</span>
        </button>
        <button onClick={() => setActiveView('missions')} className={`nav-item ${activeView === 'missions' ? 'active' : ''}`}>
          <div className="notification-icon-wrapper">
            <Package size={22} />
            {pendingMissions.length > 0 && <div className="badge" />}
          </div>
          <span className="nav-label">Missions</span>
        </button>
        <button onClick={() => setActiveView('earnings')} className={`nav-item ${activeView === 'earnings' ? 'active' : ''}`}>
          <BarChart3 size={22} />
          <span className="nav-label">Earnings</span>
        </button>
        <button onClick={() => setActiveView('account')} className={`nav-item ${activeView === 'account' ? 'active' : ''}`}>
          <User size={22} />
          <span className="nav-label">Account</span>
        </button>
      </nav>

      {/* POD Modal — full-screen overlay (mobile: bottom-sheet, desktop: centered card) */}
      {podModal && (
        <div
          onClick={() => setPodModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(11, 15, 23, 0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: 480,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              boxShadow: '0 -20px 60px rgba(11, 15, 23, 0.3)',
              animation: 'sheetUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Drag handle (decorative) */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(11, 15, 23, 0.12)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '4px 24px 0', flexShrink: 0 }}>
              <div style={{ minWidth: 0, paddingRight: 12 }}>
                <h2 style={{ color: 'var(--text)', fontWeight: 900, fontSize: 22, letterSpacing: -0.4, margin: '0 0 6px' }}>Confirm delivery</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>
                  Take a photo at the drop-off and capture the recipient&apos;s name to close out this delivery.
                </p>
              </div>
              <button
                onClick={() => setPodModal(null)}
                aria-label="Close"
                style={{ background: '#f9fafb', border: '1px solid rgba(11, 15, 23, 0.08)', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-dim)', flexShrink: 0 }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '20px 24px 8px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 10 }}>1. Site photo</label>
                <input
                  ref={podPhotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onPodPhotoSelected}
                  style={{ display: 'none' }}
                />
                <div
                  onClick={() => {
                    if (photoProcessing) return;
                    podPhotoInputRef.current?.click();
                  }}
                  style={{
                    position: 'relative',
                    height: 180,
                    background: podData.photo ? '#0b0f17' : '#f9fafb',
                    border: `2px dashed ${podData.photo ? 'rgba(16,185,129,0.45)' : '#e5e7eb'}`,
                    borderRadius: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: photoProcessing ? 'progress' : 'pointer',
                    overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}
                >
                  {podData.photo ? (
                    <>
                      <img
                        src={podData.photo}
                        alt="Drop-off site"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {/* Retake chip — small so the photo stays the focus */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (photoProcessing) return;
                          podPhotoInputRef.current?.click();
                        }}
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          background: 'rgba(11, 15, 23, 0.7)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.18)',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          cursor: 'pointer',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                        }}
                      >
                        <Camera size={12} /> Retake
                      </button>
                    </>
                  ) : photoProcessing ? (
                    <>
                      <div className="spinner" style={{ marginBottom: 10 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>Preparing photo…</span>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', border: '1px solid rgba(11, 15, 23, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, boxShadow: '0 4px 12px rgba(11, 15, 23, 0.06)' }}>
                        <Camera size={22} color="#0b0f17" />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Take a photo of the drop-off</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 4 }}>Opens your camera</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 10 }}>2. Recipient name</label>
                <input
                  type="text"
                  placeholder="Who received the delivery?"
                  value={podData.signature}
                  onChange={(e) => setPodData({ ...podData, signature: e.target.value })}
                  style={{ width: '100%', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 16px', color: 'var(--text)', fontSize: 15, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Sticky footer with CTAs — always visible, sits above the bottom nav. */}
            <div
              style={{
                padding: '16px 24px calc(20px + env(safe-area-inset-bottom))',
                borderTop: '1px solid rgba(11, 15, 23, 0.06)',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => {
                  if (!podData.photo || !podData.signature) {
                    alert("Please add a site photo and the recipient's name before submitting.");
                    return;
                  }
                  handlePodSubmit(podModal, { photoUrl: podData.photo, signatureUrl: podData.signature, lat: currentPosition?.[0], lng: currentPosition?.[1] });
                  setPodModal(null);
                }}
                disabled={!podData.photo || !podData.signature}
                style={{
                  width: '100%',
                  padding: '15px',
                  background: podData.photo && podData.signature ? '#0b0f17' : '#e5e7eb',
                  color: podData.photo && podData.signature ? '#fff' : '#9ca3af',
                  border: 'none',
                  borderRadius: 16,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: podData.photo && podData.signature ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  boxShadow: podData.photo && podData.signature ? '0 12px 28px rgba(11, 15, 23, 0.2)' : 'none',
                }}
              >
                <CheckCircle size={18} /> Confirm delivery
              </button>
              <button
                onClick={() => setPodModal(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: '4px 0', textAlign: 'center', width: '100%' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
