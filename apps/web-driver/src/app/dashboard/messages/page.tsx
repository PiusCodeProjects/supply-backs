'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { getAccessToken, getUser } from '@/lib/auth';
import { messagesApi } from '@/lib/api';
import { useSocket } from '@/contexts/SocketContext';
import { useMessaging } from '@/contexts/MessagingContext';
import Link from 'next/link';
import {
  Search, Send, Paperclip, Check, CheckCheck, Clock, File,
  MessageSquare, SmilePlus, Reply, Copy, X, ArrowDown, ChevronLeft,
  Home, BarChart3, Package, User,
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
      letterSpacing: '-0.5px',
      boxShadow: ring ? `0 0 0 2px #0b1528, 0 0 0 4px ${color}55` : undefined,
    }}>
      {getInitials(name)}
    </div>
  );
}

export default function DriverMessagesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Hydration-safe: getUser reads localStorage, so we hold it in state and
  // populate inside an effect.
  const [currentUser, setCurrentUser] = useState<any>(null);
  useEffect(() => { setCurrentUser(getUser()); }, []);
  // Shared messaging socket (same connection used by MessagingContext).
  const socket = useSocket('messaging');
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

  // MessagingContext owns the conversations fetch + polling + WS-driven list
  // updates + joining every conversation's room. We auto-select the most
  // recent thread the first time the list arrives.
  useEffect(() => {
    if (selectedId || conversations.length === 0) return;
    setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  // Open the selected thread when it changes. Room joins are handled by the
  // provider, so we don't need to emit joinConversation here.
  useEffect(() => {
    if (selectedId) openConversation(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Listen for new messages / read receipts in the currently-open thread.
  useEffect(() => {
    const onMessageCreated = (payload: any) => {
      if (payload.conversationId !== selectedId) return;
      setSelectedConversation((prev: any) => {
        if (!prev) return prev;
        if (prev.messages.some((m: any) => m.id === payload.id)) return prev;
        // Server echo of an optimistic message we already rendered — swap in place.
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
        return { ...prev, messages: [...prev.messages, payload] };
      });
    };
    const onConversationRead = (payload: any) => {
      if (payload.conversationId !== selectedId) return;
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
  }, [socket, selectedId]);

  useEffect(() => {
    const msgs = selectedConversation?.messages || [];
    if (msgs.length > prevMsgCountRef.current && isAtBottomRef.current) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      setNewMsgCount(0);
    }
    prevMsgCountRef.current = msgs.length;
  }, [selectedConversation?.messages]);

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
    setScrollProgress(el.scrollTop / Math.max(el.scrollHeight - el.clientHeight, 1));
  }

  async function loadConversations() {
    await refreshConversations();
  }

  async function openConversation(id: string) {
    const token = getAccessToken();
    if (!token) return;
    const data = await messagesApi.getConversation(token, id);
    setSelectedConversation(data);
    await messagesApi.markConversationRead(token, id);
    markConversationReadLocal(id);
    setTimeout(() => messagesEndRef.current?.scrollIntoView(), 120);
  }

  async function handleSend() {
    const token = getAccessToken();
    if (!token || !selectedId || (!message.trim() && files.length === 0)) return;
    setSending(true);
    try {
      const content = replyingTo
        ? `↩ Replying to "${replyingTo.content?.slice(0, 60)}${(replyingTo.content?.length || 0) > 60 ? '…' : ''}"\n\n${message}`
        : message;
      await messagesApi.sendMessage(token, selectedId, { content, files });
      setMessage(''); setFiles([]); setReplyingTo(null); setShowEmojiPicker(false);
      await Promise.all([openConversation(selectedId), loadConversations()]);
    } finally {
      setSending(false);
    }
  }

  function removeFile(i: number) { setFiles(prev => prev.filter((_, idx) => idx !== i)); }
  function attachmentUrl(url: string) { return `${UPLOAD_BASE}${url}`; }

  function conversationTitle(c: any) {
    return c.participants.filter((p: any) => p.id !== currentUser?.id).map((p: any) => p.displayName).join(', ') || c.title;
  }

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

  const filteredConvos = useMemo(() => {
    const sorted = [...conversations].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter(c => conversationTitle(c).toLowerCase().includes(q) || c.project?.name?.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

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

  const selectConvo = (id: string) => {
    setSelectedId(id);
    if (isMobile) setSidebarVisible(false);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        /* Layout */
        .dmc-root { display:flex; flex-direction:column; padding-bottom: 72px; }
        .dmc-header-page { margin-bottom: 18px; }
        .dmc-header-page h1 { font-size: 22px; font-weight: 800; color: #f1f5f9; letter-spacing: -0.4px; margin-bottom: 4px; }
        .dmc-header-page p { font-size: 13px; color: #475569; }
        .dmc-shell {
          display: grid; grid-template-columns: 280px 1fr;
          /* 64px topbar + 32px page-padding-top + ~56px page-header + ~20px margin + 64px bottom-nav = 236px */
          height: calc(100vh - 236px); min-height: 480px;
          background: #0b1528; border-radius: 14px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.07);
          box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
        }

        /* Sidebar */
        .dmc-sidebar {
          display: flex; flex-direction: column;
          background: #080f1e; border-right: 1px solid rgba(255,255,255,0.06);
          min-height: 0; overflow: hidden;
        }
        .dmc-sidebar-head { padding: 16px 14px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.01); flex-shrink: 0; }
        .dmc-sidebar-title { display:flex; align-items:center; gap:7px; margin-bottom:12px; }
        .dmc-sidebar-title span { font-weight:700; font-size:14px; color:#f1f5f9; }
        .dmc-search { position:relative; }
        .dmc-search input {
          width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.07);
          border-radius:9px; padding:7px 10px 7px 30px; font-size:12.5px; color:#e2e8f0;
          outline:none; box-sizing:border-box; transition:border-color 0.2s, background 0.2s;
        }
        .dmc-search input:focus { border-color:rgba(245,158,11,0.4); background:rgba(255,255,255,0.07); }
        .dmc-search input::placeholder { color:#334155; }
        .dmc-search-icon { position:absolute; left:9px; top:50%; transform:translateY(-50%); color:#334155; pointer-events:none; }
        .dmc-list { flex:1; min-height:0; overflow-y:auto; padding:6px; }
        .dmc-list::-webkit-scrollbar,
        .dmc-messages::-webkit-scrollbar { width:3px; }
        .dmc-list::-webkit-scrollbar-track,
        .dmc-messages::-webkit-scrollbar-track { background:transparent; }
        .dmc-list::-webkit-scrollbar-thumb,
        .dmc-messages::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.07); border-radius:99px; }
        .dmc-list::-webkit-scrollbar-thumb:hover,
        .dmc-messages::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.14); }

        /* Conversation item */
        .dmc-item {
          display:flex; align-items:center; gap:9px; width:100%; text-align:left;
          border:none; border-radius:9px; padding:9px 10px; cursor:pointer;
          background:transparent; color:#e2e8f0; margin-bottom:2px;
          transition:background 0.15s; position:relative;
        }
        .dmc-item:hover { background:rgba(255,255,255,0.04); }
        .dmc-item.active { background:rgba(245,158,11,0.08); }
        .dmc-item.active::before { content:''; position:absolute; left:0; top:20%; bottom:20%; width:3px; background:#f59e0b; border-radius:0 3px 3px 0; }
        .dmc-item-meta { flex:1; min-width:0; }
        .dmc-item-r1 { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:2px; }
        .dmc-item-name { font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px; color:#f1f5f9; }
        .dmc-item-name.unread { font-weight:700; }
        .dmc-item-time { font-size:10.5px; color:#334155; flex-shrink:0; }
        .dmc-item-order { font-size:11px; color:#334155; margin-bottom:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dmc-item-preview { font-size:11.5px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dmc-item-preview.unread { color:#94a3b8; }
        .dmc-badge { background:#f59e0b; color:#000; font-weight:800; border-radius:99px; min-width:17px; height:17px; display:flex; align-items:center; justify-content:center; font-size:9.5px; padding:0 3px; flex-shrink:0; position:absolute; top:5px; right:5px; box-shadow:0 2px 8px rgba(245,158,11,0.4); }

        /* Main — min-height:0 prevents grid item from growing past its cell */
        .dmc-main { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; background:#0b1528; position:relative; }

        /* Header */
        .dmc-header {
          padding: 13px 18px; border-bottom: 1px solid rgba(255,255,255,0.06);
          display:flex; align-items:center; gap:10px; flex-shrink:0;
          background: rgba(8,15,30,0.95); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
        }
        .dmc-header-info { flex:1; min-width:0; }
        .dmc-header-name { font-weight:700; font-size:14.5px; color:#f1f5f9; letter-spacing:-0.2px; }
        .dmc-header-sub { font-size:11px; color:#475569; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        /* Scroll progress */
        .dmc-progress { height:2px; background:transparent; flex-shrink:0; }
        .dmc-progress-fill { height:100%; background:linear-gradient(90deg, transparent, rgba(245,158,11,0.55), transparent); transition:none; }

        /* Messages — min-height:0 required so flex child can scroll */
        .dmc-messages {
          flex:1; min-height:0; overflow-y:auto; padding:16px 16px 10px;
          scroll-behavior:smooth; -webkit-overflow-scrolling:touch; overscroll-behavior:contain;
        }

        /* Date separator */
        .dmc-datesep { display:flex; align-items:center; gap:8px; margin:18px 0 12px; }
        .dmc-datesep-line { flex:1; height:1px; background:rgba(255,255,255,0.05); }
        .dmc-datesep-label { font-size:11px; color:#334155; font-weight:600; background:rgba(255,255,255,0.04); padding:3px 11px; border-radius:99px; white-space:nowrap; letter-spacing:0.3px; }

        /* Bubble */
        .dmc-bwrap { display:flex; flex-direction:column; margin-bottom:2px; }
        .dmc-bwrap.group-end { margin-bottom:10px; }
        .dmc-bwrap.own { align-items:flex-end; }
        .dmc-bwrap.other { align-items:flex-start; }
        .dmc-sender-row { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
        .dmc-sender-name { font-size:11.5px; font-weight:600; color:#475569; }
        .dmc-inner { display:flex; align-items:flex-end; gap:6px; max-width:72%; }
        .dmc-inner.own { flex-direction:row-reverse; max-width:72%; }
        .dmc-avatar-slot { width:30px; flex-shrink:0; display:flex; align-items:flex-end; }

        .dmc-bubble {
          position:relative; padding:8px 12px; cursor:default;
          box-shadow:0 2px 8px rgba(0,0,0,0.3); transition:filter 0.15s;
        }
        .dmc-bubble:hover { filter:brightness(1.06); }
        .dmc-bubble:hover .dmc-actions { opacity:1; pointer-events:all; }
        .dmc-bubble.own { background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%); color:#000; border-radius:18px 18px 5px 18px; }
        .dmc-bubble.own.tail::after { content:''; position:absolute; bottom:0; right:-7px; width:0; height:0; border-style:solid; border-width:10px 0 0 9px; border-color:transparent transparent transparent #d97706; }
        .dmc-bubble.other { background:#0f1e36; color:#e2e8f0; border:1px solid rgba(255,255,255,0.06); border-radius:18px 18px 18px 5px; }
        .dmc-bubble.other.tail::before { content:''; position:absolute; bottom:0; left:-7px; width:0; height:0; border-style:solid; border-width:10px 9px 0 0; border-color:transparent #0f1e36 transparent transparent; }

        .dmc-actions { opacity:0; pointer-events:none; position:absolute; top:-32px; display:flex; gap:3px; z-index:6; background:#0d1a30; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:4px 5px; box-shadow:0 4px 16px rgba(0,0,0,0.4); transition:opacity 0.15s; }
        .dmc-bubble.own .dmc-actions { right:0; }
        .dmc-bubble.other .dmc-actions { left:0; }
        .dmc-act-btn { background:transparent; border:none; border-radius:6px; width:26px; height:26px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#64748b; transition:all 0.1s; }
        .dmc-act-btn:hover { background:rgba(255,255,255,0.1); color:#f1f5f9; }

        .dmc-reply-prev { border-left:2px solid rgba(255,255,255,0.25); padding-left:7px; margin-bottom:6px; font-size:11.5px; opacity:0.65; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:250px; }
        .dmc-bubble.own .dmc-reply-prev { border-left-color:rgba(0,0,0,0.3); }
        .dmc-text { white-space:pre-wrap; line-height:1.5; font-size:13.5px; padding-right:50px; word-break:break-word; }
        .dmc-time { display:flex; align-items:center; justify-content:flex-end; gap:3px; font-size:10px; margin-top:4px; opacity:0.55; float:right; clear:both; }
        .dmc-bubble.own .dmc-time { color:rgba(0,0,0,0.65); }
        .dmc-bubble.other .dmc-time { color:#475569; }

        .dmc-img { max-width:220px; max-height:180px; border-radius:9px; cursor:zoom-in; object-fit:cover; display:block; margin-top:6px; transition:transform 0.2s; }
        .dmc-img:hover { transform:scale(1.02); }
        .dmc-file-link { display:flex; align-items:center; gap:7px; background:rgba(0,0,0,0.15); padding:6px 10px; border-radius:8px; font-size:12px; font-weight:500; text-decoration:none; margin-top:6px; transition:background 0.15s; }
        .dmc-bubble.own .dmc-file-link { color:rgba(0,0,0,0.75); }
        .dmc-bubble.other .dmc-file-link { color:#94a3b8; background:rgba(255,255,255,0.06); }
        .dmc-file-link:hover { background:rgba(0,0,0,0.25) !important; }

        /* Scroll FAB */
        .dmc-fab { position:absolute; bottom:80px; right:18px; z-index:10; width:38px; height:38px; border-radius:50%; background:#0d1a30; border:1px solid rgba(255,255,255,0.12); cursor:pointer; display:flex; align-items:center; justify-content:center; color:#e2e8f0; box-shadow:0 4px 20px rgba(0,0,0,0.5); transition:all 0.2s; font-size:12px; font-weight:800; }
        .dmc-fab:hover { background:#f59e0b; color:#000; border-color:#f59e0b; transform:scale(1.08); }

        /* Input */
        .dmc-input-area { padding:10px 14px 12px; background:#080f1e; border-top:1px solid rgba(255,255,255,0.06); flex-shrink:0; overflow:hidden; }
        .dmc-reply-bar { display:flex; align-items:center; justify-content:space-between; border-left:3px solid #f59e0b; padding:5px 9px; background:rgba(245,158,11,0.07); border-radius:0 8px 8px 0; margin-bottom:9px; }
        .dmc-reply-bar-sender { font-size:11px; font-weight:700; color:#f59e0b; margin-bottom:2px; }
        .dmc-reply-bar-text { font-size:11.5px; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:360px; }
        .dmc-file-prevs { display:flex; gap:7px; padding:7px; background:rgba(255,255,255,0.03); border-radius:9px; margin-bottom:9px; overflow-x:auto; }
        .dmc-file-prevs::-webkit-scrollbar { height:3px; }
        .dmc-file-prevs::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:99px; }
        .dmc-fp-thumb { position:relative; flex-shrink:0; }
        .dmc-fp-thumb img { width:50px; height:50px; object-fit:cover; border-radius:7px; display:block; }
        .dmc-fp-icon { width:50px; height:50px; background:rgba(255,255,255,0.05); border-radius:7px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
        .dmc-fp-rm { position:absolute; top:-4px; right:-4px; width:16px; height:16px; background:#ef4444; border:none; border-radius:50%; cursor:pointer; color:#fff; display:flex; align-items:center; justify-content:center; }
        .dmc-emoji-grid { display:flex; flex-wrap:wrap; gap:3px; padding:9px; background:rgba(255,255,255,0.04); border-radius:11px; margin-bottom:9px; border:1px solid rgba(255,255,255,0.06); }
        .dmc-emoji-btn { background:none; border:none; cursor:pointer; font-size:19px; padding:3px 4px; border-radius:5px; transition:transform 0.1s; line-height:1; }
        .dmc-emoji-btn:hover { transform:scale(1.35); background:rgba(255,255,255,0.06); }
        .dmc-composer { display:flex; align-items:flex-end; gap:5px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:5px 5px 5px 11px; transition:border-color 0.2s, box-shadow 0.2s; }
        .dmc-composer:focus-within { border-color:rgba(245,158,11,0.35); box-shadow:0 0 0 3px rgba(245,158,11,0.07); }
        .dmc-icon-btn { background:none; border:none; cursor:pointer; padding:7px; border-radius:9px; display:flex; align-items:center; justify-content:center; color:#334155; transition:color 0.15s, background 0.15s; flex-shrink:0; margin-bottom:1px; }
        .dmc-icon-btn:hover { color:#64748b; background:rgba(255,255,255,0.06); }
        .dmc-icon-btn.active { color:#f59e0b; }
        .dmc-textarea { flex:1; resize:none; background:transparent; color:#f1f5f9; border:none; padding:9px 0; min-height:40px; max-height:130px; outline:none; font-size:13.5px; font-family:inherit; line-height:1.55; overflow-y:auto; }
        .dmc-textarea::-webkit-scrollbar { width:2px; }
        .dmc-textarea::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:99px; }
        .dmc-textarea::placeholder { color:#1e293b; }
        .dmc-send { width:38px; height:38px; border-radius:11px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.2s; margin-bottom:1px; }
        .dmc-send.ready { background:#f59e0b; color:#000; box-shadow:0 4px 14px rgba(245,158,11,0.4); }
        .dmc-send.ready:hover { background:#fbbf24; transform:scale(1.05); }
        .dmc-send.idle { background:rgba(255,255,255,0.04); color:#1e293b; cursor:not-allowed; }
        .dmc-hint { font-size:11px; color:#1e293b; text-align:center; margin-top:7px; }

        /* Empty */
        .dmc-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#334155; gap:9px; }
        .dmc-empty h3 { font-size:15px; font-weight:600; color:#475569; }
        .dmc-empty p { font-size:12.5px; color:#334155; }

        /* Context menu */
        .dmc-ctx { position:fixed; background:#0d1a30; border:1px solid rgba(255,255,255,0.1); border-radius:11px; padding:5px; z-index:1000; box-shadow:0 12px 40px rgba(0,0,0,0.6); min-width:160px; }
        .dmc-ctx-item { display:flex; align-items:center; gap:9px; padding:8px 12px; border-radius:7px; cursor:pointer; font-size:12.5px; color:#cbd5e1; transition:background 0.1s; }
        .dmc-ctx-item:hover { background:rgba(255,255,255,0.07); color:#f1f5f9; }

        /* Lightbox */
        .dmc-lightbox { position:fixed; inset:0; background:rgba(0,0,0,0.94); z-index:2000; display:flex; align-items:center; justify-content:center; cursor:zoom-out; animation:dmcFade 0.18s ease; }
        .dmc-lightbox img { max-width:90vw; max-height:90vh; border-radius:10px; box-shadow:0 0 60px rgba(0,0,0,0.8); cursor:default; }
        .dmc-lightbox-close { position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.12); border:none; border-radius:50%; width:36px; height:36px; cursor:pointer; color:#fff; display:flex; align-items:center; justify-content:center; transition:background 0.15s; }
        .dmc-lightbox-close:hover { background:rgba(255,255,255,0.22); }

        .dmc-back-btn { display:none; background:none; border:none; cursor:pointer; color:#64748b; padding:6px; border-radius:8px; margin-right:2px; }
        .dmc-back-btn:hover { background:rgba(255,255,255,0.07); color:#f1f5f9; }

        @keyframes dmcFade { from { opacity:0 } to { opacity:1 } }
        @keyframes dmcUp { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:none } }
        .dmsg-anim { animation:dmcUp 0.14s ease forwards; }

        /* Responsive */
        /* Driver bottom nav — matches floating light nav used elsewhere */
        .drv-bottom-nav {
          position: fixed; bottom: 20px; left: 20px; right: 20px; z-index: 100;
          height: 72px;
          display: flex; align-items: center; justify-content: space-around;
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid rgba(0, 0, 0, 0.06);
          border-radius: 24px;
          padding: 0 8px;
          backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
          box-shadow:
            0 20px 50px rgba(11, 15, 23, 0.14),
            0 -2px 8px rgba(11, 15, 23, 0.04),
            inset 0 1px 1px rgba(255, 255, 255, 0.8);
        }
        .drv-nav-item {
          flex: 1; height: 100%;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
          color: #9ca3af; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
          border-radius: 18px; transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
          text-decoration: none; background: none; border: none; cursor: pointer; position: relative;
        }
        .drv-nav-item:hover { color: #0b0f17; }
        .drv-nav-item.active {
          color: #0b0f17;
          background: rgba(11, 15, 23, 0.04);
        }
        .drv-nav-item.active::before {
          content: '';
          position: absolute; top: 10px;
          width: 4px; height: 4px;
          background: #f59e0b; border-radius: 50%;
          box-shadow: 0 0 8px #f59e0b;
        }

        @media (max-width: 767px) {
          /* mobile: hide page header, shell fills viewport minus topbar + padding */
          .dmc-header-page { display:none; }
          .dmc-shell { grid-template-columns:1fr; height:calc(100dvh - 148px - 64px); border-radius:0; border-left:none; border-right:none; position:relative; }
          .dmc-sidebar { position:absolute; inset:0; z-index:30; transform:translateX(0); transition:transform 0.26s cubic-bezier(.4,0,.2,1); }
          .dmc-sidebar.hidden { transform:translateX(-100%); pointer-events:none; }
          .dmc-main { grid-column:1; }
          .dmc-back-btn { display:flex !important; }
          .dmc-messages { padding:12px 10px 8px; }
          .dmc-inner, .dmc-inner.own { max-width:86% !important; }
          .dmc-input-area { padding:8px 10px 10px; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .dmc-shell { grid-template-columns:250px 1fr; }
          .dmc-inner, .dmc-inner.own { max-width:78% !important; }
        }
        @media (min-width: 1280px) {
          .dmc-shell { grid-template-columns:300px 1fr; }
        }
      ` }} />

      <div className="dmc-root">
        {/* Lightbox */}
        {lightboxImg && (
          <div className="dmc-lightbox" onClick={() => setLightboxImg(null)}>
            <img src={lightboxImg} alt="" onClick={e => e.stopPropagation()} />
            <button className="dmc-lightbox-close" onClick={() => setLightboxImg(null)}><X size={16} /></button>
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div className="dmc-ctx" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="dmc-ctx-item" onClick={() => { setReplyingTo(contextMenu.msg); setContextMenu(null); textareaRef.current?.focus(); }}>
              <Reply size={14} /> Reply
            </div>
            {contextMenu.msg.content && (
              <div className="dmc-ctx-item" onClick={() => { navigator.clipboard.writeText(contextMenu.msg.content); setContextMenu(null); }}>
                <Copy size={14} /> Copy text
              </div>
            )}
          </div>
        )}

        <div className="dmc-header-page">
          <h1>Delivery Messaging</h1>
          <p>Coordinate with suppliers and contractors on each delivery.</p>
        </div>

        <div className="dmc-shell">
          {/* Sidebar */}
          <aside className={`dmc-sidebar${isMobile && !sidebarVisible ? ' hidden' : ''}`}>
            <div className="dmc-sidebar-head">
              <div className="dmc-sidebar-title">
                <MessageSquare size={15} color="#f59e0b" />
                <span>Conversations</span>
              </div>
              <div className="dmc-search">
                <Search size={12} className="dmc-search-icon" />
                <input type="text" placeholder="Search…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
            </div>

            <div className="dmc-list">
              {loading ? (
                <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                </div>
              ) : filteredConvos.length === 0 ? (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: '#334155' }}>
                  <MessageSquare size={24} style={{ margin: '0 auto 9px', opacity: 0.3 }} />
                  <div style={{ fontSize: 12.5 }}>{searchQuery ? 'No results found' : 'No delivery threads yet'}</div>
                </div>
              ) : filteredConvos.map(c => {
                const isActive = selectedId === c.id;
                const title = conversationTitle(c);
                const preview = c.lastMessage?.content || (c.lastMessage?.hasAttachments ? '📎 Attachment' : 'No messages yet');
                const time = c.updatedAt || c.createdAt;
                return (
                  <button key={c.id} className={`dmc-item${isActive ? ' active' : ''}`} onClick={() => selectConvo(c.id)}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar name={title} size={42} ring={c.unreadCount > 0} />
                      {c.unreadCount > 0 && <div className="dmc-badge">{c.unreadCount > 9 ? '9+' : c.unreadCount}</div>}
                    </div>
                    <div className="dmc-item-meta">
                      <div className="dmc-item-r1">
                        <span className={`dmc-item-name${c.unreadCount > 0 ? ' unread' : ''}`}>{title}</span>
                        {time && <span className="dmc-item-time">{fmtConvoTime(time)}</span>}
                      </div>
                      <div className="dmc-item-order">#{c.orderId?.slice(-8).toUpperCase()} · {c.project?.name}</div>
                      <div className={`dmc-item-preview${c.unreadCount > 0 ? ' unread' : ''}`}>{preview}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Main */}
          <main className="dmc-main">
            {!selectedConversation ? (
              <div className="dmc-empty">
                <div style={{ width: 58, height: 58, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <MessageSquare size={24} color="#334155" />
                </div>
                <h3>No conversation selected</h3>
                <p>Pick a delivery thread to start messaging</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="dmc-header">
                  <button className="dmc-back-btn" onClick={() => setSidebarVisible(true)}>
                    <ChevronLeft size={20} />
                  </button>
                  <Avatar name={conversationTitle(selectedConversation)} size={38} />
                  <div className="dmc-header-info">
                    <div className="dmc-header-name">{conversationTitle(selectedConversation) || selectedConversation.title}</div>
                    <div className="dmc-header-sub">
                      Order #{selectedConversation.orderId?.slice(-8).toUpperCase()} · {selectedConversation.project?.name} · {selectedConversation.project?.location}
                    </div>
                  </div>
                </div>

                {/* Scroll progress */}
                <div className="dmc-progress">
                  <div className="dmc-progress-fill" style={{ width: `${scrollProgress * 100}%` }} />
                </div>

                {/* Messages */}
                <div className="dmc-messages" ref={scrollContainerRef} onScroll={handleScroll}>
                  {messageRows.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '65px 20px', color: '#334155' }}>
                      <Clock size={22} style={{ margin: '0 auto 9px', opacity: 0.3 }} />
                      <div style={{ fontSize: 12.5 }}>No messages yet in this delivery thread</div>
                    </div>
                  )}

                  {messageRows.map(row => {
                    if (row.type === 'sep') {
                      return (
                        <div key={row.key} className="dmc-datesep">
                          <div className="dmc-datesep-line" />
                          <span className="dmc-datesep-label">{row.label}</span>
                          <div className="dmc-datesep-line" />
                        </div>
                      );
                    }

                    const { msg, first, last } = row;
                    const own = msg.isOwn;

                    return (
                      <div key={row.key} className={`dmc-bwrap dmsg-anim ${own ? 'own' : 'other'}${last ? ' group-end' : ''}`}>
                        {first && !own && (
                          <div className="dmc-sender-row">
                            <Avatar name={msg.sender.displayName} size={26} />
                            <span className="dmc-sender-name">{msg.sender.displayName}</span>
                          </div>
                        )}
                        <div className={`dmc-inner${own ? ' own' : ''}`}>
                          {!own && (
                            <div className="dmc-avatar-slot">
                              {last && <Avatar name={msg.sender.displayName} size={28} />}
                            </div>
                          )}
                          <div
                            className={`dmc-bubble ${own ? 'own' : 'other'}${last ? ' tail' : ''}`}
                            onContextMenu={e => handleContextMenu(e, msg)}
                          >
                            <div className="dmc-actions">
                              <button className="dmc-act-btn" onClick={() => { setReplyingTo(msg); textareaRef.current?.focus(); }}><Reply size={12} /></button>
                              {msg.content && <button className="dmc-act-btn" onClick={() => navigator.clipboard.writeText(msg.content)}><Copy size={12} /></button>}
                            </div>

                            {msg.content?.startsWith('↩ Replying to "') && (
                              <div className="dmc-reply-prev">{msg.content.split('\n\n')[0]}</div>
                            )}

                            {msg.content && (
                              <div className="dmc-text">
                                {msg.content.startsWith('↩ Replying to "')
                                  ? msg.content.split('\n\n').slice(1).join('\n\n')
                                  : msg.content}
                              </div>
                            )}

                            {msg.attachments?.length > 0 && msg.attachments.map((att: any) => {
                              const url = attachmentUrl(att.url);
                              return isImg(att.originalName)
                                ? <img key={att.id} src={url} alt={att.originalName} className="dmc-img" onClick={() => setLightboxImg(url)} />
                                : <a key={att.id} href={url} target="_blank" rel="noreferrer" className="dmc-file-link"><File size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.originalName}</span></a>;
                            })}

                            <div className="dmc-time">
                              <span>{fmtTime(msg.createdAt)}</span>
                              {own && (msg.readBy?.length > 0 ? <CheckCheck size={12} /> : <Check size={12} />)}
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
                  <button className="dmc-fab" onClick={() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); setNewMsgCount(0); }}>
                    {newMsgCount > 0 ? newMsgCount : <ArrowDown size={16} />}
                  </button>
                )}

                {/* Input */}
                <div className="dmc-input-area">
                  {replyingTo && (
                    <div className="dmc-reply-bar">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="dmc-reply-bar-sender">↩ {replyingTo.sender?.displayName}</div>
                        <div className="dmc-reply-bar-text">{replyingTo.content?.slice(0, 90)}</div>
                      </div>
                      <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: 4, flexShrink: 0 }}><X size={13} /></button>
                    </div>
                  )}

                  {filePreviews.length > 0 && (
                    <div className="dmc-file-prevs">
                      {filePreviews.map((fp, i) => (
                        <div key={i} className="dmc-fp-thumb">
                          {fp.url
                            ? <img src={fp.url} alt={fp.file.name} />
                            : <div className="dmc-fp-icon"><File size={15} color="#334155" /><span style={{ fontSize: 9, color: '#334155', maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fp.file.name.slice(-7)}</span></div>
                          }
                          <button className="dmc-fp-rm" onClick={() => removeFile(i)}><X size={9} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  {showEmojiPicker && (
                    <div className="dmc-emoji-grid">
                      {EMOJIS.map(e => (
                        <button key={e} className="dmc-emoji-btn" onClick={() => { setMessage(m => m + e); setShowEmojiPicker(false); textareaRef.current?.focus(); }}>{e}</button>
                      ))}
                    </div>
                  )}

                  <div className="dmc-composer">
                    <button className={`dmc-icon-btn${showEmojiPicker ? ' active' : ''}`} onClick={() => setShowEmojiPicker(v => !v)}>
                      <SmilePlus size={18} />
                    </button>
                    <label className="dmc-icon-btn" style={{ cursor: 'pointer' }}>
                      <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))} style={{ display: 'none' }} />
                      <Paperclip size={18} />
                    </label>
                    <textarea
                      ref={textareaRef}
                      className="dmc-textarea"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={Math.min(Math.max(message.split('\n').length, 1), 6)}
                      placeholder="Write a delivery update…"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    />
                    <button
                      className={`dmc-send ${!message.trim() && files.length === 0 ? 'idle' : 'ready'}`}
                      onClick={handleSend}
                      disabled={sending || (!message.trim() && files.length === 0)}
                    >
                      <Send size={16} style={{ marginLeft: 2 }} />
                    </button>
                  </div>
                  <div className="dmc-hint">Enter to send · Shift + Enter for new line</div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {/* Bottom nav — mirrors driver dashboard nav */}
      <nav className="drv-bottom-nav">
        <Link href="/dashboard" className="drv-nav-item">
          <Home size={22} />
          <span>Home</span>
        </Link>
        <Link href="/dashboard?view=earnings" className="drv-nav-item">
          <BarChart3 size={22} />
          <span>Earnings</span>
        </Link>
        <Link href="/dashboard?view=missions" className="drv-nav-item">
          <Package size={22} />
          <span>Missions</span>
        </Link>
        <Link href="/dashboard/messages" className="drv-nav-item active">
          <MessageSquare size={22} />
          <span>Messages</span>
        </Link>
        <Link href="/dashboard?view=profile" className="drv-nav-item">
          <User size={22} />
          <span>Account</span>
        </Link>
      </nav>
    </>
  );
}
