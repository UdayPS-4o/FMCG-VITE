/**
 * Slide-up panels opened from the Profile page: payment history, request a
 * detail change, raise an issue, extra contacts and logged-in devices.
 */
import { useEffect, useState } from 'react';
import { Camera, Plus, Smartphone, Trash2 } from 'lucide-react';
import BottomSheet from './BottomSheet';
import {
    fetchSessions, getPastInvoices, logoutOtherDevices, sendProfileRequest,
    type DeviceSession, type LedgerEntry, type ProfileContact,
} from '../../lib/api';
import { formatInr, fyLabel } from '../../lib/statement';

type Lang = 'en' | 'hi';

interface SheetProps {
    open: boolean;
    onClose: () => void;
    language: Lang;
}

const MAX_CONTACTS = 5;
const PHOTO_MAX_SIDE = 900;
const PHOTO_QUALITY = 0.7;
const RECENT_INVOICES = 20;

const INPUT = 'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all';
const LABEL = 'block text-sm font-semibold text-gray-700 mb-1.5';
const PRIMARY = 'w-full bg-indigo-600 text-white font-bold text-base rounded-xl py-3.5 shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-colors active:scale-95 disabled:opacity-60';
const ERROR = 'text-sm text-red-600 font-medium';

/** Shrinks a picked photo to a small JPEG data URL so it is quick to send. */
const photoToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the photo')); };
    img.src = url;
});

// ── Payment history ──────────────────────────────────────────────────────────

export const PaymentsSheet = ({ open, onClose, language, entries, fy }: SheetProps & { entries: LedgerEntry[]; fy: string }) => {
    const tr = (en: string, hi: string) => (language === 'en' ? en : hi);
    const payments = entries.filter(e => e.type === 'CR');
    const total = payments.reduce((sum, e) => sum + e.cr, 0);

    return (
        <BottomSheet open={open} onClose={onClose} title={tr('Payment history', 'भुगतान इतिहास')}>
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-3">
                <span className="text-sm font-medium text-emerald-800">{tr('Paid in FY', 'वित्त वर्ष में भुगतान')} {fyLabel(fy)}</span>
                <span className="font-bold text-emerald-700">{formatInr(total)}</span>
            </div>
            {payments.length === 0 ? (
                <div className="text-center py-6 text-gray-500 text-sm">
                    {tr('No payments recorded in this year', 'इस वर्ष कोई भुगतान दर्ज नहीं है')}
                </div>
            ) : (
                <div className="space-y-2">
                    {payments.map((e, i) => (
                        <div key={i} className="flex justify-between items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="min-w-0">
                                <div className="text-xs text-gray-500 font-medium">{e.date} · {e.book}</div>
                                <div className="text-sm font-medium text-gray-800 break-words">{e.narration || tr('Payment received', 'भुगतान प्राप्त')}</div>
                            </div>
                            <div className="font-bold text-emerald-600 shrink-0">{formatInr(e.cr)}</div>
                        </div>
                    ))}
                </div>
            )}
        </BottomSheet>
    );
};

// ── Request a detail change ──────────────────────────────────────────────────

const CHANGE_FIELDS: Array<[string, string]> = [
    ['Shop name', 'दुकान का नाम'],
    ['Mobile number', 'मोबाइल नंबर'],
    ['Address', 'पता'],
    ['GSTIN', 'जीएसटी नंबर'],
    ['FSSAI number', 'FSSAI नंबर'],
    ['PAN', 'पैन'],
    ['Email', 'ईमेल'],
    ['Other', 'अन्य'],
];

export const RequestChangeSheet = ({ open, onClose, language, onSent }: SheetProps & { onSent: () => void }) => {
    const tr = (en: string, hi: string) => (language === 'en' ? en : hi);
    const [field, setField] = useState(CHANGE_FIELDS[0][0]);
    const [value, setValue] = useState('');
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => { if (open) { setValue(''); setError(''); } }, [open]);

    const submit = async () => {
        if (!value.trim()) { setError(tr('Enter the correct detail', 'सही जानकारी दर्ज करें')); return; }
        setSending(true);
        try {
            await sendProfileRequest({ type: 'change', subject: field, details: `New value: ${value.trim()}` });
            onSent();
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSending(false);
        }
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={tr('Request a change', 'बदलाव का अनुरोध')}>
            <div className="space-y-4">
                <p className="text-sm text-gray-500">
                    {tr('Our team checks the request and updates your account.', 'हमारी टीम अनुरोध जांचकर आपका खाता अपडेट करेगी।')}
                </p>
                <div>
                    <label className={LABEL}>{tr('What should change', 'क्या बदलना है')}</label>
                    <select value={field} onChange={e => setField(e.target.value)} className={INPUT}>
                        {CHANGE_FIELDS.map(([en, hi]) => <option key={en} value={en}>{tr(en, hi)}</option>)}
                    </select>
                </div>
                <div>
                    <label className={LABEL}>{tr('Correct detail', 'सही जानकारी')}</label>
                    <textarea value={value} onChange={e => { setValue(e.target.value); setError(''); }} rows={3} maxLength={500} className={INPUT} />
                </div>
                {error && <div className={ERROR}>{error}</div>}
                <button onClick={submit} disabled={sending} className={PRIMARY}>
                    {sending ? tr('Sending…', 'भेजा जा रहा है…') : tr('Send request', 'अनुरोध भेजें')}
                </button>
            </div>
        </BottomSheet>
    );
};

