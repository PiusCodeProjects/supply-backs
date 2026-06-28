'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import { apiRequest } from '@/lib/api';
import { getAccessToken, getUser } from '@/lib/auth';
import { 
  Package, 
  Plus, 
  Layers, 
  Trash2, 
  Edit3,
  X,
  ChevronDown,
  ArrowRight,
  Database,
  Tag,
  AlertCircle,
  Search,
  Check,
  ChevronRight,
  ShoppingCart,
  Box,
  Truck,
  Zap,
  Hammer,
  Droplets,
  Paintbrush,
  Home,
  Monitor,
  Flame,
  Globe,
  Settings,
  Cpu,
  ShieldCheck,
} from 'lucide-react';

// Derive the socket origin (without the trailing /api) from the API URL env var.
const SOCKET_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001/api').replace(/\/api$/, '');

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [masterProducts, setMasterProducts] = useState<any[]>([]);
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection states for master sync
  // currentStep: 1 = pick a product, 2 = price/unit/stock form
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMasterId, setSelectedMasterId] = useState('');
  const [pickerSearch, setPickerSearch] = useState('');

  // Propose-new-product modal
  const [showPropose, setShowPropose] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState({
    name: '',
    category: '',
    description: '',
    unit: '',
  });
  const [proposalImage, setProposalImage] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    price: 0,
    unit: 'bag',
    stock: 0,
  });

  // Body scroll lock
  useEffect(() => {
    if (showAdd) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showAdd]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    const user = getUser();
    if (!token || !user?.id) return;

    const socket = io(`${SOCKET_BASE}/catalog`, { auth: { token } });
    socket.emit('joinSupplierRoom', { supplierId: user.id });
    socket.on('stockUpdated', (updates: { id: string; stock: number }[]) => {
      setItems(prev =>
        prev.map(item => {
          const update = updates.find(u => u.id === item.id);
          return update ? { ...item, stock: update.stock } : item;
        })
      );
    });

    return () => { socket.disconnect(); };
  }, []);

  async function fetchInitialData() {
    const token = getAccessToken();
    try {
      const [inventory, masters, submissions] = await Promise.allSettled([
        apiRequest<any[]>('/catalog/my', { token: token! }),
        apiRequest<any[]>('/catalog/master-products', { token: token! }),
        apiRequest<any[]>('/catalog/master-products/my-submissions', { token: token! }),
      ]);
      if (inventory.status === 'fulfilled') setItems(inventory.value);
      if (masters.status === 'fulfilled') setMasterProducts(masters.value);
      if (submissions.status === 'fulfilled') setMySubmissions(submissions.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleProposeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;
    if (!proposal.name.trim() || !proposal.category.trim()) {
      alert('Name and category are required.');
      return;
    }
    setProposing(true);
    try {
      const fd = new FormData();
      fd.append('name', proposal.name.trim());
      fd.append('category', proposal.category.trim());
      if (proposal.description.trim()) fd.append('description', proposal.description.trim());
      if (proposal.unit.trim()) fd.append('unit', proposal.unit.trim());
      if (proposalImage) fd.append('image', proposalImage);
      await apiRequest('/catalog/master-products/propose', {
        method: 'POST',
        token,
        formData: fd,
      });
      setShowPropose(false);
      setProposal({ name: '', category: '', description: '', unit: '' });
      setProposalImage(null);
      fetchInitialData();
      alert('Thanks — your proposal was submitted for admin review.');
    } catch (err: any) {
      alert(err?.message || 'Failed to submit proposal');
    } finally {
      setProposing(false);
    }
  }

  const categories = Array.from(new Set(masterProducts.map(m => m.category)));
  // Picker results: filter master products by search text across name/category/
  // description/unit. If a category chip is active, narrow further. With no
  // query and no chip we show everything so the supplier can browse.
  const pickerResults = (() => {
    const q = pickerSearch.trim().toLowerCase();
    return masterProducts.filter(m => {
      if (selectedCategory && m.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        m.name?.toLowerCase().includes(q) ||
        m.category?.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.unit?.toLowerCase().includes(q)
      );
    });
  })();
  const selectedMaster = masterProducts.find(m => m.id === selectedMasterId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    try {
      if (editingItem) {
        await apiRequest(`/catalog/${editingItem.id}`, {
          method: 'PATCH',
          token: token!,
          body: formData,
        });
      } else {
        if (!selectedMasterId) return alert('Please select a product');
        await apiRequest('/catalog', {
          method: 'POST',
          token: token!,
          body: {
            ...formData,
            masterProductId: selectedMasterId
          },
        });
      }
      setShowAdd(false);
      resetForm();
      fetchInitialData();
    } catch (err) {
      alert('Action failed');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this material from your inventory?')) return;
    const token = getAccessToken();
    try {
      await apiRequest(`/catalog/${id}`, { method: 'DELETE', token: token! });
      fetchInitialData();
    } catch (err) {
      alert('Delete failed');
    }
  }

  function handleEdit(item: any) {
    setEditingItem(item);
    setSelectedCategory(item.masterProduct?.category || item.category);
    setSelectedMasterId(item.masterProductId || '');
    setFormData({
      price: item.price,
      // Prefer the master product's unit (admin source of truth) over any
      // legacy value stored on the catalog item.
      unit: item.masterProduct?.unit || item.unit,
      stock: item.stock
    });
    setCurrentStep(2); // Go straight to pricing form
    setShowAdd(true);
  }

  function resetForm() {
    setEditingItem(null);
    setSelectedCategory('');
    setSelectedMasterId('');
    setPickerSearch('');
    setFormData({ price: 0, unit: 'bag', stock: 0 });
    setCurrentStep(1);
  }

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'Electrical': return <Zap size={18} />;
      case 'Structural': return <Layers size={18} />;
      case 'Plumbing': return <Droplets size={18} />;
      case 'Finishing': return <Box size={18} />;
      case 'Painting': return <Paintbrush size={18} />;
      case 'Roofing': return <Home size={18} />;
      case 'Aggregates': return <Database size={18} />;
      case 'Masonry': return <Hammer size={18} />;
      default: return <Cpu size={18} />;
    }
  };

  return (
    <div className="fm-root fade-in" style={{ paddingBottom: 60, minHeight: '100vh' }}>
      {/* Header Section */}
      <div className="fm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search inventory..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input"
              style={{ paddingLeft: 44, width: 280, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
         
          <button 
            onClick={() => { resetForm(); setShowAdd(true); }} 
            className="btn btn-primary"
            style={{ width: 'auto', padding: '10px 24px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}
          >
            <Plus size={16} style={{ marginRight: 8 }} />
            Add Material
          </button>
        </div>
      </div>

      {/* Pending / rejected proposals strip */}
      {!loading && mySubmissions.some(s => s.status !== 'APPROVED') && (
        <div style={{ marginBottom: 18, padding: 16, borderRadius: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 800 }}>Your Proposals</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>Products awaiting admin review</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mySubmissions.filter(s => s.status !== 'APPROVED').map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--bg-elevated)', overflow: 'hidden', flexShrink: 0 }}>
                  {s.imageUrl && <img src={s.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.category}{s.unit ? ` · ${s.unit}` : ''}</div>
                  {s.status === 'REJECTED' && s.rejectionReason && (
                    <div style={{ fontSize: 11, color: 'var(--danger, #ef4444)', marginTop: 4 }}>Reason: {s.rejectionReason}</div>
                  )}
                </div>
                <span className="badge" style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                  background: s.status === 'PENDING' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                  color: s.status === 'PENDING' ? '#f59e0b' : 'var(--danger, #ef4444)',
                  border: `1px solid ${s.status === 'PENDING' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  {s.status === 'PENDING' ? 'AWAITING REVIEW' : 'REJECTED'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '120px 0', textAlign: 'center' }}>
          <div className="spinner" style={{ width: 44, height: 44, borderTopColor: 'var(--accent)', margin: '0 auto' }} />
        </div>
      ) : (
        <div className="card" style={{ border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-surface)', borderRadius: 20 }}>
          <div className="table-wrapper">
            <table style={{ borderCollapse: 'separate', borderSpacing: '0 8px', width: '100%' }}>
              <thead>
                <tr style={{ background: 'transparent' }}>
                  <th style={{ padding: '12px 24px', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Product Details</th>
                  <th style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Category</th>
                  <th style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Pricing</th>
                  <th style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Stock Level</th>
                  <th style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Status</th>
                  <th style={{ textAlign: 'right', paddingRight: 24, fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ background: 'transparent' }}>
                {items
                  .filter(i => 
                    i.masterProduct?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    i.masterProduct?.category.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '120px 0', color: 'var(--text-muted)' }}>
                      <Database size={48} style={{ margin: '0 auto 20px', opacity: 0.15 }} />
                      <p style={{ fontSize: 15, fontWeight: 500 }}>
                        {searchQuery ? `No results found for "${searchQuery}"` : "No materials found in your inventory."}
                      </p>
                      {!searchQuery && <button onClick={() => { resetForm(); setShowAdd(true); }} className="btn btn-ghost !w-auto mt-4 !text-xs">Browse Global Catalog</button>}
                    </td>
                  </tr>
                ) : items
                  .filter(i => 
                    i.masterProduct?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    i.masterProduct?.category.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(i => (
                  <tr key={i.id} style={{ background: 'var(--bg-surface)', transition: '0.2s' }} className="inventory-row">
                    <td style={{ padding: '16px 24px', borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--bg-elevated)', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border-subtle)' }}>
                          <img src={i.masterProduct?.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>{i.masterProduct?.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>ID: {i.id.slice(-6)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                         <div style={{ color: 'var(--accent)', opacity: 0.6 }}>{getCategoryIcon(i.masterProduct?.category)}</div>
                         <span style={{ fontWeight: 700, fontSize: 13 }}>{i.masterProduct?.category}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>GH₵ {i.price.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>per {i.unit}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                         <div style={{ width: 40, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, (i.stock / 100) * 100)}%`, height: '100%', background: i.stock < 10 ? 'var(--danger)' : 'var(--accent)' }} />
                         </div>
                         <div style={{ fontWeight: 800, fontSize: 14 }}>{i.stock.toLocaleString()}</div>
                      </div>
                    </td>
                    <td>
                      <div className={`badge ${i.stock > 0 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: 10 }}>
                        {i.stock > 0 ? 'ACTIVE' : 'OUT OF STOCK'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: 24, borderTopRightRadius: 12, borderBottomRightRadius: 12 }}>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button onClick={() => handleEdit(i)} className="btn !p-2 !w-auto !bg-bg-elevated hover:!bg-accent !rounded-lg border border-white/5">
                          <Edit3 size={15} />
                        </button>
                        <button onClick={() => handleDelete(i.id)} className="btn btn-danger !p-2 !w-auto !rounded-lg border border-danger/20">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal — rendered via portal so fixed positioning is never clipped by parent overflow */}
      {showAdd && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowAdd(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw', height: '100vh',
            zIndex: 9999,
            background: 'var(--modal-backdrop, rgba(2, 6, 12, 0.65))',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 28,
              width: '100%',
              maxWidth: 620,
              maxHeight: '88vh',
              boxShadow: '0 0 80px rgba(0,0,0,0.55), 0 0 24px rgba(16, 185, 129, 0.07)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'panelSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* ── Header (fixed, never scrolls) ── */}
            <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent-muted)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Globe size={18} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.4px', lineHeight: 1.2 }}>
                      {editingItem ? 'Update Asset' : 'Material Provisioning'}
                    </h2>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      CSCP Global Catalog · Step {currentStep} of 2
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAdd(false)}
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', width: 34, height: 34, borderRadius: '50%', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Step bar */}
              <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                {[1, 2].map(s => (
                  <div key={s} style={{ flex: 1, height: 3, background: currentStep >= s ? 'var(--accent)' : 'var(--bg-overlay)', borderRadius: 2, transition: '0.4s' }} />
                ))}
              </div>
            </div>

            {/* ── Scrollable body (flex:1 + minHeight:0 is what allows it to shrink) ── */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px 28px 26px' }} className="custom-scroll">

              {/* Step 1 — Search & pick a product */}
              {currentStep === 1 && (
                <div className="fade-in">
                  <h3 style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 12 }}>Find your product</h3>

                  {/* Search bar */}
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                    <input
                      autoFocus
                      type="text"
                      className="input glass-input"
                      value={pickerSearch}
                      onChange={e => setPickerSearch(e.target.value)}
                      placeholder="Search by name, description, or unit…"
                      style={{ paddingLeft: 40, paddingRight: pickerSearch ? 40 : 14, height: 44, borderRadius: 12 }}
                    />
                    {pickerSearch && (
                      <button
                        type="button"
                        onClick={() => setPickerSearch('')}
                        aria-label="Clear search"
                        style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
                          width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Optional category chips for browsing */}
                  {categories.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('')}
                        style={{
                          padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                          border: '1px solid',
                          borderColor: selectedCategory === '' ? 'var(--accent)' : 'var(--border-subtle)',
                          background: selectedCategory === '' ? 'var(--accent-muted)' : 'transparent',
                          color: selectedCategory === '' ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        All
                      </button>
                      {categories.map(cat => {
                        const active = selectedCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(active ? '' : cat)}
                            style={{
                              padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                              fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              border: '1px solid',
                              borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                              background: active ? 'var(--accent-muted)' : 'transparent',
                              color: active ? 'var(--accent)' : 'var(--text-secondary)',
                            }}
                          >
                            <span style={{ display: 'inline-flex' }}>{getCategoryIcon(cat)}</span>
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Results */}
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                    {pickerResults.length} {pickerResults.length === 1 ? 'match' : 'matches'}
                  </div>
                  {pickerResults.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)', borderRadius: 12 }}>
                      <Package size={26} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                        No products found{pickerSearch ? ` for "${pickerSearch}"` : ''}.
                      </div>
                      <div style={{ fontSize: 11, marginTop: 4 }}>
                        Try a different search, or propose a new product below.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pickerResults.map((m: any) => (
                        <div
                          key={m.id}
                          onClick={() => {
                            setSelectedMasterId(m.id);
                            // Unit is defined by the admin on the master product and is not
                            // editable by the supplier. Prefill from the master so the form
                            // shows the canonical value.
                            if (m.unit) setFormData(f => ({ ...f, unit: m.unit }));
                            setCurrentStep(2);
                          }}
                          className="glass-item"
                          style={{ padding: '13px 16px', borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: '0.2s' }}
                        >
                          <img src={m.imageUrl} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: 'var(--bg-overlay)' }} alt="" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, overflow: 'hidden' }}>
                              <span style={{ fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 10 }}>{m.category}</span>
                              {m.unit && <span>· {m.unit}</span>}
                              {m.description && (
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {m.description}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={16} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Propose new product CTA */}
                  <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 14, border: '1px dashed var(--border-accent)', background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-muted)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Plus size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>Don't see your product?</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Propose a new product. Admin will review before it appears in the catalog.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowAdd(false); setShowPropose(true); }}
                      className="btn btn-ghost btn-sm"
                      style={{ width: 'auto', whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-accent)', color: 'var(--accent)', fontWeight: 800 }}
                    >
                      Propose
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2 — Pricing form */}
              {currentStep === 2 && (
                <form onSubmit={handleSubmit} className="fade-in">
                  {!editingItem && (
                    <button type="button" onClick={() => setCurrentStep(1)} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 800, marginBottom: 16 }}>
                      ← Change Product
                    </button>
                  )}

                  {/* Selected product preview */}
                  <div style={{ background: 'var(--accent-muted)', border: '1px solid var(--border-accent)', borderRadius: 16, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'center' }}>
                    <img src={selectedMaster?.imageUrl} style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} alt="" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ fontSize: 14, fontWeight: 900, marginBottom: 3 }}>{selectedMaster?.name}</h4>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {selectedMaster?.description}
                      </p>
                    </div>
                  </div>

                  {/* Price + Unit */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>PRICE (GH₵)</label>
                      <input className="input glass-input" type="number" required value={formData.price} onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>UNIT</span>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 9, letterSpacing: 0.4,
                          color: 'var(--text-muted)', textTransform: 'uppercase',
                        }}>
                          <ShieldCheck size={10} /> Set by admin
                        </span>
                      </label>
                      <input
                        className="input glass-input"
                        type="text"
                        required
                        readOnly
                        aria-readonly="true"
                        value={formData.unit}
                        title="Unit is defined by the admin on the master product and can't be changed."
                        tabIndex={-1}
                        style={{
                          cursor: 'not-allowed',
                          opacity: 0.85,
                          background: 'var(--bg-elevated)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Stock */}
                  <div className="form-group" style={{ margin: '14px 0 0' }}>
                    <label style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>STOCK LEVEL</label>
                    <input className="input glass-input" type="number" required value={formData.stock} onChange={e => setFormData({ ...formData, stock: parseFloat(e.target.value) })} />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
                    <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost" style={{ flex: 1, height: 48, borderRadius: 14 }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ flex: 2, height: 48, borderRadius: 14, fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: '1px' }}>
                      {editingItem ? 'Update Asset' : 'Add to Inventory'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Propose-new-product modal */}
      {showPropose && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => !proposing && setShowPropose(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'var(--modal-backdrop, rgba(2, 6, 12, 0.65))', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleProposeSubmit}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 22, width: '100%', maxWidth: 520, maxHeight: '88vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              boxShadow: '0 0 80px rgba(0,0,0,0.55), 0 0 24px rgba(16, 185, 129, 0.07)',
              animation: 'panelSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.3px' }}>Propose a New Product</h2>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Admin will review and add it to the catalog. You can then list price &amp; stock for it.
              </p>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }} className="custom-scroll">
              <Labeled label="Product name">
                <input
                  className="input"
                  required
                  value={proposal.name}
                  onChange={e => setProposal(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Cellular Lightweight Concrete Block"
                />
              </Labeled>

              <Labeled label="Category">
                <input
                  className="input"
                  required
                  list="proposal-categories"
                  value={proposal.category}
                  onChange={e => setProposal(p => ({ ...p, category: e.target.value }))}
                  placeholder="Pick existing or type a new category"
                />
                <datalist id="proposal-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </Labeled>

              <Labeled label="Unit (optional)">
                <input
                  className="input"
                  value={proposal.unit}
                  onChange={e => setProposal(p => ({ ...p, unit: e.target.value }))}
                  placeholder="e.g. Bag, Sheet, Length, Cubic Meter"
                />
              </Labeled>

              <Labeled label="Description (optional)">
                <textarea
                  className="input"
                  rows={3}
                  value={proposal.description}
                  onChange={e => setProposal(p => ({ ...p, description: e.target.value }))}
                  placeholder="What is it, what's it used for, grade/spec…"
                  style={{ resize: 'vertical', minHeight: 80, padding: 10 }}
                />
              </Labeled>

              <Labeled label="Reference image (optional)">
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setProposalImage(e.target.files?.[0] || null)}
                  style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                />
                {proposalImage && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Selected: {proposalImage.name}
                  </div>
                )}
              </Labeled>
            </div>

            <div style={{ display: 'flex', gap: 10, padding: '14px 24px 18px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => !proposing && setShowPropose(false)}
                className="btn btn-ghost"
                style={{ flex: 1, height: 44 }}
                disabled={proposing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 2, height: 44, fontWeight: 800 }}
                disabled={proposing}
              >
                {proposing ? 'Submitting…' : 'Submit for review'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      <style jsx>{`
        @keyframes panelSlideIn { from { opacity: 0; transform: scale(0.98) translateY(30px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .inventory-row:hover { background: var(--bg-elevated) !important; }
        .glass-card:hover { background: var(--accent-muted) !important; border-color: var(--accent) !important; transform: translateY(-4px); }
        .glass-item:hover { background: var(--bg-overlay) !important; transform: translateX(6px); }
        .glass-input { height: 52px !important; border-radius: 16px !important; background: var(--bg-elevated) !important; border: 1px solid var(--border-subtle) !important; color: var(--text-primary) !important; font-size: 16px !important; font-weight: 800 !important; }
        .glass-input::placeholder { color: var(--text-muted); }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 2px; }
      `}</style>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
