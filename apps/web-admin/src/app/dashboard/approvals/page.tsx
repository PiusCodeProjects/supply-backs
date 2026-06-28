'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, Check, X, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

type Pending = {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  imageUrl?: string | null;
  unit?: string | null;
  createdAt: string;
  submittedBy?: {
    id: string;
    email: string | null;
    phone: string;
    supplierProfile?: { businessName: string } | null;
  } | null;
};

export default function ApprovalsPage() {
  const [items, setItems] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => { fetchPending(); }, []);

  async function fetchPending() {
    const token = getAccessToken();
    if (!token) return;
    try {
      setLoading(true);
      const data = await apiRequest<Pending[]>('/catalog/master-products/pending', { token });
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function approve(id: string) {
    const token = getAccessToken();
    if (!token) return;
    setProcessing(id);
    try {
      await apiRequest(`/catalog/master-products/${id}/approve`, { method: 'PATCH', token });
      setItems(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Approve failed');
    } finally {
      setProcessing(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt('Reason for rejection (shown to the supplier — optional):') ?? undefined;
    if (reason === undefined) return; // user pressed Cancel
    const token = getAccessToken();
    if (!token) return;
    setProcessing(id);
    try {
      await apiRequest(`/catalog/master-products/${id}/reject`, {
        method: 'PATCH',
        token,
        body: { reason },
      });
      setItems(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Reject failed');
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px' }}>Material Approvals</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Suppliers can propose products that aren't yet in the catalog. Approve to add them; reject with a reason.
          </p>
        </div>
        <span className="badge" style={{
          background: 'rgba(245,158,11,0.12)',
          color: '#f59e0b',
          border: '1px solid rgba(245,158,11,0.3)',
          fontSize: 11, fontWeight: 800, letterSpacing: 0.5, padding: '6px 12px',
        }}>
          {items.length} pending
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center' }}>
          <div className="spinner" style={{ width: 40, height: 40, borderTopColor: 'var(--accent)', margin: '0 auto' }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-muted)' }}>
          <ClipboardCheck size={40} strokeWidth={1.3} style={{ opacity: 0.35 }} />
          <p style={{ marginTop: 12, fontSize: 14 }}>No pending proposals. All caught up.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {items.map(p => {
            const supplier = p.submittedBy?.supplierProfile?.businessName
              ?? p.submittedBy?.email
              ?? p.submittedBy?.phone
              ?? 'Unknown supplier';
            return (
              <div key={p.id} className="card" style={{ padding: 18, display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 18, alignItems: 'flex-start' }}>
                <div style={{ width: 120, height: 100, borderRadius: 12, overflow: 'hidden', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <ImageIcon size={32} style={{ opacity: 0.3 }} />}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800 }}>{p.name}</h3>
                    <span className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)', fontSize: 10, fontWeight: 800 }}>
                      {p.category}
                    </span>
                    {p.unit && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· per {p.unit}</span>
                    )}
                  </div>
                  {p.description && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                      {p.description}
                    </p>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={12} />
                    Submitted by <strong style={{ color: 'var(--text-secondary)' }}>{supplier}</strong>
                    {' · '}
                    {new Date(p.createdAt).toLocaleString()}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 130 }}>
                  <button
                    type="button"
                    onClick={() => approve(p.id)}
                    disabled={processing === p.id}
                    className="btn btn-primary"
                    style={{ width: '100%', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: processing === p.id ? 0.6 : 1 }}
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(p.id)}
                    disabled={processing === p.id}
                    className="btn btn-ghost"
                    style={{ width: '100%', height: 38, color: 'var(--danger, #ef4444)', borderColor: 'rgba(239,68,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: processing === p.id ? 0.6 : 1 }}
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
