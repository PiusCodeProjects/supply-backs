'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={null}>
      <VerifyOtpContent />
    </Suspense>
  );
}

function VerifyOtpContent() {
  const router = useRouter();
  const params = useSearchParams();
  const userId = params.get('userId') || '';

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(60);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleDigit(idx: number, val: string) {
    const char = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char && idx < 5) refs.current[idx + 1]?.focus();
    if (!char && idx > 0) refs.current[idx - 1]?.focus();

    // Auto-submit when all filled
    const code = next.join('');
    if (code.length === 6 && !next.includes('')) {
      submitOtp(code);
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  }

  async function submitOtp(code: string) {
    if (!userId) { setError('Invalid session. Please register again.'); return; }
    setLoading(true);
    setError('');
    try {
      await authApi.verifyOtp(userId, code);
      setSuccess('Phone verified! Redirecting to login...');
      setTimeout(() => router.push('/login'), 1500);
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
      setSuccess('New OTP sent!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
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
      <div className="auth-form-card fade-in" style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📱</div>
        <h1 style={{ marginBottom: 8 }}>Verify your phone</h1>
        <p className="subtitle" style={{ marginBottom: 0 }}>
          We sent a 6-digit code to your phone number.
          <br />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            (In dev mode, check the API console for the OTP)
          </span>
        </p>

        {error && (
          <div className="alert alert-danger" style={{ textAlign: 'left', marginTop: 20 }}>
            <span>⚠️</span> {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success" style={{ textAlign: 'left', marginTop: 20 }}>
            <span>✅</span> {success}
          </div>
        )}

        <div className="otp-inputs">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              className={`otp-input${d ? ' filled' : ''}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={loading}
            />
          ))}
        </div>

        <button
          className="btn btn-primary"
          onClick={() => submitOtp(digits.join(''))}
          disabled={loading || digits.join('').length < 6}
        >
          {loading ? <span className="spinner" /> : null}
          {loading ? 'Verifying...' : 'Verify Code'}
        </button>

        <div style={{ marginTop: 20, fontSize: 14, color: 'var(--text-secondary)' }}>
          Didn't receive it?{' '}
          {countdown > 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>Resend in {countdown}s</span>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {resending ? 'Sending...' : 'Resend OTP'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
