'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { saveTokens, isAuthenticated } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(identifier, password);
      if (res.user.role !== 'SUPPLIER') {
        setError('This portal is for suppliers only.');
        return;
      }
      saveTokens(res.accessToken, res.refreshToken, res.user);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-brand">
        <div className="auth-brand-logo">
          <div className="auth-brand-logo-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className="auth-brand-logo-text">CS<span>CP</span></div>
        </div>
        <h2 className="auth-brand-tagline">
          Empower your<br /><em>supply chain.</em><br />Grow faster.
        </h2>
        <p className="auth-brand-desc">
          Connect with top-tier contractors, manage your inventory in real time,
          and ensure guaranteed payments through our secure escrow system.
        </p>
        <div className="auth-brand-features">
          {[
            'Showcase products to thousands of contractors',
            'Real-time inventory and order management',
            'Seamless driver and logistics coordination',
            'Guaranteed payments on delivery',
          ].map((f) => (
            <div key={f} className="auth-feature-item">
              <div className="auth-feature-dot" />
              {f}
            </div>
          ))}
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-card fade-in">
          <h1>Supplier Login</h1>
          <p className="subtitle">Sign in to your vendor dashboard</p>

          {error && (
            <div className="alert alert-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email or Phone</label>
              <input
                type="text"
                className="form-input"
                placeholder="vendor@company.com or +1234567890"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <Link
                href="/forgot-password"
                style={{ fontSize: 13, color: 'var(--accent)' }}
              >
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth-footer">
            Become a supplier?{' '}
            <Link href="/register">Register your business</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
