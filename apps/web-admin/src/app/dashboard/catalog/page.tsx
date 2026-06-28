'use client';

import { useEffect, useState, useRef } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import {
  Plus, Search, Trash2, Edit3, X, Filter,
  ChevronLeft, ChevronRight, UploadCloud, Database,
} from 'lucide-react';

const CATEGORIES = [
  'All', 'Basic', 'Masonry', 'Structural', 'Electrical', 'Plumbing',
  'Finishing', 'Painting', 'Roofing', 'Carpentry', 'Energy', 'Glass', 'Aggregates',
];

const UNITS = ['Bags', 'm3', 'Pcs', 'Liters', 'Tons', 'Meters', 'Sqm', 'Sheets', 'kg', 'Rolls', 'Units'];

export default function GlobalCatalogPage() {
  const [products, setProducts]               = useState<any[]>([]);
  const [filtered, setFiltered]               = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [showForm, setShowForm]               = useState(false);
  const [editingItem, setEditingItem]         = useState<any>(null);
  const [search, setSearch]                   = useState('');
  const [category, setCategory]               = useState('All');
  const [file, setFile]                       = useState<File | null>(null);
  const [page, setPage]                       = useState(1);
  const [saving, setSaving]                   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const PER_PAGE = 10;

  const [form, setForm] = useState({ name: '', category: 'Basic', description: '', imageUrl: '', unit: 'Bags' });

  useEffect(() => { fetchCatalog(); }, []);

  useEffect(() => {
    let res = products;
    if (category !== 'All') res = res.filter(p => p.category === category);
    if (search) res = res.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(res);
    setPage(1);
  }, [search, category, products]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageItems  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  async function fetchCatalog() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/catalog/master-products', { token: token! });
      setProducts(data);
    } catch { /* handled */ } finally { setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('category', form.category);
    fd.append('description', form.description);
    fd.append('unit', form.unit);
    if (form.imageUrl) fd.append('imageUrl', form.imageUrl);
    if (file) fd.append('image', file);
    setSaving(true);
    try {
      if (editingItem) {
        await apiRequest(`/catalog/master-products/${editingItem.id}`, { method: 'PATCH', token: token!, formData: fd });
      } else {
        await apiRequest('/catalog/master-products', { method: 'POST', token: token!, formData: fd });
      }
      closeForm();
      fetchCatalog();
    } catch { alert('Failed to save material template'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this material template?')) return;
    const token = getAccessToken();
    try {
      await apiRequest(`/catalog/master-products/${id}`, { method: 'DELETE', token: token! });
      fetchCatalog();
    } catch { alert('Failed to delete material template'); }
  }

  function openEdit(item: any) {
    setEditingItem(item);
    setForm({ name: item.name, category: item.category, description: item.description || '', imageUrl: item.imageUrl || '', unit: item.unit || 'Bags' });
    setFile(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingItem(null);
    setFile(null);
    setForm({ name: '', category: 'Basic', description: '', imageUrl: '', unit: 'Bags' });
  }

  return (
    <div className="catalog-root fade-in">
      {/* Header */}
      <div className="catalog-header">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>Global Catalog</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Standardized material templates for the marketplace</p>
        </div>
        <button
          onClick={() => { closeForm(); setShowForm(true); }}
          className="btn btn-primary btn-sm"
        >
          <Plus size={14} /> Add Material
        </button>
      </div>

      {/* Filters — sticky */}
      <div className="catalog-sticky">
        <div className="filter-bar">
          <div className="search-wrapper">
            <Search className="search-icon" size={15} />
            <input
              className="input search-input"
              type="text"
              placeholder="Search templates…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            <select
              className="input"
              style={{ width: 160 }}
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="catalog-scroll">
        {loading ? (
          <div className="page-loader">
            <div className="spinner" style={{ width: 36, height: 36 }} />
            Loading catalog…
          </div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Unit</th>
                      <th>Description</th>
                      <th>ID</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          <div className="empty-state">
                            <Database size={36} style={{ opacity: 0.15 }} />
                            <p>No materials found matching your criteria.</p>
                          </div>
                        </td>
                      </tr>
                    ) : pageItems.map(p => (
                      <tr key={p.id} className="hover-bg">
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-elevated)', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-subtle)' }}>
                              {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.name}</span>
                          </div>
                        </td>
                        <td><span className="badge badge-info">{p.category}</span></td>
                        <td style={{ fontSize: 12.5, color: p.unit ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                          {p.unit || '—'}
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.description || '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 700 }}>
                          #{p.id.slice(-8).toUpperCase()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={() => openEdit(p)} className="btn btn-ghost btn-icon btn-sm" title="Edit">
                              <Edit3 size={13} />
                            </button>
                            <button onClick={() => handleDelete(p.id)} className="btn btn-danger btn-icon btn-sm" title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {filtered.length > PER_PAGE && (
              <div className="pagination-bar">
                <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={16} /> Prev
                </button>
                <span className="pagination-info">Page <b>{page}</b> of {totalPages}</span>
                <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeForm(); }}>
          <div className="fm-modal">
            <div className="fm-modal-header">
              <div className="fm-modal-title">{editingItem ? 'Edit Template' : 'New Material Template'}</div>
              <button onClick={closeForm} className="fm-modal-close"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} className="fm-modal-form">
              <div className="form-group">
                <label>Template Name</label>
                <input
                  className="input"
                  type="text"
                  required
                  placeholder="e.g. Portland Cement 42.5N"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    className="input"
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Unit of Sale</label>
                  <select
                    className="input"
                    value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}
                  >
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Product Image</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `1px dashed ${file ? 'var(--accent)' : 'var(--border-default)'}`,
                      borderRadius: 10,
                      padding: '14px 10px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'var(--transition)',
                    }}
                  >
                    <UploadCloud size={18} color={file ? 'var(--accent)' : 'var(--text-muted)'} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: file ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {file ? file.name.slice(0, 18) + (file.name.length > 18 ? '…' : '') : 'Upload file'}
                    </span>
                    <input type="file" hidden ref={fileRef} accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
                  </div>
                  <input
                    className="input"
                    type="url"
                    placeholder="Or paste URL…"
                    value={form.imageUrl}
                    onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Technical Description</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Specifications, grade, and use cases…"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="fm-modal-actions">
                <button type="button" onClick={closeForm} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</> : editingItem ? 'Save Changes' : 'Publish Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
