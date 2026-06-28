'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { getAccessToken } from '@/lib/auth';
import { messagesApi } from '@/lib/api';
import { useCurrentUser } from '@/contexts/CurrentUserContext';
import { useSocket } from '@/contexts/SocketContext';
import { useMessaging } from '@/contexts/MessagingContext';
import {
  Search, Send, Paperclip, Check, CheckCheck, Clock, File,
  MessageSquare, SmilePlus, Reply, Copy, X, ArrowDown, ChevronLeft, Users,
} from 'lucide-react';

const UPLOAD_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api').replace(/\/api$/, '');
const EMOJIS = ['😀','😂','🥰','😍','🤩','😎','🥳','😊','🙏','👍','❤️','🔥','💯','✅','⭐','🎉','👏','💪','🚀','💡','📦','🏗️','🚚','✍️','📋','⚡','🌟','💰','🎯','🤝'];

function getInitials(name: string) {
  if (!name) return '?';
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
}
function avatarColor(str: string) {
  const p = ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6','#ec4899','#06b6d4'];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return p[Math.abs(h) % p.length];
}
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtConvoTime(iso: string) {
  const d = new Date(iso), now = new Date(), diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'Yesterday';
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if (diff < 604800000) return days[d.getDay()];
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function getDateLabel(iso: string) {
  const d = new Date(iso), now = new Date(), diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000) return 'Yesterday';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  if (diff < 604800000) return days[d.getDay()];
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function isImg(name: string) { return /\.(jpe?g|gif|png|webp)$/i.test(name); }

function Avatar({ name, size = 38, ring = false }: { name: string; size?: number; ring?: boolean }) {
  const color = avatarColor(name || '?');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: Math.round(size * 0.36), flexShrink: 0, userSelect: 'none',
      boxShadow: ring ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${color}55` : undefined,
      letterSpacing: '-0.5px',
    }}>
      {getInitials(name)}
    </div>
  );
}

export default function ContractorMessagesPage() {
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyingTo, setReplyingTo] = useState<any | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [newMsgCount, setNewMsgCount] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: any } | null>(null);
  const [filePreviews, setFilePreviews] = useState<{ file: File; url: string }[]>([]);
  const [scrollProgress, setScrollProgress] = useState(0);
  // Responsive
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Shared CurrentUserProvider — same identity used everywhere in the dashboard.
  const { user: currentUser, fullName: currentUserName } = useCurrentUser();
  // Shared messaging socket from SocketProvider; no per-page connection churn.
  const socket = useSocket('messaging');
  // Shared messaging state — conversations list, unread badge, real-time
  // updates are all owned by MessagingContext. The page just reads + acts.
  const {
    conversations,
    loading,
    refresh: refreshConversations,
    markRead: markConversationReadLocal,
  } = useMessaging();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const selectedGroupNameRef = useRef<string | null>(null);
  const activeConversationIdsRef = useRef<string[]>([]);

  // Responsive listener
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarVisible(true);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => { selectedGroupNameRef.current = selectedGroupName; }, [selectedGroupName]);
  useEffect(() => {
    activeConversationIdsRef.current = selectedConversation?.realConversationIds ?? [];
  }, [selectedConversation]);

  // MessagingContext owns the conversations fetch + 30s polling + WS-driven
  // updates. Here we just auto-select the first thread once the list arrives.
  useEffect(() => {
    if (selectedGroupName || conversations.length === 0) return;
    const first = conversations[0];
    const name = first.participants
      .filter((p: any) => p.id !== currentUser?.id)
      .map((p: any) => p.displayName)
      .join(', ') || first.title;
    setSelectedGroupName(name);
  }, [conversations, currentUser?.id, selectedGroupName]);

  // Listen for new messages in the currently-open thread so they pop in like
  // WhatsApp. The sidebar list / unread badge / room joins are all handled
  // up in MessagingContext, so we don't need to worry about those here.
  useEffect(() => {
    const onMessageCreated = (payload: any) => {
      if (!activeConversationIdsRef.current.includes(payload.conversationId)) return;
      setSelectedConversation((prev: any) => {
        if (!prev) return prev;
        // Already rendered (HTTP response landed first).
        if (prev.messages.some((m: any) => m.id === payload.id)) return prev;
        // Swap an optimistic temp bubble in place when the server echo arrives.
        if (payload.isOwn) {
          const tempIdx = prev.messages.findIndex(
            (m: any) => m.pending && m.content === payload.content,
          );
          if (tempIdx >= 0) {
            const next = prev.messages.slice();
            next[tempIdx] = payload;
            return { ...prev, messages: next };
          }
        }
        if (!isAtBottomRef.current) setNewMsgCount(c => c + 1);
        const msgs = [...prev.messages, payload].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        return { ...prev, messages: msgs };
      });
    };
    const onConversationRead = (payload: any) => {
      if (!activeConversationIdsRef.current.includes(payload.conversationId)) return;
      setSelectedConversation((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((item: any) =>
            item.isOwn && !item.readBy.some((e: any) => e.user.id === payload.userId)
              ? { ...item, readBy: [...item.readBy, { user: prev.participants.find((p: any) => p.id === payload.userId), readAt: payload.readAt }] }
              : item
          ),
        };
      });
    };
    socket.on('messageCreated', onMessageCreated);
    socket.on('conversationRead', onConversationRead);
    return () => {
      socket.off('messageCreated', onMessageCreated);
      socket.off('conversationRead', onConversationRead);
    };
  }, [socket]);

  useEffect(() => {
    if (selectedGroupName && conversations.length > 0) {
      const gc = conversations.filter((c: any) => {
        const t = c.participants.filter((p: any) => p.id !== currentUser?.id).map((p: any) => p.displayName).join(', ') || c.title;
        return t === selectedGroupName;
      });
      openGroupedConversation(selectedGroupName, gc);
      // Room joins are owned by MessagingContext (joined for every thread on
      // load + after reconnect), so we don't re-emit joinConversation here.
    }
  }, [selectedGroupName, conversations]);

  // Auto scroll
  useEffect(() => {
    const msgs = selectedConversation?.messages || [];
    if (msgs.length > prevMsgCountRef.current && isAtBottomRef.current) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      setNewMsgCount(0);
    }
    prevMsgCountRef.current = msgs.length;
  }, [selectedConversation?.messages]);

  // File previews
  useEffect(() => {
    const pv = files.map(f => ({ file: f, url: isImg(f.name) ? URL.createObjectURL(f) : '' }));
    setFilePreviews(pv);
    return () => { pv.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); }); };
  }, [files]);

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = fromBottom < 80;
    setShowScrollBtn(fromBottom > 240);
    if (isAtBottomRef.current) setNewMsgCount(0);
    const progress = el.scrollTop / Math.max(el.scrollHeight - el.clientHeight, 1);
    setScrollProgress(Math.min(progress, 1));
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewMsgCount(0);
  }

  async function openGroupedConversation(groupName: string, groupConvos: any[]) {
    const token = getAccessToken();
    if (!token || groupConvos.length === 0) return;
    const allData = await Promise.all(groupConvos.map(c => messagesApi.getConversation(token, c.id)));
    let combined: any[] = [];
    allData.forEach(d => { combined = [...combined, ...d.messages.map((m: any) => ({ ...m, orderId: d.orderId, projectName: d.project?.name }))]; });
    combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const latest = [...groupConvos].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0];
    setSelectedConversation({ ...allData[0], title: groupName, messages: combined, latestConversationId: latest.id, realConversationIds: groupConvos.map(c => c.id), ordersCount: groupConvos.length });
    await Promise.all(groupConvos.map(c => messagesApi.markConversationRead(token, c.id)));
    // Optimistically clear unread on every thread in this group so the sidebar
    // badge drops the moment the user opens it. MessagingContext also reflects
    // this when the server emits conversationRead.
    groupConvos.forEach(c => markConversationReadLocal(c.id));
    setTimeout(() => messagesEndRef.current?.scrollIntoView(), 120);
  }

  async function handleSend() {
    const token = getAccessToken();
    if (!token || !selectedConversation?.latestConversationId || (!message.trim() && files.length === 0)) return;

    const content = replyingTo
      ? `↩ Replying to "${replyingTo.content?.slice(0, 60)}${(replyingTo.content?.length || 0) > 60 ? '…' : ''}"\n\n${message}`
      : message;
    const sendFiles = files;
    const targetConversationId = selectedConversation.latestConversationId;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build an optimistic bubble so the UI updates in the same tick. The real
    // server payload (arriving via WS or the HTTP response) will swap this out.
    const optimistic = {
      id: tempId,
      pending: true,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: {
        id: currentUser?.id,
        role: 'CONTRACTOR',
        displayName: currentUserName || 'You',
      },
      attachments: sendFiles.map((f, i) => ({
        id: `${tempId}-att-${i}`,
        originalName: f.name,
        mimeType: f.type,
        size: f.size,
        url: '',
      })),
      readBy: [],
      isOwn: true,
    };

    // Clear the composer immediately and append the optimistic bubble. This is
    // what kills the perceived send latency — the user sees their message land
    // before the round trip completes.
    setSelectedConversation((prev: any) =>
      prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
    );
    setMessage(''); setFiles([]); setReplyingTo(null); setShowEmojiPicker(false);
    isAtBottomRef.current = true;

    setSending(true);
    try {
      const real = await messagesApi.sendMessage(token, targetConversationId, { content, files: sendFiles });
      // Swap the temp bubble out if the WS event hasn't already done it.
      setSelectedConversation((prev: any) => {
        if (!prev) return prev;
        if (prev.messages.some((m: any) => m.id === real.id)) {
          return { ...prev, messages: prev.messages.filter((m: any) => m.id !== tempId) };
        }
        return {
          ...prev,
          messages: prev.messages.map((m: any) => (m.id === tempId ? real : m)),
        };
      });
      // Sidebar list/badge update via WS is real-time; this fire-and-forget
      // refresh is just a safety net if the WS misses.
      refreshConversations();
    } catch {
      // Mark the optimistic bubble as failed so the user can retry.
      setSelectedConversation((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m: any) =>
            m.id === tempId ? { ...m, failed: true, pending: false } : m,
          ),
        };
      });
    } finally {
      setSending(false);
    }
  }

  function removeFile(i: number) { setFiles(prev => prev.filter((_, idx) => idx !== i)); }
  function attachmentUrl(url: string) { return `${UPLOAD_BASE}${url}`; }

  const handleContextMenu = useCallback((e: React.MouseEvent, msg: any) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  const groupedConversations = useMemo(() => {
    const groups: Record<string, any[]> = {};
    conversations.forEach(c => {
      const t = c.participants.filter((p: any) => p.id !== currentUser?.id).map((p: any) => p.displayName).join(', ') || c.title;
      if (!groups[t]) groups[t] = [];
      groups[t].push(c);
    });
    return Object.entries(groups).sort((a, b) => {
      const ta = Math.max(...a[1].map(c => new Date(c.updatedAt || c.createdAt || 0).getTime()));
      const tb = Math.max(...b[1].map(c => new Date(c.updatedAt || c.createdAt || 0).getTime()));
      return tb - ta;
    });
  }, [conversations, currentUser]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedConversations;
    const q = searchQuery.toLowerCase();
    return groupedConversations.filter(([name]) => name.toLowerCase().includes(q));
  }, [groupedConversations, searchQuery]);

  const messageRows = useMemo(() => {
    if (!selectedConversation) return [];
    const rows: any[] = [];
    let lastDate = '';
    selectedConversation.messages.forEach((msg: any, i: number) => {
      const label = getDateLabel(msg.createdAt);
      if (label !== lastDate) { rows.push({ type: 'sep', label, key: `s${i}` }); lastDate = label; }
      const prev = selectedConversation.messages[i - 1];
      const next = selectedConversation.messages[i + 1];
      const first = !prev || prev.sender.id !== msg.sender.id || getDateLabel(prev.createdAt) !== label;
      const last = !next || next.sender.id !== msg.sender.id;
      rows.push({ type: 'msg', msg, first, last, key: msg.id });
    });
    return rows;
  }, [selectedConversation]);

  const selectGroup = (name: string) => {
    setSelectedGroupName(name);
    if (isMobile) setSidebarVisible(false);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* Layout */
        .cmc-root {
          display: flex; flex-direction: column; position: relative;
          /* 64px topbar + 32px padding-top + 32px padding-bottom */
          height: calc(100vh - 128px);
          min-height: 480px;
        }
        .cmc-shell {
          display: grid; grid-template-columns: 300px 1fr;
          flex: 1; min-height: 0; height: 0; /* height:0 forces flex child to not exceed parent */
          background: var(--bg-surface); border-radius: 14px; overflow: hidden;
          border: 1px solid var(--border-subtle);
          box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px var(--bg-elevated);
        }

        /* Sidebar */
        .cmc-sidebar {
          display: flex; flex-direction: column;
          background: var(--bg-base); border-right: 1px solid var(--border-subtle);
          min-height: 0; overflow: hidden;
        }
        .cmc-sidebar-head {
          padding: 18px 16px 14px; border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated); flex-shrink: 0;
        }
        .cmc-sidebar-title { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
        .cmc-sidebar-title span { font-weight: 700; font-size: 15px; color: var(--text-primary); letter-spacing: -0.2px; }
        .cmc-search {
          position: relative;
        }
        .cmc-search input {
          width: 100%; background: var(--border-subtle);
          border: 1px solid var(--border-subtle);
          border-radius: 10px; padding: 8px 12px 8px 34px;
          font-size: 13px; color: var(--text-primary); outline: none;
          box-sizing: border-box; transition: border-color 0.2s, background 0.2s;
        }
        .cmc-search input:focus { border-color: rgba(245,158,11,0.4); background: var(--border-subtle); }
        .cmc-search input::placeholder { color: var(--text-muted); }
        .cmc-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color: var(--text-muted); pointer-events:none; }
        .cmc-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; }

        /* Custom scrollbar */
        .cmc-list::-webkit-scrollbar,
        .cmc-messages::-webkit-scrollbar { width: 3px; }
        .cmc-list::-webkit-scrollbar-track,
        .cmc-messages::-webkit-scrollbar-track { background: transparent; }
        .cmc-list::-webkit-scrollbar-thumb,
        .cmc-messages::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 99px; }
        .cmc-list::-webkit-scrollbar-thumb:hover,
        .cmc-messages::-webkit-scrollbar-thumb:hover { background: var(--border-default); }

        /* Conversation item */
        .cmc-item {
          display: flex; align-items: center; gap: 10px;
          width: 100%; text-align: left; border: none; border-radius: 10px;
          padding: 10px 10px; cursor: pointer; background: transparent;
          color: var(--text-primary); margin-bottom: 2px; transition: background 0.15s;
          position: relative;
        }
        .cmc-item:hover { background: var(--bg-elevated); }
        .cmc-item.active { background: rgba(245,158,11,0.08); }
        .cmc-item.active::before {
          content: ''; position: absolute; left: 0; top: 20%; bottom: 20%;
          width: 3px; background: var(--accent); border-radius: 0 3px 3px 0;
        }
        .cmc-item-meta { flex: 1; min-width: 0; }
        .cmc-item-row1 { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:3px; }
        .cmc-item-name { font-weight: 500; font-size: 13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 140px; color: var(--text-primary); }
        .cmc-item-name.unread { font-weight: 700; }
        .cmc-item-time { font-size: 11px; color: var(--text-muted); flex-shrink:0; }
        .cmc-item-preview { font-size: 12px; color: var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cmc-item-preview.unread { color: var(--text-secondary); }
        .cmc-badge {
          background: var(--accent); color: #000; font-weight: 800;
          border-radius: 99px; min-width: 18px; height: 18px;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; padding: 0 4px; flex-shrink: 0;
          position: absolute; top: 6px; right: 6px;
          box-shadow: 0 2px 8px rgba(245,158,11,0.4);
        }

        /* Main area — min-height:0 is critical: grid items default to min-height:auto
           which lets them grow past the grid cell, preventing inner scroll */
        .cmc-main { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; background: var(--bg-base); position:relative; }

        /* Header */
        .cmc-header {
          padding: 14px 20px; border-bottom: 1px solid var(--border-subtle);
          display: flex; align-items: center; gap: 12px; flex-shrink: 0;
          background: rgba(8,15,30,0.95); backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .cmc-header-info { flex: 1; min-width: 0; }
        .cmc-header-name { font-weight: 700; font-size: 15px; color: var(--text-primary); letter-spacing: -0.2px; }
        .cmc-header-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cmc-header-pill {
          font-size: 11px; font-weight: 600; color: var(--accent);
          background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2);
          border-radius: 99px; padding: 3px 10px; flex-shrink: 0;
        }

        /* Scroll progress bar */
        .cmc-progress { height: 2px; background: transparent; flex-shrink:0; transition: none; }
        .cmc-progress-fill { height: 100%; background: linear-gradient(90deg, transparent, rgba(245,158,11,0.6), transparent); transition: none; }

        /* Messages pane — min-height:0 required for flex children to scroll */
        .cmc-messages {
          flex: 1; min-height: 0; overflow-y: auto; padding: 20px 20px 12px;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
        }

        /* Date separator */
        .cmc-datesep { display:flex; align-items:center; gap:10px; margin: 20px 0 14px; }
        .cmc-datesep-line { flex:1; height:1px; background: var(--border-subtle); }
        .cmc-datesep-label { font-size: 11px; color: var(--text-muted); font-weight: 600; background: var(--bg-elevated); padding: 3px 12px; border-radius: 99px; white-space:nowrap; letter-spacing: 0.3px; }

        /* Message bubble */
        .cmc-bubble-wrap { display:flex; flex-direction:column; margin-bottom: 2px; }
        .cmc-bubble-wrap.group-end { margin-bottom: 12px; }
        .cmc-bubble-wrap.own { align-items: flex-end; }
        .cmc-bubble-wrap.other { align-items: flex-start; }
        .cmc-sender-row { display:flex; align-items:center; gap:7px; margin-bottom:5px; padding-left: 44px; }
        .cmc-sender-name { font-size: 12px; font-weight: 600; color: var(--text-muted); }
        .cmc-inner { display:flex; align-items:flex-end; gap:7px; max-width: 72%; }
        .cmc-inner.own { flex-direction: row-reverse; max-width: 72%; }
        .cmc-avatar-slot { width: 32px; flex-shrink: 0; display:flex; align-items:flex-end; }

        .cmc-bubble {
          position: relative; padding: 9px 13px; cursor: default;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          transition: filter 0.15s;
        }
        .cmc-bubble:hover { filter: brightness(1.05); }
        .cmc-bubble:hover .cmc-actions { opacity: 1; pointer-events: all; }

        .cmc-bubble.own {
          background: var(--accent-gradient, linear-gradient(135deg, var(--accent), var(--accent-hover)));
          color: #000; border-radius: 18px 18px 5px 18px;
        }
        .cmc-bubble.pending { opacity: 0.72; }
        .cmc-bubble.failed { opacity: 0.85; outline: 1px dashed #ef4444; outline-offset: 1px; }
        .cmc-bubble.own.tail::after {
          content: ''; position:absolute; bottom:0; right:-7px;
          width:0; height:0; border-style:solid;
          border-width: 10px 0 0 9px; border-color: transparent transparent transparent var(--accent-hover);
        }
        .cmc-bubble.other {
          background: var(--bg-elevated); color: var(--text-primary);
          border: 1px solid var(--border-subtle);
          border-radius: 18px 18px 18px 5px;
        }
        .cmc-bubble.other.tail::before {
          content: ''; position:absolute; bottom:0; left:-7px;
          width:0; height:0; border-style:solid;
          border-width: 10px 9px 0 0; border-color: transparent var(--bg-elevated) transparent transparent;
        }

        /* Hover actions */
        .cmc-actions {
          opacity: 0; pointer-events: none;
          position: absolute; top: -32px;
          display: flex; gap: 4px; z-index: 6;
          background: var(--bg-elevated); border: 1px solid var(--border-default);
          border-radius: 8px; padding: 4px 5px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          transition: opacity 0.15s;
        }
        .cmc-bubble.own .cmc-actions { right: 0; }
        .cmc-bubble.other .cmc-actions { left: 0; }
        .cmc-act-btn {
          background: transparent; border: none; border-radius: 6px;
          width: 26px; height: 26px; cursor: pointer;
          display: flex; align-items:center; justify-content:center;
          color: var(--text-secondary); transition: all 0.1s;
        }
        .cmc-act-btn:hover { background: var(--border-default); color: var(--text-primary); }

        /* Bubble content */
        .cmc-reply-preview {
          border-left: 2px solid rgba(255,255,255,0.3); padding-left: 8px;
          margin-bottom: 7px; font-size: 12px; opacity: 0.65; font-style: italic;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px;
        }
        .cmc-bubble.own .cmc-reply-preview { border-left-color: rgba(0,0,0,0.3); }
        .cmc-text { white-space: pre-wrap; line-height: 1.5; font-size: 14px; padding-right: 52px; word-break: break-word; }
        .cmc-time {
          display: flex; align-items: center; justify-content: flex-end;
          gap: 3px; font-size: 10.5px; margin-top: 4px;
          opacity: 0.55; float: right; clear: both;
        }
        .cmc-bubble.own .cmc-time { color: rgba(0,0,0,0.7); }
        .cmc-bubble.other .cmc-time { color: var(--text-muted); }

        /* Attachments */
        .cmc-img { max-width: 240px; max-height: 200px; border-radius: 10px; cursor: zoom-in; object-fit: cover; display: block; margin-top: 6px; transition: transform 0.2s; }
        .cmc-img:hover { transform: scale(1.02); }
        .cmc-file-link {
          display: flex; align-items: center; gap: 8px;
          background: rgba(0,0,0,0.15); padding: 7px 11px; border-radius: 9px;
          font-size: 12.5px; font-weight: 500; text-decoration: none; margin-top: 6px;
          transition: background 0.15s;
        }
        .cmc-bubble.own .cmc-file-link { color: rgba(0,0,0,0.8); }
        .cmc-bubble.other .cmc-file-link { color: var(--text-secondary); background: var(--border-subtle); }
        .cmc-file-link:hover { background: rgba(0,0,0,0.25) !important; }

        /* Scroll FAB */
        .cmc-fab {
          position: absolute; bottom: 80px; right: 20px; z-index: 10;
          width: 40px; height: 40px; border-radius: 50%;
          background: var(--bg-elevated); border: 1px solid var(--border-default);
          cursor: pointer; display: flex; align-items:center; justify-content:center;
          color: var(--text-primary); box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          transition: all 0.2s; font-size: 12px; font-weight: 800;
        }
        .cmc-fab:hover { background: var(--accent); color: var(--accent-on, #000); border-color: var(--accent); transform: scale(1.08); }

        /* Input area */
        .cmc-input-area { padding: 12px 16px 14px; background: var(--bg-surface); border-top: 1px solid var(--border-subtle); flex-shrink: 0; overflow: hidden; }
        .cmc-reply-bar {
          display: flex; align-items: center; justify-content: space-between;
          border-left: 3px solid var(--accent); padding: 6px 10px;
          background: rgba(245,158,11,0.07); border-radius: 0 8px 8px 0;
          margin-bottom: 10px;
        }
        .cmc-reply-bar-sender { font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 2px; }
        .cmc-reply-bar-text { font-size: 12px; color: var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 400px; }
        .cmc-file-previews { display:flex; gap:8px; padding:8px; background: var(--bg-elevated); border-radius:10px; margin-bottom:10px; overflow-x:auto; }
        .cmc-file-previews::-webkit-scrollbar { height: 3px; }
        .cmc-file-previews::-webkit-scrollbar-thumb { background: var(--border-default); border-radius:99px; }
        .cmc-fp-thumb { position:relative; flex-shrink:0; }
        .cmc-fp-thumb img { width:56px; height:56px; object-fit:cover; border-radius:8px; display:block; }
        .cmc-fp-icon { width:56px; height:56px; background: var(--border-subtle); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; }
        .cmc-fp-remove { position:absolute; top:-5px; right:-5px; width:18px; height:18px; background:#ef4444; border:none; border-radius:50%; cursor:pointer; color:#fff; display:flex; align-items:center; justify-content:center; font-size:9px; line-height:1; }
        .cmc-emoji-grid { display:flex; flex-wrap:wrap; gap:4px; padding:10px; background: var(--bg-elevated); border-radius:12px; margin-bottom:10px; border: 1px solid var(--border-subtle); }
        .cmc-emoji-btn { background:none; border:none; cursor:pointer; font-size:20px; padding:3px 5px; border-radius:6px; transition:transform 0.1s; line-height:1; }
        .cmc-emoji-btn:hover { transform:scale(1.35); background: var(--border-subtle); }
        .cmc-composer {
          display: flex; align-items: flex-end; gap: 6px;
          background: var(--border-subtle); border: 1px solid var(--border-default);
          border-radius: 16px; padding: 6px 6px 6px 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .cmc-composer:focus-within { border-color: rgba(245,158,11,0.35); box-shadow: 0 0 0 3px rgba(245,158,11,0.08); }
        .cmc-icon-btn { background:none; border:none; cursor:pointer; padding:8px; border-radius:10px; display:flex; align-items:center; justify-content:center; color: var(--text-muted); transition:color 0.15s, background 0.15s; flex-shrink:0; margin-bottom:2px; }
        .cmc-icon-btn:hover { color: var(--text-secondary); background: var(--border-subtle); }
        .cmc-icon-btn.active { color: var(--accent); }
        .cmc-textarea {
          flex:1; resize:none; background:transparent; color: var(--text-primary); border:none;
          padding: 10px 0; min-height:42px; max-height:140px; outline:none;
          font-size:14px; font-family:inherit; line-height:1.55; overflow-y:auto;
        }
        .cmc-textarea::-webkit-scrollbar { width: 2px; }
        .cmc-textarea::-webkit-scrollbar-thumb { background: var(--border-default); border-radius:99px; }
        .cmc-textarea::placeholder { color: var(--text-muted); }
        .cmc-send {
          width:40px; height:40px; border-radius:12px; border:none; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0; transition: all 0.2s; margin-bottom:2px;
        }
        .cmc-send.ready { background: var(--accent); color: var(--accent-on, #000); box-shadow: 0 4px 14px var(--accent-glow); }
        .cmc-send.ready:hover { background: var(--accent-hover); transform: scale(1.05); }
        .cmc-send.idle { background: var(--border-subtle); color: var(--text-muted); cursor:not-allowed; }
        .cmc-hint { font-size:11px; color: var(--text-muted); text-align:center; margin-top:8px; }

        /* Empty state */
        .cmc-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color: var(--text-muted); gap:10px; background: radial-gradient(ellipse at center, var(--bg-surface) 0%, var(--bg-base) 70%); }
        .cmc-empty h3 { font-size:16px; font-weight:600; color: var(--text-muted); }
        .cmc-empty p { font-size:13px; color: var(--text-muted); }

        /* Context menu */
        .cmc-ctx { position:fixed; background: var(--bg-elevated); border:1px solid var(--border-default); border-radius:11px; padding:5px; z-index:1000; box-shadow:0 12px 40px rgba(0,0,0,0.6); min-width:165px; }
        .cmc-ctx-item { display:flex; align-items:center; gap:9px; padding:8px 13px; border-radius:7px; cursor:pointer; font-size:13px; color:#cbd5e1; transition:background 0.1s; }
        .cmc-ctx-item:hover { background:var(--border-subtle); color: var(--text-primary); }

        /* Lightbox */
        .cmc-lightbox { position:fixed; inset:0; background:rgba(0,0,0,0.94); z-index:2000; display:flex; align-items:center; justify-content:center; cursor:zoom-out; animation: fadeIn 0.18s ease; }
        .cmc-lightbox img { max-width:90vw; max-height:90vh; border-radius:10px; box-shadow:0 0 60px rgba(0,0,0,0.8); cursor:default; }
        .cmc-lightbox-close { position:absolute; top:20px; right:20px; background:var(--border-default); border:none; border-radius:50%; width:36px; height:36px; cursor:pointer; color:#fff; display:flex; align-items:center; justify-content:center; transition:background 0.15s; }
        .cmc-lightbox-close:hover { background:rgba(255,255,255,0.22); }

        /* Mobile back button */
        .cmc-back-btn { display:none; background:none; border:none; cursor:pointer; color: var(--text-secondary); padding:6px; border-radius:8px; margin-right:4px; }
        .cmc-back-btn:hover { background:var(--border-subtle); color: var(--text-primary); }

        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
        .msg-anim { animation: slideUp 0.15s ease forwards; }

        /* ── Responsive ── */
        @media (max-width: 767px) {
          /* mobile topbar wraps to ~100px + 20px page padding */
          .cmc-root { height: calc(100dvh - 120px); }
          .cmc-shell { grid-template-columns: 1fr; border-radius: 0; border-left:none; border-right:none; }
          .cmc-sidebar { position: absolute; inset: 0; z-index: 30; transform: translateX(0); transition: transform 0.26s cubic-bezier(.4,0,.2,1); }
          .cmc-sidebar.hidden { transform: translateX(-100%); pointer-events: none; }
          .cmc-main { grid-column: 1; }
          .cmc-back-btn { display: flex !important; }
          .cmc-messages { padding: 14px 12px 10px; }
          .cmc-inner { max-width: 85% !important; }
          .cmc-inner.own { max-width: 85% !important; }
          .cmc-input-area { padding: 10px 10px 12px; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .cmc-shell { grid-template-columns: 260px 1fr; }
          .cmc-inner, .cmc-inner.own { max-width: 78% !important; }
        }
        @media (min-width: 1280px) {
          .cmc-shell { grid-template-columns: 320px 1fr; }
        }
      ` }} />

      <div className="cmc-root">
        {/* Lightbox */}
        {lightboxImg && (
          <div className="cmc-lightbox" onClick={() => setLightboxImg(null)}>
            <img src={lightboxImg} alt="" onClick={e => e.stopPropagation()} />
            <button className="cmc-lightbox-close" onClick={() => setLightboxImg(null)}><X size={16} /></button>
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div className="cmc-ctx" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="cmc-ctx-item" onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); textareaRef.current?.focus(); }}>
              <Reply size={14} /> Reply
            </div>
            {contextMenu.msg.content && (
              <div className="cmc-ctx-item" onClick={() => { navigator.clipboard.writeText(contextMenu.msg.content); setContextMenu(null); }}>
                <Copy size={14} /> Copy text
              </div>
            )}
          </div>
        )}

        <div className="cmc-shell">
          {/* ── Sidebar ── */}
          <aside className={`cmc-sidebar${isMobile && !sidebarVisible ? ' hidden' : ''}`}>
            <div className="cmc-sidebar-head">
              <div className="cmc-sidebar-title">
                <MessageSquare size={17} color="var(--accent)" />
                <span>Messages</span>
              </div>
              <div className="cmc-search">
                <Search size={13} className="cmc-search-icon" />
                <input
                  type="text"
                  placeholder="Search conversations…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="cmc-list">
              {loading ? (
                <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
                  <div className="spinner-light" />
                </div>
              ) : filteredGroups.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <MessageSquare size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                  <div style={{ fontSize: 13 }}>{searchQuery ? 'No results found' : 'No conversations yet'}</div>
                </div>
              ) : filteredGroups.map(([groupName, groupConvos]) => {
                const isActive = selectedGroupName === groupName;
                const unread = groupConvos.reduce((s, c) => s + c.unreadCount, 0);
                const latest = [...groupConvos].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0];
                const preview = latest?.lastMessage?.content || (latest?.lastMessage?.hasAttachments ? '📎 Attachment' : 'No messages yet');
                const time = latest?.updatedAt || latest?.createdAt;
                return (
                  <button key={groupName} className={`cmc-item${isActive ? ' active' : ''}`} onClick={() => selectGroup(groupName)}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar name={groupName} size={44} ring={unread > 0} />
                      {unread > 0 && <div className="cmc-badge">{unread > 9 ? '9+' : unread}</div>}
                    </div>
                    <div className="cmc-item-meta">
                      <div className="cmc-item-row1">
                        <span className={`cmc-item-name${unread > 0 ? ' unread' : ''}`}>{groupName}</span>
                        {time && <span className="cmc-item-time">{fmtConvoTime(time)}</span>}
                      </div>
                      <div className={`cmc-item-preview${unread > 0 ? ' unread' : ''}`}>{preview}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Chat area ── */}
          <main className="cmc-main">
            {!selectedConversation ? (
              <div className="cmc-empty">
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)' }}>
                  <MessageSquare size={28} color="var(--text-muted)" />
                </div>
                <h3>No conversation selected</h3>
                <p>Choose a thread from the left to start messaging</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="cmc-header">
                  <button className="cmc-back-btn" onClick={() => setSidebarVisible(true)}>
                    <ChevronLeft size={20} />
                  </button>
                  <Avatar name={selectedConversation.title} size={40} />
                  <div className="cmc-header-info">
                    <div className="cmc-header-name">{selectedConversation.title}</div>
                    <div className="cmc-header-sub">
                      {selectedConversation.participants.map((p: any) => p.displayName).join(' · ')}
                    </div>
                  </div>
                  <div className="cmc-header-pill">
                    <Users size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    {selectedConversation.ordersCount} {selectedConversation.ordersCount === 1 ? 'order' : 'orders'}
                  </div>
                </div>

                {/* Scroll progress */}
                <div className="cmc-progress">
                  <div className="cmc-progress-fill" style={{ width: `${scrollProgress * 100}%` }} />
                </div>

                {/* Messages */}
                <div className="cmc-messages" ref={scrollContainerRef} onScroll={handleScroll}>
                  {messageRows.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '70px 20px', color: 'var(--text-muted)' }}>
                      <Clock size={24} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
                      <div style={{ fontSize: 13 }}>Be the first to say something</div>
                    </div>
                  )}

                  {messageRows.map(row => {
                    if (row.type === 'sep') {
                      return (
                        <div key={row.key} className="cmc-datesep">
                          <div className="cmc-datesep-line" />
                          <span className="cmc-datesep-label">{row.label}</span>
                          <div className="cmc-datesep-line" />
                        </div>
                      );
                    }

                    const { msg, first, last } = row;
                    const own = msg.isOwn;

                    return (
                      <div key={row.key} className={`cmc-bubble-wrap msg-anim ${own ? 'own' : 'other'}${last ? ' group-end' : ''}`}>
                        {first && !own && (
                          <div className="cmc-sender-row" style={{ paddingLeft: 0 }}>
                            <Avatar name={msg.sender.displayName} size={28} />
                            <span className="cmc-sender-name">{msg.sender.displayName}</span>
                          </div>
                        )}
                        <div className={`cmc-inner${own ? ' own' : ''}`}>
                          {!own && (
                            <div className="cmc-avatar-slot">
                              {last && <Avatar name={msg.sender.displayName} size={30} />}
                            </div>
                          )}
                          <div
                            className={`cmc-bubble ${own ? 'own' : 'other'}${last ? ' tail' : ''}${msg.pending ? ' pending' : ''}${msg.failed ? ' failed' : ''}`}
                            onContextMenu={e => handleContextMenu(e, msg)}
                          >
                            {/* Hover actions */}
                            <div className="cmc-actions">
                              <button className="cmc-act-btn" title="Reply" onClick={() => { setReplyingTo(msg); textareaRef.current?.focus(); }}>
                                <Reply size={12} />
                              </button>
                              {msg.content && (
                                <button className="cmc-act-btn" title="Copy" onClick={() => navigator.clipboard.writeText(msg.content)}>
                                  <Copy size={12} />
                                </button>
                              )}
                            </div>

                            {/* Reply quote */}
                            {msg.content?.startsWith('↩ Replying to "') && (
                              <div className="cmc-reply-preview">
                                {msg.content.split('\n\n')[0]}
                              </div>
                            )}

                            {/* Text */}
                            {msg.content && (
                              <div className="cmc-text">
                                {msg.content.startsWith('↩ Replying to "')
                                  ? msg.content.split('\n\n').slice(1).join('\n\n')
                                  : msg.content}
                              </div>
                            )}

                            {/* Attachments */}
                            {msg.attachments?.length > 0 && msg.attachments.map((att: any) => {
                              const url = attachmentUrl(att.url);
                              return isImg(att.originalName)
                                ? <img key={att.id} src={url} alt={att.originalName} className="cmc-img" onClick={() => setLightboxImg(url)} />
                                : <a key={att.id} href={url} target="_blank" rel="noreferrer" className="cmc-file-link"><File size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.originalName}</span></a>;
                            })}

                            {/* Meta */}
                            <div className="cmc-time">
                              <span>{fmtTime(msg.createdAt)}</span>
                              {own && (
                                msg.pending ? <Clock size={12} />
                                : msg.readBy?.length > 0 ? <CheckCheck size={12} />
                                : <Check size={12} />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} style={{ height: 4 }} />
                </div>

                {/* Scroll FAB */}
                {showScrollBtn && (
                  <button className="cmc-fab" onClick={scrollToBottom}>
                    {newMsgCount > 0 ? newMsgCount : <ArrowDown size={17} />}
                  </button>
                )}

                {/* Input */}
                <div className="cmc-input-area">
                  {replyingTo && (
                    <div className="cmc-reply-bar">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="cmc-reply-bar-sender">↩ {replyingTo.sender?.displayName}</div>
                        <div className="cmc-reply-bar-text">{replyingTo.content?.slice(0, 90)}</div>
                      </div>
                      <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}><X size={14} /></button>
                    </div>
                  )}

                  {filePreviews.length > 0 && (
                    <div className="cmc-file-previews">
                      {filePreviews.map((fp, i) => (
                        <div key={i} className="cmc-fp-thumb">
                          {fp.url
                            ? <img src={fp.url} alt={fp.file.name} />
                            : <div className="cmc-fp-icon"><File size={16} color="var(--text-muted)" /><span style={{ fontSize: 9, color: 'var(--text-muted)', maxWidth: 48, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fp.file.name.slice(-8)}</span></div>
                          }
                          <button className="cmc-fp-remove" onClick={() => removeFile(i)}><X size={9} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showEmojiPicker && (
                    <div className="cmc-emoji-grid">
                      {EMOJIS.map(e => (
                        <button key={e} className="cmc-emoji-btn" onClick={() => { setMessage(m => m + e); setShowEmojiPicker(false); textareaRef.current?.focus(); }}>{e}</button>
                      ))}
                    </div>
                  )}

                  <div className="cmc-composer">
                    <button className={`cmc-icon-btn${showEmojiPicker ? ' active' : ''}`} onClick={() => setShowEmojiPicker(v => !v)}>
                      <SmilePlus size={19} />
                    </button>
                    <label className="cmc-icon-btn" style={{ cursor: 'pointer' }}>
                      <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))} style={{ display: 'none' }} />
                      <Paperclip size={19} />
                    </label>
                    <textarea
                      ref={textareaRef}
                      className="cmc-textarea"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={Math.min(Math.max(message.split('\n').length, 1), 6)}
                      placeholder="Write a message…"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                    <button
                      className={`cmc-send ${!message.trim() && files.length === 0 ? 'idle' : 'ready'}`}
                      onClick={handleSend}
                      disabled={sending || (!message.trim() && files.length === 0)}
                    >
                      <Send size={17} style={{ marginLeft: 2 }} />
                    </button>
                  </div>
                  <div className="cmc-hint">Enter to send · Shift + Enter for new line</div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
