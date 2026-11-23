import React, { useMemo, useState } from 'react';
import {
  AttendanceSettings,
  LEAVE_TYPE_LABEL,
  LeaveRequest,
  dowOf,
  formatCutoff,
  leaveOn,
  minutesLate,
  userSetting,
  ymd,
} from '../../utils/attendance';

interface Rec { userId: number; date: string; time: string; status: string }

interface Props {
  date: string; // single day shown
  users: { id: number; name: string; isAdmin: boolean }[];
  records: Rec[];
  settings: AttendanceSettings | null;
  leaves: LeaveRequest[];
  onBackfill: (userId: number) => void;
  onMessage: (userId: number, userName: string) => void;
}

/**
 * Summary for one day: counts + who hasn't marked attendance, who is on leave
 * and who has a weekly off. Users marked "not required" are left out.
 */
const DaySummaryPanel: React.FC<Props> = ({ date, users, records, settings, leaves, onBackfill, onMessage }) => {
  const [open, setOpen] = useState(true);

  const s = useMemo(() => {
    const dayRecs = records.filter(r => r.date === date);
    const markedIds = new Set(dayRecs.map(r => Number(r.userId)));
    const dow = dowOf(date);
    const required = users.filter(u => !userSetting(settings, u.id, u.isAdmin).exempt);

    const notMarked: typeof users = [];
    const onLeave: { user: (typeof users)[number]; leave: LeaveRequest }[] = [];
    const weeklyOff: typeof users = [];
    required.forEach(u => {
      if (markedIds.has(u.id)) return;
      const leave = leaveOn(leaves, u.id, date);
      if (leave) onLeave.push({ user: u, leave });
      else if (userSetting(settings, u.id, u.isAdmin).weeklyOffDays.includes(dow)) weeklyOff.push(u);
      else notMarked.push(u);
    });

    return {
      present: dayRecs.filter(r => r.status === 'present').length,
      halfDay: dayRecs.filter(r => r.status === 'half_day').length,
      absent: dayRecs.filter(r => r.status === 'absent').length,
      late: dayRecs.filter(r => minutesLate(r.time, r.status, settings?.lateCutoff) > 0).length,
      notMarked,
      onLeave,
      weeklyOff,
      exemptCount: users.length - required.length,
    };
  }, [date, users, records, settings, leaves]);

  const isFuture = date > ymd();

  const Stat = ({ label, value, cls }: { label: string; value: number; cls: string }) => (
    <div className={`rounded-lg px-3 py-2 ${cls}`}>
      <div className="text-xl font-bold leading-tight">{value}</div>
      <div className="text-[11px] font-medium opacity-80">{label}</div>
    </div>
  );

  return (
    <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <Stat label="Present" value={s.present} cls="bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300" />
        <Stat label="Half Day" value={s.halfDay} cls="bg-pink-50 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300" />
        <Stat label={`Late (after ${formatCutoff(settings?.lateCutoff || '10:30')})`} value={s.late} cls="bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" />
        <Stat label="Not Marked" value={isFuture ? 0 : s.notMarked.length} cls="bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300" />
        <Stat label="On Leave" value={s.onLeave.length} cls="bg-purple-50 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" />
        <Stat label="Weekly Off" value={s.weeklyOff.length} cls="bg-orange-50 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" />
      </div>

      {!isFuture && (s.notMarked.length > 0 || s.onLeave.length > 0 || s.weeklyOff.length > 0) && (
        <div className="mt-4">
          <button onClick={() => setOpen(o => !o)} className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1">
            <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
            Not marked yet ({s.notMarked.length})
          </button>
          {open && (
            <>
              {s.notMarked.length === 0 ? (
                <p className="text-sm text-green-700 dark:text-green-400 mt-2">Everyone required has marked attendance. 🎉</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                  {s.notMarked.map(u => (
                    <div key={u.id} className="flex items-center justify-between gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.name}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">ID: {u.id}</div>
                      </div>
                      <div className="flex gap-2 shrink-0 text-xs font-medium">
                        <button onClick={() => onMessage(u.id, u.name)} className="text-blue-600 dark:text-blue-400 hover:underline">💬 Message</button>
                        <button onClick={() => onBackfill(u.id)} className="text-orange-600 dark:text-orange-400 hover:underline">📝 Backfill</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(s.onLeave.length > 0 || s.weeklyOff.length > 0) && (
                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  {s.onLeave.map(({ user, leave }) => (
                    <span key={user.id} className="px-2 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" title={leave.reason}>
                      🌴 {user.name} · {LEAVE_TYPE_LABEL[leave.type]} leave
                    </span>
                  ))}
                  {s.weeklyOff.map(u => (
                    <span key={u.id} className="px-2 py-1 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                      🏖️ {u.name} · weekly off
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {s.exemptCount > 0 && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
          {s.exemptCount} user(s) not required to mark attendance are hidden (change in ⚙️ Settings).
        </p>
      )}
    </div>
  );
};

export default DaySummaryPanel;
