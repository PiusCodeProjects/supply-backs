'use client';

import React, { useEffect, useState, Fragment } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  ZoomControl,
  Tooltip,
  FeatureGroup,
} from 'react-leaflet';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default icon paths for Leaflet in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

type Driver = {
  id: string;
  lat: number;
  lng: number;
  isLive: boolean;
  driverProfile?: { firstName?: string; lastName?: string };
  driverOrders?: { 
    id: string;
    status: string; 
    project?: { name: string; location: string; lat?: number; lng?: number } 
  }[];
  phone?: string;
};

type FleetMapProps = {
  drivers: Driver[];
  selectedDriverId?: string | null;
};

// Component to handle map view transitions
function MapController({ drivers, selectedDriverId }: FleetMapProps) {
  const map = useMap();

  useEffect(() => {
    if (selectedDriverId) {
      const selected = drivers.find(d => d.id === selectedDriverId);
      if (selected && selected.lat && selected.lng) {
        map.setView([selected.lat, selected.lng], 16, { animate: true });
      }
    } else if (drivers.length > 0) {
      const activeDrivers = drivers.filter(d => d.lat && d.lng);
      if (activeDrivers.length > 0) {
        const points: [number, number][] = [];
        activeDrivers.forEach(d => {
          points.push([d.lat, d.lng]);
          const order = d.driverOrders?.[0];
          if (order && order.project?.lat && order.project?.lng) points.push([order.project.lat, order.project.lng]);
        });
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 });
      }
    }
  }, [drivers, selectedDriverId, map]);

  return null;
}

