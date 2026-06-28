'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearAuth } from '@/lib/auth';
import NotificationCenter from './NotificationCenter';

export default function Navbar() {
  const router = useRouter();

  function handleLogout() {
    clearAuth();
    router.replace('/login');
  }

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      background: 'var(--bg-main)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 18 }}>
        <span style={{ fontSize: 22 }}>🚛</span> CSCP Driver
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <NotificationCenter />
        <button 
          onClick={handleLogout}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--danger)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600
          }}
        >
          <LogOut size={18} /> <span className="hide-mobile">Logout</span>
        </button>
      </div>
    </nav>
  );
}