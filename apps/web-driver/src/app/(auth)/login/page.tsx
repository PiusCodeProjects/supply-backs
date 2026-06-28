'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { saveTokens, isAuthenticated } from '@/lib/auth';
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Truck,
  ShieldCheck,
  HeadphonesIcon,
} from 'lucide-react';

function getFriendlyError(err: unknown): string {
  const raw = (err as { message?: string })?.message?.toLowerCase() ?? '';

  if (!raw) return "Something went wrong. Please try again in a moment.";

  if (
    raw.includes('unavailable') ||
    raw.includes('failed to fetch') ||
    raw.includes('network') ||
    raw.includes('connection')
  ) {
    return "We can't reach our servers right now. Please check your internet connection and try again.";
  }

  if (
    raw.includes('invalid') ||
    raw.includes('incorrect') ||
    raw.includes('not found') ||
    raw.includes('no user') ||
    raw.includes('credentials') ||
    raw.includes('password')
  ) {
    return 'The phone number or PIN you entered is incorrect. Please try again.';
  }

  if (raw.includes('unverified') || raw.includes('not verified') || raw.includes('verify')) {
    return 'Your account is awaiting verification. Please contact your dispatcher.';
  }

  if (
    raw.includes('suspended') ||
    raw.includes('disabled') ||
    raw.includes('blocked') ||
    raw.includes('deactivated') ||
    raw.includes('inactive')
  ) {
    return 'This account is currently inactive. Please contact your dispatcher for assistance.';
  }

  if (raw.includes('too many') || raw.includes('rate') || raw.includes('throttle')) {
    return 'Too many sign-in attempts. Please wait a minute and try again.';
  }

  if (raw.includes('timeout')) {
    return 'The request took too long. Please check your connection and try again.';
  }

  return "We couldn't sign you in. Please try again or contact support.";
}

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmedPhone = phone.trim();
    if (!trimmedPhone || !password) {
      setError('Please enter both your phone number and PIN to continue.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.login(trimmedPhone, password);
      if (res.user.role !== 'DRIVER') {
        setError(
          "This sign-in is for drivers only. Please use the correct portal for your account.",
        );
        return;
      }
      saveTokens(res.accessToken, res.refreshToken, res.user);
      router.push('/dashboard');
    } catch (err) {
      setError(getFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="driver-login">
      <div
        className="driver-login__bg"
        style={{ backgroundImage: `url('/background.png')` }}
        aria-hidden
      />
      <div className="driver-login__scrim" aria-hidden />

      <header className="driver-login__hero">
        <div className="driver-login__badge">
          <Truck size={18} strokeWidth={2.5} />
          <span>Driver Portal</span>
        </div>
        <h1 className="driver-login__title">
          Welcome <br />
          <span>back to the road.</span>
        </h1>
        <p className="driver-login__subtitle">
          Sign in to view your trips, navigate deliveries, and stay connected with dispatch.
        </p>
      </header>

      <main className="driver-login__card">
        <div className="driver-login__card-handle" aria-hidden />

        <div className="driver-login__heading">
          <h2>Sign in</h2>
          <p>Use the phone number and PIN provided by your dispatcher.</p>
        </div>

        {error && (
          <div className="driver-login__alert" role="alert" aria-live="polite">
            <AlertCircle size={18} strokeWidth={2.5} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="driver-login__form" noValidate>
          <div className="driver-login__field">
            <label htmlFor="phone">Phone number</label>
            <div className="driver-login__input">
              <span className="driver-login__input-icon">
                <Phone size={18} strokeWidth={2} />
              </span>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="024 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="driver-login__field">
            <div className="driver-login__field-row">
              <label htmlFor="pin">Security PIN</label>
              <Link href="/forgot-password" className="driver-login__forgot">
                Forgot PIN?
              </Link>
            </div>
            <div className="driver-login__input">
              <span className="driver-login__input-icon">
                <Lock size={18} strokeWidth={2} />
              </span>
              <input
                id="pin"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="driver-login__toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide PIN' : 'Show PIN'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="driver-login__submit"
            disabled={loading}
          >
            {loading ? (
              <span className="driver-login__spinner" aria-label="Signing you in" />
            ) : (
              <>
                <span>Sign in &amp; start driving</span>
                <ArrowRight size={20} strokeWidth={2.5} />
              </>
            )}
          </button>
        </form>

        <div className="driver-login__footer">
          <div className="driver-login__footer-item">
            <ShieldCheck size={16} strokeWidth={2.2} />
            <span>Secure sign-in</span>
          </div>
          <div className="driver-login__footer-divider" aria-hidden />
          <a
            href="tel:+233000000000"
            className="driver-login__footer-item driver-login__footer-link"
          >
            <HeadphonesIcon size={16} strokeWidth={2.2} />
            <span>Need help?</span>
          </a>
        </div>
      </main>

      <style jsx>{`
        .driver-login {
          position: relative;
          min-height: 100vh;
          width: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          background: #0b0f17;
          overflow: hidden;
        }

        .driver-login__bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          filter: saturate(1.05) brightness(0.65);
          z-index: 1;
        }

        .driver-login__scrim {
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

        .driver-login__hero {
          position: relative;
          z-index: 3;
          padding: 64px 28px 32px;
          color: #fff;
          text-shadow: 0 2px 16px rgba(0, 0, 0, 0.35);
        }

        .driver-login__badge {
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

        .driver-login__badge :global(svg) {
          color: var(--accent-secondary);
        }

        .driver-login__title {
          font-size: 40px;
          line-height: 1.05;
          font-weight: 900;
          letter-spacing: -1.5px;
          margin: 0 0 12px;
          color: #fff;
        }

        .driver-login__title span {
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .driver-login__subtitle {
          font-size: 15px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.78);
          max-width: 320px;
          margin: 0;
          font-weight: 500;
        }

        .driver-login__card {
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

        .driver-login__card-handle {
          width: 44px;
          height: 5px;
          background: rgba(0, 0, 0, 0.08);
          border-radius: 999px;
          margin: 0 auto 24px;
        }

        .driver-login__heading {
          margin-bottom: 28px;
        }

        .driver-login__heading h2 {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.8px;
          margin: 0 0 6px;
          color: #0b0f17;
        }

        .driver-login__heading p {
          font-size: 14px;
          color: var(--text-dim);
          margin: 0;
          line-height: 1.5;
        }

        .driver-login__alert {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.18);
          border-radius: 14px;
          color: #b91c1c;
          font-size: 14px;
          line-height: 1.45;
          font-weight: 600;
          margin-bottom: 20px;
          animation: alertIn 0.25s ease-out;
        }

        .driver-login__alert :global(svg) {
          flex-shrink: 0;
          margin-top: 1px;
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

        .driver-login__form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .driver-login__field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .driver-login__field-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .driver-login__field label {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-dim);
        }

        .driver-login__forgot {
          font-size: 13px;
          font-weight: 700;
          color: #0b0f17;
          text-decoration: none;
          border-bottom: 1.5px solid rgba(11, 15, 23, 0.2);
          padding-bottom: 1px;
          transition: border-color 0.2s ease;
        }

        .driver-login__forgot:hover {
          border-color: #0b0f17;
        }

        .driver-login__input {
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

        .driver-login__input:focus-within {
          background: #fff;
          border-color: #0b0f17;
          box-shadow: 0 0 0 4px rgba(11, 15, 23, 0.06);
        }

        .driver-login__input-icon {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-dim);
          display: flex;
          align-items: center;
        }

        .driver-login__input:focus-within .driver-login__input-icon {
          color: #0b0f17;
        }

        .driver-login__input input {
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

        .driver-login__input input::placeholder {
          color: #9ca3af;
          font-weight: 500;
        }

        .driver-login__input input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .driver-login__toggle {
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

        .driver-login__toggle:hover {
          color: #0b0f17;
          background: rgba(0, 0, 0, 0.04);
        }

        .driver-login__submit {
          margin-top: 14px;
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

        .driver-login__submit:hover:not(:disabled) {
          box-shadow: 0 16px 32px rgba(11, 15, 23, 0.28);
        }

        .driver-login__submit:active:not(:disabled) {
          transform: scale(0.98);
        }

        .driver-login__submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .driver-login__spinner {
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

        .driver-login__footer {
          margin-top: 28px;
          padding-top: 20px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .driver-login__footer-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-dim);
          text-decoration: none;
        }

        .driver-login__footer-link {
          color: #0b0f17;
          transition: opacity 0.2s ease;
        }

        .driver-login__footer-link:hover {
          opacity: 0.7;
        }

        .driver-login__footer-divider {
          width: 1px;
          height: 16px;
          background: rgba(0, 0, 0, 0.1);
        }

        @media (min-width: 640px) {
          .driver-login {
            align-items: center;
            justify-content: center;
            padding: 32px;
          }

          .driver-login__hero {
            display: none;
          }

          .driver-login__card {
            max-width: 440px;
            width: 100%;
            border-radius: 28px;
            padding: 40px 36px 36px;
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.25);
            animation: cardRise 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          }

          .driver-login__card-handle {
            display: none;
          }
        }

        @media (min-width: 900px) {
          .driver-login {
            display: grid;
            grid-template-columns: 1.1fr 1fr;
            gap: 0;
            padding: 0;
          }

          .driver-login__hero {
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            padding: 64px 56px;
            min-height: 100vh;
          }

          .driver-login__title {
            font-size: 56px;
          }

          .driver-login__subtitle {
            font-size: 17px;
            max-width: 420px;
          }

          .driver-login__scrim {
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

          .driver-login__card {
            margin: auto 56px;
            max-width: 460px;
          }
        }
      `}</style>
    </div>
  );
}
