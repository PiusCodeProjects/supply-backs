'use client';

/**
 * Single Socket.IO connection per namespace, shared across the driver
 * dashboard. The driver app's tracking socket is created separately by
 * `createTrackingSocket()` (because it has a different lifecycle — it only
 * runs during a live trip leg). This context is for the messaging namespace,
 * which needs to stay connected the whole time the driver is in the app so
 * unread counts and in-thread bubbles arrive in real time.
 */

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/auth';

const SOCKET_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001').replace(/\/api$/, '');
type Namespace = 'messaging';

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
