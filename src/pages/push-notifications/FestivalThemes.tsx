import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { CalendarClock, Info, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import constants from '../../constants';

/**
 * Festival themes (Notification Suite tab).
 * Schedules a festive look for the customer app's home page between a start and
 * end time. After the end time the app returns to its normal look by itself.
 * See server/routes/app/festivalThemes.js.
 */

type Festival = 'DIWALI' | 'CHRISTMAS' | 'NEW_YEAR' | 'HOLI' | 'EID' | 'CUSTOM';
type Effect = 'rockets' | 'chakri' | 'lights' | 'none';

interface Variant { label: string; bgFrom: string; bgTo: string; accent: string; effect: Effect; }
interface Theme {
    id?: number;
    name: string;
    festival: Festival;
    startAt: string;
    endAt: string;
    variants: Variant[];
    allowSwitch: boolean;
    effectsEnabled: boolean;
    isActive: boolean;
}

const FESTIVALS: { key: Festival; label: string }[] = [
    { key: 'DIWALI', label: 'Diwali' },
    { key: 'CHRISTMAS', label: 'Christmas' },
    { key: 'NEW_YEAR', label: 'New Year' },
    { key: 'HOLI', label: 'Holi' },
    { key: 'EID', label: 'Eid' },
    { key: 'CUSTOM', label: 'Other festival' },
];

// Effects that exist in the app today. Others are listed as "coming soon" so a
// festival can be scheduled now and its animation added before it starts.
const EFFECTS: { key: Effect; label: string }[] = [
    { key: 'rockets', label: 'Rockets' },
    { key: 'chakri', label: 'Chakri' },
    { key: 'lights', label: 'Decorative lights' },
    { key: 'none', label: 'No effect (colours only)' },
];
const COMING_SOON: Record<Festival, string[]> = {
    DIWALI: [],
    CHRISTMAS: ['Snowfall', 'Twinkle lights'],
    NEW_YEAR: ['Fireworks', 'Confetti'],
    HOLI: ['Colour splash'],
    EID: ['Crescent glow'],
    CUSTOM: [],
};

const DEFAULT_VARIANTS: Record<Festival, Variant[]> = {
    DIWALI: [
        { label: 'Rockets', bgFrom: '#070d2b', bgTo: '#1e2a78', accent: '#fbbf24', effect: 'rockets' },
        { label: 'Chakri', bgFrom: '#3d0a0a', bgTo: '#9a1b1b', accent: '#fb923c', effect: 'chakri' },
        { label: 'Lights', bgFrom: '#120a02', bgTo: '#5a2d08', accent: '#ffcf6b', effect: 'lights' },
    ],
    CHRISTMAS: [
        { label: 'Red', bgFrom: '#7f1d1d', bgTo: '#b91c1c', accent: '#fef3c7', effect: 'none' },
        { label: 'Green', bgFrom: '#064e3b', bgTo: '#047857', accent: '#fde68a', effect: 'none' },
        { label: 'Night', bgFrom: '#0f172a', bgTo: '#334155', accent: '#e2e8f0', effect: 'none' },
    ],
    NEW_YEAR: [
        { label: 'Gold', bgFrom: '#0b0b0b', bgTo: '#1f2937', accent: '#facc15', effect: 'none' },
        { label: 'Party', bgFrom: '#1e1b4b', bgTo: '#4338ca', accent: '#f9a8d4', effect: 'none' },
        { label: 'Fresh', bgFrom: '#022c22', bgTo: '#065f46', accent: '#a7f3d0', effect: 'none' },
    ],
    HOLI: [
        { label: 'Pink', bgFrom: '#831843', bgTo: '#db2777', accent: '#fde047', effect: 'none' },
        { label: 'Green', bgFrom: '#14532d', bgTo: '#16a34a', accent: '#f9a8d4', effect: 'none' },
        { label: 'Blue', bgFrom: '#1e3a8a', bgTo: '#2563eb', accent: '#fdba74', effect: 'none' },
    ],
    EID: [
        { label: 'Emerald', bgFrom: '#022c22', bgTo: '#065f46', accent: '#fde68a', effect: 'none' },
        { label: 'Night', bgFrom: '#0c0a3e', bgTo: '#312e81', accent: '#fef3c7', effect: 'none' },
        { label: 'Gold', bgFrom: '#422006', bgTo: '#854d0e', accent: '#fef9c3', effect: 'none' },
    ],
    CUSTOM: [
        { label: 'Set 1', bgFrom: '#1e293b', bgTo: '#334155', accent: '#fbbf24', effect: 'none' },
    ],
};

const api = `${constants.baseURL}/api/app/admin/festival-themes`;
const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
});
const errorOf = async (res: Response, fallback: string) => {
    try { return (await res.json()).error || fallback; } catch { return fallback; }
};

