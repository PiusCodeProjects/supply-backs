'use client';

import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { CheckCircle, XCircle, FileText, Building2, X } from 'lucide-react';

// Derive the API origin (without the trailing /api) for serving uploaded files.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api').replace(/\/api$/, '');

export default function SuppliersVerificationPage() {
  const [suppliers, setSuppliers]           = useState<any[]>([]);
  const [loading, setLoading]               = useState(true);
  const [docViewer, setDocViewer]           = useState<any | null>(null);
  const [rejectModal, setRejectModal]       = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason]     = useState('');
  const [actionLoading, setActionLoading]   = useState<string | null>(null);

  useEffect(() => { fetchPending(); }, []);

  async function fetchPending() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/users/suppliers/pending', { token: token! });
      setSuppliers(data);
    } catch { /* handled */ } finally { setLoading(false); }
  }

  async function handleVerify(id: string, action: 'APPROVED' | 'REJECTED', reason?: string) {
    const token = getAccessToken();
    setActionLoading(id);
    try {
      await apiRequest(`/users/${id}/verify-supplier`, {
        method: 'PATCH',
        token: token!,
        body: { action, rejectionReason: reason },
      });
      setSuppliers(prev => prev.filter(s => s.id !== id));
      setDocViewer(null);
      setRejectModal(null);
      setRejectReason('');
    } catch { alert('Verification failed. Please try again.'); }
    finally { setActionLoading(null); }
  }

  if (loading) return (
    <div className="page-loader fade-in">
      <div className="spinner" style={{ width: 36, height: 36 }} />
      Loading verification queue…
    </div>
  );

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Supplier Verification</h1>
        <p>Review and approve new vendor registrations</p>
      </div>

      {suppliers.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '80px 20px' }}>
            <CheckCircle size={48} color="var(--success)" style={{ opacity: 0.4 }} />
            <h3 style={{ fontWeight: 700, fontSize: 16 }}>All caught up!</h3>
            <p>No pending supplier applications to review.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {suppliers.map(s => {
            const docs: string[] = JSON.parse(s.supplierProfile?.documents || '[]');
            return (
              <div key={s.id} className="card">
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 20, padding: '18px 22px', alignItems: 'center' }}>
                  {/* Identity */}
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent-muted)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={22} color="var(--accent)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>{s.supplierProfile?.businessName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Registered {new Date(s.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Contact</div>
                      <div style={{ fontSize: 13 }}>{s.email || '—'}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.phone || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Documents</div>
                      {docs.length > 0 ? (
                        <button
                          onClick={() => setDocViewer(s)}
                          className="btn btn-ghost btn-sm"
                          style={{ gap: 5 }}
                        >
                          <FileText size={12} /> View {docs.length} file{docs.length > 1 ? 's' : ''}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No documents</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => handleVerify(s.id, 'APPROVED')}
                      disabled={actionLoading === s.id}
                      className="btn btn-success btn-sm"
                    >
                      {actionLoading === s.id
                        ? <div className="spinner" style={{ width: 12, height: 12 }} />
                        : <><CheckCircle size={13} /> Approve</>}
                    </button>
                    <button
                      onClick={() => setRejectModal({ id: s.id, name: s.supplierProfile?.businessName })}
                      disabled={actionLoading === s.id}
                      className="btn btn-danger btn-sm"
                    >
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Document Viewer */}
      {docViewer && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDocViewer(null); }}>
          <div className="modal modal-xl" style={{ height: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div className="modal-title">{docViewer.supplierProfile?.businessName} — Business Documents</div>
              <button className="modal-close" onClick={() => setDocViewer(null)}><X size={15} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', background: '#0a0a0a' }}>
              <iframe
                src={`${API_BASE}${JSON.parse(docViewer.supplierProfile?.documents || '[]')[0] || ''}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Business document"
              />
            </div>
            <div className="modal-footer">
              <button onClick={() => setDocViewer(null)} className="btn btn-ghost">Close</button>
              <button
                onClick={() => setRejectModal({ id: docViewer.id, name: docViewer.supplierProfile?.businessName })}
                className="btn btn-danger"
              >
                <XCircle size={14} /> Reject
              </button>
              <button
                onClick={() => handleVerify(docViewer.id, 'APPROVED')}
                disabled={actionLoading === docViewer.id}
                className="btn btn-success"
              >
                {actionLoading === docViewer.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <><CheckCircle size={14} /> Approve</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Reject Supplier</div>
              <button className="modal-close" onClick={() => { setRejectModal(null); setRejectReason(''); }}><X size={15} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Provide a reason for rejecting <strong style={{ color: 'var(--text-primary)' }}>{rejectModal.name}</strong>. This will be recorded on their profile.
              </p>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Rejection Reason</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="e.g. Incomplete documentation, unverifiable business address…"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }} className="btn btn-ghost">Cancel</button>
              <button
                onClick={() => { if (rejectReason.trim()) handleVerify(rejectModal.id, 'REJECTED', rejectReason.trim()); }}
                disabled={!rejectReason.trim() || actionLoading === rejectModal.id}
                className="btn btn-danger"
              >
                {actionLoading === rejectModal.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
