'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = useMemo(() =>
    query.trim()
      ? NAV_ITEMS.filter(item =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.desc.toLowerCase().includes(query.toLowerCase())
        )
      : NAV_ITEMS,
    [query]
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFocused(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setFocused(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocused(f => Math.min(f + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocused(f => Math.max(f - 1, 0));
      } else if (e.key === 'Enter') {
        const item = results[focused];
        if (item) navigate(item.path);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, results.length, focused]);

  function navigate(path: string) {
    router.push(path);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-input-row">
          <Search size={18} color="var(--text-muted)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear-btn" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty">No pages match &quot;{query}&quot;</div>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.path}
                  className={`search-result-item ${i === focused ? 'focused' : ''}`}
                  onClick={() => navigate(item.path)}
                  onMouseEnter={() => setFocused(i)}
                >
                  <div className="search-result-icon"><Icon size={16} /></div>
                  <div>
                    <div className="search-result-name">{item.label}</div>
                    <div className="search-result-path">{item.desc}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="search-footer">
          <span className="search-hint"><kbd className="search-kbd">Enter</kbd> to navigate</span>
          <span className="search-hint"><kbd className="search-kbd">Esc</kbd> to close</span>
          <span className="search-hint">
            <kbd className="search-kbd">&#8593;</kbd>
            <kbd className="search-kbd">&#8595;</kbd> to move
          </span>
        </div>
      </div>
    </div>
  );
}
