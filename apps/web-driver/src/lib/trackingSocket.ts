'use client';

/**
 * Tracking socket helper.
 *
 * The dashboard previously hardcoded `http://localhost:4001/tracking`, which
 * broke as soon as the driver app was deployed against the Render API. This
 * helper centralises connection creation, honours `NEXT_PUBLIC_API_URL`
 * (stripping any `/api` suffix the way the contractor/supplier apps do), and
 * always passes the bearer token in `auth` so `WsJwtGuard` can identify the
 * driver.
 */

import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './auth';

const SOCKET_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001').replace(/\/api$/, '');

export function createTrackingSocket(): Socket | null {
  const token = getAccessToken();
  if (!token) return null;
  return io(`${SOCKET_BASE}/tracking`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
}
