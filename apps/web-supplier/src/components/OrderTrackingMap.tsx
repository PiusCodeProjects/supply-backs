'use client';

/**
 * Minimal tracking map used inside the OrderTrackingModal.
 *
 * Why a separate component (not FleetMap):
 *   • FleetMap pulls Leaflet marker images from a CDN — flaky in prod and the
 *     root cause of the earlier fulfillment-page crash.
 *   • We only ever render this once we have valid lat/lng, so we can keep the
 *     surface tiny: just two CircleMarkers + a polyline. No external icons.
 */

import { useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  driver: LatLngTuple;
  destination?: LatLngTuple | null;
  driverLabel?: string;
  destinationLabel?: string;
  isLive: boolean;
};

function FollowDriver({ position }: { position: LatLngTuple }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom() < 13 ? 14 : map.getZoom(), { animate: true });
  }, [position, map]);
  return null;
}

export default function OrderTrackingMap({
  driver,
  destination,
  driverLabel,
  destinationLabel,
  isLive,
}: Props) {
  const driverColor = isLive ? '#10B981' : '#6366F1';
  const destinationColor = '#F59E0B';

  return (
    <MapContainer
      center={driver}
      zoom={14}
      scrollWheelZoom
      zoomControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FollowDriver position={driver} />

      {destination && (
        <Polyline
          positions={[driver, destination]}
          pathOptions={{
            color: driverColor,
            weight: 3,
            opacity: 0.6,
            dashArray: '6, 10',
            lineCap: 'round',
          }}
        />
      )}

      {/* Outer pulse */}
      <CircleMarker
        center={driver}
        radius={18}
        pathOptions={{
          color: driverColor,
          fillColor: driverColor,
          fillOpacity: 0.15,
          weight: 0,
        }}
      />
      {/* Driver pin */}
      <CircleMarker
        center={driver}
        radius={8}
        pathOptions={{
          color: '#fff',
          fillColor: driverColor,
          fillOpacity: 1,
          weight: 3,
        }}
      >
        {driverLabel && (
          <Tooltip permanent direction="top" offset={[0, -10]}>
            {driverLabel}
          </Tooltip>
        )}
      </CircleMarker>

      {destination && (
        <CircleMarker
          center={destination}
          radius={8}
          pathOptions={{
            color: '#fff',
            fillColor: destinationColor,
            fillOpacity: 1,
            weight: 3,
          }}
        >
          {destinationLabel && (
            <Tooltip permanent direction="top" offset={[0, -10]}>
              {destinationLabel}
            </Tooltip>
          )}
        </CircleMarker>
      )}
    </MapContainer>
  );
}
