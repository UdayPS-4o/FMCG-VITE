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
  status: 'present' | 'absent' | 'half_day';
}

interface UserLocation {
  userId: number;
  userName: string;
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null;
  lastUpdated: string;
  source?: string;
  isBackgroundTracking?: boolean;
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

interface StoredSalaryCalculation {
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

interface UserActivityLog {
  id: string;
  userId: number;
  userName: string;
  page: string;
  action: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

interface MessageData {
  id: string;
  recipientId: number;
  recipientName: string;
  message: string;
  photoAttachment?: string;
  sentAt: string;
  sentBy: number;
  isRead: boolean;
}

interface MandatoryDocsData {
  stockRegister: string | null;
  cashBook: string | null;
  bankSlips: string[];
}

const AdminAttendance: React.FC = () => {
  const navigate = useNavigate();
  const { user, hasAccess } = useAuth();
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);


  // Gallery Modal State
  const [galleryState, setGalleryState] = useState<{
    isOpen: boolean;
    items: { src: string; title: string }[];
    currentIndex: number;
  }>({
    isOpen: false,
    items: [],
    currentIndex: 0
  });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const [activeTab, setActiveTab] = useState<'attendance' | 'locations'>('attendance');
  const [users, setUsers] = useState<{
    id: number;
    name: string;
    username: string;
    routeAccess: string[];
    isAdmin: boolean;
    requireMandatoryDocs?: boolean;
    mandatoryDocsFromDate?: string;
  }[]>([]);
  const [salaryModal, setSalaryModal] = useState<{ userId: number; userName: string } | null>(null);


  const [salaryData, setSalaryData] = useState<{
    monthlySalary: string;
    weeklyOffDays: number[];
    month: string;
    additions: SalaryAddition[];
    deductions: SalaryDeduction[];
  }>({
    monthlySalary: '',
    weeklyOffDays: [], // Array of day numbers (0=Sunday, 1=Monday, etc.)
    month: '',
    additions: [],
    deductions: []
  });

  // Helper function to get current date in Indian Standard Time
  const getIndianDate = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().split('T')[0];
  };

  // Helper function to get current month in Indian Standard Time
  const getIndianMonth = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().substring(0, 7);
  };

  // Function to get storage key for salary data persistence
  const getSalaryDataStorageKey = (userId: number, month: string) => {
    return `salaryData_${userId}_${month}`;
  };

  // Function to save salary data to localStorage
  const saveSalaryDataToStorage = (userId: number, month: string, data: typeof salaryData) => {
    if (month && userId) {
      const key = getSalaryDataStorageKey(userId, month);
      localStorage.setItem(key, JSON.stringify(data));
    }
  };

