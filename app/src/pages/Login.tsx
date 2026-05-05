import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { loginUser, requestOtp, verifyOtp } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Eye, EyeOff, Smartphone, KeyRound, ArrowLeft } from 'lucide-react';

const Login = () => {
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginMethod, setLoginMethod] = useState<'password' | 'otp'>('password');
    const [otpSent, setOtpSent] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, language, setLanguage } = useStore();
    const navigate = useNavigate();

    const handleLogin = (res: any) => {
        login(res.user, res.token);
        if (res.mustChangePassword) {
            navigate('/change-password');
        } else {
            navigate('/');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');
        
        try {
            if (loginMethod === 'password') {
                const res = await loginUser(loginId, password);
                handleLogin(res);
            } else {
                if (!otpSent) {
                    const res = await requestOtp(loginId);
                    setOtpSent(true);
                    setSuccessMessage(res.message || 'OTP sent successfully!');
                } else {
                    const res = await verifyOtp(loginId, otp);
                    handleLogin(res);
                }
            }
        } catch (err: any) {
            setError(err.message || 'Action failed');
        } finally {
            setLoading(false);
        }
    };

    const switchMethod = (method: 'password' | 'otp') => {
        setLoginMethod(method);
        setError('');
        setSuccessMessage('');
        setOtpSent(false);
        setOtp('');
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
                                disabled={otpSent && loginMethod === 'otp'}
                                placeholder={language === 'en' ? 'e.g. BG001 or 9876543210' : 'उदा. BG001 या 9876543210'}
                                className={`w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all ${otpSent && loginMethod === 'otp' ? 'opacity-50' : ''}`}
                                value={loginId}
                                onChange={(e) => setLoginId(e.target.value)}
                            />
                        </div>

                        <AnimatePresence mode="wait">
                            {loginMethod === 'password' && (
                                <motion.div
                                    key="password-field"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                        {language === 'en' ? 'Password' : 'पासवर्ड'}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            required={loginMethod === 'password'}
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
                                </motion.div>
                            )}

                            {loginMethod === 'otp' && otpSent && (
                                <motion.div
                                    key="otp-field"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                        {language === 'en' ? 'Enter OTP' : 'OTP दर्ज करें'}
                                    </label>
                                    <input
                                        type="number"
                                        required={loginMethod === 'otp' && otpSent}
                                        placeholder={language === 'en' ? '4-digit code' : '4-अंकीय कोड'}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none transition-all tracking-widest text-center text-lg"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => { setOtpSent(false); setOtp(''); setSuccessMessage(''); }}
                                        className="mt-2 text-xs text-emerald-600 font-medium flex items-center gap-1 hover:text-emerald-800"
                                    >
                                        <ArrowLeft size={12} /> {language === 'en' ? 'Change Number' : 'नंबर बदलें'}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {successMessage && (
                            <div className="text-emerald-700 text-sm text-center bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                                {successMessage}
                            </div>
                        )}

                        {error && (
                            <div className="text-red-600 text-sm text-center bg-red-50 border border-red-100 p-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || (loginMethod === 'otp' && otpSent && otp.length < 4)}
                            className="w-full bg-emerald-600 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25 mt-2 flex justify-center items-center gap-2"
                        >
                            {loading ? (language === 'en' ? 'Processing…' : 'प्रोसेस हो रहा है…') : 
                             loginMethod === 'otp' && !otpSent ? (language === 'en' ? 'Get OTP' : 'OTP प्राप्त करें') :
                             (language === 'en' ? 'Sign In' : 'साइन इन करें')}
                        </button>
                    </form>

                    <div className="mt-6 flex items-center justify-between gap-4">
                        <div className="h-px bg-gray-200 flex-1"></div>
                        <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold">{language === 'en' ? 'OR' : 'या'}</span>
                        <div className="h-px bg-gray-200 flex-1"></div>
                    </div>

                    <div className="mt-6">
                        {loginMethod === 'password' ? (
                            <button 
                                onClick={() => switchMethod('otp')}
                                className="w-full border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <Smartphone size={18} className="text-emerald-600" /> 
                                {language === 'en' ? 'Login with OTP' : 'OTP से लॉगिन करें'}
                            </button>
                        ) : (
                            <button 
                                onClick={() => switchMethod('password')}
                                className="w-full border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <KeyRound size={18} className="text-emerald-600" /> 
                                {language === 'en' ? 'Login with Password' : 'पासवर्ड से लॉगिन करें'}
                            </button>
                        )}
                    </div>
                </div>

                <p className="text-center text-xs text-gray-400 mt-6">
                    {language === 'en' ? "Contact your administrator if you can't log in." : 'यदि आप लॉग इन नहीं कर पा रहे हैं तो अपने व्यवस्थापक से संपर्क करें।'}
                </p>
            </motion.div>
        </div>
    );
};

export default Login;
