'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Smartphone, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { authApi } from '@/lib/api';

function VerifyOtpContent() {
  const router = useRouter();
  const params = useSearchParams();
  const userId = params.get('userId') || '';

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (!verified) return;
    const t = setTimeout(() => router.push('/login'), 1500);
    return () => clearTimeout(t);
  }, [verified, router]);

  function handleDigit(idx: number, val: string) {
    const char = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char && idx < 5) refs.current[idx + 1]?.focus();
    if (!char && idx > 0) refs.current[idx - 1]?.focus();
    const code = next.join('');
    if (code.length === 6 && !next.includes('')) submitOtp(code);
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) refs.current[idx - 1]?.focus();
  }

  async function submitOtp(code: string) {
    if (!userId) { setError('Invalid session. Please register again.'); return; }
    setLoading(true);
    setError('');
    try {
      await authApi.verifyOtp(userId, code);
      setVerified(true);
    } catch (err: any) {
      setError(err.message || 'Invalid OTP');
      setDigits(['', '', '', '', '', '']);
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0 || !userId) return;
    setResending(true);
    setError('');
    try {
      await authApi.resendOtp(userId);
      setCountdown(60);
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-centered-page">
      <div className="auth-form-card fade-in auth-centered-card" style={{ textAlign: 'center' }}>
        <div className="otp-center-icon">
          <Smartphone size={28} color="var(--accent)" />
        </div>

        <h1 style={{ marginBottom: 8 }}>Verify your phone</h1>
        <p className="subtitle" style={{ marginBottom: 24 }}>
          We sent a 6-digit code to your phone number.
          <br />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            In dev mode, check the API console for the OTP.
          </span>
        </p>

        {error && (
          <div className="alert alert-danger" style={{ textAlign: 'left' }} role="alert">
            <span className="alert-icon"><AlertCircle size={16} /></span>
            <span>{error}</span>
          </div>
        )}
        {verified && (
          <div className="alert alert-success" style={{ textAlign: 'left' }} role="status">
            <span className="alert-icon"><CheckCircle size={16} /></span>
            <span>Phone verified! Redirecting to login...</span>
          </div>
        )}

        <div className="otp-inputs">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => { refs.current[i] = el; }}
              className={`otp-input${d ? ' filled' : ''}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              disabled={loading}
            />
          ))}
        </div>

        <button
          className="btn btn-primary"
          onClick={() => submitOtp(digits.join(''))}
          disabled={loading || digits.join('').length < 6}
        >
          {loading ? <><span className="spinner" /><span>Verifying...</span></> : 'Verify Code'}
        </button>

        <div className="otp-resend-row">
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Didn&apos;t receive it?
          </span>
          <button
            className={`countdown-chip ${countdown <= 0 ? 'ready' : ''}`}
            onClick={handleResend}
            disabled={countdown > 0 || resending}
          >
            {resending
              ? <RefreshCw size={12} />
              : countdown > 0
                ? <span>Resend in {countdown}s</span>
                : <><RefreshCw size={12} /><span>Resend OTP</span></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-centered-page">
          <div className="spinner-light" />
        </div>
      }
    >
      <VerifyOtpContent />
    </Suspense>
  );
}
