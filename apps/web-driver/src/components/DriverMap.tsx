'use client';

import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  ZoomControl,
} from 'react-leaflet';
import type { LatLngExpression, LatLngTuple } from 'leaflet';

type Leg = 'pickup' | 'delivery' | null;

type DriverMapProps = {
  currentPosition: LatLngTuple | null;
  /** Supplier / warehouse pin — shown when known, regardless of leg. */
  pickupPosition?: LatLngTuple | null;
  pickupLabel?: string;
  pickupAddress?: string;
  /** Contractor / project pin — the drop-off. */
  destinationPosition: LatLngTuple | null;
  destinationLabel: string;
  destinationAddress?: string;
  /** Which leg the driver is currently on, controls the active route colour. */
  activeLeg?: Leg;
  broadcasting: boolean;
};

function MapCamera({ center }: { center: LatLngExpression }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);

  return null;
}

const PICKUP_COLOR = '#3B82F6';      // blue — pickup leg
const DELIVERY_COLOR = '#10B981';    // green — delivery leg
const INACTIVE_COLOR = '#475569';    // slate — full-trip overview

export default function DriverMap({
  currentPosition,
  pickupPosition,
  pickupLabel,
  pickupAddress,
  destinationPosition,
  destinationLabel,
  destinationAddress,
  activeLeg,
  broadcasting,
}: DriverMapProps) {
  // Center on the driver if we have GPS. Otherwise show a country-wide
  // Ghana view (centroid + low zoom) so the map doesn't jump to whichever
  // city the delivery is in — that previously made drivers in Kumasi see
  // an Accra-centered map until GPS resolved.
  const hasGps = !!currentPosition;
  const center: LatLngTuple = currentPosition || [7.95, -1.03];

  // Active leg routes from the driver to whichever pin they're heading toward.
  const pickupRoute: LatLngTuple[] = (currentPosition && pickupPosition && activeLeg === 'pickup')
    ? [currentPosition, pickupPosition]
    : [];
  const deliveryRoute: LatLngTuple[] = (currentPosition && destinationPosition && activeLeg === 'delivery')
    ? [currentPosition, destinationPosition]
    : [];
  // Faint context line between pickup and dropoff so the overall trip shape is
  // visible at a glance, even before the driver starts moving.
  const tripOverview: LatLngTuple[] = (pickupPosition && destinationPosition) ? [pickupPosition, destinationPosition] : [];

  return (
    <MapContainer
      center={center}
      zoom={hasGps ? 14 : 7}
      scrollWheelZoom
      zoomControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <ZoomControl position="bottomleft" />
      <MapCamera center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {tripOverview.length > 0 && (
        <Polyline
          positions={tripOverview}
          pathOptions={{
            color: INACTIVE_COLOR,
            weight: 3,
            opacity: 0.35,
            lineCap: 'round',
            dashArray: '4, 8',
          }}
        />
      )}

      {pickupRoute.length > 0 && (
        <Polyline
          positions={pickupRoute}
          pathOptions={{
            color: PICKUP_COLOR,
            weight: 6,
            opacity: 0.75,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}

      {deliveryRoute.length > 0 && (
        <Polyline
          positions={deliveryRoute}
          pathOptions={{
            color: DELIVERY_COLOR,
            weight: 6,
            opacity: 0.75,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}

      {currentPosition && (
        <>
          <CircleMarker
            center={currentPosition}
            radius={20}
            pathOptions={{
              color: broadcasting ? '#F59E0B' : '#38BDF8',
              fillColor: broadcasting ? '#F59E0B' : '#38BDF8',
              fillOpacity: 0.1,
              weight: 0,
            }}
          />
          <CircleMarker
            center={currentPosition}
            radius={8}
            pathOptions={{
              color: '#FFF',
              fillColor: broadcasting ? '#F59E0B' : '#38BDF8',
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup className="premium-popup">
              <div className="font-bold">{broadcasting ? 'Live Tracking Active' : 'Your Location'}</div>
              {currentPosition && (
                <div className="text-[10px] font-mono text-accent mt-1 opacity-70">
                  {currentPosition[0].toFixed(5)}, {currentPosition[1].toFixed(5)}
                </div>
              )}
              <div className="text-xs text-dim mt-1">Broadcasting GPS coordinates</div>
            </Popup>
          </CircleMarker>
        </>
      )}

      {pickupPosition && (
        <CircleMarker
          center={pickupPosition}
          radius={10}
          pathOptions={{
            color: '#FFF',
            fillColor: PICKUP_COLOR,
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup className="premium-popup">
            <div className="font-black text-sm uppercase tracking-wider mb-1" style={{ color: PICKUP_COLOR }}>Pickup</div>
            <div className="font-bold">{pickupLabel || 'Supplier warehouse'}</div>
            {pickupAddress && <div className="text-xs text-dim mt-1">{pickupAddress}</div>}
          </Popup>
        </CircleMarker>
      )}

      {destinationPosition && (
        <CircleMarker
          center={destinationPosition}
          radius={10}
          pathOptions={{
            color: '#FFF',
            fillColor: DELIVERY_COLOR,
            fillOpacity: 1,
            weight: 3,
          }}
        >
          <Popup className="premium-popup">
            <div className="font-black text-sm uppercase tracking-wider text-success mb-1">Drop-off</div>
            <div className="font-bold">{destinationLabel}</div>
            {destinationAddress && <div className="text-xs text-dim mt-1">{destinationAddress}</div>}
          </Popup>
        </CircleMarker>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .premium-popup .leaflet-popup-content-wrapper {
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(12px);
          color: white;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 8px;
        }
        .premium-popup .leaflet-popup-tip {
          background: rgba(15, 23, 42, 0.95);
        }
      `}} />
    </MapContainer>
  );
}
