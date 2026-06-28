'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Users, Search, ShieldCheck, ShieldAlert, X } from 'lucide-react';

export default function UsersManagementPage() {
  const [users, setUsers]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterRole, setFilterRole]   = useState('ALL');
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [saving, setSaving]           = useState(false);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/users', { token: token! });
      setUsers(data);
    } catch { /* handled */ } finally { setLoading(false); }
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchesSearch = (u.email || '').toLowerCase().includes(q) || (u.phone || '').includes(search);
    return matchesSearch && (filterRole === 'ALL' || u.role === filterRole);
  });

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    const token = getAccessToken();
    setSaving(true);
    try {
      await apiRequest(`/users/${editingUser.id}`, {
        method: 'PATCH',
        token: token!,
        body: { email: editingUser.email, phone: editingUser.phone, role: editingUser.role, status: editingUser.status },
      });
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user');
    } finally { setSaving(false); }
  }

  const roleColors: Record<string, string> = {
    CONTRACTOR: 'badge-contractor',
    SUPPLIER:   'badge-supplier',
    DRIVER:     'badge-driver',
    ADMIN:      'badge-admin',
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>User Management</h1>
        <p>Manage all platform participants and their access credentials</p>
      </div>

      {/* Stats row */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 20 }}>
        {[
          { label: 'Total Users',       value: users.length,                                     color: 'var(--accent)' },
          { label: 'Verified',          value: users.filter(u => u.isVerified).length,            color: 'var(--success)' },
          { label: 'Active',            value: users.filter(u => u.status === 'ACTIVE').length,   color: 'var(--success)' },
          { label: 'Suspended',         value: users.filter(u => u.status === 'SUSPENDED').length, color: 'var(--danger)' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-card-label">{label}</div>
            <div className="stat-card-value" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="search-wrapper">
          <Search className="search-icon" size={15} />
          <input
            type="text"
            className="input search-input"
            placeholder="Search by email or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input"
          style={{ width: 180, flexShrink: 0 }}
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
        >
          <option value="ALL">All Roles</option>
          <option value="CONTRACTOR">Contractors</option>
          <option value="SUPPLIER">Suppliers</option>
          <option value="DRIVER">Drivers</option>
          <option value="ADMIN">Admins</option>
        </select>
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="page-loader"><div className="spinner" style={{ width: 32, height: 32 }} /> Loading users…</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Verified</th>
                  <th>Joined</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><Users size={32} style={{ opacity: 0.15 }} /><p>No users match your search.</p></div></td></tr>
                ) : filtered.map(u => (
                  <tr key={u.id} className="hover-bg">
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                          {(u.email || u.phone || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{u.email || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.phone || 'No phone'}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${roleColors[u.role] || 'badge-muted'}`}>{u.role}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {u.status === 'ACTIVE'
                          ? <ShieldCheck size={13} color="var(--success)" />
                          : <ShieldAlert size={13} color="var(--warning)" />}
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: u.status === 'ACTIVE' ? 'var(--success)' : 'var(--warning)' }}>{u.status}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.isVerified ? 'badge-success' : 'badge-muted'}`}>
                        {u.isVerified ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingUser(u)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingUser(null); }}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">Edit User</div>
              <button className="modal-close" onClick={() => setEditingUser(null)}><X size={15} /></button>
            </div>
            <form onSubmit={handleUpdate} className="modal-body">
              <div style={{ display: 'grid', gap: 14 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Email</label>
                  <input className="input" type="email" value={editingUser.email || ''} onChange={e => setEditingUser({ ...editingUser, email: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Phone</label>
                  <input className="input" type="tel" value={editingUser.phone || ''} onChange={e => setEditingUser({ ...editingUser, phone: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Role</label>
                    <select className="input" value={editingUser.role} onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}>
                      <option value="CONTRACTOR">Contractor</option>
                      <option value="SUPPLIER">Supplier</option>
                      <option value="DRIVER">Driver</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Status</label>
                    <select className="input" value={editingUser.status} onChange={e => setEditingUser({ ...editingUser, status: e.target.value })}>
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ padding: '16px 0 0' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingUser(null)}>Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving…</> : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
