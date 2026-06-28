'use client';

/**
 * Single source of truth for the driver's conversation list.
 *
 * Same shape as the contractor/supplier providers — see those for the full
 * rationale. In short:
 *   - Seeds from localStorage on mount (hydration-safe) so the inbox paints
 *     instantly on revisit.
 *   - Polls every 30 s as a backup, refreshes on tab focus.
 *   - Joins every conversation's socket room up front, so new messages arrive
 *     in real time across all threads — not just the currently open one.
 *   - Exposes unreadCount for the bottom-nav Messages badge and a markRead()
 *     helper for the messages page to call after opening a thread.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { messagesApi } from '@/lib/api';
import { getAccessToken, getUser } from '@/lib/auth';
import { useSocket } from './SocketContext';

const POLL_MS = 30_000;
const CACHE_KEY = 'cscp_driver_conversations_v1';

type Ctx = {
  conversations: any[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (conversationId: string) => void;
};

const MessagingContext = createContext<Ctx | null>(null);

function loadCached(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persistCache(list: any[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch {}
}

export function MessagingProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe defaults — we populate from the cache in the effect below.
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);
  const socket = useSocket('messaging');
  const inFlight = useRef(false);
  const joinedRoomsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const token = getAccessToken();
    if (!token) { setLoading(false); return; }
    inFlight.current = true;
    try {
      const data = await messagesApi.listConversations(token);
      const list = Array.isArray(data) ? data : [];
      setConversations(list);
      persistCache(list);
    } catch {
      /* keep last-known list */
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    setUserId(getUser()?.id ?? null);
    const cached = loadCached();
    if (cached.length > 0) {
      setConversations(cached);
      setLoading(false);
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Join every conversation's room so messageCreated arrives for threads the
  // driver hasn't opened. Re-join on reconnect (socket.io rooms don't survive).
  useEffect(() => {
    if (!socket) return;
    const joinAll = () => {
      conversations.forEach((c: any) => {
        if (!c?.id || joinedRoomsRef.current.has(c.id)) return;
        socket.emit('joinConversation', { conversationId: c.id });
        joinedRoomsRef.current.add(c.id);
      });
    };
    const onConnect = () => {
      joinedRoomsRef.current.clear();
      joinAll();
    };
    if (socket.connected) joinAll();
    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [socket, conversations]);

  // Real-time list updates.
  useEffect(() => {
    if (!socket) return;
    const onMessageCreated = (payload: any) => {
      setConversations(prev => {
        const idx = prev.findIndex((c: any) => c.id === payload.conversationId);
        if (idx < 0) {
          refresh();
          return prev;
        }
        const c = prev[idx];
        const updated = {
          ...c,
          lastMessage: {
            id: payload.id,
            content: payload.content,
            createdAt: payload.createdAt,
            sender: payload.sender,
            hasAttachments: (payload.attachments?.length || 0) > 0,
            isOwn: !!payload.isOwn,
          },
          updatedAt: payload.createdAt,
          unreadCount: payload.isOwn ? (c.unreadCount || 0) : (c.unreadCount || 0) + 1,
        };
        const next = prev.slice();
        next.splice(idx, 1);
        next.unshift(updated);
        persistCache(next);
        return next;
      });
    };
    const onConversationRead = (payload: any) => {
      if (payload.userId !== userId) return;
      setConversations(prev => {
        const next = prev.map((c: any) =>
          c.id === payload.conversationId ? { ...c, unreadCount: 0 } : c,
        );
        persistCache(next);
        return next;
      });
    };
    socket.on('messageCreated', onMessageCreated);
    socket.on('conversationRead', onConversationRead);
    return () => {
      socket.off('messageCreated', onMessageCreated);
      socket.off('conversationRead', onConversationRead);
    };
  }, [socket, refresh, userId]);

  const markRead = useCallback((conversationId: string) => {
    setConversations(prev => {
      const next = prev.map((c: any) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      );
      persistCache(next);
      return next;
    });
  }, []);

  const unreadCount = useMemo(
    () => conversations.reduce((s: number, c: any) => s + (c.unreadCount || 0), 0),
    [conversations],
  );

  const value = useMemo<Ctx>(() => ({
    conversations,
    unreadCount,
    loading,
    refresh,
    markRead,
  }), [conversations, unreadCount, loading, refresh, markRead]);

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}

export function useMessaging(): Ctx {
  const ctx = useContext(MessagingContext);
  if (!ctx) throw new Error('useMessaging must be used inside <MessagingProvider>');
  return ctx;
}
