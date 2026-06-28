'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, ChevronLeft, ChevronRight, Search, AlertTriangle, User, Sun, Moon, Menu, X } from 'lucide-react';
import { isAuthenticated, getUserInitials } from '@/lib/auth';
import { NAV_ITEMS, PAGE_SUBTITLES } from '@/lib/nav';
import NotificationCenter from '@/components/NotificationCenter';
import GlobalSearch from '@/components/GlobalSearch';
import { CurrentUserProvider, useCurrentUser } from '@/contexts/CurrentUserContext';
import { CartProvider } from '@/contexts/CartContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { MessagingProvider, useMessaging } from '@/contexts/MessagingContext';

const SIDEBAR_NAV = NAV_ITEMS.filter(n => n.path !== '/dashboard/profile');

function readCollapsed(): boolean {
  try { return localStorage.getItem('sidebar') === 'collapsed'; } catch { return false; }
}

function readTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Single set of providers wraps the whole dashboard so every page can read
  // the same auth/profile, the same cart, and share Socket.IO connections.
  return (
    <CurrentUserProvider>
      <SocketProvider>
        <CartProvider>
          <MessagingProvider>
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
          </MessagingProvider>
        </CartProvider>
      </SocketProvider>
    </CurrentUserProvider>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, fullName, logout } = useCurrentUser();
  const { unreadCount: unreadMessageCount } = useMessaging();
  // SSR-safe: start uncollapsed (matches server output), then sync from
  // localStorage in useEffect on the client. Avoids hydration mismatch on
  // the collapse chevron icon.
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    setTheme(readTheme());
    const initialCollapsed = readCollapsed();
    setCollapsed(initialCollapsed);
    document.documentElement.dataset.sidebar = initialCollapsed ? 'collapsed' : 'expanded';
  }, [router]);

  // Close mobile drawer when navigating
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.mobileNav = mobileNavOpen ? 'open' : 'closed';
    const prev = document.body.style.overflow;
    document.body.style.overflow = mobileNavOpen ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [mobileNavOpen]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('contractor_theme', next); } catch {}
  }

  // Persist sidebar collapsed state — only when the user explicitly toggles it,
  // not on mount (mount value can be the SSR default and would clobber the saved
  // preference before our hydration sync runs).
  function persistCollapsed(next: boolean) {
    setCollapsed(next);
    document.documentElement.dataset.sidebar = next ? 'collapsed' : 'expanded';
    try { localStorage.setItem('sidebar', next ? 'collapsed' : 'expanded'); } catch {}
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const initials = getUserInitials(user);
  const name = fullName;
  const currentNav = NAV_ITEMS.find(n => n.path === pathname);
  const currentLabel = currentNav?.label ?? (pathname === '/dashboard/profile' ? 'Profile' : 'Dashboard');
  const subtitle = PAGE_SUBTITLES[pathname] ?? '';

  return (
    <>
      <div className="app-layout">
        <div
          className={`mobile-nav-backdrop${mobileNavOpen ? ' open' : ''}`}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden={!mobileNavOpen}
        />
        <aside className={`sidebar${mobileNavOpen ? ' mobile-open' : ''}`}>
          <button
            type="button"
            className="sidebar-mobile-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4.5L5 10v8h3v-5h8v5h3v-8l-7-5.5z" fill="currentColor" />
              </svg>
            </div>
            <div className="sidebar-logo-text">CS<span>CP</span></div>
          </div>

          <div className="sidebar-section-label">Contractor</div>

          <nav className="sidebar-nav">
            {SIDEBAR_NAV.map(({ path, label, icon: Icon }) => {
              const count = path === '/dashboard/messages' ? unreadMessageCount : 0;
              const showBadge = count > 0;
              const badgeLabel = count > 99 ? '99+' : String(count);
              return (
                <Link
                  key={path}
                  href={path}
                  className={`sidebar-link${pathname === path ? ' active' : ''}`}
                  title={showBadge ? `${label} (${count} unread)` : label}
                >
                  <span className="sidebar-link-icon">
                    <Icon size={18} />
                    {showBadge && <span className="sidebar-link-dot" aria-hidden />}
                  </span>
                  <span className="sidebar-link-label">{label}</span>
                  {showBadge && (
                    <span className="sidebar-link-badge" aria-label={`${count} unread`}>
                      {badgeLabel}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <Link
              href="/dashboard/profile"
              className={`sidebar-link${pathname === '/dashboard/profile' ? ' active' : ''}`}
              title="Profile"
            >
              <span className="sidebar-link-icon"><User size={18} /></span>
              <span className="sidebar-link-label">Profile</span>
            </Link>

            <button onClick={handleLogout} className="sidebar-link danger" title="Sign Out">
              <span className="sidebar-link-icon"><LogOut size={18} /></span>
              <span className="sidebar-link-label">Sign Out</span>
            </button>

            <button
              className="sidebar-link"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
            >
              <span className="sidebar-link-icon">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </span>
              <span className="sidebar-link-label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>

            <button
              className="sidebar-collapse-btn"
              onClick={() => persistCollapsed(!collapsed)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span className="sidebar-link-icon">
                {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </span>
              <span className="sidebar-link-label">Collapse</span>
            </button>
          </div>
        </aside>

        <div className="main-content">
          <header className="topbar">
            <button
              type="button"
              className="topbar-hamburger"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            <div className="topbar-context">
              <div className="topbar-breadcrumb">
                <span>Contractor Portal</span>
                <span className="topbar-breadcrumb-sep">/</span>
                <span>{currentLabel}</span>
              </div>
              <div className="topbar-title">{currentLabel}</div>
              {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
            </div>

            <div className="topbar-actions">
              <button
                className="topbar-search-btn"
                onClick={() => setSearchOpen(true)}
                aria-label="Search pages (Cmd+K)"
              >
                <Search size={14} />
                <span>Search</span>
                <kbd className="topbar-search-kbd">K</kbd>
              </button>

              {user && !user.isVerified && (
                <div className="badge-verify">
                  <AlertTriangle size={13} />
                  Phone not verified
                </div>
              )}

              <NotificationCenter />

              <div className="topbar-profile">
                <div className="topbar-profile-copy">
                  <span className="topbar-profile-label">Signed in as</span>
                  <span className="topbar-profile-name">{name || 'Contractor'}</span>
                </div>
                <div className="avatar" title={name} aria-label={name || 'User'}>
                  {initials}
                </div>
              </div>
            </div>
          </header>

          <main className="page-content">{children}</main>
        </div>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
