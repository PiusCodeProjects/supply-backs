'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, BadgeCheck, FileText, AlertCircle } from 'lucide-react';
import { authApi } from '@/lib/api';

const FEATURES = [
  { icon: ShieldCheck, label: 'Free to join', desc: 'No subscription fees — pay only per order' },
  { icon: BadgeCheck,  label: 'Verified suppliers', desc: 'Every supplier is vetted before approval' },
  { icon: FileText,    label: 'Full audit trail', desc: 'Every project, order, and payment logged' },
];

function getStrength(pwd: string): { score: number; label: string; cls: string } {
  if (!pwd) return { score: 0, label: '', cls: '' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const map: Record<number, { label: string; cls: string }> = {
    1: { label: 'Weak',   cls: 'weak' },
    2: { label: 'Fair',   cls: 'fair' },
    3: { label: 'Good',   cls: 'good' },
    4: { label: 'Strong', cls: 'strong' },
  };
  return { score, ...(map[score] ?? { label: '', cls: '' }) };
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '', lastName: '', company: '',
    email: '', phone: '', password: '', confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const strength = useMemo(() => getStrength(form.password), [form.password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const res: any = await authApi.registerContractor({
        email: form.email,
        phone: form.phone,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        company: form.company || undefined,
      });
      router.push(`/verify-otp?userId=${res.userId}`);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-layout">
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
          Join the smarter<br /><em>construction</em><br />network.
        </h2>
        <p className="auth-brand-desc">
          Register as a contractor to access verified suppliers, place orders,
          track deliveries, and protect every payment with built-in escrow.
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
        <div className="auth-form-card fade-in">
          <h1>Create account</h1>
          <p className="subtitle">Start as a contractor — it takes 2 minutes</p>

          {error && (
            <div className="alert alert-danger" role="alert">
              <span className="alert-icon"><AlertCircle size={16} /></span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input
                  type="text"
                  className="form-input plain"
                  placeholder="John"
                  value={form.firstName}
                  onChange={e => update('firstName', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input
                  type="text"
                  className="form-input plain"
                  placeholder="Doe"
                  value={form.lastName}
                  onChange={e => update('lastName', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Company <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
              <input
                type="text"
                className="form-input plain"
                placeholder="Doe Construction Ltd."
                value={form.company}
                onChange={e => update('company', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input plain"
                placeholder="john@company.com"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input plain"
                placeholder="+1 234 567 8900"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                required
              />
              <p className="form-hint">Include country code — used for OTP verification.</p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input plain"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={e => update('password', e.target.value)}
                  required
                />
                {form.password && (
                  <>
                    <div className="strength-bar">
                      {[1,2,3,4].map(n => (
                        <div
                          key={n}
                          className={`strength-segment ${n <= strength.score ? strength.cls : ''}`}
                        />
                      ))}
                    </div>
                    <div className={`strength-label ${strength.cls}`}>{strength.label}</div>
                  </>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type="password"
                  className="form-input plain"
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={e => update('confirmPassword', e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" /><span>Creating account...</span></> : 'Create Account'}
            </button>
          </form>

          <div className="auth-footer">
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
