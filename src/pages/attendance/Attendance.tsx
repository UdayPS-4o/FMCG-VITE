import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import useAuth from "../../hooks/useAuth";
import constants from '../../constants';
import Toast from '../../components/ui/toast/Toast';
import useLocationTracking from '../../hooks/useLocationTracking';
import useAttendanceCheck from '../../hooks/useAttendanceCheck';
import useBackgroundLocationTracking from '../../hooks/useBackgroundLocationTracking';
import { PulseLoadAnimation } from '../../components/ui/loading';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface AttendanceRecord {
  id: string;
  userId: number;
  userName: string;
  date: string;
  time: string;
  location: LocationData;
  selfieData: string;
  status: 'present' | 'absent';
}

const Attendance: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
    }
  }, [loading, isAuthenticated, navigate]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Not started');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { hasMarkedToday } = useAttendanceCheck();

  const { lastPosition, isTracking, startTracking, stopTracking, getCurrentLocation } = useLocationTracking();
  const { 
    backgroundState, 
    enableBackgroundTracking, 
    disableBackgroundTracking, 
    setBackgroundUpdateInterval,
    requestBackgroundPermissions 
  } = useBackgroundLocationTracking();

  useEffect(() => {
    // Start continuous location tracking
    const initializeLocationTracking = async () => {
      try {
        await startTracking();
        console.log('Location tracking started successfully');
      } catch (error) {
        console.error('Failed to start location tracking:', error);
        setToast({ message: 'Failed to start location tracking. Some features may not work properly.', type: 'error' });
      }
    };
    
    initializeLocationTracking();
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      // Cleanup function to stop tracking when component unmounts
      stopTracking();
    };
  }, []);

  useEffect(() => {
    if (!loading && isAuthenticated && user?.requireMandatoryDocs && hasMarkedToday) {
      window.location.href = '/mandatory-docs';
    }
  }, [loading, isAuthenticated, user?.requireMandatoryDocs, hasMarkedToday]);

  // Helper function to get current date in Indian Standard Time
  const getIndianDate = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().split('T')[0];
  };



  // Use location from the hook
  useEffect(() => {
    if (lastPosition) {
      setLocation({
        latitude: lastPosition.coords.latitude,
        longitude: lastPosition.coords.longitude,
        accuracy: lastPosition.coords.accuracy,
        timestamp: lastPosition.timestamp
      });
    }
  }, [lastPosition]);

  const startCamera = async () => {
    try {
      console.log('🎥 Starting camera initialization...');
      setCameraStatus('Initializing...');
      setDebugInfo('Starting camera initialization');
      setIsCapturing(true);
      setIsVideoReady(false);
      
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported in this browser');
      }
      
      setCameraStatus('Requesting permissions...');
      setDebugInfo('Requesting camera access');
      console.log('📱 Requesting camera access...');
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      
      setCameraStatus('Stream obtained, setting up video...');
      setDebugInfo(`Camera stream obtained: ${mediaStream.getVideoTracks().length} video tracks`);
      console.log('✅ Camera stream obtained:', mediaStream.getVideoTracks().length, 'video tracks');
      setStream(mediaStream);
      
      if (videoRef.current) {
        setCameraStatus('Attaching to video element...');
        setDebugInfo('Attaching stream to video element');
        console.log('🔗 Attaching stream to video element...');
        videoRef.current.srcObject = mediaStream;
        
        // Create a promise for video readiness
        const videoReadyPromise = new Promise((resolve, reject) => {
          const video = videoRef.current;
          if (!video) {
            reject(new Error('Video element not found'));
            return;
          }
          
          const handleLoadedMetadata = () => {
            setCameraStatus('Video metadata loaded');
            setDebugInfo(`Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
            console.log('📊 Video metadata loaded - dimensions:', video.videoWidth, 'x', video.videoHeight);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('error', handleError);
            resolve(true);
          };
          
          const handleError = (error: Event) => {
            setCameraStatus('Video element error');
            setDebugInfo(`Video error: ${error}`);
            console.error('❌ Video element error:', error);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('error', handleError);
            reject(new Error('Video element failed to load'));
          };
          
          video.addEventListener('loadedmetadata', handleLoadedMetadata);
          video.addEventListener('error', handleError);
          
          // Fallback timeout with detailed checking
          setTimeout(() => {
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('error', handleError);
            setCameraStatus('Timeout reached, checking state...');
            console.log('⏰ Video ready timeout - checking current state...');
            
            const currentState = {
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              paused: video.paused,
              ended: video.ended
            };
            setDebugInfo(`Timeout state: ${JSON.stringify(currentState)}`);
            console.log('📊 Current video state:', currentState);
            
            if (video.readyState >= 1) {
              setCameraStatus('Ready (via timeout)');
              console.log('✅ Video is actually ready (readyState:', video.readyState, ')');
              resolve(true);
            } else {
              setCameraStatus('Forced ready (timeout)');
              console.log('⚠️ Video not ready, forcing ready state');
              resolve(true); // Force resolve to prevent infinite loading
            }
          }, 3000);
        });
        
        try {
          setCameraStatus('Starting playback...');
          console.log('▶️ Starting video playback...');
          await videoRef.current.play();
          setCameraStatus('Playback started');
          setDebugInfo('Video playback started successfully');
          console.log('✅ Video playback started successfully');
        } catch (playError) {
          setCameraStatus('Playback failed (normal)');
          setDebugInfo(`Autoplay failed: ${playError}`);
          console.warn('⚠️ Video autoplay failed (this is normal):', playError);
        }
        
        // Wait for video to be ready
        setCameraStatus('Waiting for video ready...');
        await videoReadyPromise;
        setCameraStatus('Camera ready!');
        setDebugInfo('Camera initialization complete');
        console.log('🎉 Camera initialization complete!');
        setIsVideoReady(true);
      }
    } catch (error) {
      setCameraStatus('Failed');
      setDebugInfo(`Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error('❌ Camera initialization failed:', error);
      let errorMessage = 'Camera access failed. ';
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Please allow camera permissions and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (error.name === 'NotReadableError') {
          errorMessage += 'Camera is being used by another application.';
        } else {
          errorMessage += error.message;
        }
      }
      
      setToast({ message: errorMessage, type: 'error' });
      setIsCapturing(false);
      setIsVideoReady(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCapturing(false);
      setIsVideoReady(false);
    }
  };

  const capturePhoto = () => {
    if (!isVideoReady) {
      setToast({ message: 'Please wait for camera to be ready before capturing.', type: 'error' });
      return;
    }
    
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      
      // Check if video is ready
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        setToast({ message: 'Video not ready yet. Please wait a moment and try again.', type: 'error' });
        return;
      }
      
      // Check if video has valid dimensions
      if (!video.videoWidth || !video.videoHeight) {
        setToast({ message: 'Video dimensions not available. Please restart camera.', type: 'error' });
        return;
      }
      
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Clear canvas before drawing
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, 0, 0);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        
        // Validate image data
        if (imageData === 'data:,' || imageData.length < 100) {
          setToast({ message: 'Failed to capture image. Please try again.', type: 'error' });
          return;
        }
        
        console.log('Image captured successfully, data length:', imageData.length);
        setCapturedImage(imageData);
        stopCamera();
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    startCamera();
  };

  const submitAttendance = async () => {
    if (!capturedImage || !location || !user) {
      setToast({ message: 'Please capture selfie and ensure location is available', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    
    try {
      const attendanceData: AttendanceRecord = {
        id: `${user.id}_${Date.now()}`,
        userId: user.id,
        userName: user.name,
        date: getIndianDate(),
        time: new Date().toLocaleTimeString(),
        location: location,
        selfieData: capturedImage,
        status: 'present'
      };

      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/attendance/mark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(attendanceData)
      });

      if (response.ok) {
        setToast({ message: 'Attendance marked successfully!', type: 'success' });
        setCapturedImage(null);
        setTimeout(() => {
          if (user?.requireMandatoryDocs) {
            window.location.href = '/mandatory-docs';
          } else {
            window.location.href = '/account-master';
          }
        }, 3000);
      } else {
        const errorData = await response.json();
        console.error('Attendance marking failed:', errorData);
        setToast({ message: errorData.message || 'Failed to mark attendance', type: 'error' });
      }
    } catch (error) {
      console.error('Error submitting attendance:', error);
      setToast({ message: 'Error submitting attendance', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewPastAttendance = () => {
    navigate('/attendance/history');
  };

  // Debug function to clear service worker cache
  const clearServiceWorkerCache = async () => {
    try {
      console.log('Clearing service worker cache...');
      
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
          console.log('Service worker unregistered:', registration);
        }
      }
      
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('All caches cleared');
      }
      
      setToast({ message: 'Service worker cache cleared! Please refresh the page.', type: 'success' });
      
      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('Error clearing service worker cache:', error);
      setToast({ message: 'Failed to clear cache: ' + (error instanceof Error ? error.message : 'Unknown error'), type: 'error' });
    }
  };

  // Show loading state while authentication is being checked
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <PulseLoadAnimation size="md" />
          <p className="text-gray-600 dark:text-gray-400 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <>
      <PageMeta
        title="Mark Attendance | Ekta Enterprises"
        description="Mark your daily attendance with selfie and location"
      />
      <PageBreadcrumb
        pageTitle="Mark Attendance"
      />
      
      <div className="max-w-2xl mx-auto p-6">
        {/* Important Notice Banner */}
        {!hasMarkedToday && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Attendance Required
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  You must mark your attendance before accessing other features of the application. Please complete your attendance marking below.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Mark Your Attendance
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Current Time: {new Date().toLocaleTimeString()}
            </p>
          </div>

          {hasMarkedToday ? (
            <div className="text-center">
              <div className="bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg p-4 mb-4">
                <h3 className="text-green-800 dark:text-green-400 font-semibold mb-2">
                  ✅ Attendance Already Marked
                </h3>
                <p className="text-green-700 dark:text-green-300">
                  You have already marked your attendance for today.
                </p>
              </div>
              <button
                onClick={viewPastAttendance}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                View Past Attendance
              </button>
            </div>
          ) : (
            <>
              {/* Location Status */}
              <div className="mb-6">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Location Status:
                  </span>
                  <span className={`text-sm font-semibold ${
                     location ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                   }`}>
                     {location ? '📍 Location Detected' : '❌ Location Required'}
                  </span>
                </div>
              </div>

              {/* Background Location Tracking Status */}
              <div className="mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                      🌍 Continuous Location Tracking
                    </h4>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      backgroundState.isBackgroundTrackingEnabled 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {backgroundState.isBackgroundTrackingEnabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                    {backgroundState.isBackgroundTrackingEnabled 
                      ? 'Your location is being tracked continuously, even when the app is not in use. This ensures accurate attendance monitoring.'
                      : 'Enable continuous tracking to monitor your location even when the app is closed or in the background.'}
                  </p>
                  
                  {backgroundState.isBackgroundTrackingSupported ? (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        {backgroundState.lastBackgroundUpdate && (
                          <span>Last update: {backgroundState.lastBackgroundUpdate.toLocaleTimeString()}</span>
                        )}
                      </div>
                      <button
                        onClick={backgroundState.isBackgroundTrackingEnabled ? disableBackgroundTracking : enableBackgroundTracking}
                        className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                          backgroundState.isBackgroundTrackingEnabled
                            ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
                        }`}
                      >
                        {backgroundState.isBackgroundTrackingEnabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                      ⚠️ Background tracking not fully supported in this browser. Location will only be tracked when the app is active.
                    </div>
                  )}
                  
                  {backgroundState.error && (
                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded mt-2">
                      ❌ {backgroundState.error}
                    </div>
                  )}
                  
                  {/* Debug button for clearing service worker cache */}
                  <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                    <button
                      onClick={clearServiceWorkerCache}
                      className="text-xs px-3 py-1 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                      title="Clear service worker cache and reload page"
                    >
                      🔧 Clear Cache & Reload
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Use this if the Enable button is not working
                    </p>
                  </div>
                </div>
              </div>

              {/* Camera Section */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Take Selfie for Attendance
                </h3>
                
                <div className="relative bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                  {!isCapturing && !capturedImage && (
                    <div className="aspect-video flex items-center justify-center flex-col space-y-4">
                      <button
                        onClick={startCamera}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                      >
                        📷 Start Camera
                      </button>
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        Click to access your camera for attendance selfie
                      </p>
                    </div>
                  )}
                  
                  {isCapturing && (
                    <div className="relative">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full aspect-video object-cover"
                      />
                      {!isVideoReady && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                          <div className="text-center p-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                            <p className="text-white text-sm mb-2">📹 Preparing camera...</p>
                            <div className="bg-white dark:bg-gray-700 rounded p-2 text-xs max-w-xs">
                              <p className="font-semibold text-blue-600 dark:text-blue-400">Status: {cameraStatus}</p>
                              <p className="text-gray-500 dark:text-gray-400 mt-1 break-words">{debugInfo}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {isVideoReady && (
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-600 bg-opacity-90 text-white px-3 py-1 rounded-full text-sm">
                          ✅ Camera ready
                        </div>
                      )}
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 space-x-4">
                        <button
                          onClick={capturePhoto}
                          disabled={!isVideoReady}
                          className={`font-medium py-2 px-4 rounded-full transition-colors ${
                            isVideoReady 
                              ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer' 
                              : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                          }`}
                        >
                          📸 {isVideoReady ? 'Capture' : 'Loading...'}
                        </button>
                        <button
                          onClick={stopCamera}
                          className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-full transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {capturedImage && (
                    <div className="relative">
                      <img
                        src={capturedImage}
                        alt="Captured selfie"
                        className="w-full aspect-video object-cover"
                      />
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 space-x-4">
                        <button
                          onClick={retakePhoto}
                          className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                          🔄 Retake
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Submit Button */}
              {capturedImage && location && (
                <div className="text-center">
                  <button
                    onClick={submitAttendance}
                    disabled={isSubmitting}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-3 px-8 rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? '⏳ Submitting...' : '✅ Mark Attendance'}
                  </button>
                </div>
              )}

              {/* Past Attendance Button */}
              <div className="text-center mt-4">
                <button
                  onClick={viewPastAttendance}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium underline"
                >
                  View Past Attendance
                </button>
              </div>
            </>
          )}
        </div>
      </div>

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

export default Attendance;
