'use client';

/**
 * Single Socket.IO connection per namespace, shared across components.
 *
 * Previously every page opened its own `io(...)` connection (catalog stock
 * sync on Shop, tracking GPS on Tracking, messaging on Messages). That
 * meant duplicate WebSocket connections when components mounted in parallel
 * and orphaned sockets after fast-refresh in dev.
 *
 * Usage:
 *   const socket = useSocket('catalog');
 *   useEffect(() => {
 *     const onChange = () => fetchCatalog();
 *     socket.on('catalogChanged', onChange);
 *     return () => socket.off('catalogChanged', onChange);
 *   }, [socket]);
 *
 * Components must clean up their own listeners on unmount. The connection
 * itself is kept alive for the lifetime of the dashboard, then disposed
 * when the provider unmounts.
 */

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/auth';

const SOCKET_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
type Namespace = 'catalog' | 'tracking' | 'messaging' | 'notifications';

type Ctx = {
  /** Get (or lazily create) the socket for a namespace. */
  get: (ns: Namespace) => Socket;
};

const SocketContext = createContext<Ctx | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  // Map<namespace, Socket> kept in a ref so re-renders never reset it.
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

  // Tear down on unmount (only happens when leaving /dashboard).
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

/** Get the shared socket for a namespace. Throws if outside the provider. */
export function useSocket(ns: Namespace): Socket {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside <SocketProvider>');
  return ctx.get(ns);
}
