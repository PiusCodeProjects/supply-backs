'use client';

import { useState, useEffect } from 'react';
import { Bell, CheckCircle, Info, AlertTriangle, XCircle } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Poll every 30s as fallback
    return () => clearInterval(interval);
  }, []);

  async function fetchNotifications() {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [notifs, count] = await Promise.all([
        apiRequest<any[]>('/notifications', { token }),
        apiRequest<number>('/notifications/unread-count', { token })
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  }

  async function markAsRead(id: string) {
    const token = getAccessToken();
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PATCH', token: token! });
      fetchNotifications();
    } catch (err) {
      console.error(err);
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'SUCCESS': return <CheckCircle size={16} color="var(--success)" />;
      case 'WARNING': return <AlertTriangle size={16} color="var(--warning)" />;
      case 'ERROR': return <XCircle size={16} color="var(--danger)" />;
      default: return <Info size={16} color="var(--info)" />;
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="btn-icon"
        style={{ position: 'relative', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -2,
            right: -2,
            background: 'var(--danger)',
            color: 'white',
            fontSize: 10,
            fontWeight: 'bold',
            borderRadius: '50%',
            width: 16,
            height: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--bg-surface)'
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div 
            onClick={() => setIsOpen(false)} 
            style={{ position: 'fixed', inset: 0, zIndex: 998 }} 
          />
          <div className="card fade-in" style={{
            position: 'absolute',
            top: 40,
            right: 0,
            width: 320,
            maxHeight: 480,
            zIndex: 999,
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-subtle)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div className="card-header" style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>
              Notifications
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n) => (
                  <div 
                    key={n.id} 
                    onClick={() => markAsRead(n.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: n.read ? 'transparent' : 'var(--accent-muted)',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                      {getIcon(n.type)}
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                      {n.message}
                    </p>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                      {new Date(n.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
