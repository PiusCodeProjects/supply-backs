'use client';

/**
 * Bolt/Uber-style location autocomplete.
 *
 * Uses Photon (https://photon.komoot.io) — free OSM-based geocoder, no API
 * key required, purpose-built for as-you-type search. We bias toward Ghana so
 * Accra/Kumasi/etc. surface first.
 *
 * Hands the parent a string + resolved lat/lng. Falls back gracefully to a
 * plain text input if Photon is unreachable.
 */

import {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MapPin, Search, Loader2, X, Locate } from 'lucide-react';

type Suggestion = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
};

type Props = {
  value: string;
  onChange: (value: string, coords?: { lat: number; lng: number } | null) => void;
  placeholder?: string;
  countryCode?: string; // ISO 3166-1 alpha-2, e.g. "gh"
  biasLat?: number;
  biasLng?: number;
  disabled?: boolean;
  required?: boolean;
  id?: string;
};

const PHOTON_URL = 'https://photon.komoot.io/api/';
// Geographic centre of Ghana (between Kumasi & Accra) — biases results so the
// most relevant matches land at the top of the list for our users.
const DEFAULT_BIAS = { lat: 7.0, lng: -1.2 };
const DEBOUNCE_MS = 280;
const MAX_RESULTS = 6;

function formatFeature(f: any): Suggestion | null {
  const coords = f?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const p = f.properties ?? {};
  const primary = [p.name, p.street && p.housenumber ? `${p.housenumber} ${p.street}` : p.street]
    .filter(Boolean)
    .join(', ');
  const secondaryParts = [p.city, p.state, p.country].filter(Boolean);
  return {
    id: `${p.osm_type ?? 'x'}-${p.osm_id ?? `${lat},${lng}`}`,
    label: primary || p.city || p.country || 'Unnamed place',
    detail: secondaryParts.join(' · ') || 'Location',
    lat,
    lng,
  };
}

