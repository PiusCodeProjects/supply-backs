'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Zap, TrendingUp, Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { authApi } from '@/lib/api';
import { saveTokens, isAuthenticated } from '@/lib/auth';

const FEATURES = [
  { icon: ShieldCheck, label: 'Escrow-protected payments', desc: 'Funds held until delivery confirmed' },
  { icon: Zap,         label: 'Real-time delivery tracking', desc: 'Live GPS on every order' },
  { icon: TrendingUp,  label: 'Verified supplier network', desc: '100+ approved suppliers ready' },
];

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard');
    const saved = localStorage.getItem('rememberEmail');
    if (saved) setIdentifier(saved);
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);
    try {
      const res = await authApi.login(identifier, password);
      if (res.user.role !== 'CONTRACTOR') {
        setError('This portal is for contractors only.');
        setLoading(false);
        return;
      }
      setSuccess(true);
      saveTokens(res.accessToken, res.refreshToken, res.user);
      if (rememberMe) {
        localStorage.setItem('rememberEmail', identifier);
      } else {
        localStorage.removeItem('rememberEmail');
      }
      setTimeout(() => router.push('/dashboard'), 300);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  }

  return (
    <div className={`auth-layout ${success ? 'success-state' : ''}`}>
      {/* Brand Panel */}
      <div className="auth-brand">
        <div className="auth-brand-logo">
          <div className="auth-brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 4.5L5 10v8h3v-5h8v5h3v-8l-7-5.5z" fill="currentColor" />
            </svg>
          </div>
          <div className="auth-brand-logo-text">CS<span>CP</span></div>
        </div>

        <h2 className="auth-brand-tagline">
          Build smarter.<br /><em>Source faster.</em><br />Pay safer.
        </h2>
        <p className="auth-brand-desc">
          The construction supply chain platform that connects you to verified
          suppliers, tracks every delivery in real time, and holds your payments
          securely in escrow until the job is done.
        </p>

        <div className="auth-brand-features">
          {FEATURES.map(({ icon: Icon, label, desc }, i) => (
            <div
              key={label}
              className="auth-feature-item"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="auth-feature-icon">
                <Icon size={16} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Form Panel */}
      <div className="auth-form-panel">
        <div className={`auth-form-card fade-in ${success ? 'pulse-success' : ''}`}>
          <h1>Welcome back</h1>
          <p className="subtitle">Sign in to your contractor account</p>

          {error && (
            <div className="alert alert-danger slide-down" role="alert">
              <span className="alert-icon"><AlertCircle size={16} /></span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert alert-success slide-down" role="status">
              <span className="alert-icon"><CheckCircle size={16} /></span>
              <span>Login successful. Redirecting...</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email or Phone</label>
              <div className="form-input-wrapper">
                <input
                  type="text"
                  className="form-input"
                  placeholder="email@company.com or +1234567890"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                  autoFocus
                />
                <span className="form-input-icon">
                  <Mail size={16} />
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="form-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <span className="form-input-icon">
                  <Lock size={16} />
                </span>
                <button
                  type="button"
                  className="form-input-toggle"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-options">
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                />
                <span className="checkbox-marker" />
                <span className="checkbox-label">Remember me</span>
              </label>
              <Link href="/forgot-password" className="form-link">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              className={`btn btn-primary ${loading ? 'is-loading' : ''}`}
              disabled={loading}
            >
              {loading ? <><span className="spinner" /><span>Signing in...</span></> : 'Sign In'}
            </button>
          </form>

          <div className="auth-footer">
            New to CSCP?{' '}
            <Link href="/register">Create contractor account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
