'use client';

const ACCESS_KEY = 'cscp_access';
const REFRESH_KEY = 'cscp_refresh';
const USER_KEY = 'cscp_user';

export function saveTokens(accessToken: string, refreshToken: string, user: any) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): any | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function getUserInitials(user: any): string {
  if (!user) return '?';
  if (user.contractorProfile) {
    const { firstName, lastName } = user.contractorProfile;
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  }
  return user.phone?.slice(-2) || '?';
}
