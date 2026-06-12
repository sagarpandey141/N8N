import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setUserEmail, setAddedNodeIds, signOut } from '../store/flowSlice';
import { toast } from 'react-toastify';
import { FaUserCircle, FaSignOutAlt, FaLock, FaEnvelope } from 'react-icons/fa';

const Navbar = () => {
  const dispatch = useDispatch();
  const userEmail = useSelector((state) => state.flow.userEmail);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState(1); // 1 = Enter Email, 2 = Verify OTP
  const [loading, setLoading] = useState(false);

  const otpRefs = useRef([]);

  // Persist session on page mount
  useEffect(() => {
    const fetchMe = async () => {
      const token = localStorage.getItem('flowbuilder_token');
      if (!token) return;

      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/me`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok) {
          dispatch(setUserEmail(data.email));
          dispatch(setAddedNodeIds(data.addedNodeIds));
          toast.success(`Welcome back, ${data.email}!`);
        } else {
          // Token expired or invalid
          localStorage.removeItem('flowbuilder_token');
          dispatch(signOut());
        }
      } catch (err) {
        console.error("Session restore error:", err);
      }
    };
    fetchMe();
  }, [dispatch]);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setStep(1);
    setEmail('');
    setOtp(['', '', '', '', '', '']);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      toast.warning('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.email_sent) {
          toast.info('OTP verification code sent to your email!');
        } else {
          toast.info('Verification code generated! Check your backend terminal logs.');
        }
        setStep(2);
        // Auto-focus first input of OTP
        setTimeout(() => {
          if (otpRefs.current[0]) otpRefs.current[0].focus();
        }, 100);
      } else {
        toast.error('Failed to send OTP code.');
      }
    } catch {
      toast.error('Could not connect to authentication server.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      toast.warning('Please enter the complete 6-digit OTP.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: otpCode }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Logged in successfully!`);
        localStorage.setItem('flowbuilder_token', data.token); // Store JWT token!
        dispatch(setUserEmail(data.email));
        dispatch(setAddedNodeIds(data.addedNodeIds));
        handleCloseModal();
      } else {
        toast.error(data.detail || 'Invalid or expired OTP.');
      }
    } catch {
      toast.error('Could not connect to authentication server.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value, index) => {
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Shift focus forward
    if (value !== '' && index < 5) {
      otpRefs.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      if (otp[index] === '' && index > 0) {
        otpRefs.current[index - 1].focus();
      }
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('flowbuilder_token'); // Clear JWT token!
    dispatch(signOut());
    toast.info('Signed out successfully.');
  };

  return (
    <>
      <nav className="h-[60px] w-full px-6 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md z-40 relative">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-lg shadow-[0_4px_12px_rgba(59,130,246,0.3)]">
            ⚡
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-gray-900 tracking-tight leading-none">Flowbuilder</h1>
            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mt-0.5 block">AI Orchestrator</span>
          </div>
        </div>

        {/* Auth / Profile Area */}
        <div className="flex items-center gap-4">
          {userEmail ? (
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200/50 py-1.5 pl-3 pr-2.5 rounded-full">
              <div className="flex items-center gap-2">
                <FaUserCircle className="text-blue-500 text-base" />
                <span className="text-xs font-bold text-gray-700 font-mono tracking-tight">{userEmail}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 bg-white border border-gray-200 text-gray-500 hover:text-red-500 hover:border-red-100 py-1 px-2.5 rounded-full text-[10px] font-bold shadow-sm transition-all active:scale-95 animate-fade-in"
                title="Sign Out"
              >
                <FaSignOutAlt />
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={handleOpenModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-1.5 rounded-full text-xs font-bold shadow-[0_4px_12px_rgba(59,130,246,0.25)] transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </nav>

      {/* Auth Modal Overlay */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md animate-fade-in">
          {/* Modal Container */}
          <div className="relative w-full max-w-sm mx-4 p-8 rounded-3xl bg-white border border-gray-100 shadow-[0_24px_50px_rgba(0,0,0,0.15)] bg-gradient-to-b from-white to-gray-50/50 overflow-hidden transform transition-all duration-300">
            {/* Background glowing blurred design spheres */}
            <div className="absolute -top-16 -left-16 w-32 h-32 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-32 h-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />

            {/* Close Button */}
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors text-xl font-bold leading-none cursor-pointer"
            >
              &times;
            </button>

            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-3 shadow-inner">
                {step === 1 ? <FaEnvelope className="text-lg animate-bounce" /> : <FaLock className="text-lg animate-pulse" />}
              </div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">
                {step === 1 ? 'Verify Your Email' : 'Enter Verification Code'}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                {step === 1 
                  ? 'Sign in or register with email OTP code.' 
                  : `Enter the 6-digit code sent to ${email}.`
                }
              </p>
            </div>

            {/* Step 1: Email Form */}
            {step === 1 && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-300">
                    ✉️
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition bg-white/80"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-2.5 rounded-2xl font-bold text-xs tracking-wider uppercase text-white shadow-[0_4px_12px_rgba(59,130,246,0.2)] transition-all cursor-pointer
                    ${loading 
                      ? 'bg-blue-300 text-white cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
                    }`}
                >
                  {loading ? 'Sending OTP…' : 'Send Code'}
                </button>
              </form>
            )}

            {/* Step 2: OTP Verification Form */}
            {step === 2 && (
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="flex justify-center gap-2">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      type="text"
                      maxLength="1"
                      required
                      ref={(el) => (otpRefs.current[idx] = el)}
                      value={digit}
                      onChange={(e) => handleOtpChange(e.target.value, idx)}
                      onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                      className="w-10 h-12 text-center text-lg font-extrabold text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition bg-white shadow-sm"
                    />
                  ))}
                </div>

                <div className="space-y-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-2.5 rounded-2xl font-bold text-xs tracking-wider uppercase text-white shadow-[0_4px_12px_rgba(59,130,246,0.2)] transition-all cursor-pointer
                      ${loading 
                        ? 'bg-blue-300 text-white/80 cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
                      }`}
                  >
                    {loading ? 'Verifying Code…' : 'Verify & Login'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-full py-1 text-center text-[10px] font-bold text-blue-500 hover:text-blue-600 tracking-wide uppercase transition cursor-pointer"
                  >
                    Change Email Address
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;