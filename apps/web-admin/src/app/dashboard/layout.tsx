'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getUser, clearAuth, isAuthenticated } from '@/lib/auth';
import {
  LayoutDashboard, Users, ShieldCheck,
  Package, ClipboardCheck, ShoppingCart, MessageSquare, LogOut, Menu, X,
  Sun, Moon,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/dashboard/users',     label: 'Users',     icon: Users },
      { href: '/dashboard/suppliers', label: 'Suppliers', icon: ShieldCheck },
      { href: '/dashboard/catalog',   label: 'Catalog',   icon: Package },
      { href: '/dashboard/approvals', label: 'Material Approvals', icon: ClipboardCheck },
      { href: '/dashboard/orders',    label: 'Orders',    icon: ShoppingCart },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
    ],
  },
];

function readTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser]   = useState<any>(null);
  const [open, setOpen]   = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    setUser(getUser());
    setTheme(readTheme());
  }, [router]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('admin_theme', next); } catch {}
  }

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const allItems = NAV_GROUPS.flatMap(g => g.items);
  const currentPage = allItems.find(n => n.href === pathname)?.label ?? 'Admin';
  const initials    = (user?.email || user?.phone || 'A').slice(0, 2).toUpperCase();

  return (
    <div className="app-layout">

      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Sidebar */}
      <aside ref={sidebarRef} className={`sidebar${open ? ' open' : ''}`}>

        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🛡</div>
          <div className="sidebar-logo-text">
            CS<span>CP</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(148,163,184,0.5)', letterSpacing: 0, marginLeft: 4 }}>Admin</span>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="sidebar-nav">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-section-label">{group.label}</div>
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`sidebar-link${active ? ' active' : ''}`}
                  >
                    <span className="sidebar-link-icon">
                      <Icon size={15} strokeWidth={active ? 2.5 : 1.8} />
                    </span>
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.email || user?.phone || 'Admin'}</div>
              <div className="sidebar-user-role">Administrator</div>
            </div>
          </div>
          <button
            onClick={() => { clearAuth(); router.push('/login'); }}
            className="sidebar-signout"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="hamburger" onClick={() => setOpen(v => !v)} aria-label="Toggle menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="topbar-title">{currentPage}</div>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              onClick={toggleTheme}
              className="topbar-icon-btn"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="topbar-badge">Admin</div>
            <div className="topbar-user">
              <div className="topbar-user-dot" />
              <span className="topbar-user-text">
                {user?.email || user?.phone || '…'}
              </span>
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
