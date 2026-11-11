import { useState, useEffect, type ReactNode } from 'react';
import { useStore } from '../context/StoreContext';
import { useNavigate } from 'react-router-dom';
import {
    logoutUser, fetchLedger, fetchMe, fetchActiveSchemes,
    fetchProfileSummary, fetchProfileLedger, saveProfilePrefs, sendProfileRequest,
    type LedgerEntry, type ProfileContact, type ProfilePrefs, type ProfileSummary, type UnpaidBill,
} from '../lib/api';
import {
    User, MapPin, Phone, FileText, Lock, LogOut, ChevronRight, Wallet, History, ChevronDown, ChevronUp, Receipt,
    ChevronLeft, Globe, Building2, Bell, Languages, FileDown, Share2, BadgePercent, Pencil,
    Users, Smartphone, AlertTriangle, Mail, ShieldCheck, CreditCard, Hash,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Capacitor } from '@capacitor/core';
import { ContactsSheet, DevicesSheet, IssueSheet, PaymentsSheet, RequestChangeSheet } from '../components/profile/ProfileSheets';
import { formatInr, fyLabel, printStatement, shareStatement } from '../lib/statement';

const LEDGER_PREVIEW = 10;
const BILLS_PREVIEW = 4;
const TOAST_MS = 3000;
const UPI_PAYEE = 'pa=9826623188m@pnb&pn=EKTA%20ENTERPRISES&cu=INR';

type SheetName = 'payments' | 'change' | 'issue' | 'contacts' | 'devices' | null;
type PrefFlag = 'orderUpdates' | 'paymentReminders' | 'schemeAlerts';

interface AppScheme {
    id: number;
    name: string;
    discount_amount: number;
    scheme_type: string;
    condition_qty: number | null;
    banner_text: string;
    end_date: string | null;
}

const CARD = 'bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden';
const CARD_HEAD = 'p-4 border-b border-gray-100 flex items-center justify-between gap-2';
const SMALL_BTN = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors active:scale-95';

