'use client';

/**
 * Shared pending-orders state.
 *
 * Before this context the supplier sidebar polled /orders/supplier every 45s
 * to drive the "Orders" badge while the fulfillment page polled the same
 * endpoint independently. Now both consumers share one fetch and any
 * accept/dispatch action can call `refresh()` to keep the badge accurate
 * without waiting for the next poll.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

const ATTENTION_STATUSES = new Set(['PENDING']);
const POLL_MS = 45_000;

type Ctx = {
  /** All supplier orders (already loaded for the page). */
  orders: any[];
  /** Count of orders that need supplier attention (PENDING). */
  attentionCount: number;
  loading: boolean;
  /** Force-refetch (e.g. after accepting / dispatching). */
  refresh: () => Promise<void>;
  /** Replace local orders cache without a network call (optimistic updates). */
  setOrders: (next: any[] | ((prev: any[]) => any[])) => void;
};

const PendingOrdersContext = createContext<Ctx | null>(null);

export function PendingOrdersProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrdersState] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    inFlight.current = true;
    try {
      const data = await apiRequest<any[]>('/orders/supplier', { token });
      setOrdersState(Array.isArray(data) ? data : []);
    } catch {
      /* keep last-known list */
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  // Initial fetch + periodic refresh + refresh-on-tab-focus.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const setOrders = useCallback<Ctx['setOrders']>((next) => {
    setOrdersState(prev => (typeof next === 'function' ? (next as (p: any[]) => any[])(prev) : next));
  }, []);

  const attentionCount = useMemo(
    () => orders.filter((o: any) => ATTENTION_STATUSES.has(o?.status)).length,
    [orders],
  );

  const value = useMemo<Ctx>(() => ({
    orders,
    attentionCount,
    loading,
    refresh,
    setOrders,
  }), [orders, attentionCount, loading, refresh, setOrders]);

  return <PendingOrdersContext.Provider value={value}>{children}</PendingOrdersContext.Provider>;
}

export function usePendingOrders(): Ctx {
  const ctx = useContext(PendingOrdersContext);
  if (!ctx) throw new Error('usePendingOrders must be used inside <PendingOrdersProvider>');
  return ctx;
}
