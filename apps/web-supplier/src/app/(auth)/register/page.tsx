'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import {
  Building2,
  Mail,
  Phone,
  Lock,
  ImageIcon,
  FileText,
  X,
  CheckCircle,
  Upload,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Business Info' },
  { id: 2, label: 'Security' },
  { id: 3, label: 'Verification' },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    businessName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [storePhotos, setStorePhotos] = useState<File[]>([]);
  const [storePhotoPreviews, setStorePhotoPreviews] = useState<string[]>([]);
  const [documents, setDocuments] = useState<File[]>([]);

  const [photoDrag, setPhotoDrag] = useState(false);
  const [docDrag, setDocDrag] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function addStorePhotos(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'));
    const previews = images.map((f) => URL.createObjectURL(f));
    setStorePhotos((prev) => [...prev, ...images]);
    setStorePhotoPreviews((prev) => [...prev, ...previews]);
  }

  function removeStorePhoto(idx: number) {
    URL.revokeObjectURL(storePhotoPreviews[idx]);
    setStorePhotos((prev) => prev.filter((_, i) => i !== idx));
    setStorePhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  function addDocuments(files: File[]) {
    setDocuments((prev) => [...prev, ...files]);
  }

  function removeDocument(idx: number) {
    setDocuments((prev) => prev.filter((_, i) => i !== idx));
  }

  function handlePhotoDrop(e: React.DragEvent) {
    e.preventDefault();
    setPhotoDrag(false);
    addStorePhotos(Array.from(e.dataTransfer.files));
  }

  function handleDocDrop(e: React.DragEvent) {
    e.preventDefault();
    setDocDrag(false);
    addDocuments(Array.from(e.dataTransfer.files));
  }

  function validateStep(): string {
    if (step === 1) {
      if (!form.businessName.trim()) return 'Business name is required';
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
        return 'A valid email address is required';
      if (!form.phone.trim()) return 'Phone number is required';
    }
    if (step === 2) {
      if (form.password.length < 8) return 'Password must be at least 8 characters';
      if (form.password !== form.confirmPassword) return 'Passwords do not match';
    }
    if (step === 3) {
      if (storePhotos.length === 0) return 'Please upload at least one store photo';
      if (documents.length === 0) return 'Please upload at least one business document';
    }
    return '';
  }

  function handleNext() {
    setError('');
    const err = validateStep();
    if (err) { setError(err); return; }
    setStep((s) => s + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const err = validateStep();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const res: any = await authApi.registerSupplier(
        {
          email: form.email,
          phone: form.phone,
          password: form.password,
          businessName: form.businessName,
        },
        documents,
        storePhotos,
      );
      router.push(`/verify-otp?userId=${res.userId}`);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const passwordStrength =
    form.password.length === 0 ? 0
    : form.password.length < 6 ? 1
    : form.password.length < 10 ? 2
    : 3;

  const strengthLabel = ['', 'Weak', 'Fair', 'Strong'][passwordStrength];
  const strengthColor = ['', 'var(--danger)', 'var(--warning)', 'var(--success)'][passwordStrength];

  return (
    <div className="auth-layout" style={{ minHeight: '100vh' }}>

      {/* ── Brand Panel ─────────────────────────────── */}
      <div className="auth-brand">
        <div className="auth-brand-logo">
          <div className="auth-brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className="auth-brand-logo-text">CS<span>CP</span></div>
        </div>

        <h2 className="auth-brand-tagline">
          Join the trusted<br /><em>supplier</em><br />network.
        </h2>

        <p className="auth-brand-desc">
          Grow your business by connecting directly with contractors across Ghana.
          Payments are secured in escrow and released only on verified delivery.
        </p>

        <div className="auth-brand-features">
          {[
            'Verified business identity protection',
            'Falcon Escrow secured payments',
            'Real-time GPS delivery tracking',
            'Direct contractor marketplace access',
          ].map((f) => (
            <div key={f} className="auth-feature-item">
              <div className="auth-feature-dot" />
              {f}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 48, display: 'flex', gap: 24 }}>
          {[
            { value: '200+', label: 'Verified Suppliers' },
            { value: '98%', label: 'On-Time Delivery' },
            { value: '24h', label: 'Avg. Verification' },
          ].map((stat) => (
            <div key={stat.label}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Form Panel ──────────────────────────────── */}
      <div
        className="auth-form-panel"
        style={{ alignItems: 'flex-start', paddingTop: 52, paddingBottom: 52, overflowY: 'auto' }}
      >
        <div className="auth-form-card fade-in" style={{ maxWidth: 500 }}>

          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', marginBottom: 6 }}>
              Supplier Registration
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Complete all steps to submit your business for verification
            </p>
          </div>

          {/* Step Indicator */}
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 40 }}>
            {STEPS.map((s, idx) => (
              <div
                key={s.id}
                style={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : 'none' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: step >= s.id ? 'var(--accent)' : 'var(--bg-elevated)',
                      border: `2px solid ${step >= s.id ? 'var(--accent)' : 'var(--border-default)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 800,
                      color: step >= s.id ? '#fff' : 'var(--text-muted)',
                      transition: 'all 0.3s',
                    }}
                  >
                    {step > s.id ? <CheckCircle size={14} /> : s.id}
                  </div>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.3px', whiteSpace: 'nowrap',
                      color: step >= s.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    style={{
                      flex: 1, height: 2, margin: '0 8px', marginBottom: 20,
                      background: step > s.id ? 'var(--accent)' : 'var(--border-default)',
                      transition: 'background 0.3s',
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 24 }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>

            {/* ── Step 1: Business Information ───────── */}
            {step === 1 && (
              <div className="fade-in">
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Business Information</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Your details as they appear on official registration documents
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={12} /> Business Name
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Acme Construction Supplies Ltd."
                    value={form.businessName}
                    onChange={(e) => update('businessName', e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={12} /> Business Email
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="orders@yourbusiness.com"
                    value={form.email}
                    onChange={(e) => update('email', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Phone size={12} /> Phone Number
                  </label>
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="+233 XX XXX XXXX"
                    value={form.phone}
                    onChange={(e) => update('phone', e.target.value)}
                  />
                  <p className="form-hint">Include country code — e.g. +233 for Ghana</p>
                </div>

                <button type="button" className="btn btn-primary" onClick={handleNext} style={{ marginTop: 8 }}>
                  Continue
                  <ArrowRight size={16} />
                </button>
              </div>
            )}

            {/* ── Step 2: Account Security ────────────── */}
            {step === 2 && (
              <div className="fade-in">
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Account Security</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Create a strong password to protect your supplier account
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={12} /> Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Minimum 8 characters"
                      value={form.password}
                      onChange={(e) => update('password', e.target.value)}
                      autoFocus
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', cursor: 'pointer',
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.password.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: i <= passwordStrength ? strengthColor : 'var(--border-default)',
                            transition: 'background 0.3s',
                          }}
                        />
                      ))}
                      <span style={{ fontSize: 11, color: strengthColor, fontWeight: 600, minWidth: 36 }}>
                        {strengthLabel}
                      </span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Lock size={12} /> Confirm Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Repeat your password"
                      value={form.confirmPassword}
                      onChange={(e) => update('confirmPassword', e.target.value)}
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', cursor: 'pointer',
                      }}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.confirmPassword.length > 0 && form.password !== form.confirmPassword && (
                    <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                      Passwords do not match
                    </div>
                  )}
                  {form.confirmPassword.length > 0 && form.password === form.confirmPassword && (
                    <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={11} /> Passwords match
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setStep(1); setError(''); }}
                    style={{ flex: 1 }}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleNext} style={{ flex: 2 }}>
                    Continue <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Verification Materials ─────── */}
            {step === 3 && (
              <div className="fade-in">
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Verification Materials</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Upload your store photos and official business documents for admin review
                  </div>
                </div>

                {/* Store Photos */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ImageIcon size={12} />
                    Store Photos
                    <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>
                  </label>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                    Photos of your physical store, warehouse, or premises. Helps our team verify your business location.
                  </p>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => photoInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && photoInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setPhotoDrag(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setPhotoDrag(true); }}
                    onDragLeave={() => setPhotoDrag(false)}
                    onDrop={handlePhotoDrop}
                    style={{
                      border: `2px dashed ${photoDrag ? 'var(--accent)' : storePhotos.length > 0 ? 'rgba(16,185,129,0.4)' : 'var(--border-default)'}`,
                      borderRadius: 14,
                      padding: storePhotos.length === 0 ? '36px 24px' : '16px',
                      cursor: 'pointer',
                      background: photoDrag ? 'var(--accent-muted)' : storePhotos.length > 0 ? 'rgba(16,185,129,0.04)' : 'var(--bg-elevated)',
                      transition: 'all 0.2s',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  >
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => e.target.files && addStorePhotos(Array.from(e.target.files))}
                    />

                    {storePhotos.length === 0 ? (
                      <>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12,
                          background: 'var(--bg-overlay)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          margin: '0 auto 12px',
                          color: 'var(--text-muted)',
                        }}>
                          <Upload size={20} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                          Drop images here or click to browse
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          JPG, PNG, WEBP — up to 10 photos
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: 8,
                          marginBottom: 10,
                        }}>
                          {storePhotoPreviews.map((src, idx) => (
                            <div
                              key={idx}
                              style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-overlay)' }}
                            >
                              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeStorePhoto(idx); }}
                                style={{
                                  position: 'absolute', top: 4, right: 4,
                                  width: 20, height: 20, borderRadius: '50%',
                                  background: 'rgba(0,0,0,0.75)', border: 'none',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: '#fff', cursor: 'pointer', padding: 0,
                                }}
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          {storePhotos.length < 10 && (
                            <div style={{
                              aspectRatio: '1', borderRadius: 10,
                              border: '2px dashed var(--border-default)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--text-muted)',
                            }}>
                              <Upload size={14} />
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {storePhotos.length} photo{storePhotos.length !== 1 ? 's' : ''} added
                          {storePhotos.length < 10 && ' · Click to add more'}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Business Documents */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={12} />
                    Business Documents
                    <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>
                  </label>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                    Business registration certificate, tax clearance, operating license, or other official documents.
                  </p>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => docInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && docInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDocDrag(true); }}
                    onDragEnter={(e) => { e.preventDefault(); setDocDrag(true); }}
                    onDragLeave={() => setDocDrag(false)}
                    onDrop={handleDocDrop}
                    style={{
                      border: `2px dashed ${docDrag ? 'var(--accent)' : documents.length > 0 ? 'rgba(16,185,129,0.4)' : 'var(--border-default)'}`,
                      borderRadius: 14,
                      padding: documents.length === 0 ? '36px 24px' : '16px',
                      cursor: 'pointer',
                      background: docDrag ? 'var(--accent-muted)' : documents.length > 0 ? 'rgba(16,185,129,0.04)' : 'var(--bg-elevated)',
                      transition: 'all 0.2s',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  >
                    <input
                      ref={docInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => e.target.files && addDocuments(Array.from(e.target.files))}
                    />

                    {documents.length === 0 ? (
                      <>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12,
                          background: 'var(--bg-overlay)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          margin: '0 auto 12px',
                          color: 'var(--text-muted)',
                        }}>
                          <Upload size={20} />
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                          Drop files here or click to browse
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          PDF, DOC, DOCX, JPG, PNG supported
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {documents.map((doc, idx) => (
                            <div
                              key={idx}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 14px',
                                background: 'var(--bg-surface)',
                                borderRadius: 10,
                                border: '1px solid var(--border-subtle)',
                                textAlign: 'left',
                              }}
                            >
                              <div style={{
                                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                background: 'var(--info-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--info)',
                              }}>
                                {doc.type.startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 13, fontWeight: 600,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {doc.name}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                  {formatBytes(doc.size)}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeDocument(idx)}
                                style={{
                                  background: 'none', border: 'none', flexShrink: 0,
                                  color: 'var(--text-muted)', display: 'flex',
                                  alignItems: 'center', cursor: 'pointer', padding: 4,
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>
                          {documents.length} file{documents.length !== 1 ? 's' : ''} added
                          {' · Click to add more'}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Notice */}
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(59,130,246,0.06)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  borderRadius: 10,
                  marginBottom: 28,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  gap: 10,
                  lineHeight: 1.5,
                }}>
                  <ShieldCheck size={16} style={{ color: 'var(--info)', flexShrink: 0, marginTop: 1 }} />
                  <span>
                    All files are encrypted in transit and reviewed exclusively by our verification team.
                    Expect a decision within 24–48 hours of submission.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => { setStep(2); setError(''); }}
                    style={{ flex: 1 }}
                  >
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ flex: 2 }}
                  >
                    {loading ? <span className="spinner" /> : <ShieldCheck size={16} />}
                    {loading ? 'Submitting Application...' : 'Submit Application'}
                  </button>
                </div>
              </div>
            )}

          </form>

          <div className="auth-footer" style={{ marginTop: 28 }}>
            Already registered?{' '}
            <Link href="/login">Sign in to your account</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
