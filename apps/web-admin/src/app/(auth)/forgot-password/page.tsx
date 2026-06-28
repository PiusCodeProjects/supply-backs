'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(userId, code, newPassword);
      setSuccess('Password reset! Redirecting...');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err: any) {
      setError(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        padding: 24,
      }}
    >
      <div className="auth-form-card fade-in" style={{ maxWidth: 400 }}>
        <div style={{ fontSize: 40, marginBottom: 12, textAlign: 'center' }}>🔑</div>
        <h1>{step === 'request' ? 'Reset password' : 'Enter new password'}</h1>
        <p className="subtitle">
          {step === 'request'
            ? 'Enter your email or phone number and we\'ll send you an OTP.'
            : 'Enter the OTP you received and choose a new password.'}
        </p>

        {error && (
          <div className="alert alert-danger"><span>⚠️</span> {error}</div>
        )}
        {success && (
          <div className="alert alert-success"><span>✅</span> {success}</div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequest}>
            <div className="form-group">
              <label className="form-label">Email or Phone</label>
              <input
                type="text"
                className="form-input"
                placeholder="email@company.com or +1234567890"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label">OTP Code</label>
              <input
                type="text"
                className="form-input"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Min. 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <div className="auth-footer">
          <Link href="/login">← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