const Toggle = ({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) => (
    <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-indigo-600' : 'bg-gray-300'}`}
    >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
);

const ActionRow = ({ icon, tint, label, hint, danger, last, onClick }: {
    icon: ReactNode;
    tint: string;
    label: string;
    hint?: string;
    danger?: boolean;
    last?: boolean;
    onClick: () => void;
}) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-4 p-4 transition-colors ${last ? '' : 'border-b border-gray-100'} ${danger ? 'hover:bg-red-50' : 'hover:bg-gray-50'}`}
    >
        <div className={`p-2 rounded-lg ${tint}`}>{icon}</div>
        <div className="flex-1 text-left">
            <div className={`text-sm font-medium ${danger ? 'text-red-600' : 'text-gray-800'}`}>{label}</div>
            {hint && <div className="text-[11px] text-gray-500 mt-0.5">{hint}</div>}
        </div>
        {!danger && <ChevronRight size={16} className="text-gray-400" />}
    </button>
);

const Profile = () => {
    const { user, updateUser, logout, language, setLanguage, cartTotal } = useStore();
    const navigate = useNavigate();
    const { registerPush, registerWebPush, fcmToken } = usePushNotifications();
    const tr = (en: string, hi: string) => (language === 'en' ? en : hi);

    const [summary, setSummary] = useState<ProfileSummary | null>(null);
    const [schemes, setSchemes] = useState<AppScheme[]>([]);

    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [ledgerFy, setLedgerFy] = useState('');
    const [ledgerYears, setLedgerYears] = useState<string[]>([]);
    const [loadingLedger, setLoadingLedger] = useState(false);
    const [viewAllLedger, setViewAllLedger] = useState(false);
    const [viewAllBills, setViewAllBills] = useState(false);

    const [sheet, setSheet] = useState<SheetName>(null);
    const [toast, setToast] = useState('');

    const [showPayModal, setShowPayModal] = useState(false);
    const [payMode, setPayMode] = useState<'selection' | 'online' | 'offline' | 'rtgs'>('selection');
    const [offlineAmount, setOfflineAmount] = useState('');
    // Set when paying one bill: pre-fills the pickup amount and the UPI apps
    const [payAmount, setPayAmount] = useState<number | null>(null);

    const loadLedger = (fy: string) => {
        setLoadingLedger(true);
        setViewAllLedger(false);
        fetchProfileLedger(fy)
            // Server not updated yet: the older endpoint still returns the current year
            .catch(() => fetchLedger().then(res => ({ fy: '', years: [] as string[], data: (res.data || []) as LedgerEntry[] })))
            .then(res => {
                setLedger(res.data);
                setLedgerFy(res.fy);
                setLedgerYears(res.years);
            })
            .catch(err => console.error('Error fetching ledger', err))
            .finally(() => setLoadingLedger(false));
    };

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

        fetchProfileSummary().then(setSummary).catch(err => console.error('Error fetching profile summary', err));
        fetchActiveSchemes().then(setSchemes).catch(() => setSchemes([]));
        loadLedger('');
    }, []);

    useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(''), TOAST_MS);
        return () => clearTimeout(timer);
    }, [toast]);

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

    const openPay = (amount: number | null) => {
        setPayAmount(amount);
        setOfflineAmount(amount ? String(Math.round(amount)) : '');
        setPayMode('selection');
        setShowPayModal(true);
    };

    const setPrefs = (prefs: ProfilePrefs) => setSummary(prev => (prev ? { ...prev, prefs } : prev));

    const togglePref = async (key: PrefFlag) => {
        if (!summary) return;
        const before = summary.prefs;
        setPrefs({ ...before, [key]: !before[key] });
        try {
            setPrefs((await saveProfilePrefs({ [key]: !before[key] })).prefs);
        } catch {
            setPrefs(before);
            setToast(tr('Could not save. Try again.', 'सेव नहीं हुआ। फिर कोशिश करें।'));
        }
    };

    const saveContacts = async (contacts: ProfileContact[]) => {
        setPrefs((await saveProfilePrefs({ contacts })).prefs);
    };

    const statementInput = () => ({
        partyName: user?.name || '',
        partyCode: user?.partyCode || '',
        fy: ledgerFy,
        balance: user?.balance || '',
        entries: ledger,
    });

    const handleStatementPdf = () => {
        if (ledger.length === 0) { setToast(tr('No entries in this year', 'इस वर्ष कोई प्रविष्टि नहीं है')); return; }
        // The app shell cannot print: share the statement instead
        if (!printStatement(statementInput())) shareStatement(statementInput());
    };

    const handleStatementShare = () => {
        if (ledger.length === 0) { setToast(tr('No entries in this year', 'इस वर्ष कोई प्रविष्टि नहीं है')); return; }
        shareStatement(statementInput());
    };

    const handleShareLocation = () => {
        if (!navigator.geolocation) { setToast(tr('Location is not available on this device', 'इस डिवाइस पर लोकेशन उपलब्ध नहीं है')); return; }
        if (!window.confirm(tr('Send your current location as your shop location? Do this while you are at the shop.', 'क्या आप अपनी वर्तमान लोकेशन दुकान की लोकेशन के रूप में भेजना चाहते हैं? यह दुकान पर रहते हुए करें।'))) return;
        navigator.geolocation.getCurrentPosition(
            async pos => {
                const { latitude, longitude, accuracy } = pos.coords;
                const at = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
                try {
                    await sendProfileRequest({
                        type: 'location',
                        details: `Location: ${at} (accuracy about ${Math.round(accuracy)} m)\nhttps://www.google.com/maps?q=${at}`,
                    });
                    setToast(tr('Location sent to our team', 'लोकेशन हमारी टीम को भेज दी गई'));
                } catch {
                    setToast(tr('Could not send. Try again.', 'भेजा नहीं जा सका। फिर कोशिश करें।'));
                }
            },
            () => setToast(tr('Allow location access and try again', 'लोकेशन की अनुमति दें और फिर कोशिश करें')),
            { enableHighAccuracy: true, timeout: 15000 },
        );
    };

    if (!user) return null;

    const credit = summary?.credit;
    const creditUsed = summary && summary.balance.type === 'DR' ? summary.balance.amount : 0;
    const creditPct = credit && credit.limit > 0 ? Math.min(100, (creditUsed / credit.limit) * 100) : 0;

    const bills = summary?.outstanding.bills || [];
    const overdueCount = bills.filter(b => (b.overdueDays ?? 0) > 0).length;
    const shownBills = viewAllBills ? bills : bills.slice(0, BILLS_PREVIEW);

    const billStatus = (b: UnpaidBill) => {
        if (b.overdueDays === null) return { text: tr(`${b.ageDays} days old`, `${b.ageDays} दिन पुराना`), cls: 'text-gray-500' };
        if (b.overdueDays > 0) return { text: tr(`${b.overdueDays} days overdue`, `${b.overdueDays} दिन से बकाया`), cls: 'text-red-600' };
        if (b.overdueDays === 0) return { text: tr('Due today', 'आज देय'), cls: 'text-amber-600' };
        return { text: tr(`Due in ${-b.overdueDays} days`, `${-b.overdueDays} दिन में देय`), cls: 'text-gray-500' };
    };

    const displayedLedger = viewAllLedger ? ledger : ledger.slice(0, LEDGER_PREVIEW);
    const upiAmount = payAmount ? `&am=${payAmount.toFixed(2)}` : '';

    const details = summary?.details;
    const notAdded = tr('Not added', 'नहीं जोड़ा गया');
    const fields = [
        { icon: User, label: tr('Party Code', 'पार्टी कोड'), value: user.partyCode },
        { icon: Phone, label: tr('Mobile', 'मोबाइल'), value: user.mobile },
        { icon: MapPin, label: tr('Address', 'पता'), value: [details?.address || user.address, details?.pincode].filter(Boolean).join(' - ') },
        { icon: FileText, label: tr('GST Number', 'जीएसटी नंबर'), value: details?.gst || user.gst },
        { icon: ShieldCheck, label: tr('FSSAI Number', 'FSSAI नंबर'), value: details?.fssai },
        { icon: CreditCard, label: 'PAN', value: details?.pan },
        { icon: Mail, label: tr('Email', 'ईमेल'), value: details?.email },
    ];

    const prefRows: Array<{ key: PrefFlag; label: string; hint: string }> = [
        { key: 'orderUpdates', label: tr('Order updates', 'ऑर्डर अपडेट'), hint: tr('When your order is approved, billed or rejected', 'जब आपका ऑर्डर स्वीकृत, बिल या अस्वीकृत हो') },
        { key: 'paymentReminders', label: tr('Payment reminders', 'भुगतान रिमाइंडर'), hint: tr('Reminders about unpaid bills', 'बकाया बिलों के रिमाइंडर') },
        { key: 'schemeAlerts', label: tr('Scheme alerts', 'स्कीम अलर्ट'), hint: tr('New schemes and offers', 'नई स्कीम और ऑफ़र') },
    ];

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Header */}
            <div className="bg-white p-4 border-b border-gray-100 sticky top-0 z-40 flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900">{tr('Profile', 'प्रोफ़ाइल')}</h1>
                <button
                    onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
                    className={`${SMALL_BTN} bg-gray-100 text-gray-700 hover:bg-gray-200`}
                >
                    <Languages size={14} /> {language === 'en' ? 'हिंदी' : 'English'}
                </button>
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
                        <h2 className="font-medium text-sm">{tr('Current Balance', 'वर्तमान शेष राशि')}</h2>
                    </div>
                    <div className="flex items-end justify-between relative z-10">
                        <div className="text-3xl font-bold">
                            {user.balance ? user.balance : '₹0.00'}
                        </div>
                        <button
                            onClick={() => openPay(null)}
                            className="bg-white text-indigo-700 px-5 py-2 rounded-xl font-bold text-sm shadow-md hover:bg-indigo-50 transition-colors active:scale-95"
                        >
                            {tr('PAY', 'भुगतान')}
                        </button>
                    </div>
                    {credit && credit.limit > 0 && (
                        <div className="relative z-10 mt-4">
                            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${creditPct >= 90 ? 'bg-red-300' : 'bg-white'}`} style={{ width: `${creditPct}%` }} />
                            </div>
                            <div className="flex justify-between text-[11px] mt-1.5 opacity-90">
                                <span>{tr('Credit limit', 'क्रेडिट सीमा')} {formatInr(credit.limit)}</span>
                                <span>{tr('Available', 'उपलब्ध')} {formatInr(Math.max(0, credit.limit - creditUsed))}</span>
                            </div>
                        </div>
                    )}
                    {credit && credit.days > 0 && (
                        <div className="relative z-10 text-[11px] opacity-90 mt-1.5">
                            {tr(`Credit period: ${credit.days} days`, `क्रेडिट अवधि: ${credit.days} दिन`)}
                        </div>
                    )}
                </div>

                {/* Outstanding bills */}
                {bills.length > 0 && (
                    <div className={CARD}>
                        <div className={CARD_HEAD}>
                            <div className="flex items-center gap-2">
                                <Hash size={18} className="text-indigo-600" />
                                <h2 className="font-semibold text-gray-900">{tr('Unpaid bills', 'बकाया बिल')}</h2>
                            </div>
                            {overdueCount > 0 ? (
                                <span className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full font-semibold">
                                    {overdueCount} {tr('overdue', 'बकाया')}
                                </span>
                            ) : (
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                                    {bills.length} {tr(bills.length === 1 ? 'bill' : 'bills', 'बिल')}
                                </span>
                            )}
                        </div>
                        <div className="p-4 space-y-3">
                            {shownBills.map((b, i) => {
                                const status = billStatus(b);
                                return (
                                    <div key={`${b.label}-${i}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <button
                                            className="flex-1 min-w-0 text-left"
                                            disabled={!b.series}
                                            onClick={() => navigate(`/invoice/${b.series}/${b.billNo}`)}
                                        >
                                            <div className="text-sm font-semibold text-gray-800 truncate">
                                                {b.label} <span className="text-xs text-gray-500 font-medium">· {b.date}</span>
                                            </div>
                                            <div className={`text-xs font-medium ${status.cls}`}>{status.text}</div>
                                        </button>
                                        <div className="text-right shrink-0">
                                            <div className="font-bold text-gray-900">{formatInr(b.pending)}</div>
                                            {b.pending < b.amount && (
                                                <div className="text-[10px] text-gray-500">{tr('of', 'कुल')} {formatInr(b.amount)}</div>
                                            )}
                                        </div>
                                        <button onClick={() => openPay(b.pending)} className={`${SMALL_BTN} bg-indigo-600 text-white hover:bg-indigo-700 shrink-0`}>
                                            {tr('Pay', 'भुगतान')}
                                        </button>
                                    </div>
                                );
                            })}
                            {bills.length > BILLS_PREVIEW && (
                                <button
                                    onClick={() => setViewAllBills(!viewAllBills)}
                                    className="w-full py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center justify-center gap-1"
                                >
                                    {viewAllBills
                                        ? <>{tr('Show Less', 'कम दिखाएं')} <ChevronUp size={16} /></>
                                        : <>{tr(`View all ${bills.length}`, `सभी ${bills.length} देखें`)} <ChevronDown size={16} /></>}
                                </button>
                            )}
                            <p className="text-[11px] text-gray-500">
                                {tr('Your payments are adjusted against the oldest bills first.', 'आपके भुगतान सबसे पुराने बिलों में पहले समायोजित किए जाते हैं।')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Party Ledger */}
                <div className={CARD}>
                    <div className={CARD_HEAD}>
                        <div className="flex items-center gap-2">
                            <History size={18} className="text-indigo-600" />
                            <h2 className="font-semibold text-gray-900">{tr('Party Ledger', 'पार्टी खाता')}</h2>
                        </div>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                            {ledger.length} {tr('entries', 'प्रविष्टियां')}
                        </span>
                    </div>

                    <div className="p-4">
                        {ledgerYears.length > 1 && (
                            <div className="flex gap-2 mb-3 overflow-x-auto">
                                {ledgerYears.map(fy => (
                                    <button
                                        key={fy}
                                        onClick={() => fy !== ledgerFy && loadLedger(fy)}
                                        className={`${SMALL_BTN} shrink-0 ${fy === ledgerFy ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                    >
                                        {fyLabel(fy)}
                                    </button>
                                ))}
                            </div>
                        )}

                        {loadingLedger ? (
                            <div className="flex justify-center p-4">
                                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        ) : ledger.length === 0 ? (
                            <div className="text-center py-6 text-gray-500 text-sm">
                                {ledgerFy
                                    ? tr(`No ledger entries in ${fyLabel(ledgerFy)}`, `${fyLabel(ledgerFy)} में कोई खाता प्रविष्टि नहीं है`)
                                    : tr('No ledger entries found', 'कोई खाता प्रविष्टि नहीं मिली')}
                                {ledgerYears.length > 1 && (
                                    <div className="text-xs text-gray-400 mt-1">{tr('Choose another year above.', 'ऊपर से दूसरा वर्ष चुनें।')}</div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {displayedLedger.map((item, idx) => {
                                    const hasInvoice = Boolean(item.series && item.billNo);
                                    return (
                                        <button
                                            key={idx}
                                            disabled={!hasInvoice}
                                            onClick={() => navigate(`/invoice/${item.series}/${item.billNo}`)}
                                            className="w-full flex justify-between items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-100 text-left"
                                        >
                                            <div className="flex gap-3 items-center min-w-0">
                                                <div className={`w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm shrink-0 ${hasInvoice ? 'text-indigo-500' : 'text-gray-400'}`}>
                                                    {hasInvoice ? <FileText size={16} /> : <Receipt size={16} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-xs text-gray-500 font-medium">{item.date}</div>
                                                    <div className="text-sm font-semibold text-gray-800 line-clamp-2 [overflow-wrap:anywhere]">{item.narration || item.book || 'N/A'}</div>
                                                    {hasInvoice && <div className="text-[11px] text-indigo-600 font-medium">{tr('View bill', 'बिल देखें')}</div>}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className={`font-bold ${item.type === 'CR' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {item.type === 'CR' ? '+' : '-'}₹{item.amount.toFixed(2)}
                                                </div>
                                                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{item.type}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {!loadingLedger && ledger.length > LEDGER_PREVIEW && (
                            <button
                                onClick={() => setViewAllLedger(!viewAllLedger)}
                                className="w-full mt-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors flex items-center justify-center gap-1"
                            >
                                {viewAllLedger ? (
                                    <>{tr('Show Less', 'कम दिखाएं')} <ChevronUp size={16} /></>
                                ) : (
                                    <>{tr('View All', 'सभी देखें')} <ChevronDown size={16} /></>
                                )}
                            </button>
                        )}

                        {!loadingLedger && ledger.length > 0 && (
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <button onClick={handleStatementPdf} className="py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors flex items-center justify-center gap-2">
                                    <FileDown size={16} /> PDF
                                </button>
                                <button onClick={handleStatementShare} className="py-2.5 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors flex items-center justify-center gap-2">
                                    <Share2 size={16} /> {tr('Share', 'शेयर करें')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Schemes */}
                {schemes.length > 0 && (
                    <div className={CARD}>
                        <div className={CARD_HEAD}>
                            <div className="flex items-center gap-2">
                                <BadgePercent size={18} className="text-indigo-600" />
                                <h2 className="font-semibold text-gray-900">{tr('Schemes for you', 'आपके लिए स्कीम')}</h2>
                            </div>
                            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-semibold">
                                {schemes.length} {tr('active', 'चालू')}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            {schemes.map(s => {
                                const target = s.scheme_type === 'overall_bill_amount' ? Number(s.condition_qty) || 0 : 0;
                                const need = Math.max(0, target - cartTotal);
                                return (
                                    <div key={s.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="text-sm font-semibold text-gray-800">{s.banner_text || s.name}</div>
                                        {s.end_date && (
                                            <div className="text-[11px] text-gray-500 mt-0.5">
                                                {tr('Valid till', 'मान्य')} {new Date(s.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                        )}
                                        {target > 0 && (
                                            <>
                                                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-2">
                                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (cartTotal / target) * 100)}%` }} />
                                                </div>
                                                <div className="text-[11px] font-medium mt-1 text-gray-600">
                                                    {need > 0
                                                        ? tr(`Add ${formatInr(need)} more to your cart to get ${formatInr(s.discount_amount)} off`, `${formatInr(s.discount_amount)} की छूट के लिए कार्ट में ${formatInr(need)} और जोड़ें`)
                                                        : tr('Your cart qualifies for this scheme', 'आपका कार्ट इस स्कीम के लिए योग्य है')}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                            <button onClick={() => navigate('/')} className="w-full py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors">
                                {tr('Shop now', 'अभी खरीदें')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Business details */}
                <div className={CARD}>
                    <div className={CARD_HEAD}>
                        <div className="flex items-center gap-2">
                            <Building2 size={18} className="text-indigo-600" />
                            <h2 className="font-semibold text-gray-900">{tr('Business details', 'व्यवसाय विवरण')}</h2>
                        </div>
                        <button onClick={() => setSheet('change')} className={`${SMALL_BTN} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}>
                            <Pencil size={13} /> {tr('Request change', 'बदलाव का अनुरोध')}
                        </button>
                    </div>
                    {fields.map((f, i) => (
                        <div key={i} className="flex items-center gap-4 p-4 border-b border-gray-100">
                            <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                                <f.icon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-400">{f.label}</div>
                                <div className={`text-sm font-medium truncate ${f.value ? 'text-gray-800' : 'text-gray-400'}`}>{f.value || notAdded}</div>
                            </div>
                        </div>
                    ))}
                    <div className="flex items-center gap-4 p-4 border-b border-gray-100">
                        <div className="p-2 bg-gray-100 rounded-lg text-gray-500"><MapPin size={16} /></div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-400">{tr('Shop location', 'दुकान की लोकेशन')}</div>
                            <div className={`text-sm font-medium ${summary?.location ? 'text-gray-800' : 'text-gray-400'}`}>
                                {summary?.location ? tr('Saved on map', 'नक्शे पर सेव है') : notAdded}
                            </div>
                        </div>
                        {summary?.location && (
                            <a
                                href={`https://www.google.com/maps?q=${summary.location.latitude},${summary.location.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`${SMALL_BTN} bg-gray-100 text-gray-700 hover:bg-gray-200`}
                            >
                                {tr('View', 'देखें')}
                            </a>
                        )}
                        <button onClick={handleShareLocation} className={`${SMALL_BTN} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}>
                            {summary?.location ? tr('Update', 'अपडेट') : tr('Share', 'शेयर करें')}
                        </button>
                    </div>
                    <div className="flex items-center gap-4 p-4">
                        <div className="p-2 bg-gray-100 rounded-lg text-gray-500"><Users size={16} /></div>
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-400">{tr('Other contacts', 'अन्य संपर्क')}</div>
                            <div className={`text-sm font-medium truncate ${summary?.prefs.contacts.length ? 'text-gray-800' : 'text-gray-400'}`}>
                                {summary?.prefs.contacts.length ? summary.prefs.contacts.map(c => c.name).join(', ') : notAdded}
                            </div>
                        </div>
                        <button onClick={() => setSheet('contacts')} disabled={!summary} className={`${SMALL_BTN} bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50`}>
                            {summary?.prefs.contacts.length ? tr('Manage', 'प्रबंधित करें') : tr('Add', 'जोड़ें')}
                        </button>
                    </div>
                </div>

                {/* Notifications */}
                <div className={CARD}>
                    <div className={CARD_HEAD}>
                        <div className="flex items-center gap-2">
                            <Bell size={18} className="text-indigo-600" />
                            <h2 className="font-semibold text-gray-900">{tr('Notifications', 'सूचनाएं')}</h2>
                        </div>
                    </div>
                    {summary && prefRows.map(row => (
                        <div key={row.key} className="flex items-center gap-4 p-4 border-b border-gray-100">
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-800">{row.label}</div>
                                <div className="text-[11px] text-gray-500 mt-0.5">{row.hint}</div>
                            </div>
                            <Toggle on={summary.prefs[row.key]} onChange={() => togglePref(row.key)} label={row.label} />
                        </div>
                    ))}
                    <ActionRow
                        icon={<Bell size={16} />}
                        tint="bg-blue-50 text-blue-500"
                        label={tr('Enable notifications on this device', 'इस डिवाइस पर सूचनाएं चालू करें')}
                        hint={fcmToken ? tr('Device is registered', 'डिवाइस पंजीकृत है') : undefined}
                        last
                        onClick={handleEnableNotifications}
                    />
                </div>

                {/* Account */}
                <div className={CARD}>
                    <ActionRow
                        icon={<AlertTriangle size={16} />}
                        tint="bg-amber-50 text-amber-600"
                        label={tr('Raise an issue', 'समस्या दर्ज करें')}
                        hint={tr('Short supply, damaged goods or a wrong bill', 'कम माल, खराब माल या गलत बिल')}
                        onClick={() => setSheet('issue')}
                    />
                    <ActionRow
                        icon={<Smartphone size={16} />}
                        tint="bg-gray-100 text-gray-500"
                        label={tr('Logged-in devices', 'लॉग-इन डिवाइस')}
                        onClick={() => setSheet('devices')}
                    />
                    <ActionRow
                        icon={<Lock size={16} />}
                        tint="bg-indigo-50 text-indigo-500"
                        label={tr('Change Password', 'पासवर्ड बदलें')}
                        onClick={() => navigate('/change-password')}
                    />
                    <ActionRow
                        icon={<LogOut size={16} />}
                        tint="bg-red-50 text-red-500"
                        label={tr('Logout', 'लॉग आउट करें')}
                        danger
                        last
                        onClick={handleLogout}
                    />
                </div>
            </div>

            <PaymentsSheet open={sheet === 'payments'} onClose={() => setSheet(null)} language={language} entries={ledger} fy={ledgerFy} />
            <RequestChangeSheet
                open={sheet === 'change'}
                onClose={() => setSheet(null)}
                language={language}
                onSent={() => setToast(tr('Request sent to our team', 'अनुरोध हमारी टीम को भेज दिया गया'))}
            />
            <IssueSheet
                open={sheet === 'issue'}
                onClose={() => setSheet(null)}
                language={language}
                onSent={() => setToast(tr('Issue sent to our team', 'समस्या हमारी टीम को भेज दी गई'))}
            />
            <ContactsSheet
                open={sheet === 'contacts'}
                onClose={() => setSheet(null)}
                language={language}
                contacts={summary?.prefs.contacts || []}
                onSave={saveContacts}
            />
            <DevicesSheet open={sheet === 'devices'} onClose={() => setSheet(null)} language={language} />

            {toast && (
                <div className="fixed left-4 right-4 bottom-28 z-[1100] flex justify-center pointer-events-none">
                    <div className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">{toast}</div>
                </div>
            )}

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
                                    {payAmount !== null && (
                                        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-4">
                                            <span className="text-sm font-medium text-indigo-800">{language === 'en' ? 'Amount for this bill' : 'इस बिल की राशि'}</span>
                                            <span className="font-bold text-indigo-700">{formatInr(payAmount)}</span>
                                        </div>
                                    )}
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
                                        
                                        <a href={`phonepe://pay?${UPI_PAYEE}${upiAmount}`} className="w-full flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-purple-50 hover:border-purple-200 transition-colors text-left group">
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

                                        <a href={`tez://upi/pay?${UPI_PAYEE}${upiAmount}`} className="w-full flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-blue-50 hover:border-blue-200 transition-colors text-left group">
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
