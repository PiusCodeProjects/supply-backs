'use client';

import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import type { LatLngExpression, LatLngTuple } from 'leaflet';

type TrackingMapProps = {
  driverPosition: LatLngTuple | null;
  destinationPosition: LatLngTuple | null;
  destinationLabel: string;
  isLive: boolean;
  driverName?: string;
};

// Pan/zoom helper. Lives inside <MapContainer> because it uses `useMap()`.
function MapCamera({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();
  // Stringify the positions to a stable key so the effect only fires when
  // coordinates actually change (not on every parent re-render).
  const key = positions.map((p) => `${p[0]},${p[1]}`).join('|');

  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], Math.max(map.getZoom(), 14), { animate: true });
      return;
    }
    // Two points → fit both with breathing room.
    const lats = positions.map((p) => p[0]);
    const lngs = positions.map((p) => p[1]);
    const bounds: [LatLngTuple, LatLngTuple] = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ];
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}

export default function TrackingMap({
  driverPosition,
  destinationPosition,
  destinationLabel,
  isLive,
  driverName,
}: TrackingMapProps) {
  // Country-wide Ghana default when no GPS yet — never centers on a delivery
  // city by accident.
  const defaultCenter: LatLngTuple = [7.95, -1.03];
  const center: LatLngExpression = driverPosition || destinationPosition || defaultCenter;
  const initialZoom = driverPosition || destinationPosition ? 13 : 7;

  const cameraPositions: LatLngTuple[] = [];
  if (driverPosition) cameraPositions.push(driverPosition);
  if (destinationPosition) cameraPositions.push(destinationPosition);

  const routePoints: LatLngTuple[] =
    driverPosition && destinationPosition ? [driverPosition, destinationPosition] : [];

  const driverColor = isLive ? '#F59E0B' : '#38BDF8';

  return (
    <>
      <MapContainer
        center={center}
        zoom={initialZoom}
        scrollWheelZoom
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomleft" />
        {cameraPositions.length > 0 ? <MapCamera positions={cameraPositions} /> : null}

        {routePoints.length === 2 ? (
          <Polyline
            positions={routePoints}
            pathOptions={{
              color: driverColor,
              weight: 4,
              opacity: 0.6,
              dashArray: '1, 12',
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ) : null}

        {driverPosition ? (
          <CircleMarker
            center={driverPosition}
            radius={22}
            pathOptions={{
              color: driverColor,
              fillColor: driverColor,
              fillOpacity: 0.1,
              weight: 0,
            }}
          />
        ) : null}

        {driverPosition ? (
          <CircleMarker
            center={driverPosition}
            radius={9}
            pathOptions={{
              color: '#fff',
              fillColor: driverColor,
              fillOpacity: 1,
              weight: 3,
            }}
          >
            {isLive ? (
              <Tooltip
                permanent
                direction="top"
                offset={[0, -14]}
                className="tracking-tooltip"
              >
                {(driverName || 'Driver') + ' · LIVE'}
              </Tooltip>
            ) : null}
          </CircleMarker>
        ) : null}

        {destinationPosition ? (
          <CircleMarker
            center={destinationPosition}
            radius={10}
            pathOptions={{
              color: '#fff',
              fillColor: '#10B981',
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Tooltip
              permanent
              direction="top"
              offset={[0, -14]}
              className="tracking-tooltip destination-tooltip"
            >
              {destinationLabel}
            </Tooltip>
          </CircleMarker>
        ) : null}
      </MapContainer>

      {/* Styles MUST live outside <MapContainer> — react-leaflet 4 wraps
          children in its own context system and a raw <style> child trips it
          up with "render is not a function". */}
      <style jsx global>{`
        .tracking-tooltip {
          background: rgba(15, 23, 42, 0.9) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 8px !important;
          color: #fff !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          padding: 3px 10px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
        }
        .tracking-tooltip::before {
          display: none !important;
        }
        .destination-tooltip {
          background: rgba(16, 185, 129, 0.9) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
        }
        .leaflet-container {
          background: #f8fafc !important;
        }
      `}</style>
    </>
  );
}
