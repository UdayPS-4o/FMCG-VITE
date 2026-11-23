import React, { useState } from 'react';
import {
  LEAVE_STATUS_STYLE,
  LEAVE_TYPE_LABEL,
  LeaveRequest,
  LeaveStatus,
  attendanceApi,
} from '../../utils/attendance';

interface Props {
  leaves: LeaveRequest[];
  loading: boolean;
  onReload: () => void;
  onToast: (message: string, type: 'success' | 'error') => void;
}

const fmt = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const FILTERS: { key: LeaveStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const LeaveRequestsPanel: React.FC<Props> = ({ leaves, loading, onReload, onToast }) => {
  const [filter, setFilter] = useState<LeaveStatus | 'all'>('pending');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const shown = filter === 'all' ? leaves : leaves.filter(l => l.status === filter);
  const count = (k: LeaveStatus | 'all') => (k === 'all' ? leaves.length : leaves.filter(l => l.status === k).length);

  const decide = async (leave: LeaveRequest, decision: 'approved' | 'rejected') => {
    setBusyId(leave.id);
    try {
      await attendanceApi('/api/attendance/admin/leaves/decide', 'POST', { id: leave.id, decision, adminNote: notes[leave.id] || '' });
      onToast(`Leave ${decision} for ${leave.userName}`, 'success');
      onReload();
    } catch (e) {
      onToast((e as Error).message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${filter === f.key
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
            >
              {f.label} ({count(f.key)})
            </button>
          ))}
        </div>
        <button onClick={onReload} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">🔄 Refresh</button>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-8">Loading leave requests…</p>
      ) : shown.length === 0 ? (
        <div className="text-center py-10">
          <div className="text-5xl mb-3">🌴</div>
          <p className="text-gray-600 dark:text-gray-400">No {filter === 'all' ? '' : filter} leave requests.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {shown.map(l => (
            <div key={l.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{l.userName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Requested {new Date(l.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${LEAVE_STATUS_STYLE[l.status]}`}>{l.status}</span>
              </div>
              <div className="mt-3 text-sm text-gray-800 dark:text-gray-200">
                <b>{fmt(l.fromDate)}</b>{l.toDate !== l.fromDate && <> → <b>{fmt(l.toDate)}</b></>}
                <span className="ml-2 text-xs text-gray-500">({l.days} day{l.days > 1 ? 's' : ''} · {LEAVE_TYPE_LABEL[l.type]})</span>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">“{l.reason}”</p>

              {l.status === 'pending' ? (
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Note to user (optional)"
                    value={notes[l.id] || ''}
                    onChange={e => setNotes(n => ({ ...n, [l.id]: e.target.value }))}
                    className="flex-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <button disabled={busyId === l.id} onClick={() => decide(l, 'approved')} className="flex-1 sm:flex-none px-3 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-60">✓ Approve</button>
                    <button disabled={busyId === l.id} onClick={() => decide(l, 'rejected')} className="flex-1 sm:flex-none px-3 py-2 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white disabled:opacity-60">✕ Reject</button>
                  </div>
                </div>
              ) : (l.decidedByName || l.adminNote) && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {l.status !== 'cancelled' && l.decidedByName && <>By {l.decidedByName}</>}
                  {l.status === 'cancelled' && <>Cancelled by user</>}
                  {l.adminNote && <> — “{l.adminNote}”</>}
                </p>
              )}
              {l.status === 'approved' && (
                <button disabled={busyId === l.id} onClick={() => decide(l, 'rejected')} className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline">
                  Revoke (mark rejected)
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeaveRequestsPanel;
