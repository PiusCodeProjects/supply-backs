'use client';

/**
 * Single source of truth for the supplier's conversation list.
 *
 * Why this exists:
 *   1. The sidebar Messages link needs an unread badge.
 *   2. The messages page previously polled `listConversations` itself on a 15s
 *      interval and re-fetched after every send, which made the "loading"
 *      spinner sit on the screen on cold start and made the list feel stale.
 *   3. Without joining each conversation's socket room up front, incoming
 *      messages for a thread the user hasn't opened yet wouldn't arrive in
 *      real time — they'd only show up on the next poll. The user had to
 *      click a conversation before seeing new messages from the sender.
 *
 * What this provider does:
 *   - Seeds `conversations` from localStorage so the messages page paints
 *     instantly on revisit (no spinner waiting for the API to wake up).
 *   - Fetches in the background, then polls every 30s + on tab focus as a
 *     safety net.
 *   - Joins the messaging socket room for every conversation, automatically
 *     re-joining on reconnect. From then on, `messageCreated` updates the
 *     list (lastMessage preview, unread counter, sort-to-top) in real time
 *     for ALL threads — not just the currently open one.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { messagesApi } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useSocket } from './SocketContext';
import { useCurrentUser } from './CurrentUserContext';

const POLL_MS = 30_000;
const CACHE_KEY = 'cscp_supplier_conversations_v1';

type Ctx = {
  conversations: any[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Locally zero out the unread count for a conversation (after marking read). */
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
  // Start empty so SSR and first client render match. The cached list is
  // hydrated in the effect below; reading localStorage during useState would
  // mismatch on hydration (server has no cache, client does).
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const socket = useSocket('messaging');
  const { user } = useCurrentUser();
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

  // Pull the cached list into state after mount (no hydration mismatch),
  // then do the live fetch + polling + focus refresh.
  useEffect(() => {
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

  // Join every conversation's room so we receive messageCreated events for
  // threads the user hasn't opened yet. Re-join on reconnect (socket.io rooms
  // don't survive a disconnect).
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
      if (payload.userId !== user?.id) return;
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
  }, [socket, refresh, user?.id]);

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
