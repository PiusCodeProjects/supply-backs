'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Plus, MapPin, Calendar, Layers, Package, ArrowRight, FolderOpen, X } from 'lucide-react';
import LocationSearch from '@/components/LocationSearch';

const PROJECT_TYPE_COLORS: Record<string, string> = {
  RESIDENTIAL: 'badge-info',
  COMMERCIAL: 'badge-accent',
  INDUSTRIAL: 'badge-warning',
  INFRASTRUCTURE: 'badge-muted',
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-success',
  INACTIVE: 'badge-muted',
  COMPLETED: 'badge-info',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    location: '',
    startDate: '',
    estimatedDuration: '',
    projectType: 'RESIDENTIAL',
    budget: 0,
    lat: null as number | null,
    lng: null as number | null,
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    const token = getAccessToken();
    try {
      const data = await apiRequest<any[]>('/projects', { token: token! });
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = getAccessToken();
    setIsSubmitting(true);
    try {
      const project = await apiRequest<any>('/projects', {
        method: 'POST',
        token: token!,
        body: newProject,
      });
      setShowCreate(false);
      setNewProject({ name: '', location: '', startDate: '', estimatedDuration: '', projectType: 'RESIDENTIAL', budget: 0, lat: null, lng: null });
      if (project?.id) {
        window.location.href = `/dashboard/projects/${project.id}`;
      } else {
        await fetchProjects();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1>My Projects</h1>
          <p>Manage construction sites and track material procurement.</p>
        </div>
        <button onClick={() => setShowCreate(v => !v)} className="btn btn-primary" style={{ width: 'auto' }}>
          <Plus size={16} /> New Project
        </button>
      </div>

      {showCreate && (
        <div className="create-form-card">
          <div className="card-header">
            <span className="card-title">Register New Construction Site</span>
            <button onClick={() => setShowCreate(false)} className="btn-icon" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="create-form-body">
            <div className="create-form-grid">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Project Name</label>
                <input
                  type="text"
                  value={newProject.name}
                  onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                  required
                  placeholder="e.g. Skyline Towers Phase 1"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Site Location</label>
                <LocationSearch
                  value={newProject.location}
                  onChange={(value, coords) =>
                    setNewProject((p) => ({
                      ...p,
                      location: value,
                      lat: coords?.lat ?? null,
                      lng: coords?.lng ?? null,
                    }))
                  }
                  placeholder="Search address, landmark, or area"
                  required
                />
                <div className="form-hint">
                  {newProject.lat != null && newProject.lng != null
                    ? `Pinned at ${newProject.lat.toFixed(5)}, ${newProject.lng.toFixed(5)}`
                    : 'Pick a suggestion to drop a pin, or use the locate button to use your current spot.'}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Project Type</label>
                <select
                  value={newProject.projectType}
                  onChange={e => setNewProject({ ...newProject, projectType: e.target.value })}
                >
                  <option value="RESIDENTIAL">Residential</option>
                  <option value="COMMERCIAL">Commercial</option>
                  <option value="INDUSTRIAL">Industrial</option>
                  <option value="INFRASTRUCTURE">Infrastructure</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Start Date</label>
                <input
                  type="date"
                  value={newProject.startDate}
                  onChange={e => setNewProject({ ...newProject, startDate: e.target.value })}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Estimated Duration (weeks)</label>
                <input
                  type="text"
                  value={newProject.estimatedDuration}
                  onChange={e => setNewProject({ ...newProject, estimatedDuration: e.target.value })}
                  placeholder="e.g. 24"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Initial Budget (GH₵)</label>
                <input
                  type="number"
                  value={newProject.budget}
                  onChange={e => setNewProject({ ...newProject, budget: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="create-form-actions">
              <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Project & Plan Materials'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost" style={{ width: 'auto' }} disabled={isSubmitting}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
          <div className="spinner-light" />
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><FolderOpen size={48} strokeWidth={1.2} /></div>
          <h3>No projects yet</h3>
          <p>Create your first construction project to start planning materials and placing orders.</p>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ width: 'auto', marginTop: 8 }}>
            <Plus size={16} /> Create First Project
          </button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map(p => (
            <div key={p.id} className="project-card">
              <div className="project-card-body">
                <div className="project-card-header">
                  <span className={`badge ${PROJECT_TYPE_COLORS[p.projectType] || 'badge-muted'}`}>
                    {p.projectType}
                  </span>
                  <span className={`badge ${STATUS_BADGE[p.status] || 'badge-muted'}`}>
                    {p.status}
                  </span>
                </div>
                <div className="project-card-title">{p.name}</div>
                <div className="project-card-meta">
                  <MapPin size={13} />
                  {p.location}
                </div>
                {p.startDate && (
                  <div className="project-card-meta" style={{ marginTop: 4 }}>
                    <Calendar size={13} />
                    Starts {new Date(p.startDate).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="project-card-footer">
                <div className="project-stats">
                  <div className="project-stat">
                    <Package size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    <strong>{p._count.requirements}</strong> materials
                  </div>
                  <div className="project-stat">
                    <Layers size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    <strong>{p._count.orders}</strong> orders
                  </div>
                </div>
                <a href={`/dashboard/projects/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                  Planning Panel <ArrowRight size={14} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
