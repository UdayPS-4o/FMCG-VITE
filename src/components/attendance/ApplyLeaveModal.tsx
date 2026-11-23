import React, { useEffect, useState } from 'react';
import {
  LEAVE_STATUS_STYLE,
  LEAVE_TYPE_LABEL,
  LeaveRequest,
  LeaveType,
  attendanceApi,
  datesBetween,
  ymd,
} from '../../utils/attendance';

interface Props {
  onClose: () => void;
  onToast: (message: string, type: 'success' | 'error') => void;
}

const INPUT = 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white';
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** User: apply for leave and see / cancel own requests. */
const ApplyLeaveModal: React.FC<Props> = ({ onClose, onToast }) => {
  const today = ymd();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [type, setType] = useState<LeaveType>('casual');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await attendanceApi<{ leaves: LeaveRequest[] }>('/api/attendance/my-settings');
      setMine(data.leaves || []);
    } catch (e) {
      console.error('Error loading leave requests:', e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const days = datesBetween(fromDate, toDate).length;

  const submit = async () => {
    if (!fromDate || !toDate || toDate < fromDate) { onToast('Please choose a valid date range', 'error'); return; }
    if (!reason.trim()) { onToast('Please give a reason', 'error'); return; }
    setSaving(true);
    try {
      await attendanceApi('/api/attendance/leave/apply', 'POST', { fromDate, toDate, type, reason });
      onToast('Leave request sent to admin', 'success');
      setReason('');
      load();
    } catch (e) {
      onToast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await attendanceApi('/api/attendance/leave/cancel', 'POST', { id });
      onToast('Leave request cancelled', 'success');
      load();
    } catch (e) {
      onToast((e as Error).message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-2 sm:p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md max-h-[92vh] overflow-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">🌴 Apply for Leave</h3>
            <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">✕</button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From</label>
                <input type="date" value={fromDate} onChange={e => { const v = e.target.value; setFromDate(v); if (toDate < v) setToDate(v); }} className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
                <input type="date" min={fromDate} value={toDate} onChange={e => setToDate(e.target.value)} className={INPUT} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as LeaveType)} className={INPUT}>
                <option value="casual">Casual leave</option>
                <option value="sick">Sick leave</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
              <textarea rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why do you need leave?" className={INPUT} />
            </div>
            <button onClick={submit} disabled={saving} className="w-full py-2.5 text-sm font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-60">
              {saving ? 'Sending…' : `Request ${days > 0 ? days : ''} day${days === 1 ? '' : 's'} leave`}
            </button>
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">My leave requests</h4>
            {loading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : mine.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No leave requests yet.</p>
            ) : (
              <div className="space-y-2">
                {mine.slice(0, 20).map(l => (
                  <div key={l.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm">
                    <div className="flex justify-between items-start gap-2">
                      <div className="text-gray-900 dark:text-white">
                        {fmt(l.fromDate)}{l.toDate !== l.fromDate && <> → {fmt(l.toDate)}</>}
                        <div className="text-xs text-gray-500 dark:text-gray-400">{l.days} day(s) · {LEAVE_TYPE_LABEL[l.type]}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${LEAVE_STATUS_STYLE[l.status]}`}>{l.status}</span>
                    </div>
                    {l.adminNote && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Admin: “{l.adminNote}”</p>}
                    {l.status === 'pending' && (
                      <button onClick={() => cancel(l.id)} className="mt-1 text-xs text-red-600 dark:text-red-400 hover:underline">Cancel request</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApplyLeaveModal;
