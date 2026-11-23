import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import useAuth from "../../hooks/useAuth";
import constants from '../../constants';
import Toast from '../../components/ui/toast/Toast';
import { PulseLoadAnimation } from '../../components/ui/loading';
import { LeaveRequest, LEAVE_TYPE_LABEL, attendanceApi } from '../../utils/attendance';

// ─── Attendance Calendar ─────────────────────────────────────────────────────
interface CalendarProps {
  month: string; // 'YYYY-MM'
  records: AttendanceRecord[];
  weeklyOffDays: number[]; // 0=Sun … 6=Sat
  leaves?: LeaveRequest[];  // approved leaves are shown in purple
  onDayClick?: (dateStr: string, dayRecords: AttendanceRecord[]) => void;
}

const AttendanceSalaryCalendar: React.FC<CalendarProps> = ({ month, records, weeklyOffDays, leaves = [], onDayClick }) => {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const startDow   = new Date(year, mon - 1, 1).getDay();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Group records by date; the "primary" one prefers 'present' over 'half_day'
  const recordsByDate: Record<string, AttendanceRecord[]> = {};
  const recordMap: Record<string, AttendanceRecord> = {};
  records.forEach(r => {
    const d = r.date.substring(0, 10);
    if (!recordsByDate[d]) recordsByDate[d] = [];
    recordsByDate[d].push(r);
    if (!recordMap[d] || r.status === 'present') recordMap[d] = r;
  });

  const getDayStyle = (dateStr: string, dow: number) => {
    const record = recordMap[dateStr];
    const leave = !record && leaves.find(l => l.status === 'approved' && l.fromDate <= dateStr && l.toDate >= dateStr);
    if (leave)
      return { bg: 'bg-purple-500', text: 'text-white', label: `${LEAVE_TYPE_LABEL[leave.type]} Leave` };
    if (weeklyOffDays.includes(dow))
      return { bg: 'bg-orange-400', text: 'text-white', label: 'Weekly Off' };
    if (record) {
      if (record.status === 'present')  return { bg: 'bg-green-500',  text: 'text-white', label: 'Present'  };
      if (record.status === 'half_day') return { bg: 'bg-pink-400',   text: 'text-white', label: 'Half Day' };
      if (record.status === 'absent')   return { bg: 'bg-red-400',    text: 'text-white', label: 'Absent'   };
    }
    return { bg: 'bg-gray-200 dark:bg-gray-600', text: 'text-gray-500 dark:text-gray-300', label: 'Not Marked' };
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayNames    = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const monthNames  = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
        <span className="font-semibold text-gray-900 dark:text-white">
          {monthNames[mon - 1]} {year}
        </span>
        {onDayClick && (
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Tap a date to view selfie</span>
        )}
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`pad-${idx}`} />;
          const dateStr = `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const dow     = new Date(year, mon - 1, day).getDay();
          const style   = getDayStyle(dateStr, dow);
          const isToday = dateStr === todayStr;
          const dayRecords = recordsByDate[dateStr] || [];
          const clickable = !!onDayClick && dayRecords.length > 0;
          const base = `
            flex items-center justify-center rounded-md h-9 sm:h-10
            text-sm font-medium
            ${style.bg} ${style.text}
            ${isToday ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-gray-800' : ''}
            transition-transform hover:scale-110
          `;
          return clickable ? (
            <button
              key={day}
              type="button"
              title={`${style.label} — view selfie`}
              onClick={() => onDayClick!(dateStr, dayRecords)}
              className={`${base} cursor-pointer underline underline-offset-2`}
            >
              {day}
            </button>
          ) : (
            <div key={day} title={style.label} className={`${base} cursor-default`}>
              {day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
        {[
          { color: 'bg-green-500',  label: 'Present'    },
          { color: 'bg-red-400',    label: 'Absent'     },
          { color: 'bg-orange-400', label: 'Weekly Off' },
          { color: 'bg-pink-400',   label: 'Half Day'   },
          { color: 'bg-purple-500', label: 'Leave'      },
          { color: 'bg-gray-300 dark:bg-gray-600', label: 'Not Marked' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-sm inline-block ${item.color}`} />
            <span className="text-[11px] text-gray-600 dark:text-gray-400">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string;
  userId: number;
  userName: string;
  date: string;
  time: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  };
  selfieData: string;
  status: 'present' | 'absent' | 'half_day';
}

interface SalaryAddition {
  id: string;
  description: string;
  amount: number;
}

interface SalaryDeduction {
  id: string;
  description: string;
  amount: number;
}

