'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken, getUser } from '@/lib/auth';
import { messagesApi } from '@/lib/api';
import { MessageSquare, Paperclip, Send, X } from 'lucide-react';

const UPLOAD_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api').replace(/\/api$/, '');

function initials(name: string) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function AdminMessagesPage() {
  const [conversations,        setConversations]        = useState<any[]>([]);
  const [selectedId,           setSelectedId]           = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [sending,  setSending]  = useState(false);
  const [message,  setMessage]  = useState('');
  const [files,    setFiles]    = useState<File[]>([]);
  const currentUser = useMemo(() => getUser(), []);
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const selectedIdRef  = useRef<string | null>(null);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.messages?.length]);

  // Socket created once on mount — persists across conversation switches
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const sock = io(`${UPLOAD_BASE}/messaging`, { auth: { token } });

    sock.on('messageCreated', (payload: any) => {
      const normalized = { ...payload, isOwn: payload.sender?.id === currentUser?.id };
      if (normalized.conversationId === selectedIdRef.current) {
        setSelectedConversation((prev: any) =>
          prev ? { ...prev, messages: [...prev.messages, normalized] } : prev,
        );
      }
      loadConversations();
    });

    sock.on('conversationRead', (payload: any) => {
      if (payload.conversationId !== selectedIdRef.current) return;
      setSelectedConversation((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((item: any) =>
            item.isOwn && !item.readBy.some((e: any) => e.user.id === payload.userId)
              ? { ...item, readBy: [...item.readBy, { user: prev.participants.find((p: any) => p.id === payload.userId), readAt: payload.readAt }] }
              : item,
          ),
        };
      });
    });

    setSocket(sock);
    return () => { sock.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load conversation messages when selection changes
  useEffect(() => {
    if (selectedId) openConversation(selectedId);
  }, [selectedId]);

  // Join socket room when socket is ready or selection changes
  useEffect(() => {
    if (socket && selectedId) socket.emit('joinConversation', { conversationId: selectedId });
  }, [selectedId, socket]);

  async function loadConversations() {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await messagesApi.listConversations(token);
      setConversations(data);
      if (!selectedIdRef.current && data.length > 0) setSelectedId(data[0].id);
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(conversationId: string) {
    const token = getAccessToken();
    if (!token) return;
    const data = await messagesApi.getConversation(token, conversationId);
    setSelectedConversation(data);
    await messagesApi.markConversationRead(token, conversationId);
    setConversations(prev =>
      prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c),
    );
  }

  async function handleSend() {
    const token = getAccessToken();
    if (!token || !selectedId || (!message.trim() && files.length === 0)) return;
    setSending(true);
    try {
      await messagesApi.sendMessage(token, selectedId, { content: message, files });
      setMessage('');
      setFiles([]);
    } finally {
      setSending(false);
    }
  }

  function conversationTitle(conv: any) {
    return conv.participants
      .filter((p: any) => p.id !== currentUser?.id)
      .map((p: any) => p.displayName)
      .join(', ');
  }

  function attachmentUrl(url: string) { return `${UPLOAD_BASE}${url}`; }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.8, marginBottom: 4 }}>Order Messages</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          Participate in order conversations between contractors and suppliers.
        </p>
      </div>

      {/* Chat shell */}
      <div style={{
        display: 'flex', flex: 1, borderRadius: 16, border: '1px solid var(--border-subtle)',
        overflow: 'hidden', background: 'var(--bg-surface)', minHeight: 620,
      }}>

        {/* ── Conversation list ── */}
        <aside style={{ width: 300, borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Conversations</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {conversations.length} thread{conversations.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: '36px 20px', color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
                No conversations yet.
              </div>
            ) : conversations.map(conv => {
              const title    = conversationTitle(conv) || conv.title || 'Order Thread';
              const selected = selectedId === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  style={{
                    width: '100%', textAlign: 'left', border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    borderLeft: `3px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                    background: selected ? 'rgba(59,130,246,0.07)' : 'transparent',
                    padding: '12px 14px', cursor: 'pointer', transition: 'background 0.15s',
                    color: 'var(--text-primary)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {/* Avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: selected ? 'rgba(59,130,246,0.18)' : 'var(--bg-elevated)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800,
                      color: selected ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                      {initials(title)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: selected ? 'var(--accent)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {title}
                        </div>
                        {conv.unreadCount > 0 && (
                          <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 100, marginLeft: 6, flexShrink: 0 }}>
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>
                        #{conv.orderId.slice(-8).toUpperCase()} · {conv.project.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.lastMessage?.content || (conv.lastMessage?.hasAttachments ? '📎 Attachment' : 'No messages yet')}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Chat area ── */}
        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedConversation ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
              <MessageSquare size={40} strokeWidth={1.4} opacity={0.25} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Select a conversation</div>
              <div style={{ fontSize: 12 }}>Choose an order thread from the left panel</div>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div style={{ padding: '13px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, color: 'var(--accent)',
                }}>
                  {initials(conversationTitle(selectedConversation) || selectedConversation.title || 'OT')}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {selectedConversation.title} · {conversationTitle(selectedConversation) || 'Participants'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Order #{selectedConversation.orderId.slice(-8).toUpperCase()} · {selectedConversation.project.name} · {selectedConversation.project.location}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedConversation.participants.map((p: any) => p.displayName).join(' · ')}
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(0,0,0,0.06)' }}>
                {selectedConversation.messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', paddingTop: 60, fontSize: 13 }}>
                    No messages yet in this order thread.
                  </div>
                ) : selectedConversation.messages.map((msg: any) => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.isOwn ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                    {/* Avatar for others */}
                    {!msg.isOwn && (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
                      }}>
                        {initials(msg.sender.displayName)}
                      </div>
                    )}
                    <div style={{ maxWidth: '68%' }}>
                      {!msg.isOwn && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, marginLeft: 4 }}>
                          {msg.sender.displayName}
                        </div>
                      )}
                      <div style={{
                        background: msg.isOwn ? 'var(--accent)' : 'var(--bg-surface)',
                        color: msg.isOwn ? '#fff' : 'var(--text-primary)',
                        borderRadius: msg.isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        padding: '10px 14px',
                        border: msg.isOwn ? 'none' : '1px solid var(--border-subtle)',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }}>
                        {msg.content && (
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: 13.5 }}>{msg.content}</div>
                        )}
                        {msg.attachments.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: msg.content ? 8 : 0 }}>
                            {msg.attachments.map((att: any) => (
                              <a key={att.id} href={attachmentUrl(att.url)} target="_blank" rel="noreferrer"
                                style={{ color: msg.isOwn ? '#BFDBFE' : 'var(--accent)', fontSize: 12, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Paperclip size={11} /> {att.originalName}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: msg.isOwn ? 'right' : 'left', paddingLeft: msg.isOwn ? 0 : 4, paddingRight: msg.isOwn ? 4 : 0 }}>
                        {new Date(msg.createdAt).toLocaleString()}
                        {msg.isOwn && msg.readBy.length > 0 && (
                          <span style={{ color: '#60A5FA', marginLeft: 4 }}>
                            · Read by {msg.readBy.map((r: any) => r.user.displayName).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                {/* File chips */}
                {files.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {files.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 100, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <Paperclip size={10} /> {f.name}
                        <button
                          onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0 0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  {/* Attach */}
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 38, height: 38, borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)', transition: 'var(--transition)',
                  }}>
                    <Paperclip size={16} />
                    <input
                      ref={fileInputRef} type="file" multiple
                      onChange={e => setFiles(Array.from(e.target.files || []))}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {/* Text */}
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    rows={1}
                    placeholder="Write a message… (Enter to send, Shift+Enter for new line)"
                    style={{
                      flex: 1, resize: 'none', background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)', border: '1px solid var(--border-default)',
                      borderRadius: 12, padding: '9px 14px', fontSize: 13.5, fontFamily: 'inherit',
                      outline: 'none', lineHeight: 1.5, maxHeight: 120, minHeight: 38,
                      overflowY: 'auto', transition: 'border-color 0.15s',
                    }}
                  />

                  {/* Send */}
                  <button
                    onClick={handleSend}
                    disabled={sending || (!message.trim() && files.length === 0)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 38, height: 38, borderRadius: 10, border: 'none', flexShrink: 0,
                      background: (!message.trim() && files.length === 0) ? 'var(--bg-elevated)' : 'var(--accent)',
                      color: (!message.trim() && files.length === 0) ? 'var(--text-muted)' : '#fff',
                      cursor: sending || (!message.trim() && files.length === 0) ? 'not-allowed' : 'pointer',
                      transition: 'var(--transition)',
                    }}
                  >
                    {sending
                      ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                      : <Send size={16} />
                    }
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
