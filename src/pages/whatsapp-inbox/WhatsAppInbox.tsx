import React, { useEffect, useRef, useState, useCallback } from 'react';
import './WhatsAppInbox.css';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Conversation {
  phone: string;
  displayPhone: string;
  name: string;
  lastMessage: string;
  lastMessageAt: number;
  lastMessageDirection: 'inbound' | 'outbound';
  lastMessageStatus?: string;
  unreadCount: number;
  messageCount: number;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  body: string;
  imageUrl?: string;
  interactiveTitle?: string;
  templateName?: string;
  timestamp: number;
  status: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = '/api/whatsapp-ui';

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

function avatarColor(name: string): string {
  const colors = [
    '#D06060','#60A0D0','#60B87A','#D0A060',
    '#9060D0','#D06090','#60D0C0','#8090A0',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(h) % colors.length];
}

function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatDateLabel(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getDateKey(ts: number): string {
  return new Date(ts).toDateString();
}

// ─── Status tick icon ─────────────────────────────────────────────────────────
function StatusTick({ status }: { status?: string }) {
  if (!status || status === 'received') return null;
  if (status === 'failed') return <span className="wa-tick wa-tick-failed" title="Failed">⚠</span>;
  if (status === 'sent') return (
    <span className="wa-tick" title="Sent">
      <svg width="14" height="10" viewBox="0 0 16 11"><path d="M11.071.653a.75.75 0 0 1 .53 1.28L6.32 7.22a.75.75 0 0 1-1.06 0L2.4 4.36a.75.75 0 1 1 1.061-1.06l2.33 2.33L10.54.654a.75.75 0 0 1 .531-.001z" fill="#8696A0"/></svg>
    </span>
  );
  if (status === 'delivered') return (
    <span className="wa-tick" title="Delivered">
      <svg width="18" height="10" viewBox="0 0 18 11"><path d="M15.01.654a.75.75 0 0 1 .53 1.28l-7 7a.75.75 0 0 1-1.06 0l-.5-.5a.75.75 0 0 1 1.06-1.06l-.03.03L14.48.654a.75.75 0 0 1 .53 0zM8.54.654a.75.75 0 0 1 .53 1.28L3.79 7.22a.75.75 0 0 1-1.06 0L.4 4.36a.75.75 0 1 1 1.06-1.06l1.8 1.8L8.01.654a.75.75 0 0 1 .53 0z" fill="#8696A0"/></svg>
    </span>
  );
  if (status === 'read') return (
    <span className="wa-tick wa-tick-read" title="Read">
      <svg width="18" height="10" viewBox="0 0 18 11"><path d="M15.01.654a.75.75 0 0 1 .53 1.28l-7 7a.75.75 0 0 1-1.06 0l-.5-.5a.75.75 0 0 1 1.06-1.06l-.03.03L14.48.654a.75.75 0 0 1 .53 0zM8.54.654a.75.75 0 0 1 .53 1.28L3.79 7.22a.75.75 0 0 1-1.06 0L.4 4.36a.75.75 0 1 1 1.06-1.06l1.8 1.8L8.01.654a.75.75 0 0 1 .53 0z" fill="#53BDEB"/></svg>
    </span>
  );
  return null;
}

// ─── Conversation Item ────────────────────────────────────────────────────────
function ConversationItem({
  conv, isActive, onClick
}: { conv: Conversation; isActive: boolean; onClick: () => void }) {
  const initials = getInitials(conv.name);
  const color = avatarColor(conv.name);
  return (
    <div
      className={`wa-conv-item ${isActive ? 'wa-conv-item--active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="wa-avatar" style={{ background: color }}>
        {initials}
      </div>
      <div className="wa-conv-info">
        <div className="wa-conv-top">
          <span className="wa-conv-name">{conv.name}</span>
          <span className="wa-conv-time">{formatTime(conv.lastMessageAt)}</span>
        </div>
        <div className="wa-conv-bottom">
          <span className="wa-conv-preview">
            {conv.lastMessageDirection === 'outbound' && (
              <StatusTick status={conv.lastMessageStatus} />
            )}
            {conv.lastMessageDirection === 'outbound' && <span className="wa-you">You: </span>}
            {conv.lastMessage}
          </span>
          {conv.unreadCount > 0 && (
            <span className="wa-unread-badge">{conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === 'outbound';
  const time = new Date(msg.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  return (
    <div className={`wa-bubble-row ${isOut ? 'wa-bubble-row--out' : 'wa-bubble-row--in'}`}>
      <div className={`wa-bubble ${isOut ? 'wa-bubble--out' : 'wa-bubble--in'} ${msg.type === 'image' ? 'wa-bubble--image' : ''}`}>
        {msg.type === 'image' && msg.imageUrl ? (
          <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="wa-img-link">
            <img src={msg.imageUrl} alt="Photo" className="wa-img" loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div className="wa-img-caption">📷 Photo</div>
          </a>
        ) : msg.type === 'interactive' ? (
          <div className="wa-interactive">
            <span className="wa-interactive-icon">🔘</span>
            <span>{msg.interactiveTitle || msg.body}</span>
          </div>
        ) : msg.type === 'order' ? (
          <div className="wa-order">🛒 {msg.body}</div>
        ) : (
          <div className="wa-body">{msg.body}</div>
        )}
        <div className="wa-meta">
          <span className="wa-msg-time">{time}</span>
          {isOut && <StatusTick status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyChat() {
  return (
    <div className="wa-empty-chat">
      <div className="wa-empty-icon">
        <svg viewBox="0 0 303 172" width="260" fill="none">
          <circle cx="151" cy="86" r="86" fill="#202C33" opacity="0.2"/>
          <path d="M150.5 30C115.5 30 87 55 87 86c0 16 7.5 30.5 19.5 40.5L100 140l14.5-7.5C120 135 135 137 150.5 137c35 0 63.5-23 63.5-51S185.5 30 150.5 30z" fill="#2A3942" stroke="#3B4A54" strokeWidth="1.5"/>
          <ellipse cx="120" cy="86" rx="5" ry="5" fill="#8696A0"/>
          <ellipse cx="150" cy="86" rx="5" ry="5" fill="#8696A0"/>
          <ellipse cx="180" cy="86" rx="5" ry="5" fill="#8696A0"/>
        </svg>
      </div>
      <h2>WhatsApp Business Inbox</h2>
      <p>Select a conversation from the left to view messages</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<{
    name: string; displayPhone: string; messages: Message[]; total: number
  } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch conversation list ──────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filter });
      if (search) params.set('search', search);
      const res = await fetch(`${API_BASE}/conversations?${params}`);
      const data = await res.json();
      if (data.ok) setConversations(data.conversations || []);
    } catch (e) {
      console.error('Failed to fetch conversations', e);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  // ── Fetch messages for active thread ────────────────────────────────────────
  const fetchMessages = useCallback(async (phone: string) => {
    setMsgLoading(true);
    try {
      const res = await fetch(`${API_BASE}/messages?phone=${phone}`);
      const data = await res.json();
      if (data.ok) {
        setActiveThread({
          name: data.name || data.displayPhone || phone,
          displayPhone: data.displayPhone || phone,
          messages: data.messages || [],
          total: data.total || 0,
        });
      }
    } catch (e) {
      console.error('Failed to fetch messages', e);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  // ── SSE live updates ─────────────────────────────────────────────────────────
  useEffect(() => {
    const connect = () => {
      const es = new EventSource(`${API_BASE}/events`);
      sseRef.current = es;
      es.onopen = () => setSseStatus('connected');
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'update') {
            // Debounce refresh
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
              fetchConversations();
              if (activePhone) fetchMessages(activePhone);
            }, 1500);
          }
        } catch {}
      };
      es.onerror = () => {
        setSseStatus('disconnected');
        es.close();
        setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      sseRef.current?.close();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [activePhone, fetchConversations, fetchMessages]);

  // ── Initial load + polling fallback ─────────────────────────────────────────
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 30000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  useEffect(() => {
    if (activePhone) {
      fetchMessages(activePhone);
    }
  }, [activePhone, fetchMessages]);

  // ── Auto-scroll to bottom ────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || !activePhone || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);

    // Optimistic UI: add a pending bubble
    const tempId = 'temp_' + Date.now();
    const tempMsg: Message = {
      id: tempId,
      direction: 'outbound',
      type: 'text',
      body: text,
      timestamp: Date.now(),
      status: 'sending',
    };
    setActiveThread((prev) =>
      prev ? { ...prev, messages: [...prev.messages, tempMsg] } : prev
    );

    try {
      const res = await fetch(`${API_BASE}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activePhone, body: text }),
      });
      const data = await res.json();
      if (!data.ok) {
        // Mark failed
        setActiveThread((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === tempId ? { ...m, status: 'failed' } : m
            ),
          };
        });
      }
      // Refresh after a short delay to pick up webhook status
      setTimeout(() => {
        fetchConversations();
        if (activePhone) fetchMessages(activePhone);
      }, 3000);
    } catch (e) {
      setActiveThread((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === tempId ? { ...m, status: 'failed' } : m
          ),
        };
      });
    } finally {
      setSending(false);
    }
  };

  // ── Group messages by date ───────────────────────────────────────────────────
  const groupedMessages = (() => {
    if (!activeThread?.messages.length) return [];
    const groups: { dateKey: string; dateLabel: string; msgs: Message[] }[] = [];
    for (const msg of activeThread.messages) {
      const dk = getDateKey(msg.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dk) {
        last.msgs.push(msg);
      } else {
        groups.push({ dateKey: dk, dateLabel: formatDateLabel(msg.timestamp), msgs: [msg] });
      }
    }
    return groups;
  })();

  const activeConv = conversations.find((c) => c.phone === activePhone);

  return (
    <div className="wa-root">
      {/* ── Left sidebar ── */}
      <div className="wa-sidebar">
        {/* Header */}
        <div className="wa-sidebar-header">
          <div className="wa-sidebar-avatar" style={{ background: '#2A5F74' }}>
            <svg viewBox="0 0 40 40" width="40" height="40">
              <circle cx="20" cy="20" r="20" fill="#2A5F74"/>
              <text x="20" y="26" textAnchor="middle" fontSize="16" fill="#fff" fontWeight="bold">EE</text>
            </svg>
          </div>
          <div className="wa-sidebar-title">
            <span>WhatsApp Inbox</span>
            <span className={`wa-sse-dot wa-sse-dot--${sseStatus}`} title={sseStatus}></span>
          </div>
        </div>

        {/* Search */}
        <div className="wa-search-wrap">
          <div className="wa-search-box">
            <svg className="wa-search-icon" viewBox="0 0 24 24" width="16" height="16">
              <path d="M10 2a8 8 0 1 0 4.906 14.32l4.387 4.387a1 1 0 0 0 1.414-1.414l-4.387-4.387A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4z" fill="#8696A0"/>
            </svg>
            <input
              id="wa-search-input"
              className="wa-search-input"
              type="text"
              placeholder="Search or start new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="wa-filter-tabs">
          <button
            id="wa-filter-all"
            className={`wa-filter-tab ${filter === 'all' ? 'wa-filter-tab--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            id="wa-filter-unread"
            className={`wa-filter-tab ${filter === 'unread' ? 'wa-filter-tab--active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            Unread {conversations.filter(c => c.unreadCount > 0).length > 0 &&
              <span className="wa-tab-count">{conversations.filter(c => c.unreadCount > 0).length}</span>}
          </button>
        </div>

        {/* Conversation list */}
        <div className="wa-conv-list">
          {loading ? (
            <div className="wa-loading-list">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="wa-skeleton">
                  <div className="wa-skeleton-avatar"></div>
                  <div className="wa-skeleton-lines">
                    <div className="wa-skeleton-line wa-skeleton-line--long"></div>
                    <div className="wa-skeleton-line wa-skeleton-line--short"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="wa-no-conversations">
              <p>No conversations found</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.phone}
                conv={conv}
                isActive={conv.phone === activePhone}
                onClick={() => setActivePhone(conv.phone)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Main chat panel ── */}
      <div className="wa-main">
        {!activePhone ? (
          <EmptyChat />
        ) : (
          <>
            {/* Chat header */}
            <div className="wa-chat-header">
              <div
                className="wa-avatar wa-avatar--md"
                style={{ background: activeConv ? avatarColor(activeConv.name) : '#607D8B' }}
              >
                {activeConv ? getInitials(activeConv.name) : '?'}
              </div>
              <div className="wa-chat-header-info">
                <div className="wa-chat-header-name">
                  {activeConv?.name || activeThread?.name || activePhone}
                </div>
                <div className="wa-chat-header-phone">
                  {activeThread?.displayPhone || activePhone}
                  {activeConv && (
                    <span className="wa-msg-count"> · {activeConv.messageCount} messages</span>
                  )}
                </div>
              </div>
              <button
                id="wa-refresh-btn"
                className="wa-header-action"
                onClick={() => { fetchConversations(); if (activePhone) fetchMessages(activePhone); }}
                title="Refresh"
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="#8696A0"/>
                </svg>
              </button>
            </div>

            {/* Messages area */}
            <div className="wa-messages-area">
              <div className="wa-messages-bg">
                {msgLoading ? (
                  <div className="wa-msg-loading">
                    <div className="wa-spinner"></div>
                  </div>
                ) : groupedMessages.length === 0 ? (
                  <div className="wa-no-messages">No messages yet</div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.dateKey}>
                      <div className="wa-date-divider">
                        <span className="wa-date-label">{group.dateLabel}</span>
                      </div>
                      {group.msgs.map((msg) => (
                        <MessageBubble key={msg.id} msg={msg} />
                      ))}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input area */}
            <div className="wa-input-area">
              <button className="wa-input-action" title="Emoji" disabled>
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 14.72a7 7 0 0 1-8.48 0A.745.745 0 1 1 8.8 15.6a5.5 5.5 0 0 0 6.4 0 .745.745 0 0 1 1.03 1.12zM8.5 11c-.83 0-1.5-.67-1.5-1.5S7.67 8 8.5 8 10 8.67 10 9.5 9.33 11 8.5 11zm7 0c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8 17 8.67 17 9.5 16.33 11 15.5 11z" fill="#8696A0"/>
                </svg>
              </button>
              <div className="wa-input-box">
                <input
                  id="wa-message-input"
                  className="wa-message-input"
                  type="text"
                  placeholder="Type a message"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={sending}
                />
              </div>
              <button
                id="wa-send-btn"
                className={`wa-send-btn ${inputText.trim() ? 'wa-send-btn--active' : ''}`}
                onClick={sendMessage}
                disabled={!inputText.trim() || sending}
                title="Send message"
              >
                {sending ? (
                  <div className="wa-send-spinner"></div>
                ) : (
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" fill="currentColor"/>
                  </svg>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
