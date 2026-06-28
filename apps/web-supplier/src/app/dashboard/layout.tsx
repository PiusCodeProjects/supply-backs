'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, ChevronLeft, ChevronRight, User, Sun, Moon } from 'lucide-react';
import { isAuthenticated, getUserInitials } from '@/lib/auth';
import { NAV_ITEMS, PAGE_SUBTITLES } from '@/lib/nav';
import { CurrentUserProvider, useCurrentUser } from '@/contexts/CurrentUserContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { PendingOrdersProvider, usePendingOrders } from '@/contexts/PendingOrdersContext';
import { MessagingProvider, useMessaging } from '@/contexts/MessagingContext';

const SIDEBAR_NAV = NAV_ITEMS.filter(n => n.path !== '/dashboard/profile');

function readCollapsed(): boolean {
  try { return localStorage.getItem('supplier_sidebar') === 'collapsed'; } catch { return false; }
}

function readTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrentUserProvider>
      <SocketProvider>
        <PendingOrdersProvider>
          <MessagingProvider>
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
          </MessagingProvider>
        </PendingOrdersProvider>
      </SocketProvider>
    </CurrentUserProvider>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, businessName, logout } = useCurrentUser();
  const { attentionCount } = usePendingOrders();
  const { unreadCount: unreadMessageCount } = useMessaging();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    setTheme(readTheme());
  }, [router]);

  useEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    try { localStorage.setItem('supplier_sidebar', collapsed ? 'collapsed' : 'expanded'); } catch {}
  }, [collapsed]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('supplier_theme', next); } catch {}
  }

  function handleLogout() {
    logout();
    router.push('/login');
  }

  const initials = getUserInitials(user);
  const currentNav = NAV_ITEMS.find(n => n.path === pathname);
  const currentLabel = currentNav?.label ?? (pathname === '/dashboard/profile' ? 'Profile' : 'Dashboard');
  const subtitle = PAGE_SUBTITLES[pathname] ?? '';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className="sidebar-logo-text">CS<span>CP</span></div>
        </div>

        <div className="sidebar-section-label">Supplier</div>

        <nav className="sidebar-nav">
          {SIDEBAR_NAV.map(({ path, label, icon: Icon }) => {
            const count =
              path === '/dashboard/fulfillment' ? attentionCount
              : path === '/dashboard/messages' ? unreadMessageCount
              : 0;
            const showBadge = count > 0;
            const badgeLabel = count > 99 ? '99+' : String(count);
            const tooltip = showBadge
              ? (path === '/dashboard/messages'
                  ? `${label} (${count} unread)`
                  : `${label} (${count} need attention)`)
              : label;
            return (
              <Link
                key={path}
                href={path}
                className={`sidebar-link${pathname === path ? ' active' : ''}`}
                title={tooltip}
              >
                <span className="sidebar-link-icon">
                  <Icon size={18} />
                  {showBadge && (
                    <span className="sidebar-link-dot" aria-hidden />
                  )}
                </span>
                <span className="sidebar-link-label">{label}</span>
                {showBadge && (
                  <span className="sidebar-link-badge" aria-label={`${count} ${path === '/dashboard/messages' ? 'unread' : 'pending'}`}>
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
            onClick={() => setCollapsed(v => !v)}
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
          <div className="topbar-context">
            <div className="topbar-breadcrumb">
              <span>Supplier Portal</span>
              <span className="topbar-breadcrumb-sep">/</span>
              <span>{currentLabel}</span>
            </div>
            <div className="topbar-title">{currentLabel}</div>
            {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
          </div>

          <div className="topbar-actions">
            {user?.status === 'PENDING_VERIFICATION' && (
              <div className="badge-verify">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Pending Approval
              </div>
            )}

            <div className="topbar-profile">
              <div className="topbar-profile-copy">
                <span className="topbar-profile-label">Signed in as</span>
                <span className="topbar-profile-name">{businessName || 'Supplier'}</span>
              </div>
              <div className="avatar" title={businessName} aria-label={businessName || 'User'}>
                {initials}
              </div>
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