interface VisibleSalarySlip {
  id: string;
  userId: number;
  userName: string;
  month: string;
  monthlySalary: number;
  totalWorkingDays: number;
  weeklyOffDays: number[];
  weeklyOffDaysCount: number;
  dailySalary: number;
  attendance: {
    presentDays: number;
    halfDays: number;
    absentDays: number;
    totalRecorded: number;
  };
  salary: {
    presentDaysSalary: number;
    halfDaysSalary: number;
    totalEarnedSalary: number;
    absentDaysDeduction: number;
    halfDaysDeduction: number;
    totalAdditions?: number;
    totalDeductions?: number;
    finalSalary?: number;
  };
  additions: SalaryAddition[];
  deductions: SalaryDeduction[];
  calculatedAt: string;
  calculatedBy: number;
}

const AttendanceHistory: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ date: string; records: AttendanceRecord[] } | null>(null);
  const [visibleSalarySlip, setVisibleSalarySlip] = useState<VisibleSalarySlip | null>(null);
  const [myWeeklyOff, setMyWeeklyOff] = useState<number[] | null>(null);
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    attendanceApi<{ weeklyOffDays: number[]; leaves: LeaveRequest[] }>('/api/attendance/my-settings')
      .then(d => { setMyWeeklyOff(d.weeklyOffDays || []); setMyLeaves(d.leaves || []); })
      .catch(err => console.error('Error loading my attendance settings:', err));
  }, []);

  useEffect(() => {
    const currentDate = new Date();
    const currentMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const currentYear = currentDate.getFullYear().toString();
    
    setSelectedMonth(currentMonth);
    setSelectedYear(currentYear);
  }, []);

  useEffect(() => {
    if (selectedMonth && selectedYear) {
      fetchAttendanceHistory();
      fetchVisibleSalarySlip();
    }
  }, [selectedMonth, selectedYear]);

  const fetchVisibleSalarySlip = async () => {
    if (!user || !selectedMonth || !selectedYear) return;
    
    try {
      const token = localStorage.getItem('token');
      const month = `${selectedYear}-${selectedMonth}`;
      
      const response = await fetch(`${constants.baseURL}/api/attendance/user/visible-salary-slip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user.id,
          month: month
        })
      });

      if (response.ok) {
        const data = await response.json();
        setVisibleSalarySlip(data.salarySlip || null);
      } else {
        setVisibleSalarySlip(null);
      }
    } catch (error) {
      console.error('Error fetching visible salary slip:', error);
      setVisibleSalarySlip(null);
    }
  };

  const fetchAttendanceHistory = async () => {
    if (!user || !selectedMonth || !selectedYear) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user.id,
          month: selectedMonth,
          year: selectedYear
        })
      });

      if (response.ok) {
        const data = await response.json();
        setAttendanceRecords(data.records || []);
      } else {
        setToast({ message: 'Failed to fetch attendance history', type: 'error' });
      }
    } catch (error) {
      console.error('Error fetching attendance history:', error);
      setToast({ message: 'Error fetching attendance history', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const generateMonthOptions = () => {
    const months = [
      { value: '01', label: 'January' },
      { value: '02', label: 'February' },
      { value: '03', label: 'March' },
      { value: '04', label: 'April' },
      { value: '05', label: 'May' },
      { value: '06', label: 'June' },
      { value: '07', label: 'July' },
      { value: '08', label: 'August' },
      { value: '09', label: 'September' },
      { value: '10', label: 'October' },
      { value: '11', label: 'November' },
      { value: '12', label: 'December' }
    ];
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
    
    // If selected year is current year, only show months up to current month
    if (parseInt(selectedYear) === currentYear) {
      return months.filter(month => parseInt(month.value) <= currentMonth);
    }
    
    // For previous years, show all months
    return months;
  };

  const generateYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= currentYear - 5; i--) {
      years.push(i.toString());
    }
    return years;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const getLocationString = (location: AttendanceRecord['location']) => {
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  };

  const statusBadge = (status: AttendanceRecord['status']) => {
    if (status === 'present')  return { cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', label: '✅ Present' };
    if (status === 'half_day') return { cls: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',   label: '🌓 Half Day' };
    return { cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', label: '❌ Absent' };
  };

  const goBackToAttendance = () => {
    navigate('/attendance');
  };

  return (
    <>
      <PageMeta
        title="Attendance History | Ekta Enterprises"
        description="View your past attendance records"
      />
      <PageBreadcrumb
        pageTitle="Attendance History"
      />
      
      <div className="max-w-6xl mx-auto px-0 py-2 md:p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 md:p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              My Attendance History
            </h1>
            <button
              onClick={goBackToAttendance}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              ← Back to Attendance
            </button>
          </div>

          {/* Month/Year Filter and Salary Slip */}
          <div className="mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Month/Year Filter */}
              <div>
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select Month
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    >
                      <option value="">Select Month</option>
                      {generateMonthOptions().map(month => (
                        <option key={month.value} value={month.value}>
                          {month.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select Year
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    >
                      <option value="">Select Year</option>
                      {generateYearOptions().map(year => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Salary Slip Display */}
              {visibleSalarySlip && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-700 dark:to-gray-800 rounded-lg p-6 border border-blue-200 dark:border-gray-600">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                      💰 Salary Slip - {visibleSalarySlip.month}
                    </h3>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Generated: {new Date(visibleSalarySlip.calculatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Monthly Salary:</span>
                        <span className="font-medium text-gray-900 dark:text-white">₹{visibleSalarySlip.monthlySalary.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Working Days:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{visibleSalarySlip.totalWorkingDays}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Present Days:</span>
                        <span className="font-medium text-green-600 dark:text-green-400">{visibleSalarySlip.attendance.presentDays}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Half Days:</span>
                        <span className="font-medium text-yellow-600 dark:text-yellow-400">{visibleSalarySlip.attendance.halfDays}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Absent Days:</span>
                        <span className="font-medium text-red-600 dark:text-red-400">{visibleSalarySlip.attendance.absentDays}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Earned Salary:</span>
                        <span className="font-medium text-gray-900 dark:text-white">₹{visibleSalarySlip.salary.totalEarnedSalary.toFixed(2)}</span>
                      </div>
                      {visibleSalarySlip.additions.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Additions:</span>
                          <span className="font-medium text-green-600 dark:text-green-400">+₹{visibleSalarySlip.salary.totalAdditions?.toFixed(2) || '0.00'}</span>
                        </div>
                      )}
                      {visibleSalarySlip.deductions.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Deductions:</span>
                          <span className="font-medium text-red-600 dark:text-red-400">-₹{visibleSalarySlip.salary.totalDeductions?.toFixed(2) || '0.00'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                   <div className="mt-4 pt-4 border-t border-blue-200 dark:border-gray-600">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold text-gray-900 dark:text-white">Final Salary:</span>
                      <span className="text-xl font-bold text-green-600 dark:text-green-400">
                        ₹{(visibleSalarySlip.salary.finalSalary || visibleSalarySlip.salary.totalEarnedSalary).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <PulseLoadAnimation size="md" />
              <p className="text-gray-600 dark:text-gray-400 mt-4">Loading attendance records...</p>
            </div>
          )}

          {/* Attendance Records */}
          {!loading && (
            <>
              {attendanceRecords.length === 0 && !myLeaves.some(l =>
                l.status === 'approved' &&
                l.fromDate <= `${selectedYear}-${selectedMonth}-31` &&
                l.toDate >= `${selectedYear}-${selectedMonth}-01`
              ) ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-6xl mb-4">📅</div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    No Attendance Records Found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    No attendance records found for {generateMonthOptions().find(m => m.value === selectedMonth)?.label} {selectedYear}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Showing {attendanceRecords.length} record(s) for {generateMonthOptions().find(m => m.value === selectedMonth)?.label} {selectedYear}
                    </p>
                  </div>
                  
                  <AttendanceSalaryCalendar
                    month={`${selectedYear}-${selectedMonth}`}
                    records={attendanceRecords}
                    weeklyOffDays={myWeeklyOff && myWeeklyOff.length ? myWeeklyOff : visibleSalarySlip?.weeklyOffDays || []}
                    leaves={myLeaves}
                    onDayClick={(date, recs) => setSelectedDay({ date, records: recs })}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Day Selfie Modal */}
      {selectedDay && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-lg max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatDate(selectedDay.date + 'T00:00:00')}
                </h3>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-5">
                {selectedDay.records.map((record) => {
                  const badge = statusBadge(record.status);
                  return (
                    <div key={record.id}>
                      <div className="flex flex-wrap items-center gap-2 mb-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span>🕒 {record.time}</span>
                        {record.location && (
                          <a
                            href={`https://www.google.com/maps?q=${record.location.latitude},${record.location.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-blue-600 hover:underline dark:text-blue-400"
                          >
                            📍 {getLocationString(record.location)}
                          </a>
                        )}
                      </div>
                      {record.selfieData ? (
                        <img
                          src={record.selfieData}
                          alt="Attendance selfie"
                          className="w-full h-auto rounded-lg"
                        />
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No selfie available.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
};

export default AttendanceHistory;