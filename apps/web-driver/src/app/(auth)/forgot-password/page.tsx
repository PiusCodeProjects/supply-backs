'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import {
  KeyRound,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  HeadphonesIcon,
} from 'lucide-react';

type Step = 'request' | 'reset';

function getFriendlyError(err: unknown): string {
  const raw = (err as { message?: string })?.message?.toLowerCase() ?? '';
  if (!raw) return 'Something went wrong. Please try again in a moment.';

  if (
    raw.includes('unavailable') ||
    raw.includes('failed to fetch') ||
    raw.includes('network') ||
    raw.includes('connection')
  ) {
    return "We can't reach our servers right now. Please check your internet connection and try again.";
  }
  if (raw.includes('expired') || raw.includes('invalid code') || raw.includes('wrong')) {
    return 'That code is incorrect or has expired. Please request a new one.';
  }
  if (raw.includes('invalid') || raw.includes('not found') || raw.includes('no user')) {
    return "We couldn't find an account with that phone number or email.";
  }
  if (raw.includes('too many') || raw.includes('rate') || raw.includes('throttle')) {
    return 'Too many attempts. Please wait a minute before trying again.';
  }
  if (raw.includes('weak') || raw.includes('short')) {
    return 'Please choose a stronger PIN — at least 8 characters with a mix of letters and numbers.';
  }
  return "We couldn't complete that. Please try again or contact support.";
}

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
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!identifier.trim()) {
      setError('Please enter your phone number or email to continue.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.forgotPassword(identifier.trim());
      if (res.userId) setUserId(res.userId);
      setStep('reset');
      setSuccess(
        "If an account exists, we've sent a 6-digit code to your phone or email. Enter it below.",
      );
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!code.trim() || code.trim().length < 4) {
      setError('Please enter the code you received.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Your new PIN must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two PINs you entered don't match. Please try again.");
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(userId, code.trim(), newPassword);
      setSuccess('Your PIN has been reset. Taking you to sign in…');
      setTimeout(() => router.push('/login'), 1400);
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="forgot">
      <div
        className="forgot__bg"
        style={{ backgroundImage: `url('/background.png')` }}
        aria-hidden
      />
      <div className="forgot__scrim" aria-hidden />

      <header className="forgot__hero">
        <Link href="/login" className="forgot__back-link">
          <ArrowLeft size={16} strokeWidth={2.5} />
          <span>Back to sign in</span>
        </Link>

        <div className="forgot__badge">
          <KeyRound size={18} strokeWidth={2.5} />
          <span>PIN Recovery</span>
        </div>

        <h1 className="forgot__title">
          {step === 'request' ? (
            <>
              Forgot your PIN? <br />
              <span>Let&apos;s get you back.</span>
            </>
          ) : (
            <>
              Almost there. <br />
              <span>Set a new PIN.</span>
            </>
          )}
        </h1>
        <p className="forgot__subtitle">
          {step === 'request'
            ? 'Enter the phone number or email linked to your driver account and we\'ll send you a verification code.'
            : 'Enter the 6-digit code we sent you and choose a new PIN you\'ll remember.'}
        </p>
      </header>

      <main className="forgot__card">
        <div className="forgot__handle" aria-hidden />

        <ol className="forgot__steps">
          <li className={`forgot__step ${step === 'request' ? 'is-active' : 'is-done'}`}>
            <span className="forgot__step-dot">
              {step === 'reset' ? <CheckCircle2 size={14} /> : '1'}
            </span>
            <span>Verify identity</span>
          </li>
          <span className="forgot__step-line" aria-hidden />
          <li className={`forgot__step ${step === 'reset' ? 'is-active' : ''}`}>
            <span className="forgot__step-dot">2</span>
            <span>Reset PIN</span>
          </li>
        </ol>

        {error && (
          <div className="forgot__alert forgot__alert--error" role="alert" aria-live="polite">
            <AlertCircle size={18} strokeWidth={2.5} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="forgot__alert forgot__alert--success" role="status" aria-live="polite">
            <CheckCircle2 size={18} strokeWidth={2.5} />
            <span>{success}</span>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequest} className="forgot__form" noValidate>
            <div className="forgot__field">
              <label htmlFor="identifier">Phone number or email</label>
              <div className="forgot__input">
                <span className="forgot__input-icon">
                  <Phone size={18} strokeWidth={2} />
                </span>
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  inputMode="text"
                  placeholder="024 000 0000 or you@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  disabled={loading}
                  autoFocus
                  required
                />
              </div>
            </div>

            <button type="submit" className="forgot__submit" disabled={loading}>
              {loading ? (
                <span className="forgot__spinner" aria-label="Sending code" />
              ) : (
                <>
                  <span>Send verification code</span>
                  <ArrowRight size={20} strokeWidth={2.5} />
                </>
              )}
            </button>

            <p className="forgot__help">
              Remembered your PIN?{' '}
              <Link href="/login" className="forgot__inline-link">
                Sign in instead
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleReset} className="forgot__form" noValidate>
            <div className="forgot__field">
              <label htmlFor="code">Verification code</label>
              <div className="forgot__input">
                <span className="forgot__input-icon">
                  <ShieldCheck size={18} strokeWidth={2} />
                </span>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  disabled={loading}
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="forgot__field">
              <label htmlFor="new-pin">New PIN</label>
              <div className="forgot__input">
                <span className="forgot__input-icon">
                  <Lock size={18} strokeWidth={2} />
                </span>
                <input
                  id="new-pin"
                  type={showNew ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="forgot__toggle"
                  onClick={() => setShowNew((s) => !s)}
                  aria-label={showNew ? 'Hide PIN' : 'Show PIN'}
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="forgot__hint">
                Use 8+ characters with a mix of letters and numbers.
              </p>
            </div>

            <div className="forgot__field">
              <label htmlFor="confirm-pin">Confirm new PIN</label>
              <div className="forgot__input">
                <span className="forgot__input-icon">
                  <Lock size={18} strokeWidth={2} />
                </span>
                <input
                  id="confirm-pin"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter your new PIN"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="forgot__toggle"
                  onClick={() => setShowConfirm((s) => !s)}
                  aria-label={showConfirm ? 'Hide PIN' : 'Show PIN'}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="forgot__submit" disabled={loading}>
              {loading ? (
                <span className="forgot__spinner" aria-label="Resetting your PIN" />
              ) : (
                <>
                  <span>Reset PIN &amp; sign in</span>
                  <ArrowRight size={20} strokeWidth={2.5} />
                </>
              )}
            </button>

            <button
              type="button"
              className="forgot__ghost"
              onClick={() => {
                setStep('request');
                setError('');
                setSuccess('');
              }}
              disabled={loading}
            >
              Didn&apos;t get a code? Send again
            </button>
          </form>
        )}

        <div className="forgot__footer">
          <div className="forgot__footer-item">
            <ShieldCheck size={16} strokeWidth={2.2} />
            <span>Secure recovery</span>
          </div>
          <div className="forgot__footer-divider" aria-hidden />
          <a
            href="tel:+233000000000"
            className="forgot__footer-item forgot__footer-link"
          >
            <HeadphonesIcon size={16} strokeWidth={2.2} />
            <span>Need help?</span>
          </a>
        </div>
      </main>

      <style jsx>{`
        .forgot {
          position: relative;
          min-height: 100vh;
          width: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          background: #0b0f17;
          overflow: hidden;
        }

        .forgot__bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          filter: saturate(1.05) brightness(0.6);
          z-index: 1;
        }

        .forgot__scrim {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(120% 60% at 50% 0%, rgba(245, 158, 11, 0.18), transparent 60%),
            linear-gradient(
              to bottom,
              rgba(11, 15, 23, 0.4) 0%,
              rgba(11, 15, 23, 0.55) 35%,
              rgba(243, 244, 246, 0.95) 78%,
              var(--bg) 100%
            );
          z-index: 2;
        }

        .forgot__hero {
          position: relative;
          z-index: 3;
          padding: 28px 28px 32px;
          color: #fff;
          text-shadow: 0 2px 16px rgba(0, 0, 0, 0.35);
          margin-top: auto;
        }

        .forgot__back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px 8px 8px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          text-decoration: none;
          margin-bottom: 28px;
          transition: background 0.2s ease;
        }

        .forgot__back-link:hover {
          background: rgba(255, 255, 255, 0.16);
        }

        .forgot__badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #fff;
          margin-bottom: 20px;
        }

        .forgot__badge :global(svg) {
          color: var(--accent-secondary);
        }

        .forgot__title {
          font-size: 36px;
          line-height: 1.05;
          font-weight: 900;
          letter-spacing: -1.4px;
          margin: 0 0 12px;
          color: #fff;
        }

        .forgot__title span {
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .forgot__subtitle {
          font-size: 14.5px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.78);
          max-width: 360px;
          margin: 0;
          font-weight: 500;
        }

        .forgot__card {
          position: relative;
          z-index: 4;
          background: #fff;
          border-top-left-radius: 36px;
          border-top-right-radius: 36px;
          padding: 16px 28px 40px;
          box-shadow: 0 -24px 60px rgba(0, 0, 0, 0.18);
          animation: cardRise 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes cardRise {
          from {
            transform: translateY(40px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .forgot__handle {
          width: 44px;
          height: 5px;
          background: rgba(0, 0, 0, 0.08);
          border-radius: 999px;
          margin: 0 auto 22px;
        }

        .forgot__steps {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 24px;
          padding: 0;
          list-style: none;
        }

        .forgot__step {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 700;
          color: #9ca3af;
          letter-spacing: 0.02em;
        }

        .forgot__step.is-active {
          color: #0b0f17;
        }

        .forgot__step.is-done {
          color: var(--success);
        }

        .forgot__step-dot {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #f3f4f6;
          color: #9ca3af;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 11px;
        }

        .forgot__step.is-active .forgot__step-dot {
          background: #0b0f17;
          color: #fff;
        }

        .forgot__step.is-done .forgot__step-dot {
          background: var(--success);
          color: #fff;
        }

        .forgot__step-line {
          flex: 1;
          height: 2px;
          background: repeating-linear-gradient(
            90deg,
            rgba(0, 0, 0, 0.12) 0 4px,
            transparent 4px 8px
          );
          border-radius: 2px;
        }

        .forgot__alert {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 14px;
          font-size: 14px;
          line-height: 1.45;
          font-weight: 600;
          margin-bottom: 20px;
          animation: alertIn 0.25s ease-out;
        }

        .forgot__alert :global(svg) {
          flex-shrink: 0;
          margin-top: 1px;
        }

        .forgot__alert--error {
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.18);
          color: #b91c1c;
        }

        .forgot__alert--success {
          background: rgba(16, 185, 129, 0.06);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #047857;
        }

        @keyframes alertIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .forgot__form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .forgot__field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .forgot__field label {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-dim);
        }

        .forgot__input {
          position: relative;
          display: flex;
          align-items: center;
          height: 60px;
          background: #f9fafb;
          border: 1.5px solid #e5e7eb;
          border-radius: 16px;
          padding: 0 14px 0 48px;
          transition: all 0.2s ease;
        }

        .forgot__input:focus-within {
          background: #fff;
          border-color: #0b0f17;
          box-shadow: 0 0 0 4px rgba(11, 15, 23, 0.06);
        }

        .forgot__input-icon {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-dim);
          display: flex;
          align-items: center;
        }

        .forgot__input:focus-within .forgot__input-icon {
          color: #0b0f17;
        }

        .forgot__input input {
          flex: 1;
          height: 100%;
          background: transparent;
          border: none;
          outline: none;
          font-size: 16px;
          font-weight: 600;
          color: #0b0f17;
          font-family: inherit;
        }

        .forgot__input input::placeholder {
          color: #9ca3af;
          font-weight: 500;
        }

        .forgot__input input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .forgot__toggle {
          background: transparent;
          border: none;
          color: var(--text-dim);
          padding: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: color 0.2s ease, background 0.2s ease;
        }

        .forgot__toggle:hover {
          color: #0b0f17;
          background: rgba(0, 0, 0, 0.04);
        }

        .forgot__hint {
          font-size: 12px;
          color: var(--text-dim);
          margin: 0;
          padding-left: 4px;
        }

        .forgot__submit {
          margin-top: 6px;
          height: 60px;
          width: 100%;
          background: #0b0f17;
          color: #fff;
          border: none;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.2px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          box-shadow: 0 12px 28px rgba(11, 15, 23, 0.2);
          transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }

        .forgot__submit:hover:not(:disabled) {
          box-shadow: 0 16px 32px rgba(11, 15, 23, 0.28);
        }

        .forgot__submit:active:not(:disabled) {
          transform: scale(0.98);
        }

        .forgot__submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .forgot__ghost {
          background: transparent;
          border: none;
          color: var(--text-dim);
          font-size: 13.5px;
          font-weight: 700;
          padding: 8px;
          cursor: pointer;
          text-align: center;
          transition: color 0.2s ease;
        }

        .forgot__ghost:hover:not(:disabled) {
          color: #0b0f17;
        }

        .forgot__ghost:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .forgot__spinner {
          width: 22px;
          height: 22px;
          border: 2.5px solid rgba(255, 255, 255, 0.25);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .forgot__help {
          text-align: center;
          font-size: 13.5px;
          color: var(--text-dim);
          margin: 0;
        }

        .forgot__inline-link {
          color: #0b0f17;
          font-weight: 700;
          text-decoration: none;
          border-bottom: 1.5px solid rgba(11, 15, 23, 0.2);
          padding-bottom: 1px;
        }

        .forgot__inline-link:hover {
          border-bottom-color: #0b0f17;
        }

        .forgot__footer {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .forgot__footer-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-dim);
          text-decoration: none;
        }

        .forgot__footer-link {
          color: #0b0f17;
          transition: opacity 0.2s ease;
        }

        .forgot__footer-link:hover {
          opacity: 0.7;
        }

        .forgot__footer-divider {
          width: 1px;
          height: 16px;
          background: rgba(0, 0, 0, 0.1);
        }

        @media (min-width: 640px) {
          .forgot {
            align-items: center;
            justify-content: center;
            padding: 32px;
          }

          .forgot__hero {
            display: none;
          }

          .forgot__card {
            max-width: 480px;
            width: 100%;
            border-radius: 28px;
            padding: 40px 36px 36px;
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25);
            animation: cardRise 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          }

          .forgot__handle {
            display: none;
          }
        }

        @media (min-width: 900px) {
          .forgot {
            display: grid;
            grid-template-columns: 1.1fr 1fr;
            gap: 0;
            padding: 0;
          }

          .forgot__hero {
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            padding: 64px 56px;
            min-height: 100vh;
          }

          .forgot__title {
            font-size: 52px;
          }

          .forgot__subtitle {
            font-size: 17px;
            max-width: 460px;
          }

          .forgot__scrim {
            background:
              radial-gradient(80% 60% at 30% 30%, rgba(245, 158, 11, 0.2), transparent 60%),
              linear-gradient(
                to right,
                rgba(11, 15, 23, 0.55) 0%,
                rgba(11, 15, 23, 0.5) 55%,
                rgba(243, 244, 246, 0.95) 65%,
                var(--bg) 100%
              );
          }

          .forgot__card {
            margin: auto 56px;
            max-width: 500px;
          }
        }
      `}</style>
    </div>
  );
}
