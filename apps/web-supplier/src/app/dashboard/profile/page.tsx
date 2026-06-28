'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken, getUser } from '@/lib/auth';
import { 
  ShieldCheck, 
  User, 
  Lock, 
  Building2, 
  CheckCircle, 
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    businessName: '',
    email: '',
    phone: '',
  });

  const [passData, setPassData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any>('/users/me', { token: token! });
      setFormData({
        businessName: data.supplierProfile?.businessName || '',
        email: data.email || '',
        phone: data.phone || '',
      });
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    setSaving(true);
    setSuccess(null);
    setError(null);
    const token = getAccessToken();

    try {
      await apiRequest('/users/profile', {
        method: 'PATCH',
        token: token!,
        body: formData,
      });
      setSuccess('Profile updated successfully');
      setTimeout(() => setSuccess(null), 4000);
      fetchProfile(); // Sync
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passData.newPassword !== passData.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setSaving(true);
    setSuccess(null);
    setError(null);
    const token = getAccessToken();

    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        token: token!,
        body: {
          oldPassword: passData.oldPassword,
          newPassword: passData.newPassword
        },
      });
      setSuccess('Password updated successfully');
      setPassData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="fm-root fade-in">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="fm-root fade-in">
      <div className="fm-content-wrap">
        <div className="fm-header">
          <div>
            <h1 className="fm-title">Management & Settings</h1>
            <p className="fm-subtitle">Control your business identity and institutional security protocols</p>
          </div>
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="btn btn-primary !w-auto" 
                onClick={handleSaveProfile} 
                disabled={saving}
              >
                {saving ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={16} className="animate-spin" />
                    Synchronizing...
                  </span>
                ) : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        <div className="tab-container">
          <button 
            className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => { setActiveTab('profile'); setError(null); setSuccess(null); }}
          >
            <Building2 size={14} style={{ marginRight: 8, display: 'inline' }} />
            Business Profile
          </button>
          <button 
            className={`tab-btn ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => { setActiveTab('account'); setError(null); setSuccess(null); }}
          >
            <ShieldCheck size={14} style={{ marginRight: 8, display: 'inline' }} />
            Account Security
          </button>
          <button 
            className={`tab-btn ${activeTab === 'compliance' ? 'active' : ''}`}
            onClick={() => { setActiveTab('compliance'); setError(null); setSuccess(null); }}
          >
            <CheckCircle size={14} style={{ marginRight: 8, display: 'inline' }} />
            Compliance Status
          </button>
        </div>

        {success && (
          <div className="badge badge-success fade-in" style={{ padding: '14px 20px', width: '100%', marginBottom: 24, justifyContent: 'center', borderRadius: 12, border: '1px solid var(--success)' }}>
            <CheckCircle size={16} style={{ marginRight: 8 }} />
            {success}
          </div>
        )}

        {error && (
          <div className="badge badge-danger fade-in" style={{ padding: '14px 20px', width: '100%', marginBottom: 24, justifyContent: 'center', borderRadius: 12, border: '1px solid var(--danger)' }}>
            <AlertCircle size={16} style={{ marginRight: 8 }} />
            {error}
          </div>
        )}

        <div className="card" style={{ 
          padding: 40, background: 'var(--bg-surface)', border: 'none', boxShadow: 'var(--shadow-sm)',
          maxHeight: 'calc(100vh - 320px)', overflowY: 'auto'
        }}>
          {activeTab === 'profile' && (
            <div className="settings-group fade-in">
              <div className="settings-group-header">
                <div className="settings-group-title">Institutional Identity</div>
                <div className="settings-group-desc">Information verified and displayed on the construction marketplace.</div>
              </div>

              <div className="settings-row">
                <div className="settings-info">
                  <div className="settings-label">Registered Business Name</div>
                  <div className="settings-hint">Your legal corporate name as registered with the authorities.</div>
                </div>
                <div className="settings-control">
                  <input 
                    type="text" 
                    className="input" 
                    value={formData.businessName}
                    onChange={e => setFormData({ ...formData, businessName: e.target.value })}
                  />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-info">
                  <div className="settings-label">Operational Email</div>
                  <div className="settings-hint">Primary node for procurement alerts and financial receipts.</div>
                </div>
                <div className="settings-control">
                  <input 
                    type="email" 
                    className="input" 
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-info">
                  <div className="settings-label">Logistics Contact</div>
                  <div className="settings-hint">Verified phone number for delivery coordination.</div>
                </div>
                <div className="settings-control">
                  <input 
                    type="text" 
                    className="input" 
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="settings-group fade-in">
              <div className="settings-group-header">
                <div className="settings-group-title">Authentication Protocol</div>
                <div className="settings-group-desc">Secure your account by updating your credentials.</div>
              </div>

              <form onSubmit={handleChangePassword}>
                <div className="settings-row">
                  <div className="settings-info">
                    <div className="settings-label">Current Password</div>
                    <div className="settings-hint">Required to verify your authorization for this change.</div>
                  </div>
                  <div className="settings-control" style={{ position: 'relative' }}>
                    <input 
                      type={showOld ? 'text' : 'password'} 
                      className="input" 
                      placeholder="••••••••"
                      value={passData.oldPassword}
                      onChange={e => setPassData({ ...passData, oldPassword: e.target.value })}
                      required
                    />
                    <button type="button" onClick={() => setShowOld(!showOld)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-info">
                    <div className="settings-label">New Password</div>
                    <div className="settings-hint">Must be at least 8 characters with institutional complexity.</div>
                  </div>
                  <div className="settings-control" style={{ position: 'relative' }}>
                    <input 
                      type={showNew ? 'text' : 'password'} 
                      className="input" 
                      placeholder="••••••••"
                      value={passData.newPassword}
                      onChange={e => setPassData({ ...passData, newPassword: e.target.value })}
                      required
                    />
                    <button type="button" onClick={() => setShowNew(!showNew)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-info">
                    <div className="settings-label">Confirm New Password</div>
                    <div className="settings-hint">Re-enter your new credentials to ensure accuracy.</div>
                  </div>
                  <div className="settings-control">
                    <input 
                      type="password" 
                      className="input" 
                      placeholder="••••••••"
                      value={passData.confirmPassword}
                      onChange={e => setPassData({ ...passData, confirmPassword: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary !w-auto px-8" disabled={saving}>
                    {saving ? 'Processing...' : 'Update Credentials'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'compliance' && (
            <div className="settings-group fade-in">
              <div className="settings-group-header">
                <div className="settings-group-title">Verification Governance</div>
                <div className="settings-group-desc">Monitor your standing within the Falcon procurement network.</div>
              </div>

              <div className="settings-row">
                <div className="settings-info">
                  <div className="settings-label">Account Verification</div>
                  <div className="settings-hint">Institutional review of your business credentials.</div>
                </div>
                <div className="settings-control">
                  <div style={{ padding: '16px 20px', background: 'var(--success-muted)', borderRadius: 12, border: '1px solid var(--success)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ShieldCheck size={20} color="var(--success)" />
                    <span style={{ fontWeight: 800, color: 'var(--success)', fontSize: 13 }}>VERIFIED SUPPLIER</span>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-info">
                  <div className="settings-label">Marketplace Tier</div>
                  <div className="settings-hint">Calculated based on fulfillment rate and escrow integrity.</div>
                </div>
                <div className="settings-control">
                  <div className="badge badge-info" style={{ padding: '10px 16px', borderRadius: 8 }}>
                    CSCP Standard Tier
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