// ── Raise an issue ───────────────────────────────────────────────────────────

const ISSUE_TYPES: Array<[string, string]> = [
    ['Short supply', 'कम माल मिला'],
    ['Damaged goods', 'खराब माल'],
    ['Wrong bill or rate', 'गलत बिल या रेट'],
    ['Delivery problem', 'डिलीवरी की समस्या'],
    ['Other', 'अन्य'],
];

interface InvoiceOption { SERIES: string; BILL: number | string; N_B_AMT?: number }

export const IssueSheet = ({ open, onClose, language, onSent }: SheetProps & { onSent: () => void }) => {
    const tr = (en: string, hi: string) => (language === 'en' ? en : hi);
    const [type, setType] = useState(ISSUE_TYPES[0][0]);
    const [invoice, setInvoice] = useState('');
    const [details, setDetails] = useState('');
    const [photo, setPhoto] = useState<string | null>(null);
    const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!open) return;
        setDetails(''); setPhoto(null); setInvoice(''); setError('');
        getPastInvoices()
            .then((rows: InvoiceOption[]) => setInvoices(rows.slice(0, RECENT_INVOICES)))
            .catch(() => setInvoices([]));
    }, [open]);

    const pickPhoto = async (file?: File) => {
        if (!file) return;
        try {
            setPhoto(await photoToDataUrl(file));
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const submit = async () => {
        if (!details.trim()) { setError(tr('Describe the problem', 'समस्या लिखें')); return; }
        setSending(true);
        try {
            await sendProfileRequest({ type: 'issue', subject: type, invoice, details: details.trim(), photo });
            onSent();
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSending(false);
        }
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={tr('Raise an issue', 'समस्या दर्ज करें')}>
            <div className="space-y-4">
                <div>
                    <label className={LABEL}>{tr('Issue', 'समस्या')}</label>
                    <select value={type} onChange={e => setType(e.target.value)} className={INPUT}>
                        {ISSUE_TYPES.map(([en, hi]) => <option key={en} value={en}>{tr(en, hi)}</option>)}
                    </select>
                </div>
                <div>
                    <label className={LABEL}>{tr('Bill (optional)', 'बिल (वैकल्पिक)')}</label>
                    <select value={invoice} onChange={e => setInvoice(e.target.value)} className={INPUT}>
                        <option value="">{tr('Not about one bill', 'किसी एक बिल से संबंधित नहीं')}</option>
                        {invoices.map(inv => {
                            const id = `${inv.SERIES}-${inv.BILL}`;
                            return <option key={id} value={id}>{id}{inv.N_B_AMT ? ` · ${formatInr(Number(inv.N_B_AMT))}` : ''}</option>;
                        })}
                    </select>
                </div>
                <div>
                    <label className={LABEL}>{tr('What went wrong', 'क्या गलत हुआ')}</label>
                    <textarea value={details} onChange={e => { setDetails(e.target.value); setError(''); }} rows={3} maxLength={1000} className={INPUT} />
                </div>
                <div>
                    <label className="flex items-center justify-center gap-2 w-full py-3 border border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 cursor-pointer hover:bg-gray-50">
                        <Camera size={16} />
                        {photo ? tr('Change photo', 'फोटो बदलें') : tr('Add a photo (optional)', 'फोटो जोड़ें (वैकल्पिक)')}
                        <input type="file" accept="image/*" className="hidden" onChange={e => pickPhoto(e.target.files?.[0])} />
                    </label>
                    {photo && (
                        <div className="mt-2 flex items-center gap-3">
                            <img src={photo} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                            <button onClick={() => setPhoto(null)} className="text-sm font-medium text-red-600">{tr('Remove photo', 'फोटो हटाएं')}</button>
                        </div>
                    )}
                </div>
                {error && <div className={ERROR}>{error}</div>}
                <button onClick={submit} disabled={sending} className={PRIMARY}>
                    {sending ? tr('Sending…', 'भेजा जा रहा है…') : tr('Send issue', 'समस्या भेजें')}
                </button>
            </div>
        </BottomSheet>
    );
};

// ── Extra contacts ───────────────────────────────────────────────────────────

const CONTACT_ROLES: Array<[string, string]> = [
    ['Owner', 'मालिक'],
    ['Accountant', 'अकाउंटेंट'],
    ['Staff', 'स्टाफ'],
    ['Family', 'परिवार'],
];

export const ContactsSheet = ({ open, onClose, language, contacts, onSave }: SheetProps & {
    contacts: ProfileContact[];
    onSave: (contacts: ProfileContact[]) => Promise<void>;
}) => {
    const tr = (en: string, hi: string) => (language === 'en' ? en : hi);
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [role, setRole] = useState(CONTACT_ROLES[1][0]);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (open) { setName(''); setMobile(''); setError(''); } }, [open]);

    const save = async (next: ProfileContact[]) => {
        setSaving(true);
        try {
            await onSave(next);
            setName(''); setMobile(''); setError('');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const add = () => {
        if (!name.trim()) { setError(tr('Enter a name', 'नाम दर्ज करें')); return; }
        if (!/^\d{10}$/.test(mobile)) { setError(tr('Enter a 10-digit mobile number', '10 अंकों का मोबाइल नंबर दर्ज करें')); return; }
        save([...contacts, { name: name.trim(), mobile, role }]);
    };

    const roleLabel = (r: string) => {
        const found = CONTACT_ROLES.find(([en]) => en === r);
        return found ? tr(found[0], found[1]) : r;
    };

    return (
        <BottomSheet open={open} onClose={onClose} title={tr('Contacts', 'संपर्क')}>
            <div className="space-y-3">
                {contacts.length === 0 && (
                    <p className="text-sm text-gray-500">
                        {tr('Add your accountant or staff so we know who else to reach.', 'अपने अकाउंटेंट या स्टाफ को जोड़ें ताकि हमें पता रहे किससे संपर्क करना है।')}
                    </p>
                )}
                {contacts.map((c, i) => (
                    <div key={`${c.mobile}-${i}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{c.name}</div>
                            <div className="text-xs text-gray-500">{roleLabel(c.role)} · {c.mobile}</div>
                        </div>
                        <button
                            onClick={() => save(contacts.filter((_, idx) => idx !== i))}
                            disabled={saving}
                            aria-label={tr('Remove contact', 'संपर्क हटाएं')}
                            className="p-2 bg-red-50 rounded-lg text-red-500"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}

                {contacts.length < MAX_CONTACTS ? (
                    <div className="pt-2 space-y-3 border-t border-gray-100">
                        <input value={name} onChange={e => { setName(e.target.value); setError(''); }} placeholder={tr('Name', 'नाम')} maxLength={60} className={INPUT} />
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                value={mobile}
                                onChange={e => { setMobile(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                                placeholder={tr('Mobile', 'मोबाइल')}
                                inputMode="numeric"
                                className={INPUT}
                            />
                            <select value={role} onChange={e => setRole(e.target.value)} className={INPUT}>
                                {CONTACT_ROLES.map(([en, hi]) => <option key={en} value={en}>{tr(en, hi)}</option>)}
                            </select>
                        </div>
                        {error && <div className={ERROR}>{error}</div>}
                        <button onClick={add} disabled={saving} className={`${PRIMARY} flex items-center justify-center gap-2`}>
                            <Plus size={18} /> {tr('Add contact', 'संपर्क जोड़ें')}
                        </button>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">{tr(`You can keep up to ${MAX_CONTACTS} contacts.`, `आप अधिकतम ${MAX_CONTACTS} संपर्क रख सकते हैं।`)}</p>
                )}
            </div>
        </BottomSheet>
    );
};

// ── Logged-in devices ────────────────────────────────────────────────────────

/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS" */
const formatUtc = (s: string | null) => {
    if (!s) return '';
    const d = new Date(`${s.replace(' ', 'T')}Z`);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const DevicesSheet = ({ open, onClose, language }: SheetProps) => {
    const tr = (en: string, hi: string) => (language === 'en' ? en : hi);
    const [sessions, setSessions] = useState<DeviceSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = () => {
        setLoading(true);
        fetchSessions()
            .then(rows => { setSessions(rows); setError(''); })
            .catch(err => setError((err as Error).message))
            .finally(() => setLoading(false));
    };

    useEffect(() => { if (open) load(); }, [open]);

    const logoutOthers = async () => {
        try {
            await logoutOtherDevices();
            load();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const others = sessions.filter(s => !s.current).length;

    return (
        <BottomSheet open={open} onClose={onClose} title={tr('Logged-in devices', 'लॉग-इन डिवाइस')}>
            {loading ? (
                <div className="flex justify-center p-4">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="space-y-2">
                    {sessions.map(s => (
                        <div key={s.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="p-2 bg-white rounded-lg text-gray-500 shadow-sm"><Smartphone size={16} /></div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-800 truncate">{s.device}</div>
                                <div className="text-xs text-gray-500">
                                    {tr('Logged in', 'लॉग-इन')} {formatUtc(s.createdAt)}
                                    {s.lastSeen ? ` · ${tr('last used', 'पिछला उपयोग')} ${formatUtc(s.lastSeen)}` : ''}
                                </div>
                            </div>
                            {s.current && (
                                <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full font-semibold shrink-0">
                                    {tr('This device', 'यह डिवाइस')}
                                </span>
                            )}
                        </div>
                    ))}
                    {error && <div className={ERROR}>{error}</div>}
                    {others > 0 && (
                        <button onClick={logoutOthers} className="w-full mt-2 py-3 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
                            {tr(`Log out ${others} other ${others === 1 ? 'device' : 'devices'}`, `अन्य ${others} डिवाइस से लॉग आउट करें`)}
                        </button>
                    )}
                </div>
            )}
        </BottomSheet>
    );
};
