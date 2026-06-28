'use client';

/**
 * Single source of truth for the logged-in contractor across the dashboard.
 * Replaces the ad-hoc getUser() / authApi.getProfile() calls scattered
 * across components so:
 *   - one fetch on mount (cached in localStorage too, for fast first paint)
 *   - components subscribe via useCurrentUser() and stay in sync
 *   - profile updates (e.g. after verify-OTP) refresh every consumer
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '@/lib/api';
import { getAccessToken, getUser, saveTokens, clearAuth as clearStoredAuth, getRefreshToken } from '@/lib/auth';

type ContractorProfile = {
  firstName?: string;
  lastName?: string;
  company?: string;
} | null;

export type CurrentUser = {
  id: string;
  email?: string | null;
  phone?: string;
  isVerified?: boolean;
  contractorProfile?: ContractorProfile;
  createdAt?: string;
} | null;

type Ctx = {
  user: CurrentUser;
  /** Display-ready full name (falls back to phone or empty string). */
  fullName: string;
  /** Whether the initial profile fetch is in flight. */
  loading: boolean;
  /** Re-fetch the profile from the API. */
  refresh: () => Promise<void>;
  /** Locally update cached user (e.g. after verifying OTP). */
  setUser: (u: CurrentUser) => void;
  /** Wipe local auth and clear the cache. */
  logout: () => void;
};

const CurrentUserContext = createContext<Ctx | null>(null);

function deriveName(u: CurrentUser): string {
  if (!u) return '';
  const p = u.contractorProfile;
  const n = p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() : '';
  return n || u.phone || '';
}

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  // Start null so SSR and the first client render agree. We hydrate from
  // localStorage in an effect (below) — reading it during useState would
  // produce a hydration mismatch because window is undefined on the server.
  const [user, setUserState] = useState<CurrentUser>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const persist = useCallback((next: CurrentUser) => {
    setUserState(next);
    // Mirror to localStorage so other tabs / page reloads pick it up.
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
      /* keep cached value on transient errors */
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

  // Sync across tabs: another tab logs in/out → reflect it here.
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
    fullName: deriveName(user),
    loading,
    refresh,
    setUser: persist,
    logout,
  }), [user, loading, refresh, persist, logout]);

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): Ctx {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error('useCurrentUser must be used inside <CurrentUserProvider>');
  }
  return ctx;
}

// Expose internals only for the rare component that needs to manually persist
// (e.g. login form right after saveTokens). Most code should use useCurrentUser().
export { saveTokens };
