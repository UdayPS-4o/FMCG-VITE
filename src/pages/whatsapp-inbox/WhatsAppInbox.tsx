import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor';
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
  inboundCount?: number;
  outboundCount?: number;
  /** true when we have messaged them but they have never written to us */
  neverReplied?: boolean;
}

interface InboxStats {
  totalContacts: number;
  totalUnread: number;
  /** parties reached only through the paid API — invoices, receipts, reminders */
  outgoingOnlyContacts: number;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  body: string;
  imageUrl?: string;
  interactiveTitle?: string;
  interactiveBody?: string;
  interactiveHeader?: string;
  documentUrl?: string;
  documentFilename?: string;
  templateName?: string;
  timestamp: number;
  status: string;
  replyTo?: { body: string; direction: 'inbound' | 'outbound' };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/whatsapp-ui';

// Common emojis grouped by category
const EMOJI_GROUPS = [
  { label: '😀 Smileys', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😝', '😜', '🤩', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '😳', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '💀', '👻', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'] },
  { label: '👋 People', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤞', '✌️', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '👏', '🙌', '🤝', '🙏', '💪', '👀', '👁️', '👅', '👄', '💋'] },
  { label: '❤️ Hearts', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💯', '✅', '☑️', '🔥', '💥', '⭐', '🌟', '✨', '💫', '🎉', '🎊', '🎈', '🎁', '🎀', '🏆', '🥇', '🥈', '🥉'] },
  { label: '🐶 Animals', emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🐘', '🦏', '🦛', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'] },
  { label: '🍎 Food', emojis: ['🍎', '🍊', '🍋', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌽', '🌶️', '🫑', '🧄', '🧅', '🥔', '🍠', '🥐', '🥖', '🍞', '🥨', '🧀', '🥚', '🍳', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🍜', '🍝', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥮', '🍢', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🧃', '🥤', '🧋', '☕', '🫖', '🍵', '🧉', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧊', '🥄', '🍴', '🍽️'] },
  { label: '🚗 Travel', emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🛼', '🚏', '🛣️', '🛤️', '⛽', '🚦', '🚥', '🚧', '⚓', '🛟', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '✈️', '🛩️', '🛫', '🛬', '🪂', '💺', '🚁', '🚟', '🚠', '🚡', '🚀', '🛸', '🌍', '🌎', '🌏', '🗺️', '🧭', '🏔️', '⛰️', '🌋', '🗻', '🏕️', '🏖️', '🏜️', '🏝️', '🏛️', '🏗️', '🏘️', '🏚️', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '💒', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋'] },
];

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ['#D06060', '#60A0D0', '#60B87A', '#D0A060', '#9060D0', '#D06090', '#60D0C0', '#8090A0'];
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
      <svg width="14" height="10" viewBox="0 0 16 11"><path d="M11.071.653a.75.75 0 0 1 .53 1.28L6.32 7.22a.75.75 0 0 1-1.06 0L2.4 4.36a.75.75 0 1 1 1.061-1.06l2.33 2.33L10.54.654a.75.75 0 0 1 .531-.001z" fill="#8696A0" /></svg>
    </span>
  );
  if (status === 'delivered') return (
    <span className="wa-tick" title="Delivered">
      <svg width="18" height="10" viewBox="0 0 18 11"><path d="M15.01.654a.75.75 0 0 1 .53 1.28l-7 7a.75.75 0 0 1-1.06 0l-.5-.5a.75.75 0 0 1 1.06-1.06l-.03.03L14.48.654a.75.75 0 0 1 .53 0zM8.54.654a.75.75 0 0 1 .53 1.28L3.79 7.22a.75.75 0 0 1-1.06 0L.4 4.36a.75.75 0 1 1 1.06-1.06l1.8 1.8L8.01.654a.75.75 0 0 1 .53 0z" fill="#8696A0" /></svg>
    </span>
  );
  if (status === 'read') return (
    <span className="wa-tick wa-tick-read" title="Read">
      <svg width="18" height="10" viewBox="0 0 18 11"><path d="M15.01.654a.75.75 0 0 1 .53 1.28l-7 7a.75.75 0 0 1-1.06 0l-.5-.5a.75.75 0 0 1 1.06-1.06l-.03.03L14.48.654a.75.75 0 0 1 .53 0zM8.54.654a.75.75 0 0 1 .53 1.28L3.79 7.22a.75.75 0 0 1-1.06 0L.4 4.36a.75.75 0 1 1 1.06-1.06l1.8 1.8L8.01.654a.75.75 0 0 1 .53 0z" fill="#53BDEB" /></svg>
    </span>
  );
  return null;
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filtered = search
    ? EMOJI_GROUPS.flatMap(g => g.emojis).filter(e => e.includes(search))
    : EMOJI_GROUPS[tab].emojis;

