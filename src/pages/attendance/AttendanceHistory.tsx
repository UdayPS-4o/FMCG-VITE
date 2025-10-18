import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import useAuth from "../../hooks/useAuth";
import constants from '../../constants';
import Toast from '../../components/ui/toast/Toast';
import { PulseLoadAnimation } from '../../components/ui/loading';

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
  status: 'present' | 'absent';
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [visibleSalarySlip, setVisibleSalarySlip] = useState<VisibleSalarySlip | null>(null);

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

  const openImageModal = (imageData: string) => {
    setSelectedImage(imageData);
  };

  const closeImageModal = () => {
    setSelectedImage(null);
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
      
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
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
              {attendanceRecords.length === 0 ? (
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
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                      <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                          <th scope="col" className="px-6 py-3">Date</th>
                          <th scope="col" className="px-6 py-3">Time</th>
                          <th scope="col" className="px-6 py-3">Status</th>
                          <th scope="col" className="px-6 py-3">Location</th>
                          <th scope="col" className="px-6 py-3">Selfie</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceRecords.map((record) => (
                          <tr key={record.id} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                              {formatDate(record.date)}
                            </td>
                            <td className="px-6 py-4">
                              {record.time}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                record.status === 'present' 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                              }`}>
                                {record.status === 'present' ? '✅ Present' : '❌ Absent'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-mono">
                                {getLocationString(record.location)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <button
                                onClick={() => openImageModal(record.selfieData)}
                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                              >
                                📷 View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl max-h-full overflow-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Attendance Selfie
                </h3>
                <button
                  onClick={closeImageModal}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>
              <img
                src={selectedImage}
                alt="Attendance selfie"
                className="w-full h-auto rounded-lg"
              />
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