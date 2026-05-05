import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { requestOtp, verifyOtp } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ArrowLeft, MessageSquare } from 'lucide-react';

const Login = () => {
    const [loginId, setLoginId] = useState('');
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, language, setLanguage } = useStore();
    const navigate = useNavigate();

    const handleRequestOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');
        try {
            const res = await requestOtp(loginId);
            setOtpSent(true);
            setSuccessMessage(res.message || 'OTP sent to your registered mobile number.');
        } catch (err: any) {
            setError(err.message || 'Failed to send OTP');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await verifyOtp(loginId, otp);
            login(res.user, res.token);
            navigate(res.mustChangePassword ? '/change-password' : '/');
        } catch (err: any) {
            setError(err.message || 'Incorrect OTP');
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
                    <p className="text-sm text-gray-500 mt-1">
                        {language === 'en' ? 'Login with OTP on your registered mobile' : 'अपने मोबाइल पर OTP से लॉगिन करें'}
                    </p>
                </div>

                <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/60 p-8">
                    <AnimatePresence mode="wait">
                        {!otpSent ? (
                            <motion.form
                                key="step-phone"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.25 }}
                                onSubmit={handleRequestOtp}
                                className="space-y-5"
                            >
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

                                {error && (
                                    <div className="text-red-600 text-sm text-center bg-red-50 border border-red-100 p-3 rounded-xl">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !loginId.trim()}
                                    className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25 flex justify-center items-center gap-2"
                                >
                                    <MessageSquare size={18} />
                                    {loading
                                        ? (language === 'en' ? 'Sending OTP…' : 'OTP भेजा जा रहा है…')
                                        : (language === 'en' ? 'Get OTP' : 'OTP प्राप्त करें')}
                                </button>
                            </motion.form>
                        ) : (
                            <motion.form
                                key="step-otp"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.25 }}
                                onSubmit={handleVerifyOtp}
                                className="space-y-5"
                            >
                                <div className="text-center">
                                    <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-2xl mb-3">
                                        <MessageSquare size={22} className="text-emerald-600" />
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        {successMessage || (language === 'en' ? 'OTP sent to your mobile.' : 'आपके मोबाइल पर OTP भेजा गया।')}
                                    </p>
                                    <p className="text-xs text-emerald-700 font-semibold mt-1">{loginId}</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                        {language === 'en' ? 'Enter 4-digit OTP' : '4-अंकीय OTP दर्ज करें'}
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        autoFocus
                                        placeholder="• • • •"
                                        maxLength={4}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-xl font-bold tracking-[0.5em] text-center focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.slice(0, 4))}
                                    />
                                </div>

                                {error && (
                                    <div className="text-red-600 text-sm text-center bg-red-50 border border-red-100 p-3 rounded-xl">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || otp.length < 4}
                                    className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25"
                                >
                                    {loading
                                        ? (language === 'en' ? 'Verifying…' : 'जांचा जा रहा है…')
                                        : (language === 'en' ? 'Sign In' : 'साइन इन करें')}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { setOtpSent(false); setOtp(''); setError(''); setSuccessMessage(''); }}
                                    className="w-full text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 transition-colors pt-1"
                                >
                                    <ArrowLeft size={14} />
                                    {language === 'en' ? 'Change number / Party Code' : 'नंबर / पार्टी कोड बदलें'}
                                </button>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                    {language === 'en' ? "Contact your administrator if you can't log in." : 'यदि आप लॉग इन नहीं कर पा रहे हैं तो अपने व्यवस्थापक से संपर्क करें।'}
                </p>
            </motion.div>
        </div>
    );
};

export default Login;
