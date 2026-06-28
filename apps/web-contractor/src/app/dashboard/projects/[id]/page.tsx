'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { ArrowLeft, MapPin, Package, Clock, CheckCircle, Plus, Trash2, Calendar, Search, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { projectsApi } from '@/lib/api';

const UNITS = ['Bags', 'm3', 'Pcs', 'Liters', 'Tons', 'Meters', 'Sqm', 'Sheets', 'kg', 'Rolls', 'Units'];

const TEMPLATES = [
  {
    name: '2 Bedroom House',
    icon: 'home',
    materials: [
      { materialName: 'Portland Cement', quantityNeeded: 200, unit: 'Bags', priority: 'HIGH' },
      { materialName: 'River Sand', quantityNeeded: 50, unit: 'm3', priority: 'MEDIUM' },
      { materialName: 'Concrete Blocks', quantityNeeded: 1500, unit: 'Pcs', priority: 'HIGH' },
      { materialName: 'Iron Rods (12mm)', quantityNeeded: 50, unit: 'Pcs', priority: 'HIGH' },
    ]
  },
  {
    name: 'Foundation Phase',
    icon: 'build',
    materials: [
      { materialName: 'Portland Cement', quantityNeeded: 100, unit: 'Bags', priority: 'HIGH' },
      { materialName: 'Gravel / Stones', quantityNeeded: 30, unit: 'm3', priority: 'MEDIUM' },
      { materialName: 'Water Supply', quantityNeeded: 5000, unit: 'Liters', priority: 'MEDIUM' },
    ]
  },
  {
    name: 'Roofing Phase',
    icon: 'home',
    materials: [
      { materialName: 'Roofing Sheets', quantityNeeded: 50, unit: 'Sheets', priority: 'HIGH' },
      { materialName: 'Timber Wood', quantityNeeded: 100, unit: 'Pcs', priority: 'MEDIUM' },
      { materialName: 'Roofing Nails', quantityNeeded: 20, unit: 'kg', priority: 'LOW' },
    ]
  }
];