// ISO <-> value for <input type="datetime-local"> (local time, no seconds)
const toLocalInput = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');
const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const statusOf = (t: Theme, now = new Date()) => {
    if (!t.isActive) return { label: 'Paused', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300' };
    if (new Date(t.endAt) <= now) return { label: 'Ended', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' };
    if (new Date(t.startAt) <= now) return { label: 'Live now', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' };
    return { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' };
};

const blankTheme = (festival: Festival = 'DIWALI'): Theme => ({
    name: '',
    festival,
    startAt: '',
    endAt: '',
    variants: DEFAULT_VARIANTS[festival].map(v => ({ ...v })),
    allowSwitch: true,
    effectsEnabled: true,
    isActive: true,
});

const inputCls = 'w-full p-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 dark:text-white rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm';
const labelCls = 'block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1';

const Toggle = ({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) => (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span>
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>
        </span>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" />
    </label>
);

const FestivalThemes: React.FC = () => {
    const [themes, setThemes] = useState<Theme[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Theme>(blankTheme());
    const [error, setError] = useState('');

    const set = <K extends keyof Theme>(k: K, v: Theme[K]) => { setForm(f => ({ ...f, [k]: v })); setError(''); };
    const setVariant = (i: number, patch: Partial<Variant>) =>
        setForm(f => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch(api, { headers: authHeaders() });
            if (!res.ok) throw new Error(await errorOf(res, 'Failed to load festival themes'));
            setThemes(await res.json());
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const changeFestival = (festival: Festival) => {
        // New themes pick up the festival's suggested colours
        setForm(f => f.id ? { ...f, festival } : {
            ...f,
            festival,
            variants: DEFAULT_VARIANTS[festival].map(v => ({ ...v })),
        });
        setError('');
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) return setError('Enter a theme name');
        if (!form.startAt || !form.endAt) return setError('Pick both a start and an end time');
        if (new Date(form.endAt) <= new Date(form.startAt)) return setError('End time must be after the start time');

        setSaving(true);
        try {
            const res = await fetch(form.id ? `${api}/${form.id}` : api, {
                method: form.id ? 'PUT' : 'POST',
                headers: authHeaders(),
                body: JSON.stringify(form),
            });
            if (!res.ok) throw new Error(await errorOf(res, 'Failed to save theme'));
            const { theme } = await res.json();
            toast.success(form.id ? 'Theme updated' : 'Theme scheduled');
            setForm(theme);
            load();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (t: Theme) => {
        if (!t.id || !window.confirm(`Delete "${t.name}"? The app goes back to its normal look if this theme is live.`)) return;
        try {
            const res = await fetch(`${api}/${t.id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) throw new Error(await errorOf(res, 'Failed to delete theme'));
            toast.success('Theme deleted');
            if (form.id === t.id) setForm(blankTheme());
            load();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const formStatus = useMemo(() => (form.startAt && form.endAt ? statusOf(form) : null), [form]);
    const comingSoon = COMING_SOON[form.festival];

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
            {/* THEME LIST */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><CalendarClock size={18} className="text-blue-500" /> Festival themes</h2>
                    <div className="flex gap-2">
                        <button type="button" onClick={load} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Refresh"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
                        <button type="button" onClick={() => { setForm(blankTheme()); setError(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"><Plus size={15} /> New theme</button>
                    </div>
                </div>
                <div className="flex-1 divide-y divide-gray-100 dark:divide-gray-700">
                    {themes.length === 0 && !loading && (
                        <p className="p-6 text-sm text-gray-500 dark:text-gray-400 text-center">No festival themes yet. Create one for the next festival.</p>
                    )}
                    {themes.map(t => {
                        const st = statusOf(t);
                        const selected = form.id === t.id;
                        return (
                            <div key={t.id} onClick={() => { setForm({ ...t }); setError(''); }}
                                className={`p-4 cursor-pointer flex items-center gap-3 transition-colors ${selected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
                                <div className="flex -space-x-1.5 shrink-0">
                                    {t.variants.map((v, i) => (
                                        <span key={i} className="w-5 h-5 rounded-full border-2 border-white dark:border-gray-800" style={{ background: `linear-gradient(135deg, ${v.bgFrom}, ${v.bgTo})` }} />
                                    ))}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{t.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(t.startAt)} – {fmtDate(t.endAt)}</p>
                                </div>
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                                <button type="button" onClick={(e) => { e.stopPropagation(); remove(t); }} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30" aria-label={`Delete ${t.name}`}><Trash2 size={15} /></button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* EDITOR */}
            <form onSubmit={save} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 space-y-5">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <Sparkles size={18} className="text-amber-500" /> {form.id ? `Edit: ${form.name}` : 'New festival theme'}
                    </h2>
                    {formStatus && <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${formStatus.cls}`}>{formStatus.label}</span>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Theme name</label>
                        <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Diwali 2026" />
                    </div>
                    <div>
                        <label className={labelCls}>Festival</label>
                        <select className={inputCls} value={form.festival} onChange={e => changeFestival(e.target.value as Festival)}>
                            {FESTIVALS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Starts</label>
                        <input type="datetime-local" className={inputCls} value={toLocalInput(form.startAt)} onChange={e => set('startAt', fromLocalInput(e.target.value))} />
                    </div>
                    <div>
                        <label className={labelCls}>Ends (normal theme returns automatically)</label>
                        <input type="datetime-local" className={inputCls} value={toLocalInput(form.endAt)} onChange={e => set('endAt', fromLocalInput(e.target.value))} />
                    </div>
                </div>

                <div>
                    <label className={labelCls}>Background colour sets retailers can switch between (top → bottom of the home page)</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {form.variants.map((v, i) => (
                            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                                <div className="h-14 flex items-end p-2" style={{ background: `linear-gradient(180deg, ${v.bgFrom}, ${v.bgTo})` }}>
                                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: v.accent, color: v.bgFrom }}>{v.label || `Set ${i + 1}`}</span>
                                </div>
                                <div className="p-2.5 space-y-2">
                                    <input className={inputCls} value={v.label} onChange={e => setVariant(i, { label: e.target.value })} placeholder={`Set ${i + 1}`} aria-label={`Set ${i + 1} name`} />
                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        {(['bgFrom', 'bgTo', 'accent'] as const).map(k => (
                                            <label key={k} className="flex flex-col items-center gap-0.5 cursor-pointer">
                                                <input type="color" value={v[k]} onChange={e => setVariant(i, { [k]: e.target.value })} className="w-9 h-7 rounded border border-gray-300 dark:border-gray-600 cursor-pointer" />
                                                {k === 'bgFrom' ? 'Top' : k === 'bgTo' ? 'Bottom' : 'Accent'}
                                            </label>
                                        ))}
                                    </div>
                                    <select className={inputCls} value={v.effect} onChange={e => setVariant(i, { effect: e.target.value as Effect })} aria-label={`Set ${i + 1} effect`}>
                                        {EFFECTS.map(ef => <option key={ef.key} value={ef.key}>{ef.label}</option>)}
                                        {comingSoon.map(c => <option key={c} disabled>{c} (coming soon)</option>)}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                        {form.variants.length < 3 && (
                            <button type="button" onClick={() => set('variants', [...form.variants, { label: `Set ${form.variants.length + 1}`, bgFrom: '#1e293b', bgTo: '#334155', accent: '#fbbf24', effect: 'none' }])}
                                className="text-xs font-semibold text-blue-600 hover:underline">+ Add colour set</button>
                        )}
                        {form.variants.length > 1 && (
                            <button type="button" onClick={() => set('variants', form.variants.slice(0, -1))} className="text-xs font-semibold text-gray-500 hover:underline">Remove last set</button>
                        )}
                    </div>
                </div>

                <div className="space-y-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 p-4 border border-gray-200 dark:border-gray-600">
                    <Toggle checked={form.allowSwitch} onChange={v => set('allowSwitch', v)} label="Show theme switch button" hint="Retailers can switch between the colour sets on the home page." />
                    <Toggle checked={form.effectsEnabled} onChange={v => set('effectsEnabled', v)} label="Play animated effects" hint="Rockets, chakri and lights. Turn off to show festive colours only." />
                    <Toggle checked={form.isActive} onChange={v => set('isActive', v)} label="Enabled" hint="Turn off to pause this theme without deleting it." />
                </div>

                {comingSoon.length > 0 && (
                    <p className="flex gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                        <Info size={14} className="shrink-0 mt-0.5" />
                        {comingSoon.join(' and ')} effects for this festival will be added to the app before it starts. Until then, schedule it with colours only.
                    </p>
                )}

                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                <div className="flex justify-end gap-3">
                    {form.id && <button type="button" onClick={() => { setForm(blankTheme()); setError(''); }} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200">Cancel</button>}
                    <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-semibold flex items-center gap-2">
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {form.id ? 'Save changes' : 'Schedule theme'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default FestivalThemes;
