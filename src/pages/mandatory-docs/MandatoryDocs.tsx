import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import constants from '../../constants';
import Toast from '../../components/ui/toast/Toast';
import PageMeta from '../../components/common/PageMeta';
import { ChevronLeft, ChevronRight, Upload, X, Plus, Trash2 } from 'lucide-react';

interface AttendanceRecord {
  date: string;
  status: 'present' | 'absent';
}

type DocType = 'stockRegister' | 'cashBook' | 'bankSlip';

interface DayDocs {
  date: string;
  stockRegister?: string;
  cashBook?: string;
  bankSlips: string[];
}

const MandatoryDocs: React.FC = () => {
  const { user, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Data State
  const [requiredDays, setRequiredDays] = useState<string[]>([]);
  const [docsByDay, setDocsByDay] = useState<Record<string, DayDocs>>({});
  
  // UI State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Camera State
  const [isCapturing, setIsCapturing] = useState(false);
  const [activeCapture, setActiveCapture] = useState<{ date: string; type: DocType; index?: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
    }
  }, [loading, isAuthenticated, navigate]);

  const getISTDate = (d: Date) => {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(d.getTime() + istOffset);
    return istTime.toISOString().split('T')[0];
  };

  const fetchAttendanceHistory = async (): Promise<AttendanceRecord[]> => {
    try {
      const token = localStorage.getItem('token');
      const now = new Date();
      // Fetch history for current and previous month to be safe for 14 day lookback
      const currentMonthStr = (now.getMonth() + 1).toString().padStart(2, '0');
      const currentYear = now.getFullYear().toString();
      
      const prevDate = new Date();
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevMonthStr = (prevDate.getMonth() + 1).toString().padStart(2, '0');
      const prevYear = prevDate.getFullYear().toString();

      const [currRes, prevRes] = await Promise.all([
        fetch(`${constants.baseURL}/api/attendance/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userId: user?.id, month: currentMonthStr, year: currentYear })
        }),
        fetch(`${constants.baseURL}/api/attendance/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ userId: user?.id, month: prevMonthStr, year: prevYear })
        })
      ]);

      let records: any[] = [];
      if (currRes.ok) {
        const data = await currRes.json();
        records = [...records, ...(data.records || [])];
      }
      if (prevRes.ok) {
        const data = await prevRes.json();
        records = [...records, ...(data.records || [])];
      }
      
      return records.map((r: any) => ({ date: r.date, status: r.status }));
    } catch {
      return [];
    }
  };

  const computeRequiredDays = async () => {
    const today = getISTDate(new Date());

    // Check for explicit "From Date" requirement first
    if (user?.requireMandatoryDocs && user?.mandatoryDocsFromDate) {
      const fromDate = new Date(user.mandatoryDocsFromDate);
      const toDate = new Date(); // Today
      const datesToCheck: string[] = [];
      
      // Create date loop
      const current = new Date(fromDate);
      while (current <= toDate) {
         datesToCheck.push(getISTDate(new Date(current)));
         current.setDate(current.getDate() + 1);
      }
      
      if (datesToCheck.length === 0) {
        setRequiredDays([]);
        return;
      }

      // Check status from server
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${constants.baseURL}/api/docs/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ userId: user.id, dates: datesToCheck })
        });
        
        if (response.ok) {
          const data = await response.json();
          // Filter out dates that are already submitted (true in status)
          // Also filter out future dates just in case
          const pendingDays = datesToCheck.filter(date => {
             // specific date status check
             if (data.status && data.status[date]) return false; // Already submitted
             
             // Don't require future dates (though loop shouldn't go there)
             if (date > today) return false;
             
             return true;
          });
          
          setRequiredDays(pendingDays);
          
          // Initialize doc state for pending days
           setDocsByDay(prev => {
              const next = { ...prev };
              pendingDays.forEach(date => {
                if (!next[date]) {
                  next[date] = { date, bankSlips: [] };
                }
              });
              return next;
            });
          return;
        }
      } catch (e) {
        console.error('Failed to check doc status', e);
        // Fallback or show error? For now, if error, maybe don't block everything.
      }
    }

    const history = await fetchAttendanceHistory();
    const presentDates = new Set(history.filter(h => h.status === 'present').map(h => h.date));
    
    const days: string[] = [];
    days.push(today); // Today is always required if not marked (but we are here usually because it's required)
    
    // Look back 14 days
    let back = 1;
    while (back <= 14) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      const dateStr = getISTDate(d);
      if (!presentDates.has(dateStr)) {
        days.push(dateStr);
      } else {
        // Break sequence if present? The requirement was "if user doesnt logged in from 2-days then he has to upload docs for both"
        // Usually this means consecutive absence. 
        // But let's stick to the previous logic: break on first present found?
        // "if user doesnt logged in from 2-days" implies consecutive.
        break; 
      }
      back++;
    }
    
    const uniqueDays = Array.from(new Set(days)).sort();
    setRequiredDays(uniqueDays);
    
    // Initialize doc state for these days
    setDocsByDay(prev => {
      const next = { ...prev };
      uniqueDays.forEach(date => {
        if (!next[date]) {
          next[date] = { date, bankSlips: [] };
        }
      });
      return next;
    });
  };

  useEffect(() => {
    if (user && isAuthenticated) {
      computeRequiredDays();
    }
  }, [user, isAuthenticated]);

  // --- Calendar Logic ---
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sunday
    
    const days = [];
    // Padding for previous month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const isDateRequired = (dateStr: string) => requiredDays.includes(dateStr);
  
  const isDateCompleted = (dateStr: string) => {
    const day = docsByDay[dateStr];
    if (!day) return false;
    const hasBank = Array.isArray(day.bankSlips) && day.bankSlips.some(s => !!s);
    return !!day.stockRegister && !!day.cashBook && hasBank;
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDayClick = (date: Date) => {
    const dateStr = getISTDate(date);
    if (isDateRequired(dateStr)) {
      setSelectedDate(dateStr);
    }
  };

  // --- Camera Logic ---
  const startCamera = async (date: string, type: DocType, index?: number) => {
    setActiveCapture({ date, type, index });
    setIsCapturing(true);
    setIsVideoReady(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        setIsVideoReady(true);
      }
    } catch (e) {
      setToast({ message: 'Camera access failed. Please allow camera permissions.', type: 'error' });
      setIsCapturing(false);
      setIsVideoReady(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    setStream(null);
    setIsCapturing(false);
    setIsVideoReady(false);
    setActiveCapture(null);
  };

  const capturePhoto = () => {
    if (!isVideoReady || !videoRef.current || !canvasRef.current || !activeCapture) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0);
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const { date, type, index } = activeCapture;
    
    setDocsByDay(prev => {
      const day = { ...(prev[date] || { date, bankSlips: [] }) };
      if (type === 'stockRegister') day.stockRegister = imageData;
      if (type === 'cashBook') day.cashBook = imageData;
      if (type === 'bankSlip') {
        const slips = [...(day.bankSlips || [])];
        if (typeof index === 'number' && index >= 0) {
          slips[index] = imageData;
        } else {
          slips.push(imageData);
        }
        day.bankSlips = slips;
      }
      return { ...prev, [date]: day };
    });
    stopCamera();
  };

  const addBankSlipRow = (date: string) => {
    setDocsByDay(prev => {
      const day = { ...(prev[date] || { date, bankSlips: [] }) };
      day.bankSlips = [...(day.bankSlips || []), ''];
      return { ...prev, [date]: day };
    });
  };

  const removeBankSlipRow = (date: string, index: number) => {
    setDocsByDay(prev => {
      const day = { ...(prev[date] || { date, bankSlips: [] }) };
      const newSlips = [...day.bankSlips];
      newSlips.splice(index, 1);
      day.bankSlips = newSlips;
      return { ...prev, [date]: day };
    });
  };

  // --- Submission Logic ---
  const validateAll = () => {
    for (const date of requiredDays) {
      if (!isDateCompleted(date)) return false;
    }
    return true;
  };

  const submitAll = async () => {
    if (!user) return;
    if (!validateAll()) {
      setToast({ message: 'Please upload all required documents for each highlighted day.', type: 'error' });
      return;
    }
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        userId: user.id,
        days: requiredDays.map(date => ({
          date,
          stockRegister: docsByDay[date].stockRegister,
          cashBook: docsByDay[date].cashBook,
          bankSlips: docsByDay[date].bankSlips.filter(s => !!s)
        }))
      };
      const response = await fetch(`${constants.baseURL}/api/docs/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        setToast({ message: 'Failed to submit documents.', type: 'error' });
        setIsSubmitting(false);
        return;
      }
      setToast({ message: 'Documents submitted successfully.', type: 'success' });
      setTimeout(() => {
        navigate('/account-master');
      }, 800);
    } catch {
      setToast({ message: 'Submission error occurred.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;

  const days = getDaysInMonth(currentMonth);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <PageMeta title="Mandatory Docs" description="Upload mandatory documents" />
      
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mandatory Documents</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">Select highlighted days to upload documents</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <button onClick={handlePrevMonth} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <span className="text-lg font-semibold text-gray-900 dark:text-white min-w-[140px] text-center">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            {weekDays.map(day => (
              <div key={day} className="py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 auto-rows-fr">
            {days.map((date, idx) => {
              if (!date) return <div key={`empty-${idx}`} className="h-24 md:h-32 bg-gray-50/30 dark:bg-gray-900/30 border-b border-r border-gray-100 dark:border-gray-700/50" />;
              
              const dateStr = getISTDate(date);
              const isRequired = isDateRequired(dateStr);
              const isCompleted = isRequired && isDateCompleted(dateStr);
              const isToday = dateStr === getISTDate(new Date());
              
              return (
                <div 
                  key={dateStr}
                  onClick={() => isRequired && handleDayClick(date)}
                  className={`
                    relative h-24 md:h-32 border-b border-r border-gray-100 dark:border-gray-700/50 p-2 transition-all
                    ${isRequired 
                      ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50' 
                      : 'opacity-50 cursor-default'}
                    ${isCompleted ? 'bg-green-50/50 dark:bg-green-900/10' : ''}
                    ${isRequired && !isCompleted ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                  `}
                >
                  <div className={`
                    inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium mb-2
                    ${isToday 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-gray-700 dark:text-gray-300'}
                  `}>
                    {date.getDate()}
                  </div>
                  
                  {isRequired && (
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className={`
                        text-xs px-2 py-1 rounded-md font-medium text-center truncate
                        ${isCompleted 
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}
                      `}>
                        {isCompleted ? 'Completed' : 'Pending'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={submitAll}
            disabled={isSubmitting || requiredDays.length === 0}
            className={`
              px-6 py-3 rounded-lg font-medium text-white shadow-sm transition-all
              ${isSubmitting || requiredDays.length === 0
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-brand-600 hover:bg-brand-700 hover:shadow-md'}
            `}
          >
            {isSubmitting ? 'Submitting...' : `Submit ${requiredDays.length} Days`}
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Upload Documents</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedDate}</p>
              </div>
              <button 
                onClick={() => setSelectedDate(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Document Rows */}
              {[
                { label: 'Physical Stock Register', key: 'stockRegister', type: 'stockRegister' as DocType },
                { label: 'Physical Cash Book', key: 'cashBook', type: 'cashBook' as DocType }
              ].map(doc => {
                const day = docsByDay[selectedDate] || { date: selectedDate, bankSlips: [] };
                const hasImage = !!day[doc.key as keyof DayDocs];
                
                return (
                  <div key={doc.key} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <label className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                        {doc.label}
                        {hasImage && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Uploaded</span>}
                      </label>
                      <button
                        onClick={() => startCamera(selectedDate, doc.type)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        {hasImage ? 'Retake' : 'Upload'}
                      </button>
                    </div>
                    {hasImage && (
                      <div className="relative aspect-video w-full max-w-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100">
                        <img 
                          src={day[doc.key as keyof DayDocs] as string} 
                          alt={doc.label}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Bank Slips Section */}
              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <label className="font-medium text-gray-900 dark:text-white">Bank Deposit Slips</label>
                  <button
                    onClick={() => addBankSlipRow(selectedDate)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Slip
                  </button>
                </div>
                
                <div className="space-y-4">
                  {((docsByDay[selectedDate]?.bankSlips?.length ? docsByDay[selectedDate].bankSlips : [''])).map((slip, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-500">Slip #{idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startCamera(selectedDate, 'bankSlip', idx)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Upload"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                          {idx > 0 && (
                            <button
                              onClick={() => removeBankSlipRow(selectedDate, idx)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {slip ? (
                        <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100">
                          <img src={slip} alt={`Slip ${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-400 text-sm">
                          No image uploaded
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => setSelectedDate(null)}
                className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Modal */}
      {isCapturing && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-black rounded-xl overflow-hidden shadow-2xl">
            <div className="absolute top-4 left-0 right-0 text-center z-10">
              <span className="bg-black/50 text-white px-3 py-1 rounded-full text-sm font-medium backdrop-blur-md">
                Align document within frame
              </span>
            </div>
            
            <div className="relative aspect-[3/4] md:aspect-video bg-gray-900">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              {!isVideoReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-900 flex items-center justify-center gap-8">
              <button
                onClick={stopCamera}
                className="p-4 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <button
                onClick={capturePhoto}
                disabled={!isVideoReady}
                className="p-1 rounded-full border-4 border-white transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-16 h-16 bg-white rounded-full"></div>
              </button>
              
              <div className="w-14"></div> {/* Spacer for alignment */}
            </div>
            <canvas ref={canvasRef} className="hidden" />
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
    </div>
  );
};

export default MandatoryDocs;

