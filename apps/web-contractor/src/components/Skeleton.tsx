'use client';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({ width, height, className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width: width ?? '100%', height: height ?? 16 }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: i === lines - 1 && lines > 1 ? '70%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 10 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton skeleton-text lg" style={{ width: '60%', marginBottom: 6 }} />
          <div className="skeleton skeleton-text sm" style={{ width: '40%' }} />
        </div>
      </div>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{ width: i === lines - 1 ? '75%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonStatGrid() {
  return (
    <div className="stats-grid">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="skeleton-stat">
          <div className="skeleton skeleton-text sm" style={{ width: '55%' }} />
          <div className="skeleton" style={{ height: 32, width: '45%', borderRadius: 6 }} />
          <div className="skeleton skeleton-text sm" style={{ width: '70%' }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  const headerWidths = ['30%', '20%', '20%', '15%', '10%'];
  const rowWidths    = ['25%', '20%', '20%', '15%', '12%'];
  return (
    <div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 24 }}>
        {headerWidths.map((w, i) => (
          <div key={i} className="skeleton skeleton-text sm" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          {rowWidths.map((w, j) => (
            <div key={j} className="skeleton skeleton-text" style={{ width: w }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonConversationList({ items = 5 }: { items?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton skeleton-text" style={{ width: '60%', marginBottom: 6 }} />
            <div className="skeleton skeleton-text sm" style={{ width: '85%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonProjectGrid() {
  return (
    <div className="projects-grid">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="project-card">
          <div className="project-card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="skeleton" style={{ width: 80, height: 20, borderRadius: 99 }} />
              <div className="skeleton skeleton-text sm" style={{ width: 60 }} />
            </div>
            <div className="skeleton skeleton-text lg" style={{ width: '70%', marginBottom: 8 }} />
            <div className="skeleton skeleton-text" style={{ width: '50%', marginBottom: 6 }} />
            <div className="skeleton skeleton-text sm" style={{ width: '40%' }} />
          </div>
          <div className="project-card-footer">
            <div className="skeleton skeleton-text sm" style={{ width: '40%' }} />
            <div className="skeleton skeleton-text sm" style={{ width: '25%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
