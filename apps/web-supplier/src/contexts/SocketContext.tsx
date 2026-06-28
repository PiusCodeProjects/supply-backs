'use client';

/**
 * Single Socket.IO connection per namespace, shared across components.
 *
 * Replaces the per-page `io(...)` calls in messages / drivers / inventory /
 * fulfillment so we don't open duplicate WebSocket connections when multiple
 * components mount in parallel (e.g. tracking + drivers).
 *
 * Usage:
 *   const sock = useSocket('tracking');
 *   useEffect(() => {
 *     sock.on('locationUpdated', handler);
 *     return () => sock.off('locationUpdated', handler);
 *   }, [sock]);
 */

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/auth';

const SOCKET_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
type Namespace = 'catalog' | 'tracking' | 'messaging' | 'notifications';

type Ctx = {
  get: (ns: Namespace) => Socket;
};

const SocketContext = createContext<Ctx | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketsRef = useRef<Map<Namespace, Socket>>(new Map());

  const get = useMemo(() => (ns: Namespace): Socket => {
    const existing = socketsRef.current.get(ns);
    if (existing) return existing;
    const token = getAccessToken() ?? undefined;
    const socket = io(`${SOCKET_BASE}/${ns}`, {
      auth: token ? { token } : undefined,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketsRef.current.set(ns, socket);
    return socket;
  }, []);

  useEffect(() => {
    const sockets = socketsRef.current;
    return () => {
      sockets.forEach(s => { try { s.disconnect(); } catch {} });
      sockets.clear();
    };
  }, []);

  const value = useMemo<Ctx>(() => ({ get }), [get]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(ns: Namespace): Socket {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>');
  return ctx.get(ns);
}