export default function FleetMap({ drivers, selectedDriverId }: FleetMapProps) {
  const center: [number, number] = [6.6885, -1.6244]; // Kumasi/Accra default

  return (
    <div className="fm-map-wrapper" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom
        zoomControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <ZoomControl position="bottomleft" />
        <MapController drivers={drivers} selectedDriverId={selectedDriverId} />

        <FeatureGroup>
          {drivers.filter(d => d.lat && d.lng).map(driver => {
            const isSelected = driver.id === selectedDriverId;
            const color = isSelected ? '#F59E0B' : driver.isLive ? '#10B981' : '#6366F1';
            const name = `${driver.driverProfile?.firstName || ''} ${driver.driverProfile?.lastName || ''}`.trim() || 'Driver';
            const status = driver.isLive ? 'MOVING' : (driver.driverOrders?.[0]?.status?.replace('_', ' ') || 'IDLE');
            const unitId = driver.id.slice(-6).toUpperCase();
            const size = isSelected ? 36 : driver.isLive ? 28 : 20;

            // Custom marker icon
            const icon = L.divIcon({
              className: 'custom-driver-marker',
              html: `
                <div class="marker-container ${isSelected ? 'selected' : ''} ${driver.isLive ? 'live' : ''}" 
                     style="--marker-color: ${color}; --marker-size: ${size}px;">
                  <div class="marker-core">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <div class="marker-glow"></div>
                  ${(driver.isLive || isSelected) ? '<div class="marker-pulse"></div>' : ''}
                </div>
              `,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            });

            const order = driver.driverOrders?.[0];
            const hasMission = order && order.project?.lat && order.project?.lng;

            return (
              <Fragment key={driver.id}>
                <Marker 
                  position={[driver.lat, driver.lng]} 
                  icon={icon}
                  zIndexOffset={isSelected ? 1000 : 500}
                >
                  <Popup className="premium-popup">
                    <div className="map-popup-card">
                      <div className="popup-header">
                        <span className="unit-pill">UNIT {unitId}</span>
                        {driver.isLive && <span className="live-indicator">LIVE</span>}
                      </div>
                      <div className="popup-name">{name}</div>
                      <div className="popup-status-row">
                        <div className="status-dot" style={{ background: color }}></div>
                        <span className="status-text">{status}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="popup-coords">{driver.lat.toFixed(5)}, {driver.lng.toFixed(5)}</div>
                        <a href={`tel:${driver.phone}`} className="popup-call-btn" title="Call Driver">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                          </svg>
                          Call
                        </a>
                      </div>
                    </div>
                  </Popup>
                  {driver.isLive && (
                    <Tooltip permanent direction="top" offset={[0, -size/2 - 4]} className="premium-tooltip">
                      {driver.driverProfile?.firstName || 'Live'}
                    </Tooltip>
                  )}
                </Marker>

                {hasMission && (
                  <Marker 
                    position={[order.project!.lat!, order.project!.lng!]}
                    icon={L.divIcon({
                      className: 'project-marker',
                      html: `<div class="project-pin" style="--pin-color: ${color}"><div class="pin-core"></div></div>`,
                      iconSize: [12, 12],
                      iconAnchor: [6, 6]
                    })}
                  />
                )}
                {hasMission && (
                  <Polyline 
                    positions={[[driver.lat, driver.lng], [order.project!.lat!, order.project!.lng!]]}
                    pathOptions={{
                      color: color,
                      weight: 2,
                      opacity: 0.5,
                      dashArray: '8, 12',
                      lineJoin: 'round'
                    }}
                  />
                )}
              </Fragment>
            );
          })}
        </FeatureGroup>
      </MapContainer>

      <style dangerouslySetInnerHTML={{ __html: `
        /* Premium Marker Styles */
        .marker-container {
          position: relative;
          width: var(--marker-size);
          height: var(--marker-size);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .marker-core {
          width: 100%;
          height: 100%;
          background: var(--marker-color);
          border: 2px solid #fff;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          z-index: 2;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transform: rotate(45deg);
        }
        .marker-core svg {
          width: 60%;
          height: 60%;
          transform: rotate(-45deg);
        }
        .marker-glow {
          position: absolute;
          width: 140%;
          height: 140%;
          background: var(--marker-color);
          border-radius: 50%;
          opacity: 0.15;
          filter: blur(8px);
          z-index: 1;
        }
        .marker-pulse {
          position: absolute;
          width: 200%;
          height: 200%;
          border: 2px solid var(--marker-color);
          border-radius: 50%;
          opacity: 0;
          animation: marker-pulse-ani 2s infinite;
          z-index: 0;
        }
        @keyframes marker-pulse-ani {
          0% { transform: scale(0.5); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }

        /* Popup Styles */
        .premium-popup .leaflet-popup-content-wrapper {
          background: rgba(255, 255, 255, 0.95) !important;
          backdrop-filter: blur(12px) !important;
          border: 1px solid rgba(0, 0, 0, 0.1) !important;
          border-radius: 12px !important;
          color: #1e293b !important;
          box-shadow: 0 12px 32px rgba(0,0,0,0.15) !important;
          padding: 0 !important;
        }
        .premium-popup .leaflet-popup-content {
          margin: 0 !important;
          width: 220px !important;
        }
        .premium-popup .leaflet-popup-tip {
          background: rgba(255, 255, 255, 0.95) !important;
        }
        .map-popup-card {
          padding: 16px;
        }
        .popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .unit-pill {
          background: rgba(0,0,0,0.05);
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #475569;
        }
        .live-indicator {
          font-size: 9px;
          font-weight: 900;
          color: #059669;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .live-indicator::before {
          content: '';
          width: 6px;
          height: 6px;
          background: #059669;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(5, 150, 105, 0.4);
        }
        .popup-name {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #0f172a;
        }
        .popup-status-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          background: rgba(0,0,0,0.03);
          padding: 8px;
          border-radius: 8px;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .status-text {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          color: #334155;
        }
        .popup-coords {
          font-size: 10px;
          font-family: monospace;
          color: #64748b;
        }
        .popup-call-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #10B981;
          color: #fff !important;
          text-decoration: none !important;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 6px;
          transition: all 0.2s ease;
        }
        .popup-call-btn:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        .premium-tooltip {
          background: #1e293b !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 6px !important;
          color: #fff !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          padding: 4px 10px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
        }
        .premium-tooltip:before { display: none; }
        
        .project-pin {
          width: 12px;
          height: 12px;
          background: #fff;
          border: 3px solid var(--pin-color);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--pin-color);
          position: relative;
        }
        .project-pin::after {
          content: 'DESTINATION';
          position: absolute;
          top: -20px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 8px;
          font-weight: 900;
          color: var(--pin-color);
          white-space: nowrap;
          background: rgba(0,0,0,0.8);
          padding: 2px 4px;
          border-radius: 2px;
        }

        .leaflet-container { background: #f8fafc !important; height: 100% !important; width: 100% !important; }
      `}} />
    </div>
  );
}
