'use client';

import { useEffect, useState } from 'react';
import { getUser, getAccessToken, getUserInitials } from '@/lib/auth';
import { authApi } from '@/lib/api';
import { User, Mail, Phone, Building2, ShieldCheck, ShieldAlert, BadgeCheck, Calendar } from 'lucide-react';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const cachedUser = getUser();

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      authApi.getProfile(token)
        .then((p: any) => setProfile(p))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const user = profile || cachedUser;
  const cp = user?.contractorProfile;
  const firstName = cp?.firstName || '';
  const lastName = cp?.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Contractor';
  const company = cp?.company || '';
  const email = user?.email || '';
  const phone = user?.phone || '';
  const isVerified = Boolean(user?.isVerified);
  const initials = getUserInitials(user);
  const joinedAt = user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  if (loading) {
    return (
      <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
        <div className="spinner-light" />
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: 780, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Your account details and verification status.</p>
        </div>
      </div>

      <div className="profile-layout">
        {/* Header card */}
        <div className="profile-header-card">
          <div
            className="avatar lg"
            style={{ flexShrink: 0 }}
            aria-label={fullName}
          >
            {initials}
          </div>
          <div className="profile-info">
            <div className="profile-name">{fullName}</div>
            {company && <div className="profile-meta">{company}</div>}
            <div className="profile-badges">
              <span className={`badge ${isVerified ? 'badge-success' : 'badge-warning'}`}>
                {isVerified ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                {isVerified ? 'Verified' : 'Unverified'}
              </span>
              <span className="badge badge-accent">
                <BadgeCheck size={11} /> Contractor
              </span>
            </div>
          </div>
        </div>

        {/* Contact & account info */}
        <div className="profile-section">
          <div className="card-header">
            <span className="card-title">Account Information</span>
          </div>

          <div className="profile-field-row">
            <div className="profile-field-label">
              <User size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', opacity: 0.6 }} />
              Full Name
            </div>
            <div className="profile-field-value">{fullName}</div>
          </div>

          {company && (
            <div className="profile-field-row">
              <div className="profile-field-label">
                <Building2 size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', opacity: 0.6 }} />
                Company
              </div>
              <div className="profile-field-value">{company}</div>
            </div>
          )}

          <div className="profile-field-row">
            <div className="profile-field-label">
              <Mail size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', opacity: 0.6 }} />
              Email
            </div>
            <div className="profile-field-value">{email || <span style={{ color: 'var(--text-muted)' }}>Not set</span>}</div>
          </div>

          <div className="profile-field-row">
            <div className="profile-field-label">
              <Phone size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', opacity: 0.6 }} />
              Phone
            </div>
            <div className="profile-field-value">{phone || <span style={{ color: 'var(--text-muted)' }}>Not set</span>}</div>
          </div>

          {joinedAt && (
            <div className="profile-field-row">
              <div className="profile-field-label">
                <Calendar size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle', opacity: 0.6 }} />
                Member Since
              </div>
              <div className="profile-field-value">{joinedAt}</div>
            </div>
          )}
        </div>

        {/* Verification status */}
        <div className="profile-section">
          <div className="card-header">
            <span className="card-title">Verification Status</span>
          </div>
          <div className="card-body">
            {isVerified ? (
              <div className="alert alert-success" role="status">
                <span className="alert-icon"><ShieldCheck size={16} /></span>
                <div>
                  <strong>Account Verified</strong>
                  <br />
                  <span style={{ fontSize: 13 }}>Your phone number has been verified. You can place orders and use escrow features.</span>
                </div>
              </div>
            ) : (
              <div className="alert alert-warning" role="alert">
                <span className="alert-icon"><ShieldAlert size={16} /></span>
                <div>
                  <strong>Phone Verification Required</strong>
                  <br />
                  <span style={{ fontSize: 13 }}>
                    Verify your phone number to unlock ordering, escrow, and supplier messaging.{' '}
                    <a href={`/verify-otp?userId=${user?.id}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      Verify now →
                    </a>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
