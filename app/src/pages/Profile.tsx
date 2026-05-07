import { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useNavigate } from 'react-router-dom';
import { logoutUser, fetchLedger, fetchMe } from '../lib/api';
import { User, MapPin, Phone, FileText, Lock, LogOut, ChevronRight, Wallet, History, ChevronDown, ChevronUp, Receipt, ChevronLeft, Globe, Building2, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Capacitor } from '@capacitor/core';

const Profile = () => {
    const { user, updateUser, logout, language } = useStore();
    const navigate = useNavigate();
    const { registerPush, registerWebPush, fcmToken } = usePushNotifications();
    
    const [ledger, setLedger] = useState<any[]>([]);
    const [loadingLedger, setLoadingLedger] = useState(false);
    const [viewAllLedger, setViewAllLedger] = useState(false);
    
    const [showPayModal, setShowPayModal] = useState(false);
    const [payMode, setPayMode] = useState<'selection' | 'online' | 'offline' | 'rtgs'>('selection');
    const [offlineAmount, setOfflineAmount] = useState('');

    useEffect(() => {
        // Fetch fresh balance and mobile number details
        fetchMe()
            .then(data => {
                if (data && updateUser) {
                    updateUser({
                        mobile: data.mobile,
                        balance: data.balance,
                        name: data.name
                    });
                }
            })
            .catch(console.error);

        setLoadingLedger(true);
        fetchLedger()
            .then(res => setLedger(res.data || []))
            .catch(err => console.error("Error fetching ledger", err))
            .finally(() => setLoadingLedger(false));
    }, []);

    const handleLogout = async () => {
        await logoutUser();
        logout();
        navigate('/login');
    };

    const handleEnableNotifications = () => {
        if (Capacitor.isNativePlatform()) {
            registerPush();
        } else {
            registerWebPush();
        }
        alert(language === 'en' ? 'Checking/Requesting Notification Permissions...' : 'अधिसूचना अनुमतियों की जाँच / अनुरोध किया जा रहा है...');
    };

    if (!user) return null;

    const fields = [
        { icon: User,     label: language === 'en' ? 'Party Code' : 'पार्टी कोड',    value: user.partyCode },
        { icon: Phone,    label: language === 'en' ? 'Mobile' : 'मोबाइल',        value: user.mobile || '—' },
        { icon: MapPin,   label: language === 'en' ? 'Address' : 'पता',       value: user.address || '—' },
        { icon: FileText, label: language === 'en' ? 'GST Number' : 'जीएसटी नंबर',    value: user.gst || '—' },
    ].filter(f => f.value !== '—' || f.label === 'Mobile' || f.label === 'मोबाइल');

    const displayedLedger = viewAllLedger ? ledger : ledger.slice(0, 10);

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Header */}
            <div className="bg-white p-4 border-b border-gray-100 sticky top-0 z-40">
                <h1 className="text-xl font-bold text-gray-900">{language === 'en' ? 'Profile' : 'प्रोफ़ाइल'}</h1>
            </div>

            <div className="p-4 space-y-4">
                {/* Avatar + name */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-600 rounded-full text-white text-2xl font-bold shadow-lg shadow-emerald-600/30 mb-3">
                        {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-bold text-gray-900 text-lg">{user.name}</div>
                    <div className="text-sm text-gray-500 font-medium mt-0.5">{user.mobile || user.partyCode}</div>
                </div>

                {/* Current Balance */}
                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-5 shadow-sm text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Wallet size={80} />
                    </div>
                    <div className="flex items-center gap-3 mb-3 opacity-90 relative z-10">
                        <Wallet size={18} />
                        <h2 className="font-medium text-sm">{language === 'en' ? 'Current Balance' : 'वर्तमान शेष राशि'}</h2>
                    </div>
                    <div className="flex items-end justify-between relative z-10">
                        <div className="text-3xl font-bold">
                            {user.balance ? user.balance : '₹0.00'}
                        </div>
                        <button 
                            onClick={() => { setShowPayModal(true); setPayMode('selection'); }}
                            className="bg-white text-indigo-700 px-5 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-indigo-50 transition-colors active:scale-95"
                        >
                            {language === 'en' ? 'PAY' : 'भुगतान'}
                        </button>
                    </div>
                </div>

                {/* Party Ledger */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <History size={18} className="text-indigo-600" />
                            <h2 className="font-semibold text-gray-900">{language === 'en' ? 'Party Ledger' : 'पार्टी खाता'}</h2>
                        </div>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                            {ledger.length} {language === 'en' ? 'entries' : 'प्रविष्टियां'}
                        </span>
                    </div>

                    <div className="p-4">
                        {loadingLedger ? (
                            <div className="flex justify-center p-4">
                                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : ledger.length === 0 ? (
                            <div className="text-center py-6 text-gray-500 text-sm">{language === 'en' ? 'No ledger entries found' : 'कोई खाता प्रविष्टि नहीं मिली'}</div>
                        ) : (
                            <div className="space-y-3">
                                {displayedLedger.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="flex gap-3 items-center">
                                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-400">
                                                <Receipt size={16} />
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500 font-medium">{item.date}</div>
                                                <div className="text-sm font-semibold text-gray-800 line-clamp-2">{item.narration || item.book || 'N/A'}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`font-bold ${item.type === 'CR' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {item.type === 'CR' ? '+' : '-'}₹{item.amount.toFixed(2)}
                                            </div>
                                            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{item.type}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        {!loadingLedger && ledger.length > 10 && (
                            <button 
                                onClick={() => setViewAllLedger(!viewAllLedger)}
                                className="w-full mt-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center justify-center gap-1"
                            >
                                {viewAllLedger ? (
                                    <>{language === 'en' ? 'Show Less' : 'कम दिखाएं'} <ChevronUp size={16} /></>
                                ) : (
                                    <>{language === 'en' ? 'View All' : 'सभी देखें'} <ChevronDown size={16} /></>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Details */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {fields.map((f, i) => (
                        <div key={i} className={`flex items-center gap-4 p-4 ${i < fields.length - 1 ? 'border-b border-gray-100' : ''}`}>
                            <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                                <f.icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-400">{f.label}</div>
                                <div className="text-sm font-medium text-gray-800 truncate">{f.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                        onClick={handleEnableNotifications}
                        className="w-full flex items-center gap-4 p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-500">
                            <Bell size={16} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="text-sm font-medium text-gray-800">{language === 'en' ? 'Enable Notifications' : 'सूचनाएं चालू करें'}</div>
                            {fcmToken && <div className="text-[10px] text-green-600 mt-0.5">{language === 'en' ? 'Device is registered' : 'डिवाइस पंजीकृत है'}</div>}
                        </div>
                        <ChevronRight size={16} className="text-gray-400" />
                    </button>

                    <button
                        onClick={() => navigate('/change-password')}
                        className="w-full flex items-center gap-4 p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-500">
                            <Lock size={16} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="text-sm font-medium text-gray-800">{language === 'en' ? 'Change Password' : 'पासवर्ड बदलें'}</div>
                        </div>
                        <ChevronRight size={16} className="text-gray-400" />
                    </button>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-4 p-4 hover:bg-red-50 transition-colors"
                    >
                        <div className="p-2 bg-red-50 rounded-lg text-red-500">
                            <LogOut size={16} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="text-sm font-medium text-red-600">{language === 'en' ? 'Logout' : 'लॉग आउट करें'}</div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Pay Modal */}
            <AnimatePresence>
                {showPayModal && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }} 
                            onClick={() => { setShowPayModal(false); setPayMode('selection'); setOfflineAmount(''); }} 
                            className="fixed inset-0 bg-black/40 z-[999]" 
                        />
                        <motion.div 
                            initial={{ y: '100%' }} 
                            animate={{ y: 0 }} 
                            exit={{ y: '100%' }} 
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }} 
                            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 pb-8 z-[1000] shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
                        >
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-5" />
                            
                            {payMode === 'selection' && (
                                <>
                                    <h3 className="text-lg font-bold text-gray-900 mb-4">{language === 'en' ? 'Select Payment Mode' : 'भुगतान मोड चुनें'}</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button onClick={() => setPayMode('online')} className="flex flex-col items-center justify-center p-5 bg-indigo-50 border border-indigo-100 rounded-2xl gap-3 hover:bg-indigo-100 transition-colors text-indigo-700">
                                            <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 shadow-sm">
                                                <Globe size={28} />
                                            </div>
                                            <span className="font-bold">{language === 'en' ? 'Online' : 'ऑनलाइन'}</span>
                                        </button>
                                        <button onClick={() => setPayMode('offline')} className="flex flex-col items-center justify-center p-5 bg-orange-50 border border-orange-100 rounded-2xl gap-3 hover:bg-orange-100 transition-colors text-orange-700">
                                            <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 shadow-sm">
                                                <User size={28} />
                                            </div>
                                            <span className="font-bold">{language === 'en' ? 'Offline' : 'ऑफ़लाइन'}</span>
                                        </button>
                                    </div>
                                </>
                            )}

                            {payMode === 'offline' && (
                                <>
                                    <div className="flex items-center gap-3 mb-5">
                                        <button onClick={() => setPayMode('selection')} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"><ChevronLeft size={18} /></button>
                                        <h3 className="text-lg font-bold text-gray-900">{language === 'en' ? 'Request Pickup' : 'पिकअप का अनुरोध करें'}</h3>
                                    </div>
                                    <div className="space-y-5">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">{language === 'en' ? 'Amount (₹)' : 'राशि (₹)'}</label>
                                            <input 
                                                type="number" 
                                                value={offlineAmount} 
                                                onChange={(e) => setOfflineAmount(e.target.value)} 
                                                placeholder="0.00" 
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-lg font-bold text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all" 
                                            />
                                        </div>
                                        <button 
                                            onClick={async () => { 
                                                if (offlineAmount && Number(offlineAmount) > 0) {
                                                    const newMessage = {
                                                        id: Date.now().toString(),
                                                        recipientId: 1, // Defaulting admin ID to 1
                                                        recipientName: 'Admin',
                                                        message: `Pickup requested for ₹${offlineAmount} by ${user?.name || user?.partyCode}`,
                                                        photoAttachment: null,
                                                        sentAt: new Date().toISOString(),
                                                        sentBy: user?.partyCode || 'user',
                                                        isRead: false
                                                    };
                                                    
                                                    const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace('/api/app', '');
                                                    try {
                                                        await fetch(baseUrl + '/api/messages', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json'
                                                            },
                                                            body: JSON.stringify(newMessage)
                                                        });
                                                    } catch (err) {
                                                        console.error('Failed to send message:', err);
                                                    }

                                                    alert('Pickup Requested for ₹' + offlineAmount); 
                                                    setShowPayModal(false); 
                                                    setPayMode('selection'); 
                                                    setOfflineAmount(''); 
                                                } else {
                                                    alert(language === 'en' ? 'Please enter a valid amount' : 'कृपया एक वैध राशि दर्ज करें');
                                                }
                                            }} 
                                            className="w-full bg-indigo-600 text-white font-bold text-base rounded-xl py-4 shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-colors active:scale-95"
                                        >
                                            {language === 'en' ? 'Request Pickup' : 'पिकअप अनुरोध करें'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {payMode === 'online' && (
                                <>
                                    <div className="flex items-center gap-3 mb-5">
                                        <button onClick={() => setPayMode('selection')} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"><ChevronLeft size={18} /></button>
                                        <h3 className="text-lg font-bold text-gray-900">{language === 'en' ? 'Pay Online' : 'ऑनलाइन भुगतान करें'}</h3>
                                    </div>
                                    <div className="space-y-3">
                                        <button onClick={() => setPayMode('rtgs')} className="w-full flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-left group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold shadow-sm">
                                                    <Building2 size={20} />
                                                </div>
                                                <div>
                                                    <span className="block font-bold text-gray-900">RTGS / NEFT / IMPS</span>
                                                    <span className="text-xs text-gray-500 font-medium">Bank Transfer</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={18} className="text-gray-400 group-hover:text-indigo-600" />
                                        </button>
                                        
                                        <a href="phonepe://pay?pa=0490008700003292@pnb&pn=EKTA%20ENTERPRISES&cu=INR" className="w-full flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-purple-50 hover:border-purple-200 transition-colors text-left group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-xl shadow-sm">
                                                    पे
                                                </div>
                                                <div>
                                                    <span className="block font-bold text-gray-900">PhonePe</span>
                                                    <span className="text-xs text-gray-500 font-medium">Open PhonePe App</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={18} className="text-gray-400 group-hover:text-purple-600" />
                                        </a>

                                        <a href="tez://upi/pay?pa=0490008700003292@pnb&pn=EKTA%20ENTERPRISES&cu=INR" className="w-full flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors text-left group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-700 font-bold text-xl shadow-sm border border-gray-200">
                                                    G
                                                </div>
                                                <div>
                                                    <span className="block font-bold text-gray-900">Google Pay</span>
                                                    <span className="text-xs text-gray-500 font-medium">Open Google Pay App</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={18} className="text-gray-400 group-hover:text-blue-600" />
                                        </a>
                                    </div>
                                </>
                            )}

                            {payMode === 'rtgs' && (
                                <>
                                    <div className="flex items-center gap-3 mb-5">
                                        <button onClick={() => setPayMode('online')} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"><ChevronLeft size={18} /></button>
                                        <h3 className="text-lg font-bold text-gray-900">Bank Details</h3>
                                    </div>
                                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-sm text-gray-800 space-y-3">
                                        <p className="font-bold text-indigo-700 mb-4 text-xs uppercase tracking-wider">Kindly transfer your balance to:</p>
                                        
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-start">
                                                <span className="text-gray-500 font-medium w-24 shrink-0">Name:</span> 
                                                <strong className="text-gray-900">EKTA ENTERPRISES</strong>
                                            </div>
                                            <div className="flex items-start">
                                                <span className="text-gray-500 font-medium w-24 shrink-0">Bank:</span> 
                                                <strong className="text-gray-900">PUNJAB NATIONAL BANK</strong>
                                            </div>
                                            <div className="flex items-start">
                                                <span className="text-gray-500 font-medium w-24 shrink-0">Branch:</span> 
                                                <strong className="text-gray-900">Seoni</strong>
                                            </div>
                                            <div className="flex items-start">
                                                <span className="text-gray-500 font-medium w-24 shrink-0">Acc. No.:</span> 
                                                <strong className="text-indigo-700 tracking-wider text-base">0490008700003292</strong>
                                            </div>
                                            <div className="flex items-start">
                                                <span className="text-gray-500 font-medium w-24 shrink-0">IFSC CODE:</span> 
                                                <strong className="text-gray-900">PUNB0049000</strong>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Profile;
