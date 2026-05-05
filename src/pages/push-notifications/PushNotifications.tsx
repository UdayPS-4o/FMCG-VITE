import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToPush, urlBase64ToUint8Array, getVapidKey } from '../../services/pushService';
import { toast } from 'react-toastify';
import constants from '../../constants';

interface PushToken {
    id: number;
    user_id: string;
    token: string;
    type: string;
    created_at: string;
}

const PushNotifications: React.FC = () => {
    const { user } = useAuth();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState<ServiceWorkerRegistration | null>(null);

    // Admin Control Panel State
    const [tokens, setTokens] = useState<PushToken[]>([]);
    const [loadingTokens, setLoadingTokens] = useState(false);
    
    // Suite State
    const [targetMode, setTargetMode] = useState<'ALL' | 'USER' | 'SUBGROUP'>('ALL');
    const [targetValue, setTargetValue] = useState('');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [url, setUrl] = useState('/');
    const [imageUrl, setImageUrl] = useState('');
    const [sending, setSending] = useState(false);
    const [usersMetadata, setUsersMetadata] = useState<any[]>([]);
    
    const titleRef = useRef<HTMLInputElement>(null);
    const messageRef = useRef<HTMLTextAreaElement>(null);
    const [lastFocused, setLastFocused] = useState<'title' | 'message'>('message');

    useEffect(() => {
        fetchTokens();
        fetchMetadata();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                setServiceWorkerRegistration(registration);
                registration.pushManager.getSubscription().then(subscription => {
                    setIsSubscribed(!!subscription);
                });
            });
        }
    }, []);

    const fetchTokens = async () => {
        setLoadingTokens(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${constants.baseURL}/api/push/tokens`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to fetch tokens');
            const data = await response.json();
            setTokens(data);
        } catch (error) {
            console.error('Error fetching tokens', error);
            toast.error('Failed to load connected devices.');
        } finally {
            setLoadingTokens(false);
        }
    };

    const fetchMetadata = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${constants.baseURL}/api/push/metadata`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUsersMetadata(data.users || []);
            }
        } catch (error) {
            console.error('Error fetching metadata', error);
        }
    };

    const handleSubscription = async () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = 'standalone' in navigator && (navigator as any).standalone === true;

        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            if (isIOS && !isStandalone) {
                toast.info('To enable notifications on your iPhone, you must first add this app to your Home Screen.');
            } else {
                toast.error('Push notifications are not supported by your browser.');
            }
            return;
        }

        const vapidPublicKey = getVapidKey();
        if (!vapidPublicKey) {
            toast.error('Push notification configuration is missing.');
            return;
        }

        setLoading(true);
        try {
            const registration = serviceWorkerRegistration || await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                toast.info('You are already subscribed to notifications.');
                setIsSubscribed(true);
                return;
            }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                toast.warn('Permission for notifications was denied.');
                return;
            }

            const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey as BufferSource,
            });

            await subscribeToPush(subscription, user?.username || 'admin');
            toast.success('Successfully subscribed to notifications!');
            setIsSubscribed(true);
            fetchTokens();
        } catch (error: any) {
            toast.error(error.message || 'Failed to subscribe to notifications.');
        } finally {
            setLoading(false);
        }
    };

    const handleSendNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !message) {
            toast.error('Title and message are required.');
            return;
        }

        if (targetMode !== 'ALL' && !targetValue) {
            toast.error(`Please specify a target ${targetMode.toLowerCase()}!`);
            return;
        }

        setSending(true);
        try {
            const payload = {
                title,
                message,
                url,
                imageUrl,
                targetMode,
                targetValue: targetMode === 'ALL' ? undefined : targetValue
            };

            const token = localStorage.getItem('token');
            const res = await fetch(`${constants.baseURL}/api/push/send-advanced`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText);
            }
            
            toast.success('Notification Suite payload dispatched successfully!');
            setTitle('');
            setMessage('');
            setImageUrl('');
        } catch (error: any) {
            console.error('Error sending push', error);
            let errMsg = 'Failed to send notification.';
            try {
                const parsed = JSON.parse(error.message);
                if (parsed.error) errMsg = parsed.error;
            } catch(e) {
                errMsg = error.message || errMsg;
            }
            toast.error(errMsg);
        } finally {
            setSending(false);
        }
    };

    const handleInjectVariable = (variable: string) => {
        const ref = lastFocused === 'title' ? titleRef : messageRef;
        if (ref.current) {
            const input = ref.current;
            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            
            const currentValue = lastFocused === 'title' ? title : message;
            const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end);
            
            if (lastFocused === 'title') {
                setTitle(newValue);
            } else {
                setMessage(newValue);
            }
            
            setTimeout(() => {
                input.focus();
                input.setSelectionRange(start + variable.length, start + variable.length);
            }, 0);
        }
    };

    const uniqueUsers = Array.from(new Set(tokens.map(t => t.user_id)));
    const uniqueSubgroups = Array.from(new Set(usersMetadata.filter(u => u.subgroup && u.subgroup.title).map(u => u.subgroup.title)));
    
    let targetCount = 0;
    if (targetMode === 'ALL') {
        targetCount = tokens.length;
    } else if (targetMode === 'USER') {
        targetCount = tokens.filter(t => t.user_id === targetValue).length;
    } else if (targetMode === 'SUBGROUP') {
        const targetSubgroup = (targetValue || '').toLowerCase();
        const matchedUsernames = usersMetadata.filter(u => u.subgroup && (u.subgroup.title || '').toLowerCase() === targetSubgroup).map(u => u.username);
        targetCount = tokens.filter(t => matchedUsernames.includes(t.user_id)).length;
    }

    return (
        <div className="container mx-auto p-4 space-y-6">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-2">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Notification Suite</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Advanced targeting and variable injection platform</p>
                </div>
                <button
                    onClick={handleSubscription}
                    disabled={isSubscribed || loading}
                    className="mt-4 md:mt-0 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg shadow disabled:bg-gray-400 dark:disabled:bg-gray-600 transition-all flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                    {loading ? 'Registering...' : isSubscribed ? 'Admin Registered' : 'Register Admin Device'}
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-full">
                
                {/* COMPOSER PANEL (LEFT SIDE) */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 flex flex-col h-full">
                    <h2 className="text-xl font-bold mb-6 text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        Compose & Target
                    </h2>
                    
                    <form onSubmit={handleSendNotification} className="space-y-5 flex-1 flex flex-col">
                        {/* Targeting Segment */}
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">1. Select Target Audience</label>
                            <div className="flex gap-4 mb-4">
                                {['ALL', 'SUBGROUP', 'USER'].map((mode) => (
                                    <label key={mode} className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="radio" 
                                            name="targetMode" 
                                            value={mode}
                                            checked={targetMode === mode}
                                            onChange={() => { setTargetMode(mode as any); setTargetValue(''); }}
                                            className="text-blue-600 focus:ring-blue-500 w-4 h-4"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{mode.toLowerCase()}</span>
                                    </label>
                                ))}
                            </div>
                            
                            {targetMode === 'USER' && (
                                <div>
                                    <input
                                        type="text"
                                        list="users-list"
                                        value={targetValue}
                                        onChange={(e) => setTargetValue(e.target.value)}
                                        placeholder="Search User ID or Name..."
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    />
                                    <datalist id="users-list">
                                        {uniqueUsers.map(uid => {
                                            const userObj = usersMetadata.find(u => u.username === uid);
                                            const label = userObj ? `${userObj.name} (${uid})` : uid;
                                            return <option key={uid} value={uid}>{label}</option>
                                        })}
                                    </datalist>
                                </div>
                            )}
                            
                            {targetMode === 'SUBGROUP' && (
                                <div>
                                    <input
                                        type="text"
                                        list="subgroups-list"
                                        value={targetValue}
                                        onChange={(e) => setTargetValue(e.target.value)}
                                        placeholder="Search Subgroup Code or Name..."
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-blue-500 focus:border-blue-500 transition-all"
                                    />
                                    <datalist id="subgroups-list">
                                        {uniqueSubgroups.map((sg: any) => (
                                            <option key={sg} value={sg}>{sg}</option>
                                        ))}
                                    </datalist>
                                </div>
                            )}

                            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                                Targeting {targetCount} active device{targetCount !== 1 ? 's' : ''}
                            </div>
                        </div>

                        {/* Message Segment */}
                        <div className="flex-1 space-y-4">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">2. Message Content</label>
                            
                            {/* Injection Helper */}
                            <div className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800/30 flex gap-2 items-center">
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <span>Inject variables (click to insert): 
                                    <button type="button" onMouseDown={(e) => { e.preventDefault(); handleInjectVariable('{{name}}'); }} className="mx-1 bg-white dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-gray-700 px-1.5 py-0.5 rounded font-mono border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer">{`{{name}}`}</button>, 
                                    <button type="button" onMouseDown={(e) => { e.preventDefault(); handleInjectVariable('{{balance}}'); }} className="mx-1 bg-white dark:bg-gray-800 hover:bg-blue-100 dark:hover:bg-gray-700 px-1.5 py-0.5 rounded font-mono border border-gray-200 dark:border-gray-700 transition-colors cursor-pointer">{`{{balance}}`}</button>
                                </span>
                            </div>

                            <div>
                                <input
                                    ref={titleRef}
                                    onFocus={() => setLastFocused('title')}
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-semibold"
                                    placeholder="Title (e.g. Hello {{name}}!)"
                                    required
                                />
                            </div>
                            
                            <div>
                                <textarea
                                    ref={messageRef}
                                    onFocus={() => setLastFocused('message')}
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-y"
                                    rows={4}
                                    placeholder="Message body. Your current balance is {{balance}}."
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Action URL (Optional)</label>
                                    <input
                                        type="text"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="/app/orders"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Image URL (Optional)</label>
                                    <input
                                        type="text"
                                        value={imageUrl}
                                        onChange={(e) => setImageUrl(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={sending || tokens.length === 0}
                            className="w-full mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg disabled:opacity-50 transition-all transform active:scale-[0.98] flex justify-center items-center gap-2"
                        >
                            {sending ? (
                                <><svg className="animate-spin w-5 h-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Dispatching...</>
                            ) : (
                                <><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg> Broadcast Notification</>
                            )}
                        </button>
                    </form>
                </div>

                {/* RIGHT SIDE: DEVICES */}
                <div className="flex flex-col gap-6 h-full">

                    {/* CONNECTED DEVICES PANEL */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 flex-1 flex flex-col min-h-[300px]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                Connected Devices ({tokens.length})
                            </h2>
                            <button 
                                onClick={fetchTokens} 
                                disabled={loadingTokens}
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full transition-colors"
                            >
                                <svg className={`w-4 h-4 ${loadingTokens ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                {loadingTokens ? 'Refreshing...' : 'Refresh List'}
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto flex-1 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 h-full relative">
                                <thead className="bg-gray-50 dark:bg-gray-700/80 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">User ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Subscribed At</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {tokens.length > 0 ? tokens.map((token) => (
                                        <tr key={token.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">{token.user_id}</td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-bold rounded-md shadow-sm ${token.type === 'fcm' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200 border border-orange-200 dark:border-orange-800' : 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200 border border-green-200 dark:border-green-800'}`}>
                                                    {token.type.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                {new Date(token.created_at).toLocaleString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                                <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                                <p>No devices connected yet.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default PushNotifications; 