import { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useNavigate } from 'react-router-dom';
import { logoutUser, fetchLedger, fetchMe } from '../lib/api';
import { User, MapPin, Phone, FileText, Lock, LogOut, ChevronRight, Wallet, History, ChevronDown, ChevronUp, Receipt } from 'lucide-react';

const Profile = () => {
    const { user, updateUser, logout, language } = useStore();
    const navigate = useNavigate();
    
    const [ledger, setLedger] = useState<any[]>([]);
    const [loadingLedger, setLoadingLedger] = useState(false);
    const [viewAllLedger, setViewAllLedger] = useState(false);

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
                <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-5 shadow-sm text-white">
                    <div className="flex items-center gap-3 mb-2 opacity-90">
                        <Wallet size={18} />
                        <h2 className="font-medium text-sm">{language === 'en' ? 'Current Balance' : 'वर्तमान शेष राशि'}</h2>
                    </div>
                    <div className="text-3xl font-bold">
                        {user.balance ? user.balance : '₹0.00'}
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
                                                <div className="text-sm font-semibold text-gray-800">{item.book || 'N/A'}</div>
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
        </div>
    );
};

export default Profile;
