'use client';

/**
 * Shop cart state, persisted to localStorage so it survives navigation
 * (browsing Projects, Messages, etc. used to wipe the in-memory cart).
 *
 * The shop page owns the rich quantity/cap logic (project requirements,
 * stock, supplier grouping); this context just stores the lines and
 * exposes primitive operations the page can build on.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type CartLine = {
  catalogItemId: string;
  supplierId: string;
  supplierName: string;
  supplierPhone?: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  stock: number;
  imageUrl?: string;
  category?: string;
  /** undefined = personal purchase; non-empty = scoped to a project */
  projectId?: string;
  requirementId?: string;
};

type Ctx = {
  cart: CartLine[];
  /** Replace the cart wholesale (used after submit clears scope). */
  setCart: (next: CartLine[] | ((prev: CartLine[]) => CartLine[])) => void;
  /** Empty everything. */
  clear: () => void;
  /** Drop all lines that match a predicate (e.g. by projectId). */
  removeWhere: (pred: (l: CartLine) => boolean) => void;
};

const STORAGE_KEY = 'cscp_contractor_cart_v1';
const CartContext = createContext<Ctx | null>(null);

function readPersisted(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Start empty for SSR-safe rendering, then hydrate on the client to avoid
  // a mismatch between server and client markup.
  const [cart, setCartState] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCartState(readPersisted());
    setHydrated(true);
  }, []);

  // Persist on every change — but only after hydration, so we don't overwrite
  // the stored cart with an empty initial render.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch {}
  }, [cart, hydrated]);

  // Multi-tab sync: another tab adds an item → reflect it here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      try {
        setCartState(e.newValue ? JSON.parse(e.newValue) : []);
      } catch { /* ignore corrupt payload */ }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setCart = useCallback<Ctx['setCart']>((next) => {
    setCartState(prev => (typeof next === 'function' ? (next as (p: CartLine[]) => CartLine[])(prev) : next));
  }, []);

  const clear = useCallback(() => setCartState([]), []);
  const removeWhere = useCallback((pred: (l: CartLine) => boolean) => {
    setCartState(prev => prev.filter(l => !pred(l)));
  }, []);

  const value = useMemo<Ctx>(() => ({ cart, setCart, clear, removeWhere }), [cart, setCart, clear, removeWhere]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Ctx {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return ctx;
}
