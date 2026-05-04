'use client'

import React, { useState } from 'react';
import { Loader2, Mail, Lock, Cloud, ArrowRight, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';

type Step = 'login' | 'forgot' | 'otp' | 'reset' | 'done';

export default function LoginPage() {
  const [step, setStep] = useState<Step>('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Reset flow state
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const clearMessages = () => { setError(''); setInfo(''); };

  // ── Login ──────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = data.user?.isAdmin ? '/access' : '/selection';
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Send OTP ───────────────────────────────────────────
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setInfo(data.message);
        setStep('otp');
      } else {
        setError(data.error || 'Failed to send code.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Reset Password ─────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep('done');
      } else {
        setError(data.error || 'Reset failed.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Shared UI pieces ───────────────────────────────────
  const Background = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
    </div>
  );

 const Logo = () => (
  <div className="h-[100px] flex items-center justify-center overflow-visible mb-4">
    <img src="/Taqsai.png" alt="Taqsai" className="h-[200px] w-auto object-contain" />
  </div>
);

  const Alert = ({ msg, type }: { msg: string; type: 'error' | 'info' }) => (
    <div className={`mb-6 p-4 rounded-xl text-sm backdrop-blur-sm flex items-center gap-2 ${
      type === 'error'
        ? 'bg-red-500/20 border border-red-500/50 text-red-200 animate-pulse'
        : 'bg-blue-500/20 border border-blue-500/50 text-blue-200'
    }`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${type === 'error' ? 'bg-red-400' : 'bg-blue-400'}`} />
      {msg}
    </div>
  );

  const inputClass = "w-full pl-12 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-white placeholder-gray-400 transition-all duration-300 hover:bg-white/15";
  const btnClass = "w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-bold py-3 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg hover:shadow-cyan-500/50 transform hover:-translate-y-0.5";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      <Background />

      <div className="max-w-md w-full relative z-10">
        <Logo />

        <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl p-8 hover:border-white/30 transition-all duration-300">

          {/* ── STEP: login ── */}
          {step === 'login' && (
            <>
              <h1 className="text-4xl font-bold text-center text-white mb-2">Welcome Back</h1>
              <p className="text-center text-gray-300 mb-8">Sign in to monitor your weather stations</p>

              {error && <Alert msg={error} type="error" />}

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-200 mb-2">Email Address</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                      className={inputClass} placeholder="you@example.com" disabled={loading} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-200 mb-2">Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      className={inputClass} placeholder="••••••••" disabled={loading} />
                  </div>
                  <div className="flex justify-end mt-2">
                    <button type="button" onClick={() => { clearMessages(); setStep('forgot'); }}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                      Forgot password?
                    </button>
                  </div>
                </div>

                <button onClick={handleLogin} disabled={loading} className={btnClass}>
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Signing in...</> : <>Sign In <ArrowRight className="w-5 h-5" /></>}
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 text-center text-sm text-gray-300">
                Don't have an account?{' '}
                <a href="/auth/register" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">Create one now</a>
              </div>
            </>
          )}

          {/* ── STEP: forgot — enter email ── */}
          {step === 'forgot' && (
            <>
              <button onClick={() => { clearMessages(); setStep('login'); }}
                className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to login
              </button>

              <div className="flex justify-center mb-4">
                <div className="p-3 bg-blue-500/20 rounded-2xl">
                  <KeyRound className="w-8 h-8 text-blue-400" />
                </div>
              </div>
              <h1 className="text-3xl font-bold text-center text-white mb-2">Reset Password</h1>
              <p className="text-center text-gray-300 mb-8">Enter your email and we'll send you a 6-digit code</p>

              {error && <Alert msg={error} type="error" />}

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-200 mb-2">Email Address</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                      className={inputClass} placeholder="you@example.com" disabled={loading} />
                  </div>
                </div>
                <button onClick={handleSendOTP} disabled={loading || !resetEmail} className={btnClass}>
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</> : <>Send Code <ArrowRight className="w-5 h-5" /></>}
                </button>
              </div>
            </>
          )}

          {/* ── STEP: otp + new password ── */}
          {step === 'otp' && (
            <>
              <button onClick={() => { clearMessages(); setStep('forgot'); }}
                className="flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>

              <div className="flex justify-center mb-4">
                <div className="p-3 bg-blue-500/20 rounded-2xl">
                  <ShieldCheck className="w-8 h-8 text-blue-400" />
                </div>
              </div>
              <h1 className="text-3xl font-bold text-center text-white mb-2">Enter Code</h1>
              <p className="text-center text-gray-300 mb-2">
                We sent a 6-digit code to <span className="text-white font-semibold">{resetEmail}</span>
              </p>
              <p className="text-center text-gray-400 text-sm mb-8">It expires in 10 minutes</p>

              {error && <Alert msg={error} type="error" />}
              {info && <Alert msg={info} type="info" />}

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-200 mb-2">6-Digit Code</label>
                  <input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full py-3 text-center bg-white/10 border border-white/20 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none text-white text-2xl font-bold tracking-widest placeholder-gray-500 transition-all"
                    placeholder="······" maxLength={6} disabled={loading} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-200 mb-2">New Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      className={inputClass} placeholder="Min. 8 characters" disabled={loading} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-200 mb-2">Confirm Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      className={inputClass} placeholder="Repeat new password" disabled={loading} />
                  </div>
                </div>

                <button onClick={handleResetPassword}
                  disabled={loading || otp.length !== 6 || !newPassword || !confirmPassword}
                  className={btnClass}>
                  {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Resetting...</> : <>Reset Password <ArrowRight className="w-5 h-5" /></>}
                </button>

                <button onClick={handleSendOTP} disabled={loading}
                  className="w-full text-sm text-gray-400 hover:text-blue-300 transition-colors py-1">
                  Didn't receive it? Resend code
                </button>
              </div>
            </>
          )}

          {/* ── STEP: done ── */}
          {step === 'done' && (
            <div className="text-center py-4">
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-green-500/20 rounded-2xl">
                  <ShieldCheck className="w-12 h-12 text-green-400" />
                </div>
              </div>
              <h1 className="text-3xl font-bold text-white mb-3">Password Reset!</h1>
              <p className="text-gray-300 mb-8">Your password has been updated successfully. You can now sign in.</p>
              <button onClick={() => { clearMessages(); setStep('login'); setPassword(''); }} className={btnClass}>
                Back to Sign In <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

        </div>

        <div className="mt-8 text-center text-gray-400 text-xs">
          <p>Secure weather data for meteorologists & researchers</p>
        </div>
      </div>
    </div>
  );
}