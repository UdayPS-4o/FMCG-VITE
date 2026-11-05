import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { BellRing, ImagePlus, Loader2, Megaphone, RefreshCw, Send, Trash2, X } from 'lucide-react';
import constants from '../../constants';

type Frequency = 'ONCE' | 'HOURLY' | 'EVERY_PAGE';
type TargetMode = 'ALL' | 'SUBGROUP' | 'USER';

interface Promotion {
    id: number;
    title: string;
    message: string;
    mediaUrl: string;
    actionUrl: string;
    ctaText: string;
    frequency: Frequency;
    targetMode: TargetMode;
    targetValue: string;
    startDate: string | null;
    endDate: string | null;
    isActive: boolean;
    pushSent: boolean;
    createdAt: string;
}

interface Props {
    usersMetadata: any[];
    tokens: { user_id: string }[];
}

const FREQUENCIES: { key: Frequency; label: string; hint: string }[] = [
    { key: 'ONCE', label: 'Show only once', hint: 'Shown after login until the user closes it with X — never again after that.' },
    { key: 'HOURLY', label: 'Every hour', hint: 'Shown at most once every hour while the app is being used.' },
    { key: 'EVERY_PAGE', label: 'Every page change', hint: 'Shown every time the user opens another page.' },
];
const FREQ_LABEL: Record<Frequency, string> = { ONCE: 'Once', HOURLY: 'Hourly', EVERY_PAGE: 'Every page' };
const MAX_BYTES = 8 * 1024 * 1024;

