import React, { useState } from 'react';
import {
  AttendanceSettings,
  AttendanceUserSetting,
  DAY_NAMES_SHORT,
  attendanceApi,
  userSetting,
} from '../../utils/attendance';

interface Props {
  users: { id: number; name: string; isAdmin: boolean }[];
  settings: AttendanceSettings | null;
  onClose: () => void;
  onSaved: (settings: AttendanceSettings, message: string) => void;
  onError: (message: string) => void;
}

const AttendanceSettingsModal: React.FC<Props> = ({ users, settings, onClose, onSaved, onError }) => {
  const [lateCutoff, setLateCutoff] = useState(settings?.lateCutoff || '10:30');
  const [rows, setRows] = useState<Record<string, AttendanceUserSetting>>(() => {
    const init: Record<string, AttendanceUserSetting> = {};
    users.forEach(u => { init[String(u.id)] = userSetting(settings, u.id, u.isAdmin); });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const toggleDay = (id: string, day: number) =>
    setRows(r => {
      const cur = r[id].weeklyOffDays;
      return { ...r, [id]: { ...r[id], weeklyOffDays: cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day].sort() } };
    });

  const setAllOff = (day: number) =>
    setRows(r => {
      const next: Record<string, AttendanceUserSetting> = {};
      Object.entries(r).forEach(([id, v]) => {
        next[id] = { ...v, weeklyOffDays: v.weeklyOffDays.includes(day) ? v.weeklyOffDays : [...v.weeklyOffDays, day].sort() };
      });
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const data = await attendanceApi<{ settings: AttendanceSettings }>('/api/attendance/admin/settings', 'PUT', { lateCutoff, users: rows });
      onSaved(data.settings, 'Attendance settings saved');
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-2 sm:p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-3xl max-h-[92vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">⚙️ Attendance Settings</h3>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">✕</button>
        </div>

        <div className="p-4 overflow-auto space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Late after</label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="time"
                value={lateCutoff}
                onChange={e => setLateCutoff(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">Anyone marking Present or Half Day after this time is tagged “Late”.</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Weekly off &amp; attendance required, per user</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Set for everyone:{' '}
                {DAY_NAMES_SHORT.map((d, i) => (
                  <button key={d} onClick={() => setAllOff(i)} className="ml-1 text-blue-600 dark:text-blue-400 hover:underline">{d}</button>
                ))}
              </span>
            </div>
            <div className="space-y-2">
              {users.map(u => {
                const id = String(u.id);
                const row = rows[id];
                return (
                  <div key={id} className={`rounded-lg border p-3 ${row.exempt ? 'border-gray-200 dark:border-gray-700 opacity-60' : 'border-gray-200 dark:border-gray-600'}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        {u.name} {u.isAdmin && <span className="text-xs text-gray-500">(admin)</span>}
                      </span>
                      <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!row.exempt}
                          onChange={e => setRows(r => ({ ...r, [id]: { ...r[id], exempt: !e.target.checked } }))}
                        />
                        Must mark attendance
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {DAY_NAMES_SHORT.map((d, i) => {
                        const on = row.weeklyOffDays.includes(i);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDay(id, i)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${on
                              ? 'bg-orange-400 border-orange-400 text-white'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-orange-300'}`}
                            title={on ? 'Weekly off' : 'Working day'}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Orange = weekly off. Used by the “Not marked” list, the 12:45 PM reminder, multi-day backfill, the user’s calendar and as the default in Calculate Salary.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceSettingsModal;
