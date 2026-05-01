import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { changePassword } from '../lib/api';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';

const ChangePassword = () => {
    const { user, updateUser } = useStore();
    const navigate = useNavigate();

    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNext, setShowNext] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (next !== confirm) {
            setError('New passwords do not match');
            return;
        }
        if (next.length < 4) {
            setError('Password must be at least 4 characters');
            return;
        }

        setLoading(true);
        try {
            await changePassword(current, next);
            updateUser({ mustChangePassword: false });
            setDone(true);
            setTimeout(() => navigate('/'), 1500);
        } catch (err: any) {
            setError(err.message || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-indigo-50 flex flex-col justify-center items-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm"
            >
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500 rounded-2xl shadow-lg shadow-amber-500/30 mb-4">
                        <Lock size={28} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Set Your Password</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {user?.mustChangePassword
                            ? 'You\'re using a temporary password. Please set a new one to continue.'
                            : 'Change your account password'}
                    </p>
                </div>

                {done ? (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-3xl shadow-xl p-8 text-center"
                    >
                        <CheckCircle className="text-emerald-500 mx-auto mb-3" size={48} />
                        <p className="font-bold text-gray-900 text-lg">Password Changed!</p>
                        <p className="text-sm text-gray-500 mt-1">Redirecting you…</p>
                    </motion.div>
                ) : (
                    <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/60 p-8">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Current Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showCurrent ? 'text' : 'password'}
                                        required
                                        placeholder={user?.mustChangePassword ? '1234 (temporary)' : 'Current password'}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all"
                                        value={current}
                                        onChange={(e) => setCurrent(e.target.value)}
                                    />
                                    <button type="button" onClick={() => setShowCurrent(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    New Password
                                </label>
                                <div className="relative">
                                    <input
                                        type={showNext ? 'text' : 'password'}
                                        required
                                        placeholder="Min 4 characters"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all"
                                        value={next}
                                        onChange={(e) => setNext(e.target.value)}
                                    />
                                    <button type="button" onClick={() => setShowNext(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showNext ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Confirm New Password
                                </label>
                                <input
                                    type="password"
                                    required
                                    placeholder="Repeat new password"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                />
                            </div>

                            {error && (
                                <div className="text-red-600 text-sm bg-red-50 border border-red-100 p-3 rounded-xl">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 shadow-lg shadow-emerald-600/25"
                            >
                                {loading ? 'Saving…' : 'Set Password'}
                            </button>

                            {!user?.mustChangePassword && (
                                <button
                                    type="button"
                                    onClick={() => navigate(-1)}
                                    className="w-full text-gray-500 py-2 text-sm hover:text-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                        </form>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default ChangePassword;