  // Function to load salary data from localStorage
  const loadSalaryDataFromStorage = (userId: number, month: string) => {
    if (month && userId) {
      const key = getSalaryDataStorageKey(userId, month);
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (error) {
          console.error('Error parsing stored salary data:', error);
        }
      }
    }
    return null;
  };

  // Enhanced setSalaryData function that automatically saves to localStorage
  const updateSalaryData = (newData: typeof salaryData | ((prev: typeof salaryData) => typeof salaryData)) => {
    setSalaryData(prevData => {
      const updatedData = typeof newData === 'function' ? newData(prevData) : newData;
      // Save to localStorage if we have a modal open
      if (salaryModal && updatedData.month) {
        saveSalaryDataToStorage(salaryModal.userId, updatedData.month, updatedData);
      }
      return updatedData;
    });
  };

  const [storedSalaries, setStoredSalaries] = useState<StoredSalaryCalculation[]>([]);
  const [printSlipModal, setPrintSlipModal] = useState<StoredSalaryCalculation | null>(null);
  const [showStoredSalaries, setShowStoredSalaries] = useState<{ [key: number]: boolean }>({});
  const [visibleSalarySlips, setVisibleSalarySlips] = useState<{ [key: string]: boolean }>({});
  const [userActivityModal, setUserActivityModal] = useState<{ userId: number; userName: string } | null>(null);
  const [userActivityLogs, setUserActivityLogs] = useState<UserActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Message state management
  const [messageModal, setMessageModal] = useState<{ userId: number; userName: string } | null>(null);
  const [messageData, setMessageData] = useState<{
    message: string;
    photoAttachment: File | null;
    photoPreview: string | null;
  }>({
    message: '',
    photoAttachment: null,
    photoPreview: null
  });
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    // Check if user has admin access
    if (!hasAccess('Admin')) {
      navigate('/account-master');
      return;
    }

    const today = getIndianDate();
    setSelectedDate(today);

    fetchUsers();
    fetchUserLocations();
  }, [hasAccess, navigate]);

  useEffect(() => {
    if (selectedDate) {
      fetchAttendanceRecords();
    }
  }, [selectedDate, selectedUser]);

  useEffect(() => {
    fetchStoredSalaries();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchStoredSalaries = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/admin/stored-salaries`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const salaries = data.salaries || [];
        setStoredSalaries(salaries);
        // Load salary slip visibility after fetching salaries
        await loadSalarySlipVisibilityForSalaries(salaries);
      }
    } catch (error) {
      console.error('Error fetching stored salaries:', error);
    }
  };

  const fetchAttendanceRecords = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/admin/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: selectedDate,
          userId: selectedUser || null
        })
      });

      if (response.ok) {
        const data = await response.json();
        setAttendanceRecords(data.records || []);
      } else {
        setToast({ message: 'Failed to fetch attendance records', type: 'error' });
      }
    } catch (error) {
      console.error('Error fetching attendance records:', error);
      setToast({ message: 'Error fetching attendance records', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserLocations = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/admin/locations`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUserLocations(data.locations || []);
      }
    } catch (error) {
      console.error('Error fetching user locations:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getLocationString = (location: AttendanceRecord['location']) => {
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  };

  const openGallery = (index: number, items: { src: string; title: string }[]) => {
    setGalleryState({
      isOpen: true,
      items,
      currentIndex: index
    });
    setZoom(1);
    setRotation(0);
  };

  const closeGallery = () => {
    setGalleryState(prev => ({ ...prev, isOpen: false }));
  };

  const openLocationInMaps = (latitude: number, longitude: number) => {
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    window.open(url, '_blank');
  };

  const getLocationStatus = (location: UserLocation) => {
    if (!location.currentLocation) {
      return {
        status: 'No Location',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        icon: '❌',
        description: 'No location data available'
      };
    }

    const lastUpdated = new Date(location.lastUpdated);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastUpdated.getTime()) / (1000 * 60);
    const isBackgroundTracking = location.isBackgroundTracking || false;
    const source = location.source || 'unknown';

    if (diffMinutes < 5) {
      return {
        status: isBackgroundTracking ? 'Online (BG)' : 'Online',
        color: 'text-green-800',
        bgColor: 'bg-green-100',
        icon: isBackgroundTracking ? '🌍' : '📍',
        description: isBackgroundTracking
          ? `Active with background tracking (${source})`
          : 'Active with foreground tracking'
      };
    } else if (diffMinutes < 30) {
      return {
        status: isBackgroundTracking ? 'Recent (BG)' : 'Recent',
        color: 'text-yellow-800',
        bgColor: 'bg-yellow-100',
        icon: isBackgroundTracking ? '🟡' : '🟠',
        description: isBackgroundTracking
          ? `Recently active with background tracking (${Math.round(diffMinutes)}m ago)`
          : `Recently active (${Math.round(diffMinutes)}m ago)`
      };
    } else {
      return {
        status: 'Offline',
        color: 'text-red-800',
        bgColor: 'bg-red-100',
        icon: '🔴',
        description: `Last seen ${Math.round(diffMinutes)}m ago${isBackgroundTracking ? ' (had background tracking)' : ''}`
      };
    }
  };

  const refreshLocations = () => {
    fetchUserLocations();
    setToast({ message: 'Locations refreshed', type: 'success' });
  };

  // Function to cycle through status options
  const cycleStatus = (currentStatus: string): string => {
    const statusOrder = ['present', 'absent', 'half_day'];
    const currentIndex = statusOrder.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % statusOrder.length;
    return statusOrder[nextIndex];
  };

  const updateAttendanceStatus = async (recordId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/admin/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recordId,
          newStatus
        })
      });

      if (response.ok) {
        setToast({ message: 'Attendance status updated successfully', type: 'success' });
        fetchAttendanceRecords(); // Refresh the records
        // Remove setEditingStatus since it's not defined and not needed
      } else {
        setToast({ message: 'Failed to update attendance status', type: 'error' });
      }
    } catch (error) {
      console.error('Error updating attendance status:', error);
      setToast({ message: 'Error updating attendance status', type: 'error' });
    }
  };

  // Function to handle double-click status change
  const handleStatusDoubleClick = (record: AttendanceRecord) => {
    const newStatus = cycleStatus(record.status);
    updateAttendanceStatus(record.id, newStatus);
  };

  // Function to delete attendance record
  const deleteAttendanceRecord = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/admin/delete-record`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ recordId })
      });

      if (response.ok) {
        setToast({ message: 'Attendance record deleted successfully', type: 'success' });
        fetchAttendanceRecords(); // Refresh the records
      } else {
        setToast({ message: 'Failed to delete attendance record', type: 'error' });
      }
    } catch (error) {
      console.error('Error deleting attendance record:', error);
      setToast({ message: 'Error deleting attendance record', type: 'error' });
    }
  };

  const calculateSalary = async () => {
    if (!salaryModal) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/admin/calculate-salary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: salaryModal.userId,
          monthlySalary: parseFloat(salaryData.monthlySalary),
          weeklyOffDays: salaryData.weeklyOffDays, // Array of day numbers
          month: salaryData.month || selectedDate.substring(0, 7), // YYYY-MM format
          additions: salaryData.additions,
          deductions: salaryData.deductions
        })
      });

      if (response.ok) {
        const data = await response.json();
        setToast({
          message: `Salary calculated: ₹${data.calculation.salary.totalEarnedSalary} (${data.calculation.totalWorkingDays} working days)`,
          type: 'success'
        });
        setSalaryModal(null);
        setSalaryData({ monthlySalary: '', weeklyOffDays: [], month: '', additions: [], deductions: [] });
        fetchStoredSalaries(); // Refresh stored salaries after calculation
      } else {
        setToast({ message: 'Failed to calculate salary', type: 'error' });
      }
    } catch (error) {
      console.error('Error calculating salary:', error);
      setToast({ message: 'Error calculating salary', type: 'error' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'absent':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'half_day':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'present':
        return '✅ Present';
      case 'absent':
        return '❌ Absent';
      case 'half_day':
        return '🟡 Half Day';
      default:
        return status;
    }
  };

  const addAddition = () => {
    const newAddition: SalaryAddition = {
      id: Date.now().toString(),
      description: '',
      amount: 0
    };
    updateSalaryData(prev => ({
      ...prev,
      additions: [...prev.additions, newAddition]
    }));
  };

  const removeAddition = (id: string) => {
    updateSalaryData(prev => ({
      ...prev,
      additions: prev.additions.filter(addition => addition.id !== id)
    }));
  };

  const updateAddition = (id: string, field: 'description' | 'amount', value: string | number) => {
    updateSalaryData(prev => ({
      ...prev,
      additions: prev.additions.map(addition =>
        addition.id === id ? { ...addition, [field]: value } : addition
      )
    }));
  };

  const addDeduction = () => {
    const newDeduction: SalaryDeduction = {
      id: Date.now().toString(),
      description: '',
      amount: 0
    };
    updateSalaryData(prev => ({
      ...prev,
      deductions: [...prev.deductions, newDeduction]
    }));
  };

  const removeDeduction = (id: string) => {
    updateSalaryData(prev => ({
      ...prev,
      deductions: prev.deductions.filter(deduction => deduction.id !== id)
    }));
  };

  const updateDeduction = (id: string, field: 'description' | 'amount', value: string | number) => {
    updateSalaryData(prev => ({
      ...prev,
      deductions: prev.deductions.map(deduction =>
        deduction.id === id ? { ...deduction, [field]: value } : deduction
      )
    }));
  };

  const toggleStoredSalaries = (userId: number) => {
    setShowStoredSalaries(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const handlePrintSlip = (salary: StoredSalaryCalculation) => {
    setPrintSlipModal(salary);
  };

  const fetchUserActivityLogs = async (userId: number) => {
    setActivityLoading(true);
    try {
      const user = users.find(u => u.id === userId);
      const userName = user?.name || 'Unknown';

      // Generate user-specific logs based on selected date and user ID
      const selectedDateObj = new Date(selectedDate);
      const baseTimestamp = selectedDateObj.getTime();

      // Create different activity patterns based on user ID
      const activityPatterns = {
        dashboard: ['Viewed dashboard', 'Checked notifications', 'Reviewed alerts'],
        attendance: ['Checked in', 'Checked out', 'Updated attendance status', 'Viewed attendance history'],
        profile: ['Updated profile information', 'Changed password', 'Updated contact details'],
        reports: ['Generated Employee Attendance Report', 'Downloaded Monthly Payroll Report', 'Viewed Sales Analytics Dashboard', 'Created Quarterly Performance Report', 'Exported Daily Activity Summary'],
        invoicing: ['Created new invoice', 'Updated invoice status', 'Sent invoice to client'],
        inventory: ['Updated stock levels', 'Added new product', 'Checked inventory status']
      };

      const pages = Object.keys(activityPatterns);
      const mockLogs: UserActivityLog[] = [];

      // Generate 3-8 random activities for the selected date
      const numActivities = 3 + (userId % 6); // Different number of activities per user

      for (let i = 0; i < numActivities; i++) {
        const randomPage = pages[Math.floor((userId * i + i) % pages.length)];
        const actions = activityPatterns[randomPage as keyof typeof activityPatterns];
        const randomAction = actions[Math.floor((userId + i) % actions.length)];

        // Generate timestamps throughout the selected date
        const hourOffset = 8 + (i * 2) + (userId % 3); // Start from 8 AM, spread throughout day
        const minuteOffset = (userId * 7 + i * 13) % 60; // Different minutes for each user
        const activityTimestamp = new Date(baseTimestamp + (hourOffset * 60 * 60 * 1000) + (minuteOffset * 60 * 1000));

        // Generate different IP addresses based on user ID
        const ipVariation = (userId % 50) + 100;
        const ipAddress = `192.168.1.${ipVariation}`;

        mockLogs.push({
          id: `${userId}_${i}`,
          userId: userId,
          userName: userName,
          page: randomPage.charAt(0).toUpperCase() + randomPage.slice(1),
          action: randomAction,
          timestamp: activityTimestamp.toISOString(),
          ipAddress: ipAddress
        });
      }

      // Sort logs by timestamp (newest first)
      mockLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      setUserActivityLogs(mockLogs);
    } catch (error) {
      console.error('Error fetching user activity logs:', error);
      setToast({ message: 'Failed to fetch user activity logs', type: 'error' });
    } finally {
      setActivityLoading(false);
    }
  };

  const handleUserActivityClick = async (userId: number, userName: string) => {
    setUserActivityModal({ userId, userName });
    await fetchUserActivityLogs(userId);
  };

  // Functions for managing salary slip visibility to users
  const getSalarySlipVisibilityKey = (userId: number, month: string) => {
    return `salary_slip_visible_${userId}_${month}`;
  };

  const toggleSalarySlipVisibility = (salary: StoredSalaryCalculation) => {
    const key = getSalarySlipVisibilityKey(salary.userId, salary.month);
    const newVisibility = !visibleSalarySlips[key];

    setVisibleSalarySlips(prev => ({
      ...prev,
      [key]: newVisibility
    }));

    // Save to localStorage
    localStorage.setItem(key, JSON.stringify(newVisibility));

    // Also send to backend to update user's visible salary slips
    updateUserSalarySlipVisibility(salary.userId, salary.month, newVisibility);
  };

  const updateUserSalarySlipVisibility = async (userId: number, month: string, isVisible: boolean) => {
    try {
      const response = await fetch(`${constants.baseURL}/api/attendance/admin/salary-slip-visibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userId, month, isVisible })
      });

      if (!response.ok) {
        throw new Error('Failed to update salary slip visibility');
      }
    } catch (error) {
      console.error('Error updating salary slip visibility:', error);
      setToast({ message: 'Failed to update salary slip visibility', type: 'error' });
    }
  };

  const loadSalarySlipVisibilityForSalaries = async (salaries: StoredSalaryCalculation[]) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/admin/salary-slip-visibility`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const backendVisibility = data.visibilityData || {};

        // Convert backend format to frontend format
        const visibility: { [key: string]: boolean } = {};
        salaries.forEach(salary => {
          const key = getSalarySlipVisibilityKey(salary.userId, salary.month);
          const backendKey = `${salary.userId}_${salary.month}`;

          // Check backend data first, then fall back to localStorage
          if (backendVisibility[backendKey] && backendVisibility[backendKey].isVisible) {
            visibility[key] = true;
            // Sync with localStorage
            localStorage.setItem(key, JSON.stringify(true));
          } else {
            // Check localStorage as fallback
            const saved = localStorage.getItem(key);
            if (saved) {
              visibility[key] = JSON.parse(saved);
            } else {
              visibility[key] = false;
            }
          }
        });

        setVisibleSalarySlips(visibility);
      } else {
        // Fallback to localStorage if API fails
        const visibility: { [key: string]: boolean } = {};
        salaries.forEach(salary => {
          const key = getSalarySlipVisibilityKey(salary.userId, salary.month);
          const saved = localStorage.getItem(key);
          if (saved) {
            visibility[key] = JSON.parse(saved);
          }
        });
        setVisibleSalarySlips(visibility);
      }
    } catch (error) {
      console.error('Error loading salary slip visibility:', error);
      // Fallback to localStorage if API fails
      const visibility: { [key: string]: boolean } = {};
      salaries.forEach(salary => {
        const key = getSalarySlipVisibilityKey(salary.userId, salary.month);
        const saved = localStorage.getItem(key);
        if (saved) {
          visibility[key] = JSON.parse(saved);
        }
      });
      setVisibleSalarySlips(visibility);
    }
  };

  const handleViewDocs = async (userId: number, userName: string, date: string) => {
    // Show loading state using toast or global loading if preferred, here we use toast for feedback
    // const loadingToastId = 'docs-loading'; 
    // We could use a toast here to indicate loading if network is slow

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/docs/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, date })
      });

      if (response.ok) {
        const data = await response.json();
        const docs = data.docs; // Accessing docs from response

        if (docs) {
          const items: { src: string; title: string }[] = [];
          if (docs.stockRegister) items.push({ src: docs.stockRegister, title: 'Physical Stock Register' });
          if (docs.cashBook) items.push({ src: docs.cashBook, title: 'Physical Cash Book' });
          if (docs.bankSlips && Array.isArray(docs.bankSlips)) {
            docs.bankSlips.forEach((s: string, i: number) => items.push({ src: s, title: `Bank Deposit Slip #${i + 1}` }));
          }

          if (items.length > 0) {
            openGallery(0, items);
          } else {
            setToast({ message: 'No documents uploaded for this date', type: 'error' });
          }
        } else {
          setToast({ message: 'No documents found', type: 'error' });
        }

      } else {
        setToast({ message: 'No documents found for this date', type: 'error' });
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      setToast({ message: 'Failed to fetch documents', type: 'error' });
    }
  };

  const handleSendMessageClick = (userId: number, userName: string) => {
    setMessageModal({ userId, userName });
    setMessageData({
      message: '',
      photoAttachment: null,
      photoPreview: null
    });
  };

  const handlePhotoAttachment = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setToast({ message: 'Photo size must be less than 5MB', type: 'error' });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        setMessageData(prev => ({
          ...prev,
          photoAttachment: file,
          photoPreview: e.target?.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhotoAttachment = () => {
    setMessageData(prev => ({
      ...prev,
      photoAttachment: null,
      photoPreview: null
    }));
  };

  const sendMessage = async () => {
    if (!messageModal || (!messageData.message.trim() && !messageData.photoAttachment)) {
      setToast({ message: 'Please enter a message or attach a photo', type: 'error' });
      return;
    }

    setSendingMessage(true);
    try {
      // Simulate API call with delay for realistic UX
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mock successful message sending
      // In a real implementation, this would send to the backend API
      const messagePayload = {
        recipientId: messageModal.userId,
        recipientName: messageModal.userName,
        message: messageData.message.trim(),
        photoAttachment: messageData.photoPreview || null, // Use the actual photo data URL
        sentAt: new Date().toISOString(),
        sentBy: user?.id || 0, // Use actual admin user ID from auth context
        isRead: false
      };

      // Store message in localStorage for demo purposes
      // In production, this would be handled by the backend
      const existingMessages = JSON.parse(localStorage.getItem('userMessages') || '[]');
      const newMessage = {
        id: Date.now().toString(),
        ...messagePayload
      };
      existingMessages.push(newMessage);
      localStorage.setItem('userMessages', JSON.stringify(existingMessages));

      // Manually trigger storage event for same-window notification updates
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'userMessages',
        newValue: JSON.stringify(existingMessages),
        storageArea: localStorage
      }));

      console.log('Message sent:', newMessage);

      setToast({ message: `Message sent to ${messageModal.userName} successfully!`, type: 'success' });
      setMessageModal(null);
      setMessageData({
        message: '',
        photoAttachment: null,
        photoPreview: null
      });
    } catch (error) {
      console.error('Error sending message:', error);
      setToast({ message: 'Failed to send message. Please try again.', type: 'error' });
    } finally {
      setSendingMessage(false);
    }
  };

  const loadSalarySlipVisibility = async () => {
    await loadSalarySlipVisibilityForSalaries(storedSalaries);
  };

  const printSalarySlip = () => {
    if (printSlipModal) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(generateSalarySlipHTML(printSlipModal));
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const generateSalarySlipHTML = (salary: StoredSalaryCalculation) => {
    const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weeklyOffDaysText = salary.weeklyOffDays.map(day => weekDays[day]).join(', ');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Salary Slip - ${salary.userName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .company-name { font-size: 24px; font-weight: bold; color: #333; }
          .slip-title { font-size: 18px; margin-top: 10px; }
          .employee-info { margin-bottom: 20px; }
          .salary-details { width: 100%; border-collapse: collapse; }
          .salary-details th, .salary-details td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .salary-details th { background-color: #f2f2f2; }
          .total-row { font-weight: bold; background-color: #e8f5e8; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">Your Company Name</div>
          <div class="slip-title">Salary Slip</div>
        </div>
        
        <div class="employee-info">
          <p><strong>Employee Name:</strong> ${salary.userName}</p>
          <p><strong>Month:</strong> ${salary.month}</p>
          <p><strong>Generated On:</strong> ${new Date().toLocaleDateString()}</p>
        </div>
        
        <table class="salary-details">
          <tr><th>Description</th><th>Days/Amount</th><th>Amount</th></tr>
          <tr><td>Monthly Salary</td><td>-</td><td>₹${salary.monthlySalary.toFixed(2)}</td></tr>
          <tr><td>Total Working Days</td><td>${salary.totalWorkingDays}</td><td>-</td></tr>
          <tr><td>Weekly Off Days</td><td>${weeklyOffDaysText} (${salary.weeklyOffDaysCount} days)</td><td>-</td></tr>
          <tr><td>Daily Salary</td><td>-</td><td>₹${salary.dailySalary.toFixed(2)}</td></tr>
          <tr><td colspan="3"><strong>Attendance Summary</strong></td></tr>
          <tr><td>Present Days</td><td>${salary.attendance.presentDays}</td><td>₹${salary.salary.presentDaysSalary.toFixed(2)}</td></tr>
          <tr><td>Half Days</td><td>${salary.attendance.halfDays}</td><td>₹${salary.salary.halfDaysSalary.toFixed(2)}</td></tr>
          <tr><td>Absent Days</td><td>${salary.attendance.absentDays}</td><td>-₹${salary.salary.absentDaysDeduction.toFixed(2)}</td></tr>
          ${salary.additions && salary.additions.length > 0 ? `
          <tr><td colspan="3"><strong>Additions</strong></td></tr>
          ${salary.additions.map(addition => `<tr><td>${addition.description}</td><td>-</td><td>+₹${addition.amount.toFixed(2)}</td></tr>`).join('')}` : ''}
          ${salary.deductions && salary.deductions.length > 0 ? `
          <tr><td colspan="3"><strong>Deductions</strong></td></tr>
          ${salary.deductions.map(deduction => `<tr><td>${deduction.description}</td><td>-</td><td>-₹${deduction.amount.toFixed(2)}</td></tr>`).join('')}` : ''}
          <tr><td><strong>Total Earned Salary</strong></td><td>-</td><td><strong>₹${salary.salary.totalEarnedSalary.toFixed(2)}</strong></td></tr>
          <tr class="total-row"><td><strong>Final Salary</strong></td><td>-</td><td><strong>₹${(salary.salary.finalSalary || salary.salary.totalEarnedSalary).toFixed(2)}</strong></td></tr>
        </table>
        
        <div class="footer">
          <p>This is a computer-generated salary slip.</p>
          <p>Calculated on: ${new Date(salary.calculatedAt).toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
  };

  if (!hasAccess('Admin')) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Access Denied
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title="Admin Attendance Portal | Ekta Enterprises"
        description="Admin portal to view all user attendance records and locations"
      />
      <PageBreadcrumb
        pageTitle="Admin Attendance Portal"
      />

      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Admin Attendance Portal
            </h1>
          </div>

          {/* Tab Navigation */}
          <div className="mb-6">
            <div className="border-b border-gray-200 dark:border-gray-700">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('attendance')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'attendance'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  📅 Attendance Records
                </button>
                <button
                  onClick={() => setActiveTab('locations')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'locations'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  📍 Live Locations
                </button>
              </nav>
            </div>
          </div>

          {/* Attendance Records Tab */}
          {activeTab === 'attendance' && (
            <>
              {/* Filters */}
              <div className="mb-6">
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select Date
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Filter by User
                    </label>
                    <select
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    >
                      <option value="">All Users</option>
                      {users.map(user => (
                        <option key={user.id} value={user.id.toString()}>
                          {user.name} {user.isAdmin ? '(admin)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Salary Management Buttons */}
                  <div className="flex flex-col space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Salary Management
                    </label>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          if (selectedUser) {
                            const user = users.find(u => u.id.toString() === selectedUser);
                            if (user) {
                              setSalaryModal({ userId: user.id, userName: user.name });
                              // Load persisted data for the current month
                              const currentMonth = selectedDate.substring(0, 7);
                              const persistedData = loadSalaryDataFromStorage(user.id, currentMonth);
                              if (persistedData) {
                                setSalaryData(persistedData);
                              } else {
                                // Reset to default values with current month
                                setSalaryData({
                                  monthlySalary: '',
                                  weeklyOffDays: [],
                                  month: currentMonth,
                                  additions: [],
                                  deductions: []
                                });
                              }
                            }
                          } else {
                            setToast({ message: 'Please select a user first', type: 'error' });
                          }
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center space-x-1"
                      >
                        <span>💰</span>
                        <span>Calculate Salary</span>
                      </button>
                      <button
                        onClick={() => {
                          if (selectedUser) {
                            const userId = parseInt(selectedUser);
                            toggleStoredSalaries(userId);
                          } else {
                            setToast({ message: 'Please select a user first', type: 'error' });
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center space-x-1"
                      >
                        <span>📊</span>
                        <span>View History</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Salary History Display */}
              {selectedUser && showStoredSalaries[parseInt(selectedUser)] && (
                <div className="mb-6 bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                      Salary History for {users.find(u => u.id.toString() === selectedUser)?.name}
                    </h4>
                    {storedSalaries
                      .filter(salary => salary.userId === parseInt(selectedUser))
                      .length === 0 ? (
                      <p className="text-gray-500 dark:text-gray-400 text-sm">
                        No salary calculations found for this user.
                      </p>
                    ) : (
                      <div className="grid gap-3">
                        {storedSalaries
                          .filter(salary => salary.userId === parseInt(selectedUser))
                          .sort((a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime())
                          .map((salary) => (
                            <div key={salary.id} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h5 className="font-medium text-gray-900 dark:text-white">
                                    {salary.month}
                                  </h5>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Calculated: {new Date(salary.calculatedAt).toLocaleString()}
                                  </p>
                                </div>
                                <div className="flex flex-col gap-2">
                                  <button
                                    onClick={() => handlePrintSlip(salary)}
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded-md transition-colors"
                                  >
                                    🖨️ Print Slip
                                  </button>
                                  <div className="flex items-center gap-2">
                                    <label className="flex items-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={visibleSalarySlips[getSalarySlipVisibilityKey(salary.userId, salary.month)] || false}
                                        onChange={() => toggleSalarySlipVisibility(salary)}
                                        className="sr-only"
                                      />
                                      <div className={`relative w-10 h-5 rounded-full transition-colors ${visibleSalarySlips[getSalarySlipVisibilityKey(salary.userId, salary.month)]
                                        ? 'bg-blue-600'
                                        : 'bg-gray-300 dark:bg-gray-600'
                                        }`}>
                                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${visibleSalarySlips[getSalarySlipVisibilityKey(salary.userId, salary.month)]
                                          ? 'translate-x-5'
                                          : 'translate-x-0'
                                          }`}></div>
                                      </div>
                                      <span className="ml-2 text-xs text-gray-700 dark:text-gray-300">
                                        Show salary slip to user
                                      </span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Monthly Salary:</span>
                                  <p className="font-medium text-gray-900 dark:text-white">₹{salary.monthlySalary.toFixed(2)}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Present Days:</span>
                                  <p className="font-medium text-gray-900 dark:text-white">{salary.attendance.presentDays}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Half Days:</span>
                                  <p className="font-medium text-gray-900 dark:text-white">{salary.attendance.halfDays}</p>
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Final Salary:</span>
                                  <p className="font-medium text-green-600 dark:text-green-400">₹{(salary.salary.finalSalary || salary.salary.totalEarnedSalary).toFixed(2)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Loading State */}
              {loading && (
                <div className="text-center py-8">
                  <PulseLoadAnimation size="md" />
                  <p className="text-gray-600 dark:text-gray-400 mt-4">Loading attendance records...</p>
                </div>
              )}

              {/* Attendance Records Table */}
              {!loading && (
                <>
                  {attendanceRecords.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="text-gray-400 text-6xl mb-4">📅</div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        No Attendance Records Found
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        No attendance records found for {formatDate(selectedDate)}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Showing {attendanceRecords.length} record(s) for {formatDate(selectedDate)}
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                            <tr>
                              <th scope="col" className="px-6 py-3">User</th>
                              <th scope="col" className="px-6 py-3">Date</th>
                              <th scope="col" className="px-6 py-3">Time</th>
                              <th scope="col" className="px-6 py-3">Status</th>
                              <th scope="col" className="px-6 py-3">Location</th>
                              <th scope="col" className="px-6 py-3">Selfie</th>
                              <th scope="col" className="px-6 py-3">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attendanceRecords.map((record) => (
                              <React.Fragment key={record.id}>
                                <tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                    <button
                                      onClick={() => handleUserActivityClick(record.userId, record.userName)}
                                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline transition-colors duration-200 text-left font-medium"
                                    >
                                      {record.userName}
                                    </button>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      ID: {record.userId}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    {formatDate(record.date)}
                                  </td>
                                  <td className="px-6 py-4">
                                    {record.time}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span
                                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(record.status)}`}
                                      onDoubleClick={() => handleStatusDoubleClick(record)}
                                      title="Double-click to change status"
                                    >
                                      {getStatusText(record.status)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-xs font-mono">
                                      {getLocationString(record.location)}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <button
                                      onClick={() => openGallery(0, [{ src: record.selfieData, title: 'Attendance Selfie' }])}
                                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                                    >
                                      📷 View
                                    </button>
                                  </td>

                                  <td className="px-6 py-4">
                                    <div className="flex space-x-2">
                                      {users.find(u => u.id === record.userId)?.requireMandatoryDocs && (
                                        <button
                                          onClick={() => handleViewDocs(record.userId, record.userName, record.date)}
                                          className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-medium transition-colors"
                                          title="View mandatory documents"
                                        >
                                          📄 View Docs
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleSendMessageClick(record.userId, record.userName)}
                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
                                        title="Send message to user"
                                      >
                                        💬 Message
                                      </button>
                                      <button
                                        onClick={() => openLocationInMaps(record.location.latitude, record.location.longitude)}
                                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 font-medium"
                                      >
                                        🗺️ Maps
                                      </button>
                                      <button
                                        onClick={() => deleteAttendanceRecord(record.id)}
                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
                                        title="Delete attendance record"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* Live Locations Tab */}
          {activeTab === 'locations' && (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Real-time User Locations
                </h2>
                <button
                  onClick={refreshLocations}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  🔄 Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                    <tr>
                      <th scope="col" className="px-6 py-3">User</th>
                      <th scope="col" className="px-6 py-3">Status</th>
                      <th scope="col" className="px-6 py-3">Current Location</th>
                      <th scope="col" className="px-6 py-3">Last Updated</th>
                      <th scope="col" className="px-6 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userLocations.map((location) => {
                      const status = getLocationStatus(location);
                      return (
                        <tr key={location.userId} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                          <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                            <button
                              onClick={() => handleUserActivityClick(location.userId, location.userName)}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline transition-colors duration-200 text-left font-medium"
                            >
                              {location.userName}
                            </button>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              ID: {location.userId}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col space-y-1">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}>
                                <span className="mr-1">{status.icon}</span>
                                {status.status}
                              </span>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {status.description}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {location.currentLocation ? (
                              <span className="text-xs font-mono">
                                {location.currentLocation.latitude.toFixed(6)}, {location.currentLocation.longitude.toFixed(6)}
                              </span>
                            ) : (
                              <span className="text-gray-400">No location data</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {new Date(location.lastUpdated).toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            {location.currentLocation && (
                              <button
                                onClick={() => openLocationInMaps(location.currentLocation!.latitude, location.currentLocation!.longitude)}
                                className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 font-medium"
                              >
                                🗺️ View on Maps
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Salary Calculation Modal */}
      {salaryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Calculate Salary - {salaryModal.userName}
                </h3>
                <button
                  onClick={() => {
                    setSalaryModal(null);
                    setSalaryData({ monthlySalary: '', weeklyOffDays: [], month: '', additions: [], deductions: [] });
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monthly Salary (₹)
                  </label>
                  <input
                    type="number"
                    value={salaryData.monthlySalary}
                    onChange={(e) => updateSalaryData({ ...salaryData, monthlySalary: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                    placeholder="Enter monthly salary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Weekly Off Days
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                      <label key={day} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={salaryData.weeklyOffDays.includes(index)}
                          onChange={(e) => {
                            const updatedDays = e.target.checked
                              ? [...salaryData.weeklyOffDays, index]
                              : salaryData.weeklyOffDays.filter(d => d !== index);
                            updateSalaryData({ ...salaryData, weeklyOffDays: updatedDays });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                        />
                        <span className="text-gray-700 dark:text-gray-300">{day}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Month (YYYY-MM)
                  </label>
                  <input
                    type="month"
                    value={salaryData.month || selectedDate.substring(0, 7)}
                    max={getIndianMonth()}
                    onChange={(e) => {
                      const newMonth = e.target.value;
                      if (salaryModal && salaryModal.userId) {
                        const persistedData = loadSalaryDataFromStorage(salaryModal.userId, newMonth);
                        if (persistedData) {
                          setSalaryData(persistedData);
                        } else {
                          updateSalaryData({ ...salaryData, month: newMonth });
                        }
                      } else {
                        updateSalaryData({ ...salaryData, month: newMonth });
                      }
                    }}
                    className="w-full bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                  />
                </div>

                {/* Additions Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Additions
                    </label>
                    <button
                      type="button"
                      onClick={addAddition}
                      className="text-green-600 hover:text-green-700 text-sm font-medium"
                    >
                      + Add
                    </button>
                  </div>
                  {salaryData.additions.map((addition) => (
                    <div key={addition.id} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={addition.description}
                        onChange={(e) => updateAddition(addition.id, 'description', e.target.value)}
                        placeholder="Description"
                        className="flex-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                      />
                      <input
                        type="number"
                        value={addition.amount}
                        onChange={(e) => updateAddition(addition.id, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="Amount"
                        className="w-24 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => removeAddition(addition.id)}
                        className="text-red-600 hover:text-red-700 px-2"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* Deductions Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Deductions
                    </label>
                    <button
                      type="button"
                      onClick={addDeduction}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      + Add
                    </button>
                  </div>
                  {salaryData.deductions.map((deduction) => (
                    <div key={deduction.id} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={deduction.description}
                        onChange={(e) => updateDeduction(deduction.id, 'description', e.target.value)}
                        placeholder="Description"
                        className="flex-1 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                      />
                      <input
                        type="number"
                        value={deduction.amount}
                        onChange={(e) => updateDeduction(deduction.id, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="Amount"
                        className="w-24 bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={() => removeDeduction(deduction.id)}
                        className="text-red-600 hover:text-red-700 px-2"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <p>Calculation will be based on:</p>
                  <ul className="list-disc list-inside mt-1">
                    <li>Attendance records for {salaryData.month || selectedDate.substring(0, 7)}</li>
                    <li>Present days = Full pay</li>
                    <li>Half days = 50% pay</li>
                    <li>Absent days = No pay</li>
                  </ul>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setSalaryModal(null);
                    setSalaryData({ monthlySalary: '', weeklyOffDays: [], month: '', additions: [], deductions: [] });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={calculateSalary}
                  disabled={!salaryData.monthlySalary || salaryData.weeklyOffDays.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-lg"
                >
                  Calculate Salary
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {/* Gallery Modal */}
      {galleryState.isOpen && (
        <div className="fixed inset-0 bg-black/95 flex flex-col z-50">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
            <h3 className="text-lg font-semibold text-white px-2">
              {galleryState.items[galleryState.currentIndex]?.title}
              <span className="ml-2 text-sm font-normal text-gray-300">
                ({galleryState.currentIndex + 1} / {galleryState.items.length})
              </span>
            </h3>
            <button
              onClick={closeGallery}
              className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              ✕ Close
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex items-center justify-center overflow-hidden relative p-4">
            {/* Navigation Buttons */}
            {galleryState.items.length > 1 && (
              <>
                <button
                  onClick={() => {
                    setGalleryState(prev => ({
                      ...prev,
                      currentIndex: (prev.currentIndex - 1 + prev.items.length) % prev.items.length
                    }));
                    setZoom(1);
                    setRotation(0);
                  }}
                  className="absolute left-4 z-20 text-white/50 hover:text-white p-4 rounded-full hover:bg-white/10 transition-colors text-4xl"
                  disabled={galleryState.items.length <= 1}
                >
                  ‹
                </button>
                <button
                  onClick={() => {
                    setGalleryState(prev => ({
                      ...prev,
                      currentIndex: (prev.currentIndex + 1) % prev.items.length
                    }));
                    setZoom(1);
                    setRotation(0);
                  }}
                  className="absolute right-4 z-20 text-white/50 hover:text-white p-4 rounded-full hover:bg-white/10 transition-colors text-4xl"
                  disabled={galleryState.items.length <= 1}
                >
                  ›
                </button>
              </>
            )}

            {/* Image */}
            <div
              className="relative transition-transform duration-200 ease-out will-change-transform"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            >
              <img
                src={galleryState.items[galleryState.currentIndex]?.src}
                alt={galleryState.items[galleryState.currentIndex]?.title}
                className="max-h-[85vh] max-w-[90vw] object-contain shadow-2xl"
                draggable={false}
              />
            </div>
          </div>

          {/* Controls Toolbar */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-gray-900/90 backdrop-blur-md rounded-full px-6 py-3 flex items-center space-x-6 shadow-2xl border border-white/10 z-20">
            <div className="flex items-center space-x-2 border-r border-white/20 pr-4">
              <button
                onClick={() => setZoom(z => Math.max(0.2, z - 0.2))}
                className="text-white hover:text-blue-400 transition-colors p-2 text-xl"
                title="Zoom Out (-)"
              >
                −
              </button>
              <span className="text-white/80 w-12 text-center text-sm tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(4, z + 0.2))}
                className="text-white hover:text-blue-400 transition-colors p-2 text-xl"
                title="Zoom In (+)"
              >
                +
              </button>
            </div>

            <button
              onClick={() => setRotation(r => r + 90)}
              className="text-white hover:text-blue-400 transition-colors p-2 flex items-center gap-2"
              title="Rotate 90°"
            >
              <span className="text-xl">↻</span>
              <span className="text-sm">Rotate</span>
            </button>

            <button
              onClick={() => {
                setZoom(1);
                setRotation(0);
              }}
              className="text-white hover:text-blue-400 transition-colors p-2 text-sm border-l border-white/20 pl-4"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Print Slip Modal */}
      {printSlipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl max-h-full overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  🖨️ Print Salary Slip - {printSlipModal.userName}
                </h3>
                <button
                  onClick={() => setPrintSlipModal(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
                >
                  ✕
                </button>
              </div>

              {/* Salary Slip Preview */}
              <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg mb-6">
                <div className="text-center border-b-2 border-gray-300 pb-4 mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Your Company Name</h2>
                  <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">Salary Slip</p>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Employee Name:</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{printSlipModal.userName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Month:</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{printSlipModal.month}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Generated On:</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{new Date().toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Calculated On:</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{new Date(printSlipModal.calculatedAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                    <thead>
                      <tr className="bg-gray-200 dark:bg-gray-700">
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-900 dark:text-white">Description</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-900 dark:text-white">Days/Count</th>
                        <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-900 dark:text-white">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">Monthly Salary</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">-</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-900 dark:text-white">₹{printSlipModal.monthlySalary.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">Total Working Days</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">{printSlipModal.totalWorkingDays}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-900 dark:text-white">-</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">Daily Salary</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">-</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-900 dark:text-white">₹{printSlipModal.dailySalary.toFixed(2)}</td>
                      </tr>
                      <tr className="bg-gray-100 dark:bg-gray-800">
                        <td colSpan={3} className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-semibold text-gray-900 dark:text-white">Attendance Summary</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">Present Days</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">{printSlipModal.attendance.presentDays}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-900 dark:text-white">₹{printSlipModal.salary.presentDaysSalary.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">Half Days</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">{printSlipModal.attendance.halfDays}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-900 dark:text-white">₹{printSlipModal.salary.halfDaysSalary.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">Absent Days</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">{printSlipModal.attendance.absentDays}</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-red-600 dark:text-red-400">-₹{printSlipModal.salary.absentDaysDeduction.toFixed(2)}</td>
                      </tr>
                      <tr className="bg-gray-100 dark:bg-gray-800">
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-bold text-gray-900 dark:text-white">Total Earned Salary</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">-</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right font-bold text-gray-900 dark:text-white">₹{printSlipModal.salary.totalEarnedSalary.toFixed(2)}</td>
                      </tr>
                      {printSlipModal.additions && printSlipModal.additions.length > 0 && (
                        <>
                          <tr className="bg-gray-100 dark:bg-gray-800">
                            <td colSpan={3} className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-semibold text-gray-900 dark:text-white">Additions</td>
                          </tr>
                          {printSlipModal.additions.map((addition, index) => (
                            <tr key={index}>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">{addition.description}</td>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">-</td>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-green-600 dark:text-green-400">+₹{addition.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </>
                      )}
                      {printSlipModal.deductions && printSlipModal.deductions.length > 0 && (
                        <>
                          <tr className="bg-gray-100 dark:bg-gray-800">
                            <td colSpan={3} className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-semibold text-gray-900 dark:text-white">Deductions</td>
                          </tr>
                          {printSlipModal.deductions.map((deduction, index) => (
                            <tr key={index}>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">{deduction.description}</td>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">-</td>
                              <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-red-600 dark:text-red-400">-₹{deduction.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </>
                      )}
                      <tr className="bg-green-100 dark:bg-green-900">
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 font-bold text-gray-900 dark:text-white">Final Salary</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-white">-</td>
                        <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right font-bold text-green-600 dark:text-green-400">₹{(printSlipModal.salary.finalSalary || printSlipModal.salary.totalEarnedSalary).toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="text-center mt-6 text-sm text-gray-600 dark:text-gray-400">
                  <p>This is a computer-generated salary slip.</p>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setPrintSlipModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
                >
                  Close
                </button>
                <button
                  onClick={printSalarySlip}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg"
                >
                  🖨️ Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Activity Modal */}
      {userActivityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  👤 User Activity - {userActivityModal.userName}
                </h3>
                <button
                  onClick={() => {
                    setUserActivityModal(null);
                    setUserActivityLogs([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter:</span>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Filter logs for today
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const filteredLogs = userActivityLogs.filter(log => {
                          const logDate = new Date(log.timestamp);
                          return logDate >= today;
                        });
                        setUserActivityLogs(filteredLogs);
                      } else {
                        // Reset filter by refetching all logs
                        fetchUserActivityLogs(userActivityModal.userId);
                      }
                    }}
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Today</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Filter logs for last week
                        const lastWeek = new Date();
                        lastWeek.setDate(lastWeek.getDate() - 7);
                        const filteredLogs = userActivityLogs.filter(log => {
                          const logDate = new Date(log.timestamp);
                          return logDate >= lastWeek;
                        });
                        setUserActivityLogs(filteredLogs);
                      } else {
                        // Reset filter by refetching all logs
                        fetchUserActivityLogs(userActivityModal.userId);
                      }
                    }}
                  />
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Last Week</span>
                </label>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {activityLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <PulseLoadAnimation size="sm" />
                    <span className="ml-3 text-gray-600 dark:text-gray-400">Loading activity logs...</span>
                  </div>
                ) : userActivityLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 text-6xl mb-4">📋</div>
                    <p className="text-gray-500 dark:text-gray-400">No activity logs found for this user.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {userActivityLogs.map((log) => (
                      <div key={log.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-l-4 border-blue-500">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                                {log.page}
                              </span>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {log.action}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              🕒 {new Date(log.timestamp).toLocaleString()}
                            </p>
                            {log.ipAddress && (
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                🌐 IP: {log.ipAddress}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            {(() => {
                              const now = new Date();
                              const logTime = new Date(log.timestamp);
                              const diffMs = now.getTime() - logTime.getTime();
                              const diffMins = Math.floor(diffMs / (1000 * 60));
                              const diffHours = Math.floor(diffMins / 60);
                              const diffDays = Math.floor(diffHours / 24);

                              if (diffMins < 1) return 'Just now';
                              if (diffMins < 60) return `${diffMins}m ago`;
                              if (diffHours < 24) return `${diffHours}h ago`;
                              return `${diffDays}d ago`;
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => {
                    setUserActivityModal(null);
                    setUserActivityLogs([]);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Message Modal */}
      {messageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  💬 Send Message to {messageModal.userName}
                </h3>
                <button
                  onClick={() => {
                    setMessageModal(null);
                    setMessageData({ message: '', photoAttachment: null, photoPreview: null });
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {/* Message Text Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Message
                  </label>
                  <textarea
                    value={messageData.message}
                    onChange={(e) => setMessageData(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Type your message here..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-blue-400 resize-none"
                  />
                </div>

                {/* Photo Attachment */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Photo Attachment (Optional)
                  </label>

                  {messageData.photoPreview ? (
                    <div className="relative">
                      <img
                        src={messageData.photoPreview}
                        alt="Photo preview"
                        className="w-full h-32 object-cover rounded-lg border border-gray-300 dark:border-gray-600"
                      />
                      <button
                        onClick={removePhotoAttachment}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm transition-colors"
                        title="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoAttachment}
                        className="hidden"
                        id="photo-upload"
                      />
                      <label
                        htmlFor="photo-upload"
                        className="cursor-pointer flex flex-col items-center space-y-2"
                      >
                        <div className="text-gray-400 text-2xl">📷</div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Click to attach a photo
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-500">
                          Max size: 5MB
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setMessageModal(null);
                      setMessageData({ message: '', photoAttachment: null, photoPreview: null });
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500 transition-colors"
                    disabled={sendingMessage}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={sendingMessage || (!messageData.message.trim() && !messageData.photoAttachment)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                  >
                    {sendingMessage ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <span>📤</span>
                        <span>Send Message</span>
                      </>
                    )}
                  </button>
                </div>
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

export default AdminAttendance;