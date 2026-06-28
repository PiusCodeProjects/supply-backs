'use client';

import { SocketProvider } from '@/contexts/SocketContext';
import { MessagingProvider } from '@/contexts/MessagingContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The driver dashboard reaches the messaging socket through SocketProvider
  // (so the dashboard page and the messages page share one connection) and
  // the conversation list / unread count through MessagingProvider. The
  // tracking socket is created lazily by the dashboard page itself because
  // it only runs during a live trip leg.
  return (
    <SocketProvider>
      <MessagingProvider>
        {children}
      </MessagingProvider>
    </SocketProvider>
  );
}