export default function LocationSearch({
  value,
  onChange,
  placeholder = 'Search address, landmark, or area',
  countryCode = 'gh',
  biasLat = DEFAULT_BIAS.lat,
  biasLng = DEFAULT_BIAS.lng,
  disabled,
  required,
  id,
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [locating, setLocating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks whether the latest text in the input was just chosen from the list
  // — used to suppress a re-fetch right after a click selection.
  const lockNextFetchRef = useRef(false);

  // Keep local query in sync if the parent resets `value` externally.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const runSearch = useCallback(
    async (text: string) => {
      if (!text || text.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }

      // Cancel any in-flight request.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          q: text.trim(),
          limit: String(MAX_RESULTS),
          lang: 'en',
          lat: String(biasLat),
          lon: String(biasLng),
        });
        if (countryCode) params.set('osm_tag', '!boundary');
        const res = await fetch(`${PHOTON_URL}?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        const formatted = features
          .map(formatFeature)
          .filter((s: Suggestion | null): s is Suggestion => !!s);
        // Prefer results in our country.
        const prioritised = countryCode
          ? formatted.sort((a: Suggestion, b: Suggestion) => {
              const aMatch = a.detail.toLowerCase().includes('ghana') ? -1 : 0;
              const bMatch = b.detail.toLowerCase().includes('ghana') ? -1 : 0;
              return aMatch - bMatch;
            })
          : formatted;
        setResults(prioritised.slice(0, MAX_RESULTS));
        setActiveIndex(prioritised.length > 0 ? 0 : -1);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError("Search is temporarily unavailable. You can still type the address manually.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [biasLat, biasLng, countryCode],
  );

  // Debounced search on query change.
  useEffect(() => {
    if (lockNextFetchRef.current) {
      lockNextFetchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // Close dropdown on outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Clean up on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  function handleSelect(s: Suggestion) {
    lockNextFetchRef.current = true;
    const display = s.detail ? `${s.label}, ${s.detail}` : s.label;
    setQuery(display);
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onChange(display, { lat: s.lat, lng: s.lng });
    inputRef.current?.blur();
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    // The free-text changed → the previously resolved coords no longer apply.
    onChange(v, null);
  }

  function handleClear() {
    setQuery('');
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onChange('', null);
    inputRef.current?.focus();
  }

  async function handleUseMyLocation() {
    if (!('geolocation' in navigator)) {
      setError("Your browser doesn't support location services.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // Reverse geocode the coords into a readable address via Photon.
          const params = new URLSearchParams({
            lat: String(pos.coords.latitude),
            lon: String(pos.coords.longitude),
            lang: 'en',
            limit: '1',
          });
          const res = await fetch(`${PHOTON_URL.replace('/api/', '/reverse')}?${params.toString()}`);
          const data = res.ok ? await res.json() : null;
          const first = Array.isArray(data?.features) ? data.features[0] : null;
          const formatted = first ? formatFeature(first) : null;
          if (formatted) {
            handleSelect(formatted);
          } else {
            const display = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
            lockNextFetchRef.current = true;
            setQuery(display);
            onChange(display, { lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location access is blocked. Please enable it in your browser settings.');
        } else {
          setError("We couldn't get your location. Please try again or type the address.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        handleSelect(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showDropdown = useMemo(
    () => open && (loading || results.length > 0 || (!!error && query.trim().length >= 2)),
    [open, loading, results.length, error, query],
  );

  return (
    <div ref={containerRef} className="ls-root">
      <div className={`ls-field ${showDropdown ? 'is-open' : ''}`}>
        <span className="ls-leading">
          <MapPin size={16} />
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="ls-list"
        />
        <div className="ls-trailing">
          {loading && <Loader2 size={15} className="ls-spin" />}
          {!loading && query && (
            <button
              type="button"
              className="ls-icon-btn"
              onClick={handleClear}
              aria-label="Clear location"
              tabIndex={-1}
            >
              <X size={15} />
            </button>
          )}
          <button
            type="button"
            className="ls-icon-btn ls-locate"
            onClick={handleUseMyLocation}
            disabled={locating}
            aria-label="Use my current location"
            title="Use my current location"
            tabIndex={-1}
          >
            {locating ? <Loader2 size={15} className="ls-spin" /> : <Locate size={15} />}
          </button>
        </div>
      </div>

      {showDropdown && (
        <div className="ls-dropdown" role="listbox" id="ls-list">
          {loading && results.length === 0 && (
            <div className="ls-state">
              <Loader2 size={14} className="ls-spin" />
              <span>Searching…</span>
            </div>
          )}

          {!loading && results.length === 0 && !error && query.trim().length >= 2 && (
            <div className="ls-state">
              <Search size={14} />
              <span>No matches for &ldquo;{query}&rdquo;</span>
            </div>
          )}

          {error && (
            <div className="ls-state ls-state--error">
              <span>{error}</span>
            </div>
          )}

          {results.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`ls-item ${i === activeIndex ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => e.preventDefault() /* keep focus */}
              onClick={() => handleSelect(s)}
              role="option"
              aria-selected={i === activeIndex}
            >
              <span className="ls-item-icon">
                <MapPin size={14} />
              </span>
              <span className="ls-item-text">
                <span className="ls-item-label">{s.label}</span>
                <span className="ls-item-detail">{s.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        .ls-root {
          position: relative;
          width: 100%;
        }
        .ls-field {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          min-height: 44px;
          padding: 0 8px 0 12px;
          background: var(--bg-elevated, #f9fafb);
          border: 1px solid var(--border-subtle, #e5e7eb);
          border-radius: 12px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .ls-field:focus-within {
          border-color: var(--accent, #f59e0b);
          box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.12);
          background: var(--bg-surface, #fff);
        }
        .ls-field.is-open {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
        }
        .ls-leading {
          color: var(--text-muted, #9ca3af);
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
        }
        .ls-field input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font: inherit;
          font-size: 14px;
          color: var(--text-primary, #0b0f17);
          padding: 10px 0;
          min-width: 0;
        }
        .ls-field input::placeholder {
          color: var(--text-muted, #9ca3af);
        }
        .ls-trailing {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
        .ls-icon-btn {
          background: transparent;
          border: none;
          color: var(--text-muted, #9ca3af);
          cursor: pointer;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .ls-icon-btn:hover {
          background: rgba(11, 15, 23, 0.06);
          color: var(--text-primary, #0b0f17);
        }
        .ls-icon-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .ls-locate {
          color: var(--accent, #f59e0b);
        }
        .ls-locate:hover {
          background: rgba(245, 158, 11, 0.12);
          color: var(--accent, #f59e0b);
        }
        .ls-spin {
          animation: ls-spin 0.8s linear infinite;
        }
        @keyframes ls-spin {
          to { transform: rotate(360deg); }
        }
        .ls-dropdown {
          position: absolute;
          top: calc(100% - 1px);
          left: 0;
          right: 0;
          z-index: 60;
          background: var(--bg-surface, #fff);
          border: 1px solid var(--accent, #f59e0b);
          border-top: 1px solid var(--border-subtle, #e5e7eb);
          border-bottom-left-radius: 12px;
          border-bottom-right-radius: 12px;
          box-shadow: 0 18px 40px rgba(11, 15, 23, 0.12);
          overflow: hidden;
          max-height: 320px;
          overflow-y: auto;
        }
        .ls-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 14px;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(11, 15, 23, 0.05);
          cursor: pointer;
          text-align: left;
          color: var(--text-primary, #0b0f17);
          transition: background 0.12s ease;
        }
        .ls-item:last-child {
          border-bottom: none;
        }
        .ls-item.is-active,
        .ls-item:hover {
          background: rgba(245, 158, 11, 0.08);
        }
        .ls-item-icon {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: rgba(245, 158, 11, 0.1);
          color: var(--accent, #f59e0b);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ls-item-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1;
        }
        .ls-item-label {
          font-size: 13.5px;
          font-weight: 700;
          color: var(--text-primary, #0b0f17);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ls-item-detail {
          font-size: 11.5px;
          color: var(--text-muted, #6b7280);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ls-state {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          font-size: 12.5px;
          color: var(--text-muted, #6b7280);
        }
        .ls-state--error {
          color: #b91c1c;
        }
      `}</style>
    </div>
  );
}