  return (
    <div className="wa-emoji-picker" ref={ref}>
      <div className="wa-emoji-search-row">
        <input
          className="wa-emoji-search"
          placeholder="Search emoji…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      {!search && (
        <div className="wa-emoji-tabs">
          {EMOJI_GROUPS.map((g, i) => (
            <button
              key={i}
              className={`wa-emoji-tab-btn ${tab === i ? 'active' : ''}`}
              onClick={() => setTab(i)}
              title={g.label}
            >
              {g.emojis[0]}
            </button>
          ))}
        </div>
      )}
      <div className="wa-emoji-grid">
        {filtered.map((em, i) => (
          <button key={i} className="wa-emoji-btn" onClick={() => onSelect(em)} title={em}>
            {em}
          </button>
        ))}
        {filtered.length === 0 && <p className="wa-emoji-empty">No results</p>}
      </div>
    </div>
  );
}

// ─── Message Context Menu ─────────────────────────────────────────────────────
function MessageContextMenu({
  msg, x, y, onClose, onReply, onCopy, onForward, onReact
}: {
  msg: Message; x: number; y: number;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onReact: (emoji: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showReactions, setShowReactions] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 260),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 9000,
  };

  return (
    <div className="wa-ctx-menu" style={style} ref={ref}>
      {/* Quick reactions */}
      <div className="wa-ctx-reactions">
        {QUICK_REACTIONS.map(em => (
          <button key={em} className="wa-ctx-reaction-btn" onClick={() => { onReact(em); onClose(); }} title={em}>
            {em}
          </button>
        ))}
        <button className="wa-ctx-reaction-btn wa-ctx-reaction-more" onClick={() => setShowReactions(v => !v)} title="More">
          +
        </button>
      </div>
      <div className="wa-ctx-divider" />
      <button className="wa-ctx-item" onClick={() => { onReply(); onClose(); }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" /></svg>
        Reply
      </button>
      <button className="wa-ctx-item" onClick={() => { onCopy(); onClose(); }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" /></svg>
        Copy
      </button>
      <button className="wa-ctx-item" onClick={() => { onForward(); onClose(); }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z" /></svg>
        Forward
      </button>
      {showReactions && (
        <div className="wa-ctx-more-reactions">
          {EMOJI_GROUPS[0].emojis.slice(0, 30).map(em => (
            <button key={em} className="wa-emoji-btn" onClick={() => { onReact(em); onClose(); }}>{em}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Conversation Item ────────────────────────────────────────────────────────
function ConversationItem({
  conv, isActive, onClick
}: { conv: Conversation; isActive: boolean; onClick: () => void }) {
  return (
    <div
      className={`wa-conv-item ${isActive ? 'wa-conv-item--active' : ''}`}
      onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="wa-avatar" style={{ background: avatarColor(conv.name) }}>
        {getInitials(conv.name)}
      </div>
      <div className="wa-conv-info">
        <div className="wa-conv-top">
          <span className="wa-conv-name">
            {conv.name}
            {conv.neverReplied && <span className="wa-no-reply" title="Never replied">·</span>}
          </span>
          <span className="wa-conv-time">{formatTime(conv.lastMessageAt)}</span>
        </div>
        <div className="wa-conv-bottom">
          <span className="wa-conv-preview">
            {conv.lastMessageDirection === 'outbound' && <StatusTick status={conv.lastMessageStatus} />}
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
function MessageBubble({
  msg, onImageClick, onContextMenu
}: {
  msg: Message;
  onImageClick: (url: string) => void;
  onContextMenu: (msg: Message, x: number, y: number) => void;
}) {
  const isOut = msg.direction === 'outbound';
  const [hover, setHover] = useState(false);
  const time = new Date(msg.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const handleDropdownClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onContextMenu(msg, e.clientX, e.clientY);
  };

  return (
    <div
      className={`wa-bubble-row ${isOut ? 'wa-bubble-row--out' : 'wa-bubble-row--in'}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Dropdown arrow — left side for outbound, right side for inbound */}
      {isOut && hover && (
        <button className="wa-bubble-action wa-bubble-action--left" onClick={handleDropdownClick} title="Options">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#8696a0"><path d="M7 10l5 5 5-5H7z" /></svg>
        </button>
      )}

      <div className={`wa-bubble ${isOut ? 'wa-bubble--out' : 'wa-bubble--in'} ${msg.type === 'image' ? 'wa-bubble--image' : ''}`}>
        {/* Reply-to preview */}
        {msg.replyTo && (
          <div className={`wa-reply-preview ${msg.replyTo.direction === 'outbound' ? 'wa-reply-preview--out' : ''}`}>
            <span className="wa-reply-preview-label">{msg.replyTo.direction === 'outbound' ? 'You' : 'Customer'}</span>
            <span className="wa-reply-preview-body">{msg.replyTo.body}</span>
          </div>
        )}

        {/* Message content */}
        {msg.type === 'image' && msg.imageUrl ? (
          <div onClick={() => onImageClick(msg.imageUrl!)} className="wa-img-link" style={{ cursor: 'pointer' }}>
            <img src={msg.imageUrl} alt="Photo" className="wa-img" />
          </div>
        ) : msg.type === 'document' && msg.documentUrl ? (
          <a href={msg.documentUrl} target="_blank" rel="noopener noreferrer" className="wa-doc-link">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
            </svg>
            <span>{msg.documentFilename || 'Document'}</span>
          </a>
        ) : msg.type === 'interactive' && !isOut ? (
          <div className="wa-interactive">
            <span className="wa-interactive-icon">🔘</span>
            <span>{msg.interactiveTitle || msg.body}</span>
          </div>
        ) : (msg.type === 'interactive' || msg.type === 'template') && isOut ? (
          <div className="wa-outbound-template">
            {(msg.interactiveHeader || msg.templateName) && (
              <div className="wa-template-header">{msg.interactiveHeader || msg.templateName}</div>
            )}
            <div className="wa-body">{msg.body || msg.interactiveBody}</div>
            {msg.documentUrl && (
              <a href={msg.documentUrl} target="_blank" rel="noopener noreferrer"
                 className="wa-doc-link wa-template-doc">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
                </svg>
                <span>{msg.documentFilename || 'Attachment'}</span>
              </a>
            )}
            <div className="wa-template-tag">📋 Template</div>
          </div>
        ) : msg.type === 'order' ? (
          <div className="wa-order">🛒 {msg.body}</div>
        ) : (
          <div className="wa-body">{msg.body}</div>
        )}

        {/* Reaction badge */}
        {(msg as any).reaction && (
          <div className="wa-reaction-badge">{(msg as any).reaction}</div>
        )}

        <div className="wa-meta">
          <span className="wa-msg-time">{time}</span>
          {isOut && <StatusTick status={msg.status} />}
        </div>
      </div>

      {/* Dropdown arrow — right side for inbound */}
      {!isOut && hover && (
        <button className="wa-bubble-action wa-bubble-action--right" onClick={handleDropdownClick} title="Options">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#8696a0"><path d="M7 10l5 5 5-5H7z" /></svg>
        </button>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyChat() {
  return (
    <div className="wa-empty-chat">
      <div className="wa-empty-icon">
        <svg viewBox="0 0 303 172" width="260" fill="none">
          <circle cx="151" cy="86" r="86" fill="#202C33" opacity="0.2" />
          <path d="M150.5 30C115.5 30 87 55 87 86c0 16 7.5 30.5 19.5 40.5L100 140l14.5-7.5C120 135 135 137 150.5 137c35 0 63.5-23 63.5-51S185.5 30 150.5 30z" fill="#2A3942" stroke="#3B4A54" strokeWidth="1.5" />
          <ellipse cx="120" cy="86" rx="5" ry="5" fill="#8696A0" />
          <ellipse cx="150" cy="86" rx="5" ry="5" fill="#8696A0" />
          <ellipse cx="180" cy="86" rx="5" ry="5" fill="#8696A0" />
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
  const [filter, setFilter] = useState<'all' | 'unread' | 'sent'>('all');
  const [stats, setStats] = useState<InboxStats | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sseStatus, setSseStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // New feature state
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── 24-hour service window check ─────────────────────────────────────────────
  // WhatsApp Business: can only send free-form messages within 24h of last customer message
  const { isServiceWindowOpen, windowClosedAt } = useMemo(() => {
    if (!activeThread?.messages) return { isServiceWindowOpen: false, windowClosedAt: null };
    const lastInbound = [...activeThread.messages].reverse().find(m => m.direction === 'inbound');
    if (!lastInbound) return { isServiceWindowOpen: false, windowClosedAt: null };
    const elapsed = Date.now() - lastInbound.timestamp;
    const open = elapsed < 24 * 60 * 60 * 1000;
    return { isServiceWindowOpen: open, windowClosedAt: open ? null : lastInbound.timestamp };
  }, [activeThread?.messages]);

  // ── Fetch conversation list ──────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ filter });
      if (search) params.set('search', search);
      const res = await fetch(`${API_BASE}/conversations?${params}`, { credentials: 'include' });
      if (!res.ok) {
        const text = await res.text();
        console.error('[WA-UI] HTTP', res.status, text.slice(0, 200));
        setFetchError(`Server returned ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.ok) { setConversations(data.conversations || []); setFetchError(null); }
      else setFetchError(data.error || 'Unknown error');
    } catch (e) {
      console.error('[WA-UI] fetch error:', e);
      setFetchError(String(e));
    } finally { setLoading(false); }
  }, [filter, search]);

  // ── Fetch counts for the filter tabs ────────────────────────────────────────
  // Taken from /stats rather than from the conversation list, because that list
  // is already filtered by the tab you are looking at.
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`, { credentials: 'include' });
      const data = await res.json();
      if (data.ok) setStats(data);
    } catch { /* counts are cosmetic — never block the inbox on them */ }
  }, []);

  // ── Fetch messages for active thread ────────────────────────────────────────
  const fetchMessages = useCallback(async (phone: string) => {
    fetch(`${API_BASE}/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    }).catch(() => { });
    setConversations(prev => prev.map(c => String(c.phone) === String(phone) ? { ...c, unreadCount: 0 } : c));
    setMsgLoading(true);
    try {
      const res = await fetch(`${API_BASE}/messages?phone=${phone}`, { credentials: 'include' });
      const data = await res.json();
      if (data.ok) {
        setActiveThread({
          name: data.name || data.displayPhone || phone,
          displayPhone: data.displayPhone || phone,
          messages: data.messages || [],
          total: data.total || 0,
        });
      }
    } catch (e) { console.error('Failed to fetch messages', e); }
    finally { setMsgLoading(false); }
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
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
              fetchConversations();
              if (activePhone) fetchMessages(activePhone);
            }, 1500);
          }
        } catch { }
      };
      es.onerror = () => { setSseStatus('disconnected'); es.close(); setTimeout(connect, 5000); };
    };
    connect();
    return () => { sseRef.current?.close(); if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, [activePhone, fetchConversations, fetchMessages]);

  useEffect(() => {
    fetchConversations();
    fetchStats();
    const interval = setInterval(() => { fetchConversations(); fetchStats(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchStats]);

  useEffect(() => {
    if (activePhone) { fetchMessages(activePhone); setReplyTo(null); setReactions({}); }
  }, [activePhone, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages]);

  // Close emoji picker and context menu on click-outside
  useEffect(() => {
    const handler = () => setContextMenu(null);
    if (contextMenu) document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || !activePhone || sending || !isServiceWindowOpen) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    const currentReplyTo = replyTo;
    setReplyTo(null);

    const tempId = 'temp_' + Date.now();
    const tempMsg: Message = {
      id: tempId, direction: 'outbound', type: 'text',
      body: text, timestamp: Date.now(), status: 'sending',
      replyTo: currentReplyTo ? { body: currentReplyTo.body, direction: currentReplyTo.direction } : undefined,
    };
    setActiveThread(prev => prev ? { ...prev, messages: [...prev.messages, tempMsg] } : prev);

    try {
      const res = await fetch(`${API_BASE}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activePhone, body: text }),
      });
      const data = await res.json();
      if (!data.ok) {
        setActiveThread(prev => prev ? {
          ...prev, messages: prev.messages.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
        } : prev);
      }
      setTimeout(() => { fetchConversations(); if (activePhone) fetchMessages(activePhone); }, 3000);
    } catch {
      setActiveThread(prev => prev ? {
        ...prev, messages: prev.messages.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
      } : prev);
    } finally { setSending(false); }
  };

  const handleFileUpload = async (file: File) => {
    if (!activePhone || !isServiceWindowOpen) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setSending(true);

      const tempId = 'temp_' + Date.now();
      const isImage = file.type.startsWith('image/');
      const tempMsg: Message = {
        id: tempId, direction: 'outbound', type: isImage ? 'image' : 'document',
        body: file.name, timestamp: Date.now(), status: 'sending',
      };
      if (isImage) tempMsg.imageUrl = base64;
      else tempMsg.documentUrl = '#'; // placeholder

      setActiveThread(prev => prev ? { ...prev, messages: [...prev.messages, tempMsg] } : prev);

      try {
        const uploadRes = await fetch(`${API_BASE}/upload`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, base64 })
        });
        const uploadData = await uploadRes.json();

        if (!uploadData.ok) throw new Error('Upload failed');

        const sendRes = await fetch(`${API_BASE}/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: activePhone,
            body: inputText.trim() || undefined,
            mediaUrl: uploadData.url,
            mediaType: isImage ? 'image' : 'document',
            filename: file.name
          })
        });
        const sendData = await sendRes.json();
        if (!sendData.ok) throw new Error('Send failed');

        setInputText('');
        setTimeout(() => { fetchConversations(); if (activePhone) fetchMessages(activePhone); }, 3000);
      } catch (e) {
        console.error(e);
        setActiveThread(prev => prev ? {
          ...prev, messages: prev.messages.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
        } : prev);
      } finally {
        setSending(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveImageEdit = (editedImageObject: any) => {
    const { imageBase64, fullName, mimeType } = editedImageObject;
    fetch(imageBase64)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], fullName || 'edited-image.jpg', { type: mimeType || 'image/jpeg' });
        handleFileUpload(file);
        setPreviewImage(null);
      });
  };


  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isServiceWindowOpen) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isServiceWindowOpen) return;

    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  // ── Context menu handlers ─────────────────────────────────────────────────────
  const handleCopy = useCallback((msg: Message) => {
    navigator.clipboard.writeText(msg.body).catch(() => { });
  }, []);

  const handleForward = useCallback((msg: Message) => {
    const text = `[Forwarded]\n${msg.body}`;
    navigator.clipboard.writeText(text).catch(() => { });
  }, []);

  const handleReact = useCallback((msg: Message, emoji: string) => {
    setReactions(prev => ({ ...prev, [msg.id]: emoji }));
  }, []);

  // ── Grouped messages ─────────────────────────────────────────────────────────
  const groupedMessages = useMemo(() => {
    if (!activeThread?.messages.length) return [];
    const groups: { dateKey: string; dateLabel: string; msgs: Message[] }[] = [];
    for (const msg of activeThread.messages) {
      const msgWithReaction = reactions[msg.id] ? { ...msg, reaction: reactions[msg.id] } : msg;
      const dk = getDateKey(msg.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dk) { last.msgs.push(msgWithReaction as Message); }
      else { groups.push({ dateKey: dk, dateLabel: formatDateLabel(msg.timestamp), msgs: [msgWithReaction as Message] }); }
    }
    return groups;
  }, [activeThread?.messages, reactions]);

  const activeConv = conversations.find((c) => c.phone === activePhone);

  // Window closed message
  const windowClosedMsg = windowClosedAt
    ? `Last message was ${Math.floor((Date.now() - windowClosedAt) / 3600000)}h ago. Service window closed.`
    : null;

  return (
    <div className={`wa-root ${activePhone ? 'wa-chat-active' : ''}`} onClick={() => { setShowEmojiPicker(false); }}>
      {/* Image preview modal */}
      {previewImage && (
        <div className="wa-image-modal" onClick={() => setPreviewImage(null)}>
          {window.innerWidth > 768 ? (
            <div onClick={e => e.stopPropagation()} style={{ width: '90vw', height: '90vh', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
              <FilerobotImageEditor
                source={previewImage}
                onSave={(editedImageObject, designState) => handleSaveImageEdit(editedImageObject)}
                onClose={() => setPreviewImage(null)}
                annotationsCommon={{
                  fill: '#ff0000',
                }}
                Text={{ text: 'Annotation...' }}
                tabsIds={[TABS.ADJUST, TABS.ANNOTATE, TABS.WATERMARK, TABS.FILTERS, TABS.FINETUNE]}
                defaultTabId={TABS.ANNOTATE}
                defaultToolId={TOOLS.ARROW}
                savingPixelRatio={4}
                previewPixelRatio={window.devicePixelRatio}
              />
            </div>
          ) : (
            <>
              <button className="wa-modal-close" onClick={() => setPreviewImage(null)}>✕</button>
              <img src={previewImage} alt="Preview" className="wa-modal-img" onClick={e => e.stopPropagation()} />
            </>
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <MessageContextMenu
          msg={contextMenu.msg}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onReply={() => { setReplyTo(contextMenu.msg); inputRef.current?.focus(); }}
          onCopy={() => handleCopy(contextMenu.msg)}
          onForward={() => handleForward(contextMenu.msg)}
          onReact={(em) => handleReact(contextMenu.msg, em)}
        />
      )}

      {/* ── Sidebar ── */}
      <div className="wa-sidebar">
        <div className="wa-sidebar-header">
          <a href="/dashboard" className="wa-hamburger" title="Back to Dashboard">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2z" fill="#8696A0" />
            </svg>
          </a>
          <div className="wa-sidebar-avatar" style={{ background: '#2A5F74' }}>
            <svg viewBox="0 0 40 40" width="40" height="40">
              <circle cx="20" cy="20" r="20" fill="#2A5F74" />
              <text x="20" y="26" textAnchor="middle" fontSize="16" fill="#fff" fontWeight="bold">EE</text>
            </svg>
          </div>
          <div className="wa-sidebar-title">
            <span>WhatsApp Inbox</span>
            <span className={`wa-sse-dot wa-sse-dot--${sseStatus}`} title={sseStatus}></span>
          </div>
        </div>

        <div className="wa-search-wrap">
          <div className="wa-search-box">
            <svg className="wa-search-icon" viewBox="0 0 24 24" width="16" height="16">
              <path d="M10 2a8 8 0 1 0 4.906 14.32l4.387 4.387a1 1 0 0 0 1.414-1.414l-4.387-4.387A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4z" fill="#8696A0" />
            </svg>
            <input id="wa-search-input" className="wa-search-input" type="text"
              placeholder="Search or start new chat" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="wa-filter-tabs">
          <button id="wa-filter-all"
            className={`wa-filter-tab ${filter === 'all' ? 'wa-filter-tab--active' : ''}`}
            onClick={() => setFilter('all')}>All</button>
          <button id="wa-filter-unread"
            className={`wa-filter-tab ${filter === 'unread' ? 'wa-filter-tab--active' : ''}`}
            onClick={() => setFilter('unread')}>
            Unread {(stats ? stats.totalUnread : conversations.filter(c => c.unreadCount > 0).length) > 0 &&
              <span className="wa-tab-count">
                {stats ? stats.totalUnread : conversations.filter(c => c.unreadCount > 0).length}
              </span>}
          </button>
          <button id="wa-filter-sent"
            className={`wa-filter-tab ${filter === 'sent' ? 'wa-filter-tab--active' : ''}`}
            onClick={() => setFilter('sent')}
            title="Parties we messaged through the API who have never replied — invoices, cash receipts, balance reminders, ledgers">
            Sent {!!stats?.outgoingOnlyContacts &&
              <span className="wa-tab-count">{stats.outgoingOnlyContacts}</span>}
          </button>
        </div>

        <div className="wa-conv-list">
          {loading ? (
            <div className="wa-loading-list">
              {[1, 2, 3, 4, 5].map(i => (
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
              {fetchError ? (
                <>
                  <p style={{ color: '#e74c3c' }}>⚠ {fetchError}</p>
                  <p style={{ fontSize: '11px', marginTop: '4px' }}>Check browser console for details</p>
                </>
              ) : <p>No conversations found</p>}
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem key={conv.phone} conv={conv}
                isActive={conv.phone === activePhone}
                onClick={() => setActivePhone(conv.phone)} />
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
              <button className="wa-mobile-back-btn" onClick={() => setActivePhone(null)} title="Back">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" fill="#8696A0" />
                </svg>
              </button>
              <div className="wa-avatar wa-avatar--md"
                style={{ background: activeConv ? avatarColor(activeConv.name) : '#607D8B' }}>
                {activeConv ? getInitials(activeConv.name) : '?'}
              </div>
              <div className="wa-chat-header-info">
                <div className="wa-chat-header-name">
                  {activeConv?.name || activeThread?.name || activePhone}
                </div>
                <div className="wa-chat-header-phone">
                  {activeThread?.displayPhone || activePhone}
                  {activeConv && <span className="wa-msg-count"> · {activeConv.messageCount} messages</span>}
                </div>
              </div>
              <button id="wa-refresh-btn" className="wa-header-action"
                onClick={() => { fetchConversations(); if (activePhone) fetchMessages(activePhone); }}
                title="Refresh">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" fill="#8696A0" />
                </svg>
              </button>
            </div>

            {/* Messages area */}
            <div className={`wa-messages-area ${isDragging ? 'wa-dragging' : ''}`} onClick={() => { setShowEmojiPicker(false); setContextMenu(null); }}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            >
              {isDragging && (
                <div className="wa-drag-overlay">
                  <div className="wa-drag-box">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="#fff"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                    <span>Drop file to send</span>
                  </div>
                </div>
              )}
              <div className="wa-messages-bg">
                {msgLoading ? (
                  <div className="wa-msg-loading"><div className="wa-spinner"></div></div>
                ) : groupedMessages.length === 0 ? (
                  <div className="wa-no-messages">No messages yet</div>
                ) : (
                  groupedMessages.map((group) => (
                    <div key={group.dateKey}>
                      <div className="wa-date-divider">
                        <span className="wa-date-label">{group.dateLabel}</span>
                      </div>
                      {group.msgs.map((msg) => (
                        <MessageBubble
                          key={msg.id} msg={msg}
                          onImageClick={setPreviewImage}
                          onContextMenu={(m, x, y) => {
                            setContextMenu({ msg: m, x, y });
                            setShowEmojiPicker(false);
                          }}
                        />
                      ))}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* ── Input area ── */}
            <div className="wa-input-wrapper">
              {/* Reply-to banner */}
              {replyTo && (
                <div className="wa-reply-banner">
                  <div className="wa-reply-banner-bar" />
                  <div className="wa-reply-banner-content">
                    <span className="wa-reply-banner-label">
                      {replyTo.direction === 'outbound' ? 'You' : activeThread?.name || 'Customer'}
                    </span>
                    <span className="wa-reply-banner-body">{replyTo.body}</span>
                  </div>
                  <button className="wa-reply-banner-close" onClick={() => setReplyTo(null)}>✕</button>
                </div>
              )}

              {/* 24h window locked notice */}
              {!isServiceWindowOpen && windowClosedMsg && (
                <div className="wa-window-locked">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="#f0ad4e">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                  <span>{windowClosedMsg} Use a WhatsApp template to re-engage.</span>
                </div>
              )}

              <div className={`wa-input-area ${!isServiceWindowOpen ? 'wa-input-area--locked' : ''}`}>
                {/* Emoji button */}
                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button
                    className={`wa-input-action ${showEmojiPicker ? 'wa-input-action--active' : ''}`}
                    title="Emoji"
                    disabled={!isServiceWindowOpen}
                    onClick={() => setShowEmojiPicker(v => !v)}
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24">
                      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 14.72a7 7 0 0 1-8.48 0A.745.745 0 1 1 8.8 15.6a5.5 5.5 0 0 0 6.4 0 .745.745 0 0 1 1.03 1.12zM8.5 11c-.83 0-1.5-.67-1.5-1.5S7.67 8 8.5 8 10 8.67 10 9.5 9.33 11 8.5 11zm7 0c-.83 0-1.5-.67-1.5-1.5S14.67 8 15.5 8 17 8.67 17 9.5 16.33 11 15.5 11z"
                        fill={showEmojiPicker ? '#00a884' : '#8696A0'} />
                    </svg>
                  </button>
                  {showEmojiPicker && (
                    <EmojiPicker
                      onSelect={(em) => {
                        setInputText(prev => prev + em);
                        inputRef.current?.focus();
                      }}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  )}
                </div>

                <button
                  className="wa-input-action"
                  title="Attach"
                  disabled={!isServiceWindowOpen}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M12 5v14M5 12h14" stroke="#8696A0" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </button>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file);
                    e.target.value = '';
                  }
                }} />

                <div className="wa-input-box">
                  <input
                    id="wa-message-input"
                    ref={inputRef}
                    className="wa-message-input"
                    type="text"
                    placeholder={isServiceWindowOpen ? 'Type a message' : 'Messaging disabled — 24h window closed'}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                    }}
                    disabled={sending || !isServiceWindowOpen}
                  />
                </div>

                <button
                  id="wa-send-btn"
                  className={`wa-send-btn ${inputText.trim() && isServiceWindowOpen ? 'wa-send-btn--active' : ''}`}
                  onClick={sendMessage}
                  disabled={!inputText.trim() || sending || !isServiceWindowOpen}
                  title={isServiceWindowOpen ? 'Send message' : '24h window closed'}
                >
                  {sending ? (
                    <div className="wa-send-spinner"></div>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24">
                      <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" fill="currentColor" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