const api = `${constants.baseURL}/api/app/admin/promotions`;
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
});
const mediaSrc = (url: string) => (/^https?:\/\//i.test(url) ? url : `${constants.baseURL}${url}`);
const errorOf = async (res: Response, fallback: string) => {
    try { return (await res.json()).error || fallback; } catch { return fallback; }
};

const inputCls = 'w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 dark:text-white rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm';
const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1';

const InAppPromotions: React.FC<Props> = ({ usersMetadata, tokens }) => {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [loadingList, setLoadingList] = useState(false);

    const [targetMode, setTargetMode] = useState<TargetMode>('ALL');
    const [targetValue, setTargetValue] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [ctaText, setCtaText] = useState('');
    const [actionUrl, setActionUrl] = useState('');
    const [frequency, setFrequency] = useState<Frequency>('ONCE');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [sendPush, setSendPush] = useState(true);
    const [publishing, setPublishing] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const subgroups = Array.from(new Set(usersMetadata.filter(u => u.subgroup?.title).map(u => u.subgroup.title as string)));
    const partyOptions = Array.from(new Set([
        ...tokens.map(t => t.user_id).filter(id => !id.startsWith('user:') && id.toUpperCase() !== 'ADMIN'),
        ...usersMetadata.map(u => u.username).filter(Boolean),
    ]));

    const fetchPromotions = async () => {
        setLoadingList(true);
        try {
            const res = await fetch(api, { headers: authHeaders() });
            if (!res.ok) throw new Error(await errorOf(res, 'Failed to load promotions'));
            setPromotions(await res.json());
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setLoadingList(false);
        }
    };

    useEffect(() => { fetchPromotions(); }, []);

    const uploadFile = (file: File) => {
        if (!/^image\/(gif|png|jpe?g|webp)$/i.test(file.type)) {
            toast.error('Please choose a GIF, PNG, JPG or WEBP image.');
            return;
        }
        if (file.size > MAX_BYTES) {
            toast.error('File is larger than 8 MB.');
            return;
        }
        setUploading(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const res = await fetch(`${api}/upload`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ fileBase64: reader.result, filename: file.name }),
                });
                if (!res.ok) throw new Error(await errorOf(res, 'Upload failed'));
                const data = await res.json();
                setMediaUrl(data.url);
                toast.success('Image uploaded');
            } catch (err: any) {
                toast.error(err.message);
            } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = '';
            }
        };
        reader.readAsDataURL(file);
    };

    const resetForm = () => {
        setMediaUrl(''); setTitle(''); setMessage(''); setCtaText(''); setActionUrl('');
        setStartDate(''); setEndDate(''); setTargetMode('ALL'); setTargetValue(''); setFrequency('ONCE');
    };

    const publish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!mediaUrl) return toast.error('Please upload an image or GIF.');
        if (targetMode !== 'ALL' && !targetValue.trim()) return toast.error(`Please choose a target ${targetMode.toLowerCase()}.`);
        if (sendPush && !title.trim()) return toast.error('Notification title is required when sending a push notification.');
        if (startDate && endDate && new Date(endDate) <= new Date(startDate)) return toast.error('End time must be after start time.');

        setPublishing(true);
        try {
            const res = await fetch(api, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    title, message, mediaUrl, actionUrl: actionUrl.trim(), ctaText: ctaText.trim(), frequency,
                    targetMode, targetValue: targetMode === 'ALL' ? '' : targetValue.trim(),
                    startDate: startDate ? new Date(startDate).toISOString() : null,
                    endDate: endDate ? new Date(endDate).toISOString() : null,
                    sendPush,
                }),
            });
            if (!res.ok) throw new Error(await errorOf(res, 'Failed to publish promotion'));
            const data = await res.json();
            toast.success(sendPush
                ? `Promotion is live — push sent to ${data.pushedDevices} device(s).`
                : 'Promotion is live in the app.');
            resetForm();
            fetchPromotions();
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setPublishing(false);
        }
    };

    const toggleActive = async (p: Promotion) => {
        setBusyId(p.id);
        try {
            const res = await fetch(`${api}/${p.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ isActive: !p.isActive }) });
            if (!res.ok) throw new Error(await errorOf(res, 'Update failed'));
            setPromotions(list => list.map(x => (x.id === p.id ? { ...x, isActive: !p.isActive } : x)));
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const resendPush = async (p: Promotion) => {
        if (!window.confirm('Send this promotion as a push notification again?')) return;
        setBusyId(p.id);
        try {
            const res = await fetch(`${api}/${p.id}/push`, { method: 'POST', headers: authHeaders() });
            if (!res.ok) throw new Error(await errorOf(res, 'Push failed'));
            const data = await res.json();
            toast.success(`Push sent to ${data.pushedDevices} device(s).`);
            setPromotions(list => list.map(x => (x.id === p.id ? { ...x, pushSent: true } : x)));
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (p: Promotion) => {
        if (!window.confirm('Delete this promotion? It will stop showing in the app.')) return;
        setBusyId(p.id);
        try {
            const res = await fetch(`${api}/${p.id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) throw new Error(await errorOf(res, 'Delete failed'));
            setPromotions(list => list.filter(x => x.id !== p.id));
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setBusyId(null);
        }
    };

    const statusOf = (p: Promotion) => {
        const now = new Date();
        if (!p.isActive) return { text: 'Paused', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
        if (p.startDate && new Date(p.startDate) > now) return { text: 'Scheduled', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200' };
        if (p.endDate && new Date(p.endDate) < now) return { text: 'Expired', cls: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200' };
        return { text: 'Live', cls: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200' };
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* COMPOSER */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <h2 className="text-xl font-bold mb-6 text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-purple-500" /> Create In-App Promotion
                </h2>

                <form onSubmit={publish} className="space-y-5">
                    {/* 1. Target */}
                    <div className="bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">1. Select Target Audience</label>
                        <div className="flex gap-4 mb-3">
                            {(['ALL', 'SUBGROUP', 'USER'] as TargetMode[]).map(mode => (
                                <label key={mode} className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="promoTarget" checked={targetMode === mode}
                                        onChange={() => { setTargetMode(mode); setTargetValue(''); }}
                                        className="text-blue-600 focus:ring-blue-500 w-4 h-4" />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{mode.toLowerCase()}</span>
                                </label>
                            ))}
                        </div>
                        {targetMode === 'SUBGROUP' && (
                            <select value={targetValue} onChange={e => setTargetValue(e.target.value)} className={inputCls}>
                                <option value="">Choose a subgroup…</option>
                                {subgroups.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        )}
                        {targetMode === 'USER' && (
                            <>
                                <input list="promo-party-codes" value={targetValue} onChange={e => setTargetValue(e.target.value)}
                                    placeholder="Party code(s), comma separated — e.g. BU216, BC016" className={inputCls} />
                                <datalist id="promo-party-codes">
                                    {partyOptions.map(code => (
                                        <option key={code} value={code}>{usersMetadata.find(u => u.username === code)?.name || ''}</option>
                                    ))}
                                </datalist>
                            </>
                        )}
                    </div>

                    {/* 2. Media */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">2. Promotion Image / GIF</label>
                        <input ref={fileRef} type="file" accept="image/gif,image/png,image/jpeg,image/webp" className="hidden"
                            onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                        {mediaUrl ? (
                            <div className="relative inline-block">
                                <img src={mediaSrc(mediaUrl)} alt="Promotion" className="max-h-56 rounded-lg border border-gray-200 dark:border-gray-600" />
                                <button type="button" onClick={() => setMediaUrl('')}
                                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div
                                onClick={() => !uploading && fileRef.current?.click()}
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); }}
                                className={`cursor-pointer border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 transition-colors ${dragOver
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                            >
                                {uploading ? <Loader2 className="w-8 h-8 animate-spin text-blue-500" /> : <ImagePlus className="w-8 h-8 text-gray-400" />}
                                <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">{uploading ? 'Uploading…' : 'Click or drop an image / GIF here'}</p>
                                <p className="text-xs text-gray-400">GIF, PNG, JPG, WEBP · up to 8 MB · portrait (e.g. 1080×1350) looks best</p>
                            </div>
                        )}
                    </div>

                    {/* 3. Display frequency */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">3. When to show</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {FREQUENCIES.map(f => (
                                <button type="button" key={f.key} onClick={() => setFrequency(f.key)}
                                    className={`text-left p-3 rounded-lg border transition-all ${frequency === f.key
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500'
                                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}>
                                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{f.label}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{f.hint}</div>
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                                <label className={labelCls}>Start (optional)</label>
                                <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>End (optional)</label>
                                <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
                            </div>
                        </div>
                    </div>

                    {/* 4. Button / link */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">4. Button (optional)</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Button text</label>
                                <input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="e.g. Shop Now" className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Opens</label>
                                <input value={actionUrl} onChange={e => setActionUrl(e.target.value)} placeholder="/search?q=dove or https://…" className={inputCls} />
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Leave "Opens" empty to show the image with only the X button.</p>
                    </div>

                    {/* 5. Push notification */}
                    <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-lg border border-amber-200 dark:border-amber-800/50 space-y-3">
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={sendPush} onChange={e => setSendPush(e.target.checked)} className="mt-0.5 w-4 h-4 text-blue-600 rounded" />
                            <span>
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1"><BellRing className="w-4 h-4" /> Also send as push notification</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">Users with the app closed get a normal notification with this image; tapping it opens the promotion.</span>
                            </span>
                        </label>
                        {sendPush && (
                            <>
                                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title (e.g. Diwali Mega Offer 🎉)" className={inputCls} />
                                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} placeholder="Notification message (e.g. Flat 10% off on Dove — today only)" className={inputCls} />
                            </>
                        )}
                    </div>

                    <button type="submit" disabled={publishing || uploading}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg disabled:opacity-50 transition-all active:scale-[0.98] flex justify-center items-center gap-2">
                        {publishing ? <><Loader2 className="w-5 h-5 animate-spin" /> Publishing…</> : <><Megaphone className="w-5 h-5" /> Publish Promotion</>}
                    </button>
                </form>
            </div>

            {/* RIGHT: preview + list */}
            <div className="flex flex-col gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">App Preview</h2>
                    <div className="mx-auto w-[260px] h-[460px] rounded-[2rem] border-[6px] border-gray-800 bg-gray-200 dark:bg-gray-900 relative overflow-hidden shadow-xl">
                        <div className="absolute inset-0 bg-black/55 flex items-center justify-center p-4">
                            {mediaUrl ? (
                                <div className="relative w-full bg-white rounded-xl overflow-hidden shadow-2xl">
                                    <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/45 text-white flex items-center justify-center"><X className="w-3.5 h-3.5" /></span>
                                    <img src={mediaSrc(mediaUrl)} alt="" className="w-full max-h-[330px] object-contain bg-gray-100 block" />
                                    {actionUrl.trim() && (
                                        <div className="p-2">
                                            <div className="w-full py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold text-center">{ctaText.trim() || 'View Offer'}</div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-white/70 text-sm text-center">Upload an image to preview the popup</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 flex-1">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Promotions ({promotions.length})</h2>
                        <button onClick={fetchPromotions} disabled={loadingList}
                            className="text-blue-600 dark:text-blue-400 text-sm font-medium flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full">
                            <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                    </div>
                    {promotions.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No promotions yet.</p>
                    ) : (
                        <ul className="space-y-3">
                            {promotions.map(p => {
                                const st = statusOf(p);
                                return (
                                    <li key={p.id} className="flex gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <img src={mediaSrc(p.mediaUrl)} alt="" className="w-16 h-16 object-cover rounded-md bg-gray-100 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{p.title || `Promotion #${p.id}`}</span>
                                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {FREQ_LABEL[p.frequency]} · {p.targetMode === 'ALL' ? 'All users' : `${p.targetMode.toLowerCase()}: ${p.targetValue}`}
                                                {p.pushSent && ' · push sent'}
                                            </div>
                                            {(p.startDate || p.endDate) && (
                                                <div className="text-xs text-gray-400 mt-0.5">
                                                    {p.startDate ? new Date(p.startDate).toLocaleString() : 'now'} → {p.endDate ? new Date(p.endDate).toLocaleString() : 'no end'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <button type="button" onClick={() => toggleActive(p)} disabled={busyId === p.id} title={p.isActive ? 'Pause' : 'Activate'}
                                                className={`relative w-10 h-5 rounded-full transition-colors ${p.isActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.isActive ? 'left-5' : 'left-0.5'}`} />
                                            </button>
                                            <div className="flex gap-1">
                                                <button type="button" onClick={() => resendPush(p)} disabled={busyId === p.id} title="Send push notification"
                                                    className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"><Send className="w-4 h-4" /></button>
                                                <button type="button" onClick={() => remove(p)} disabled={busyId === p.id} title="Delete"
                                                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InAppPromotions;
