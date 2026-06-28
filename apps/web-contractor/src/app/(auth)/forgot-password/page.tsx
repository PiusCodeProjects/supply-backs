'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { authApi } from '@/lib/api';

type Step = 'request' | 'reset';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState('');
  const [userId, setUserId] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(identifier);
      if (res.userId) {
        setUserId(res.userId);
        setStep('reset');
        setSuccess('OTP sent — check your phone or the API console in dev mode.');
      } else {
        setSuccess('If an account exists, an OTP has been sent.');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await authApi.resetPassword(userId, code, newPassword);
      setSuccess('Password reset. Redirecting to login...');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err: any) {
      setError(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-centered-page">
      <div className="auth-form-card fade-in auth-centered-card">
        <div className="step-progress">
          <div className="step-item">
            <div className={`step-circle ${step === 'reset' ? 'done' : 'active'}`}>
              {step === 'reset' ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : '1'}
            </div>
            <div className="step-meta">
              <span className={`step-title ${step === 'request' ? 'active' : 'done'}`}>Request OTP</span>
            </div>
            <div className={`step-connector ${step === 'reset' ? 'done' : ''}`} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className={`step-circle ${step === 'reset' ? 'active' : ''}`}>2</div>
            <div className="step-meta" style={{ marginLeft: 8 }}>
              <span className={`step-title ${step === 'reset' ? 'active' : ''}`}>Set New Password</span>
            </div>
          </div>
        </div>

        <div className="forgot-icon-block">
          <div className="otp-center-icon">
            <KeyRound size={24} color="var(--accent)" />
          </div>
          <h1>{step === 'request' ? 'Reset password' : 'Set new password'}</h1>
          <p className="subtitle">
            {step === 'request'
              ? "Enter your email or phone and we'll send an OTP."
              : 'Enter the OTP you received and choose a new password.'}
          </p>
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            <span className="alert-icon"><AlertCircle size={16} /></span>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="alert alert-success" role="status">
            <span className="alert-icon"><CheckCircle size={16} /></span>
            <span>{success}</span>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequest}>
            <div className="form-group">
              <label className="form-label">Email or Phone</label>
              <input
                type="text"
                className="form-input plain"
                placeholder="email@company.com or +1234567890"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" /><span>Sending OTP...</span></> : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label">OTP Code</label>
              <input
                type="text"
                className="form-input plain"
                placeholder="6-digit code"
                value={code}
                onChange={e => setCode(e.target.value)}
                maxLength={6}
                style={{ letterSpacing: '0.2em', fontWeight: 700 }}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input plain"
                placeholder="Min. 8 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-input plain"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" /><span>Resetting...</span></> : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="auth-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ArrowLeft size={14} />
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
