'use client';

/**
 * Single source of truth for the logged-in supplier across the dashboard.
 * Replaces scattered getUser() / authApi.getProfile() calls so:
 *   - one fetch on mount (cached in localStorage for fast first paint)
 *   - components subscribe via useCurrentUser() and stay in sync
 *   - profile updates (verification approval, business-name edits)
 *     propagate to every consumer
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '@/lib/api';
import { getAccessToken, getUser, getRefreshToken, clearAuth as clearStoredAuth } from '@/lib/auth';

type SupplierProfile = {
  businessName?: string;
  verificationStatus?: string;
} | null;

export type CurrentUser = {
  id: string;
  email?: string | null;
  phone?: string;
  status?: string;
  isVerified?: boolean;
  supplierProfile?: SupplierProfile;
  createdAt?: string;
} | null;

type Ctx = {
  user: CurrentUser;
  /** Business name (falls back to phone). */
  businessName: string;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: CurrentUser) => void;
  logout: () => void;
};

const CurrentUserContext = createContext<Ctx | null>(null);

function deriveBusinessName(u: CurrentUser): string {
  if (!u) return '';
  return u.supplierProfile?.businessName || u.phone || '';
}

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  // Start null so SSR and the first client render agree. We hydrate from
  // localStorage in an effect (below) — reading it during useState would
  // produce a hydration mismatch because window is undefined on the server.
  const [user, setUserState] = useState<CurrentUser>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const persist = useCallback((next: CurrentUser) => {
    setUserState(next);
    if (typeof window === 'undefined') return;
    if (next) {
      try { localStorage.setItem('cscp_user', JSON.stringify(next)); } catch {}
    }
  }, []);

  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    try {
      const fresh = await authApi.getProfile(token) as CurrentUser;
      if (fresh) persist(fresh);
    } catch {
      /* keep cached value */
    } finally {
      setLoading(false);
    }
  }, [persist]);

  // Pull the cached profile into state after mount so the topbar paints fast
  // without a hydration mismatch, then refresh from the API.
  useEffect(() => {
    const cached = getUser() as CurrentUser;
    if (cached) setUserState(cached);
    refresh();
  }, [refresh]);

  // Multi-tab sync.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onStorage(e: StorageEvent) {
      if (e.key === 'cscp_user') {
        setUserState(e.newValue ? JSON.parse(e.newValue) : null);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const logout = useCallback(() => {
    const token = getRefreshToken();
    if (token) { authApi.logout(token).catch(() => {}); }
    clearStoredAuth();
    persist(null);
  }, [persist]);

  const value = useMemo<Ctx>(() => ({
    user,
    businessName: deriveBusinessName(user),
    loading,
    refresh,
    setUser: persist,
    logout,
  }), [user, loading, refresh, persist, logout]);

  return (
    <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): Ctx {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error('useCurrentUser must be used inside <CurrentUserProvider>');
  return ctx;
}
