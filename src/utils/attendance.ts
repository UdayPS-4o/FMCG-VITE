// Shared attendance helpers: settings, leave requests, late check.
import constants from '../constants';

export interface AttendanceUserSetting {
  weeklyOffDays: number[]; // 0=Sun … 6=Sat
  exempt: boolean;         // attendance not required (e.g. owner, accounts)
}

export interface AttendanceSettings {
  lateCutoff: string; // 'HH:MM' 24h
  users: Record<string, AttendanceUserSetting>;
}

export type LeaveType = 'casual' | 'sick' | 'other';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  userId: number;
  userName: string;
  fromDate: string;
  toDate: string;
  days: number;
  type: LeaveType;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  decidedByName?: string;
  decidedAt?: string;
  adminNote?: string;
}

export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { casual: 'Casual', sick: 'Sick', other: 'Other' };
export const LEAVE_STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

/** Local YYYY-MM-DD for a Date (defaults to today). */
export const ymd = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Day of week (0=Sun) for a YYYY-MM-DD string, timezone-safe. */
export const dowOf = (date: string) => new Date(`${date}T00:00:00`).getDay();

/** All YYYY-MM-DD dates from..to inclusive. */
export const datesBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  if (!from || !to || to < from) return out;
  const cur = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cur <= end && out.length < 400) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

/** "11:02:15 AM", "12:15:34 pm", "11:39:44", "09:30" → minutes since midnight (or null). */
export const timeToMinutes = (time: string | undefined | null): number | null => {
  if (!time) return null;
  const m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i.exec(time);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase().replace(/\./g, '');
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/** Minutes late after the cut-off, or 0 if on time / unknown. Only for present/half-day marks. */
export const minutesLate = (time: string | undefined, status: string, lateCutoff: string | undefined): number => {
  if (!lateCutoff || status === 'absent') return 0;
  const t = timeToMinutes(time);
  const c = timeToMinutes(lateCutoff);
  if (t === null || c === null) return 0;
  return Math.max(0, t - c);
};

export const formatLate = (mins: number) =>
  mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m late` : `${mins}m late`;

/** "10:30" → "10:30 AM" */
export const formatCutoff = (hhmm: string) => {
  const m = timeToMinutes(hhmm);
  if (m === null) return hhmm;
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** A user's saved settings. Admins are exempt by default until an admin changes it. */
export const userSetting = (settings: AttendanceSettings | null, userId: number, isAdmin = false): AttendanceUserSetting => {
  const s = settings?.users?.[String(userId)];
  return { weeklyOffDays: s?.weeklyOffDays || [], exempt: s ? !!s.exempt : isAdmin };
};

/** Approved leave covering a date for a user, if any. */
export const leaveOn = (leaves: LeaveRequest[], userId: number, date: string) =>
  leaves.find(l => l.status === 'approved' && Number(l.userId) === Number(userId) && l.fromDate <= date && l.toDate >= date);

const authHeaders = (json = false): Record<string, string> => {
  const h: Record<string, string> = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

/** fetch JSON from the API; throws Error(message) on failure. */
export const attendanceApi = async <T = Record<string, unknown>>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const res = await fetch(`${constants.baseURL}${path}`, {
    method,
    headers: authHeaders(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.message || `Request failed (${res.status})`);
  return data as T;
};