export default function ProjectDetailsPage() {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Planning State
  const [requirements, setRequirements] = useState<any[]>([]);
  const [newReq, setNewReq] = useState({ materialName: '', quantityNeeded: 1, unit: 'Bags', priority: 'MEDIUM', neededBy: '' });
  const [masterProducts, setMasterProducts] = useState<any[]>([]);
  const [showMasterDropdown, setShowMasterDropdown] = useState(false);

  const isInitialLoadRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (id) {
      fetchProjectDetails();
      fetchMasterProducts();
    }
  }, [id]);

  // Debounced autosave whenever requirements change
  useEffect(() => {
    if (isInitialLoadRef.current) {
      if (!loading) isInitialLoadRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      runAutoSave(requirements);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements]);

  async function fetchMasterProducts() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/catalog/master-products', { token: token! });
      setMasterProducts(data);
    } catch (err) {
      console.error('Failed to fetch master products', err);
    }
  }

  async function fetchProjectDetails() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any>(`/projects/${id}`, { token: token! });
      setProject(data);
      setRequirements(data.requirements || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function runAutoSave(toSave: any[]) {
    const token = getAccessToken();
    if (!token) return;
    setSaveStatus('saving');
    try {
      await projectsApi.setRequirements(token, id as string, toSave);
      setSaveStatus('saved');
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
      savedTimeoutRef.current = setTimeout(() => {
        setSaveStatus((s) => (s === 'saved' ? 'idle' : s));
      }, 2000);
    } catch (err) {
      setSaveStatus('error');
    }
  }

  const addManual = () => {
    if (!newReq.materialName) return;
    setRequirements([...requirements, { ...newReq, id: `temp-${Date.now()}` }]);
    setNewReq({ materialName: '', quantityNeeded: 1, unit: 'Bags', priority: 'MEDIUM', neededBy: '' });
  };

  const applyTemplate = (template: any) => {
    setRequirements([...requirements, ...template.materials]);
  };

  const removeReq = (index: number) => {
    setRequirements(requirements.filter((_, i) => i !== index));
  };

  if (loading) {
    return <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><div className="spinner-light" /></div>;
  }

  if (!project) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <h2>Project not found</h2>
        <Link href="/dashboard/projects" className="btn btn-secondary" style={{ width: 'auto', marginTop: 20 }}>Back to Projects</Link>
      </div>
    );
  }

  const totalSpent = project.orders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);

  return (
    <>
    <div className="fade-in">
      <div style={{ marginBottom: 32 }}>
        <Link href="/dashboard/projects" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
          <ArrowLeft size={16} /> Back to Projects
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ margin: 0 }}>{project.name}</h1>
              <span className={`badge badge-${project.status === 'ACTIVE' ? 'success' : 'muted'}`}>{project.status}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
              <MapPin size={16} /> {project.location} • <span style={{ color: 'var(--accent)' }}>{project.projectType}</span> • <Clock size={16} style={{ marginLeft: 8 }} /> {project.estimatedDuration} weeks
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>TOTAL PROCUREMENT</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>GH₵ {Math.round(totalSpent).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="detail-split-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>
        <div>
          {/* MATERIAL PLANNING PANEL */}
          <div className="card" style={{ marginBottom: 32, overflow: 'visible' }}>
            <div className="card-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Package size={18} color="var(--accent)" />
                <span className="card-title">Material Planning Panel</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', minHeight: 32 }}>
                {saveStatus === 'saving' && (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                    <span>Saving…</span>
                  </>
                )}
                {saveStatus === 'saved' && (
                  <>
                    <CheckCircle size={14} color="var(--success, #10b981)" />
                    <span>Saved</span>
                  </>
                )}
                {saveStatus === 'error' && (
                  <>
                    <AlertCircle size={14} color="var(--danger, #ef4444)" />
                    <span style={{ color: 'var(--danger, #ef4444)' }}>Couldn’t save</span>
                    <button
                      onClick={() => runAutoSave(requirements)}
                      className="btn btn-ghost btn-sm"
                      style={{ width: 'auto', padding: '4px 10px' }}
                    >
                      Retry
                    </button>
                  </>
                )}
                {saveStatus === 'idle' && requirements.length > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>Changes save automatically</span>
                )}
              </div>
            </div>
            
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px 0', borderBottom: '1px solid var(--border-subtle)', marginBottom: 32 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>LOAD FROM TEMPLATE:</span>
                <select 
                  onChange={(e) => {
                    const template = TEMPLATES.find(t => t.name === e.target.value);
                    if (template) applyTemplate(template);
                    e.target.value = ""; // Reset dropdown
                  }}
                  style={{ minWidth: 240, background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 12px' }}
                  defaultValue=""
                >
                  <option value="" disabled>Select a construction phase...</option>
                  {TEMPLATES.map(t => (
                    <option key={t.name} value={t.name}>{t.icon} {t.name}</option>
                  ))}
                </select>
              </div>

              {requirements.length > 0 && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
                  Define the materials you need for this project. This will help you generate smart orders and track procurement progress.
                </p>
              )}

              <div id="manual-input" className="material-input-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.5fr auto', gap: 12, marginBottom: 24, marginTop: requirements.length === 0 ? 32 : 0, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                  <label>Material Name</label>
                  <div style={{ position: 'relative' }}>
                    <Search 
                      size={14} 
                      style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: newReq.materialName ? 'var(--accent)' : 'var(--text-muted)', transition: 'var(--transition)', pointerEvents: 'none' }} 
                    />
                    <input 
                      type="text" 
                      value={newReq.materialName} 
                      onChange={e => {
                        setNewReq({...newReq, materialName: e.target.value});
                        setShowMasterDropdown(true);
                      }} 
                      onFocus={() => setShowMasterDropdown(true)}
                      placeholder="e.g. River Sand" 
                      autoComplete="off"
                      style={{ paddingLeft: 40 }}
                    />
                  </div>
                  {showMasterDropdown && (
                    <>
                      <div 
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} 
                        onClick={() => setShowMasterDropdown(false)}
                      />
                      <div className="search-dropdown-portal">
                        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid var(--border-subtle)', marginBottom: 4 }}>
                          Global Catalog Suggestions
                        </div>
                        {masterProducts
                          .filter(p => !newReq.materialName || p.name.toLowerCase().includes(newReq.materialName.toLowerCase()) || p.category.toLowerCase().includes(newReq.materialName.toLowerCase()))
                          .slice(0, 15)
                          .map(p => (
                            <div 
                              key={p.id} 
                              className="search-dropdown-item"
                              onClick={() => {
                                setNewReq({...newReq, materialName: p.name, unit: p.unit || newReq.unit});
                                setShowMasterDropdown(false);
                              }}
                            >
                              <div className="item-icon">
                                {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} /> : <Package size={16} />}
                              </div>
                              <div className="item-info">
                                <div className="item-name">{p.name}{p.unit ? <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 6 }}>· {p.unit}</span> : null}</div>
                                <div className="item-cat">{p.category}</div>
                              </div>
                            </div>
                          ))}
                        {masterProducts.filter(p => !newReq.materialName || p.name.toLowerCase().includes(newReq.materialName.toLowerCase())).length === 0 && (
                          <div style={{ padding: 24, textAlign: 'center' }}>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>No materials found</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Try a different search or type your own</div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Qty</label>
                  <input type="number" value={newReq.quantityNeeded} onChange={e => setNewReq({...newReq, quantityNeeded: Number(e.target.value)})} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Unit</label>
                  <select value={newReq.unit} onChange={e => setNewReq({...newReq, unit: e.target.value})}>
                    {(UNITS.includes(newReq.unit) ? UNITS : [newReq.unit, ...UNITS]).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Priority</label>
                  <select value={newReq.priority} onChange={e => setNewReq({...newReq, priority: e.target.value})}>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Needed By</label>
                  <input type="date" value={newReq.neededBy} onChange={e => setNewReq({...newReq, neededBy: e.target.value})} />
                </div>
                <button onClick={addManual} className="btn btn-ghost" style={{ height: 46, width: 46, padding: 0, borderColor: 'var(--accent)' }}><Plus size={20} color="var(--accent)" /></button>
              </div>



              {/* LIST */}
              {requirements.length > 0 && (
                <>
                  <div className="table-wrapper" style={{ background: 'rgba(255,255,255,0.01)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.03)' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Quantity Needed</th>
                          <th>Priority</th>
                          <th>Needed By</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {requirements.map((r, i) => (
                          <tr key={r.id || i}>
                            <td style={{ fontWeight: 600 }}>
                               <input 
                                 type="text" 
                                 value={r.materialName} 
                                 onChange={e => {
                                   const updated = [...requirements];
                                   updated[i] = { ...updated[i], materialName: e.target.value };
                                   setRequirements(updated);
                                 }}
                                 className="editable-cell-input"
                                 style={{ 
                                   background: 'none', 
                                   border: 'none', 
                                   color: 'inherit', 
                                   fontWeight: 'inherit', 
                                   width: '100%', 
                                   padding: '4px 0',
                                   outline: 'none'
                                 }}
                               />
                            </td>
                            <td>
                               <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                 <input 
                                   type="number" 
                                   value={r.quantityNeeded} 
                                   onChange={e => {
                                     const updated = [...requirements];
                                     updated[i] = { ...updated[i], quantityNeeded: Number(e.target.value) };
                                     setRequirements(updated);
                                   }}
                                   style={{ 
                                     background: 'rgba(255,255,255,0.05)', 
                                     border: '1px solid rgba(255,255,255,0.1)', 
                                     borderRadius: 4,
                                     color: 'inherit', 
                                     width: '60px', 
                                     padding: '2px 6px',
                                     textAlign: 'center',
                                     fontSize: 13
                                   }}
                                 />
                                 <select 
                                   value={r.unit} 
                                   onChange={e => {
                                     const updated = [...requirements];
                                     updated[i] = { ...updated[i], unit: e.target.value };
                                     setRequirements(updated);
                                   }}
                                   style={{ 
                                     background: 'none', 
                                     border: 'none', 
                                     color: 'var(--text-secondary)', 
                                     fontSize: 12, 
                                     padding: 0, 
                                     cursor: 'pointer',
                                     outline: 'none'
                                   }}
                                 >
                                   {(UNITS.includes(r.unit) ? UNITS : [r.unit, ...UNITS]).map(u => (
                                     <option key={u} value={u}>{u}</option>
                                   ))}
                                 </select>
                               </div>
                            </td>
                             <td style={{ verticalAlign: 'middle' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                 <span className={`badge badge-${r.priority === 'HIGH' ? 'danger' : r.priority === 'MEDIUM' ? 'warning' : 'info'}`}>
                                   {r.priority}
                                 </span>
                                 {project.orders?.some((o: any) => o.items?.some((oi: any) => oi.catalogItem?.name?.toLowerCase().includes(r.materialName.toLowerCase()))) && (
                                   <span className="badge badge-success" style={{ textTransform: 'uppercase', fontSize: 10 }}>
                                     <CheckCircle size={10} style={{ marginRight: 4 }} /> Ordered
                                   </span>
                                 )}
                               </div>
                             </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                               <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                 <Calendar size={12} /> 
                                 <input 
                                   type="date" 
                                   value={r.neededBy ? (typeof r.neededBy === 'string' ? r.neededBy.split('T')[0] : new Date(r.neededBy).toISOString().split('T')[0]) : ''} 
                                   onChange={e => {
                                     const updated = [...requirements];
                                     updated[i] = { ...updated[i], neededBy: e.target.value };
                                     setRequirements(updated);
                                   }}
                                   style={{ 
                                     background: 'none', 
                                     border: 'none', 
                                     color: 'inherit', 
                                     fontSize: 'inherit', 
                                     padding: 0, 
                                     width: '110px',
                                     cursor: 'pointer'
                                   }}
                                 />
                               </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button onClick={() => removeReq(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 8 }}>
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {(() => {
                    const orderedCount = requirements.filter(r => 
                      project.orders?.some((o: any) => 
                        o.items?.some((oi: any) => oi.catalogItem?.name?.toLowerCase().includes(r.materialName.toLowerCase()))
                      )
                    ).length;
                    const allOrdered = requirements.length > 0 && orderedCount === requirements.length;

                    return (
                      <div style={{ marginTop: 32, padding: 32, background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(245, 158, 11, 0.01) 100%)', borderRadius: 20, border: '1px solid var(--accent-glow)', textAlign: 'center' }}>
                         <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--accent)', letterSpacing: 1 }}>
                           {allOrdered ? 'PROCUREMENT COMPLETE' : 'READY TO PROCURE?'}
                         </div>
                         <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                           {allOrdered 
                             ? 'All planned materials for this project have been ordered. Track your deliveries in the history below.'
                             : `You have ordered ${orderedCount} of ${requirements.length} planned materials. Continue to the marketplace to procure the rest.`}
                         </p>
                         {!allOrdered && (
                           <Link href={`/dashboard/shop?projectId=${id}`} className="btn btn-primary" style={{ width: 'auto', padding: '14px 48px', fontSize: 15, fontWeight: 800 }}>
                             {orderedCount > 0 ? '🚀 Procure Remaining Materials' : '🚀 Create Smart Order Now'}
                           </Link>
                         )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Order History</span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Supplier</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Escrow</th>
                  </tr>
                </thead>
                <tbody>
                  {project.orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
                        No orders yet.
                      </td>
                    </tr>
                  ) : (
                    project.orders.map((o: any) => (
                      <tr key={o.id}>
                        <td style={{ fontSize: 12, fontWeight: 700 }}>#{(o.id ?? '').slice(-8).toUpperCase() || '—'}</td>
                        <td>{o.supplier.supplierProfile.businessName}</td>
                        <td style={{ fontWeight: 600 }}>GH₵ {Math.round(o.totalAmount).toLocaleString()}</td>
                        <td>
                           <span className={`badge badge-${o.status === 'COMPLETED' ? 'success' : 'info'}`}>
                             {o.status}
                           </span>
                        </td>
                        <td>
                           <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: o.escrowStatus === 'HELD' ? 'var(--warning)' : 'var(--success)' }}>
                             {o.escrowStatus}
                           </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          {/* PROJECT TIMELINE */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="card-title">Project Timeline</span>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ position: 'relative', paddingLeft: 24, borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                <div style={{ marginBottom: 32, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -33, top: 0, width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', border: '4px solid var(--bg-surface)' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Project Created</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(project.createdAt).toLocaleDateString()}</div>
                </div>
                
                <div style={{ marginBottom: 32, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -33, top: 0, width: 16, height: 16, borderRadius: '50%', background: project.requirements.length > 0 ? 'var(--accent)' : 'var(--bg-elevated)', border: '4px solid var(--bg-surface)' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Material Planning</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{project.requirements.length > 0 ? 'Completed' : 'Pending...'}</div>
                </div>

                <div style={{ marginBottom: 32, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -33, top: 0, width: 16, height: 16, borderRadius: '50%', background: project.orders.length > 0 ? 'var(--accent)' : 'var(--bg-elevated)', border: '4px solid var(--bg-surface)' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Procurement Started</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{project.orders.length} orders placed</div>
                </div>

                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -33, top: 0, width: 16, height: 16, borderRadius: '50%', background: 'var(--bg-elevated)', border: '4px solid var(--bg-surface)' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--text-muted)' }}>Project Completion</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>TBD</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Quick Stats</span>
            </div>
            <div style={{ padding: 24 }}>
               <div style={{ marginBottom: 20 }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                   <span style={{ color: 'var(--text-secondary)' }}>Procurement Progress</span>
                   <span style={{ fontWeight: 700 }}>{project.requirements.length > 0 ? Math.round((project.orders.length / project.requirements.length) * 100) : 0}%</span>
                 </div>
                 <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                   <div style={{ height: '100%', width: `${project.requirements.length > 0 ? (project.orders.length / project.requirements.length) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 3 }} />
                 </div>
               </div>
               
               <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                   <span style={{ color: 'var(--text-secondary)' }}>Materials Planned</span>
                   <span>{project.requirements.length}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                   <span style={{ color: 'var(--text-secondary)' }}>Active Orders</span>
                   <span>{project.orders.length}</span>
                 </div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                   <span style={{ color: 'var(--text-secondary)' }}>Initial Budget</span>
                   <span>GH₵ {project.budget?.toLocaleString() || 0}</span>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    </>
  );
}

