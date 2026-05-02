import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { loginUser } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingBag, Eye, EyeOff } from 'lucide-react';

const Login = () => {
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, language, setLanguage } = useStore();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await loginUser(loginId, password);
            // Store token + user
            login(res.user, res.token);
            // If first login / temp password → go to change-password screen
            if (res.mustChangePassword) {
                navigate('/change-password');
            } else {
                navigate('/');
            }
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-indigo-50 flex flex-col justify-center items-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-sm"
            >
                {/* Language Toggle */}
                <div className="flex justify-end mb-4">
                    <button
                        type="button"
                        onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
                        className="bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-3 py-1 rounded-full text-xs font-semibold shadow-sm transition-colors"
                    >
                        {language === 'en' ? 'हिंदी में देखें' : 'View in English'}
                    </button>
                </div>

                {/* Logo / Brand */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-600/30 mb-4">
                        <ShoppingBag size={28} className="text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">{language === 'en' ? 'Welcome' : 'स्वागत है'}</h1>
                    <p className="text-sm text-gray-500 mt-1">{language === 'en' ? 'Sign in with your party code or mobile number' : 'अपने पार्टी कोड या मोबाइल नंबर से साइन इन करें'}</p>
                </div>

                <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/60 p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {language === 'en' ? 'Party Code / Mobile' : 'पार्टी कोड / मोबाइल'}
                            </label>
                            <input
                                type="text"
                                required
                                autoFocus
                                placeholder={language === 'en' ? 'e.g. BG001 or 9876543210' : 'उदा. BG001 या 9876543210'}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all"
                                value={loginId}
                                onChange={(e) => setLoginId(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {language === 'en' ? 'Password' : 'पासवर्ड'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    placeholder={language === 'en' ? 'Enter password' : 'पासवर्ड दर्ज करें'}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">
                                {language === 'en' ? (
                                    <>Default password for new accounts is <strong>1234</strong></>
                                ) : (
                                    <>नए अकाउंट के लिए डिफ़ॉल्ट पासवर्ड <strong>1234</strong> है</>
                                )}
                            </p>
                        </div>

                        {error && (
                            <div className="text-red-600 text-sm text-center bg-red-50 border border-red-100 p-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25 mt-2"
                        >
                            {loading ? (language === 'en' ? 'Signing in…' : 'साइन इन हो रहा है…') : (language === 'en' ? 'Sign In' : 'साइन इन करें')}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                    {language === 'en' ? "Contact your administrator if you can't log in." : 'यदि आप लॉग इन नहीं कर पा रहे हैं तो अपने व्यवस्थापक से संपर्क करें।'}
                </p>
            </motion.div>
        </div>
    );
};

export default Login;
