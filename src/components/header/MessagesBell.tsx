import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useAuth from '../../hooks/useAuth';
import constants from '../../constants';

/**
 * Header bell: every message sent to this user (customer-app issues, change
 * requests, pickup requests, staff messages), read or unread, with the unread
 * count on the icon. The blue banner (GlobalMessageNotification) only shows
 * unread ones; this is where older messages stay visible.
 */

interface MessageData {
  id: string;
  recipientId: number;
  message: string;
  photoAttachment?: string | null;
  sentAt: string;
  sentBy: number | string;
  isRead: boolean;
}

type Filter = 'all' | 'unread';

const POLL_MS = 15000;
const PANEL_WIDTH = 400;
const EDGE_GAP = 8;
const MAX_BADGE = 99;

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const MessagesBell: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [photo, setPhoto] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: PANEL_WIDTH });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isAdmin = Boolean(user?.routeAccess?.includes('Admin'));
  const userId = user?.id;

  const load = useCallback(async () => {
    if (userId == null) return;
    try {
      const res = await fetch(`${constants.baseURL}/api/messages`);
      if (!res.ok) return;
      const data = await res.json();
      // Same rule as the banner: own messages, plus the admin inbox (recipient 1) for admins
      const mine = (data.messages || []).filter(
        (m: MessageData) => m.recipientId === userId || (isAdmin && m.recipientId === 1)
      );
      mine.sort((a: MessageData, b: MessageData) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      setMessages(mine);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }, [userId, isAdmin]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Close on a click outside the bell and the panel
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    if (!open && buttonRef.current) {
      // The panel is drawn on <body> (the header slides and is transformed), so place it by hand
      const rect = buttonRef.current.getBoundingClientRect();
      const width = Math.min(PANEL_WIDTH, window.innerWidth - EDGE_GAP * 2);
      const left = Math.max(EDGE_GAP, Math.min(rect.left, window.innerWidth - width - EDGE_GAP));
      setPosition({ top: Math.max(EDGE_GAP, rect.bottom + EDGE_GAP), left, width });
      load();
    }
    setOpen(!open);
  };

  const setRead = async (id: string, isRead: boolean) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, isRead } : m)));
    try {
      const res = await fetch(`${constants.baseURL}/api/messages/${id}/${isRead ? 'read' : 'unread'}`, { method: 'PUT' });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      console.error('Error updating message:', err);
      load();
    }
  };

  const markAllRead = async () => {
    setMessages(prev => prev.map(m => ({ ...m, isRead: true })));
    try {
      await fetch(`${constants.baseURL}/api/messages/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isAdmin }),
      });
    } catch (err) {
      console.error('Error marking all messages as read:', err);
      load();
    }
  };

  if (!user) return null;

  const unread = messages.filter(m => !m.isRead).length;
  const shown = filter === 'unread' ? messages.filter(m => !m.isRead) : messages;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex items-center justify-center w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-semibold leading-[18px] text-center">
            {unread > MAX_BADGE ? `${MAX_BADGE}+` : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="fixed flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{ top: position.top, left: position.left, width: position.width, maxHeight: `calc(100vh - ${position.top + EDGE_GAP}px)`, zIndex: 99990 }}
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Notifications</h5>
            <button
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-sm font-medium text-brand-500 hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              Mark all read
            </button>
          </div>

          <div className="flex gap-2 px-4 py-2">
            {([['all', `All (${messages.length})`], ['unread', `Unread (${unread})`]] as Array<[Filter, string]>).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  filter === key
                    ? 'bg-brand-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto px-2 pb-2">
            {shown.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                {filter === 'unread' ? 'No unread messages' : 'No messages yet'}
              </div>
            ) : (
              shown.map(m => (
                <div
                  key={m.id}
                  className={`m-2 rounded-xl border p-3 ${
                    m.isRead
                      ? 'border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900'
                      : 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      {!m.isRead && <span className="w-2 h-2 rounded-full bg-blue-600" aria-hidden="true" />}
                      {formatTime(m.sentAt)}
                    </span>
                    <button
                      onClick={() => setRead(m.id, !m.isRead)}
                      className="text-xs font-medium text-brand-500 hover:underline shrink-0"
                    >
                      {m.isRead ? 'Mark unread' : 'Mark read'}
                    </button>
                  </div>
                  <p className={`text-sm whitespace-pre-line break-words ${m.isRead ? 'text-gray-600 dark:text-gray-300' : 'font-medium text-gray-900 dark:text-gray-100'}`}>
                    {m.message}
                  </p>
                  {m.photoAttachment && (
                    <button onClick={() => setPhoto(m.photoAttachment || null)} className="mt-2 block" title="View photo">
                      <img src={m.photoAttachment} alt="Attachment" className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}

      {photo && createPortal(
        <div
          className="fixed inset-0 bg-black/75 flex items-center justify-center p-4"
          style={{ zIndex: 100002 }}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setPhoto(null)}
        >
          <img src={photo} alt="Attachment" className="max-w-full max-h-[90vh] object-contain rounded" />
        </div>,
        document.body
      )}
    </>
  );
};

export default MessagesBell;
