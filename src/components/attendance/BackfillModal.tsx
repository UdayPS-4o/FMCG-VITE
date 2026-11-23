import React, { useMemo, useState } from 'react';
import {
  AttendanceSettings,
  DAY_NAMES_SHORT,
  attendanceApi,
  datesBetween,
  dowOf,
  userSetting,
  ymd,
} from '../../utils/attendance';

type Status = 'present' | 'absent' | 'half_day';

interface Props {
  users: { id: number; name: string; isAdmin: boolean }[];
  settings: AttendanceSettings | null;
  initialUserId?: string;
  initialDate?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

const INPUT = 'bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white';

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const BackfillModal: React.FC<Props> = ({ users, settings, initialUserId = '', initialDate, onClose, onSaved, onError }) => {
  const today = ymd();
  const start = initialDate && initialDate <= today ? initialDate : today;
  const [userId, setUserId] = useState(initialUserId);
  const [fromDate, setFromDate] = useState(start);
  const [toDate, setToDate] = useState(start);
  const [time, setTime] = useState('10:00');
  const [status, setStatus] = useState<Status>('present');
  const [skipWeeklyOff, setSkipWeeklyOff] = useState(true);
  const [note, setNote] = useState('');
  const [selfieData, setSelfieData] = useState('');
  const [saving, setSaving] = useState(false);

  const user = users.find(u => String(u.id) === userId);
  const weeklyOffDays = user ? userSetting(settings, user.id, user.isAdmin).weeklyOffDays : [];

  const preview = useMemo(() => {
    const all = datesBetween(fromDate, toDate);
    const future = all.filter(d => d > today);
    const off = skipWeeklyOff ? all.filter(d => d <= today && weeklyOffDays.includes(dowOf(d))) : [];
    const add = all.filter(d => d <= today && !off.includes(d));
    return { all, add, off, future };
  }, [fromDate, toDate, skipWeeklyOff, weeklyOffDays, today]);

  const handlePhoto = (file: File | undefined) => {
    if (!file) { setSelfieData(''); return; }
    if (!file.type.startsWith('image/')) { onError('Please choose an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { onError('Photo size must be less than 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setSelfieData(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!userId || !fromDate || !toDate || !time) { onError('User, dates and time are required'); return; }
    if (toDate < fromDate) { onError('To date cannot be before From date'); return; }
    if (preview.all.length > 62) { onError('Backfill at most 62 days at a time'); return; }
    if (preview.add.length === 0) { onError('No days to add in this range'); return; }
    setSaving(true);
    try {
      const data = await attendanceApi<{ created: { date: string }[]; skipped: { date: string; reason: string }[] }>(
        '/api/attendance/admin/backfill', 'POST',
        { userId: Number(userId), fromDate, toDate, time, status, note, selfieData, skipWeeklyOff }
      );
      const existing = data.skipped.filter(s => s.reason === 'already has an entry').length;
      onSaved(
        `Backfilled ${data.created.length} day(s) for ${user?.name || 'user'}` +
        (existing ? ` · ${existing} already had an entry` : '')
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-2 sm:p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md max-h-[92vh] overflow-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">📝 Backfill Attendance</h3>
            <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">✕</button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User *</label>
              <select value={userId} onChange={e => setUserId(e.target.value)} className={INPUT}>
                <option value="">Select user</option>
                {users.map(u => (
                  <option key={u.id} value={String(u.id)}>{u.name} {u.isAdmin ? '(admin)' : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From *</label>
                <input type="date" max={today} value={fromDate}
                  onChange={e => { const v = e.target.value; setFromDate(v); if (!toDate || toDate < v) setToDate(v); }}
                  className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To *</label>
                <input type="date" min={fromDate} max={today} value={toDate} onChange={e => setToDate(e.target.value)} className={INPUT} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time *</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status *</label>
                <select value={status} onChange={e => setStatus(e.target.value as Status)} className={INPUT}>
                  <option value="present">Present</option>
                  <option value="half_day">Half Day</option>
                  <option value="absent">Absent</option>
                </select>
              </div>
            </div>
            {preview.all.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={skipWeeklyOff} onChange={e => setSkipWeeklyOff(e.target.checked)} />
                Skip weekly off days
                {user && (
                  <span className="text-xs text-gray-500">
                    ({weeklyOffDays.length ? weeklyOffDays.map(d => DAY_NAMES_SHORT[d]).join(', ') : 'none set'})
                  </span>
                )}
              </label>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason / note</label>
              <input type="text" maxLength={500} placeholder="e.g. phone not working, marked on call" value={note} onChange={e => setNote(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo (optional)</label>
              <input type="file" accept="image/*" onChange={e => handlePhoto(e.target.files?.[0])} className="block w-full text-sm text-gray-700 dark:text-gray-300" />
              {selfieData && <img src={selfieData} alt="Backfill photo preview" className="mt-2 h-24 rounded-md object-cover" />}
            </div>

            {userId && preview.all.length > 0 && (
              <div className="rounded-lg bg-orange-50 dark:bg-gray-700/60 border border-orange-200 dark:border-gray-600 p-3 text-xs text-gray-700 dark:text-gray-300 space-y-1">
                <div>
                  <b>{preview.add.length}</b> day(s) will be added
                  {preview.add.length > 0 && preview.add.length <= 31 && (
                    <>: {preview.add.map(shortDate).join(', ')}</>
                  )}
                </div>
                {preview.off.length > 0 && <div>Skipping weekly off: {preview.off.map(shortDate).join(', ')}</div>}
                {preview.future.length > 0 && <div>Skipping future: {preview.future.length} day(s)</div>}
                <div className="text-gray-500 dark:text-gray-400">Days that already have an entry are skipped, never overwritten.</div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60">
              {saving ? 'Saving…' : preview.add.length > 1 ? `Save ${preview.add.length} Entries` : 'Save Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackfillModal;
