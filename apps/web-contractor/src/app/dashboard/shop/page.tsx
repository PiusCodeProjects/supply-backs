'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, ShoppingCart, X, Plus, Minus, Package, MapPin,
  User as UserIcon, Phone, CheckCircle, AlertCircle, ChevronDown,
  Briefcase, ShieldCheck, ArrowRight, FolderOpen, Truck, Store as StoreIcon,
  Info, Calendar, Tag,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useCurrentUser } from '@/contexts/CurrentUserContext';
import { useCart, type CartLine } from '@/contexts/CartContext';
import { useSocket } from '@/contexts/SocketContext';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fmt = (val: number) =>
  new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 0 })
    .format(val)
    .replace('GHS', 'GH₵');

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function matchesRequirement(haystack: string, target: string): boolean {
  if (!haystack || !target) return false;
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(target.toLowerCase())}(?:$|[^a-z0-9])`, 'i');
  return re.test(haystack.toLowerCase());
}

const PERSONAL = '__personal__';

export default function ShopPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 80, textAlign: 'center', color: 'var(--text-muted)' }}>
      <div className="spinner" style={{ width: 32, height: 32, borderTopColor: 'var(--accent)', margin: '0 auto' }} />
    </div>}>
      <ShopPage />
    </Suspense>
  );
}

function ShopPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || PERSONAL;

  /* ── data ───────────────────────────────────────────────────────────────── */
  const [items, setItems] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [project, setProject] = useState<any | null>(null);    // { ...project, requirements, orders }
  const [loading, setLoading] = useState(true);

  /* ── ui state ───────────────────────────────────────────────────────────── */
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId);
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modePickerOpen, setModePickerOpen] = useState(false);

  /* ── cart + drawer ──────────────────────────────────────────────────────── */
  // Cart lives in CartProvider so it persists across navigation + browser tabs.
  const { cart, setCart, removeWhere } = useCart();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stage, setStage] = useState<'cart' | 'checkout' | 'done'>('cart');
  const [submitting, setSubmitting] = useState(false);
  const [shipping, setShipping] = useState({ recipientName: '', recipientPhone: '', address: '' });
  const [notice, setNotice] = useState<string | null>(null);
  // Product details modal — `null` when closed
  const [viewingProduct, setViewingProduct] = useState<any>(null);
  // Per-supplier choice: PICKUP (contractor collects) or DELIVERY (supplier ships). Default: DELIVERY.
  const [fulfillmentBySupplier, setFulfillmentBySupplier] = useState<Record<string, 'PICKUP' | 'DELIVERY'>>({});
  const getFulfillment = (supplierId: string): 'PICKUP' | 'DELIVERY' =>
    fulfillmentBySupplier[supplierId] ?? 'DELIVERY';
  const setFulfillment = (supplierId: string, t: 'PICKUP' | 'DELIVERY') =>
    setFulfillmentBySupplier(prev => ({ ...prev, [supplierId]: t }));

  // Auto-dismiss the cap notice
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  const isProjectMode = selectedProjectId !== PERSONAL;

  /* ── data loaders ───────────────────────────────────────────────────────── */
  useEffect(() => {
    Promise.all([fetchCatalog(), fetchProjects()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isProjectMode) fetchProject(selectedProjectId);
    else setProject(null);
    setActiveRequirementId(null);
    setActiveCategory(null);
  }, [selectedProjectId, isProjectMode]);

  // Reflect mode in the URL so a refresh keeps the same scope
  useEffect(() => {
    const next = isProjectMode ? `/dashboard/shop?projectId=${selectedProjectId}` : '/dashboard/shop';
    router.replace(next);
  }, [selectedProjectId, isProjectMode, router]);

  // Contractor identity comes from the shared CurrentUserProvider — one fetch,
  // every component stays in sync.
  const { user: currentUser, fullName: contractorName } = useCurrentUser();
  const contractorPhone = currentUser?.phone || '';

  // Prefill the recipient form: always seed empty fields with the contractor's
  // info, and re-apply whenever the drawer opens or the identity loads (so a
  // fresh checkout never starts blank).
  useEffect(() => {
    setShipping(s => ({
      ...s,
      recipientName: s.recipientName?.trim() ? s.recipientName : contractorName,
      recipientPhone: s.recipientPhone?.trim() ? s.recipientPhone : contractorPhone,
    }));
  }, [contractorName, contractorPhone, drawerOpen]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [drawerOpen]);

  // Live sync over the shared catalog socket. The provider owns the
  // connection; we just attach + clean up listeners.
  const catalogSocket = useSocket('catalog');
  useEffect(() => {
    const onCatalogChanged = () => { fetchCatalog(); };
    const onStockUpdated = (updates: { id: string; stock: number }[]) => {
      setItems(prev => prev.map(i => {
        const u = updates.find(x => x.id === i.id);
        return u ? { ...i, stock: u.stock } : i;
      }));
    };
    catalogSocket.on('catalogChanged', onCatalogChanged);
    catalogSocket.on('stockUpdated', onStockUpdated);
    return () => {
      catalogSocket.off('catalogChanged', onCatalogChanged);
      catalogSocket.off('stockUpdated', onStockUpdated);
    };
  }, [catalogSocket]);

  async function fetchCatalog() {
    try {
      const data = await apiRequest<any[]>('/catalog');
      setItems(data);
    } catch (err) { console.error(err); }
  }
  async function fetchProjects() {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiRequest<any[]>('/projects', { token });
      setProjects(data);
    } catch (err) { console.error(err); }
  }
  async function fetchProject(id: string) {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiRequest<any>(`/projects/${id}`, { token });
      setProject(data);
    } catch (err) { console.error(err); }
  }

  /* ── derived ───────────────────────────────────────────────────────────── */
  const categories = useMemo(
    () => Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort() as string[],
    [items],
  );

  // Allocation per requirement: ordered (already submitted) + cart contributions
  const requirementStats = useMemo(() => {
    if (!project?.requirements) return new Map<string, { ordered: number; inCart: number; needed: number }>();
    const map = new Map<string, { ordered: number; inCart: number; needed: number }>();
    for (const r of project.requirements) {
      const needed = Number(r.quantityNeeded || 0);
      const target = (r.materialName || '').toLowerCase();
      let ordered = 0;
      for (const o of project.orders || []) {
        for (const oi of o.items || []) {
          const name = oi.catalogItem?.name?.toLowerCase?.() || '';
          if (matchesRequirement(name, target)) ordered += Number(oi.quantity || 0);
        }
      }
      const inCart = cart
        .filter(l => l.projectId === project.id && l.requirementId === r.id)
        .reduce((s, l) => s + l.quantity, 0);
      map.set(r.id, { needed, ordered, inCart });
    }
    return map;
  }, [project, cart]);

  // For an item, find the best matching requirement in current project (if any)
  function matchRequirement(item: any) {
    if (!project?.requirements?.length) return null;
    return project.requirements.find((r: any) =>
      matchesRequirement(item.name || '', r.materialName)
      || matchesRequirement(item.category || '', r.materialName),
    ) || null;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => {
      // Search
      if (q) {
        const supplierName = i.supplier?.supplierProfile?.businessName?.toLowerCase() ?? '';
        const hit =
          i.name?.toLowerCase().includes(q) ||
          i.category?.toLowerCase().includes(q) ||
          supplierName.includes(q);
        if (!hit) return false;
      }
      // Project-mode filters
      if (isProjectMode) {
        const reqs = project?.requirements ?? [];
        if (activeRequirementId) {
          // Specific requirement chip → match just that one
          const req = reqs.find((r: any) => r.id === activeRequirementId);
          if (!req) return false;
          return matchesRequirement(i.name || '', req.materialName)
              || matchesRequirement(i.category || '', req.materialName);
        }
        // "All requirements" chip → match ANY of the project's requirements,
        // so the grid is scoped to the project shopping list instead of the
        // full catalog. If there are no requirements yet, fall through to the
        // full catalog so the contractor can still browse.
        if (reqs.length === 0) return true;
        return reqs.some((r: any) =>
          matchesRequirement(i.name || '', r.materialName)
          || matchesRequirement(i.category || '', r.materialName),
        );
      }
      // Personal-mode category filter
      if (activeCategory) {
        return i.category === activeCategory;
      }
      return true;
    });
  }, [items, search, isProjectMode, activeRequirementId, activeCategory, project]);

  const cartTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  // Cart visible in current scope (so switching modes doesn't show stale-scope items)
  const cartInScope = useMemo(
    () => cart.filter(l => (isProjectMode ? l.projectId === selectedProjectId : !l.projectId)),
    [cart, isProjectMode, selectedProjectId],
  );
  const cartInScopeCount = cartInScope.reduce((s, l) => s + l.quantity, 0);

  // Group cart-in-scope by supplier for checkout
  const groupedBySupplier = useMemo(() => {
    const map = new Map<string, { supplierId: string; supplierName: string; supplierPhone?: string; lines: CartLine[]; subtotal: number }>();
    for (const line of cartInScope) {
      const g = map.get(line.supplierId) ?? {
        supplierId: line.supplierId,
        supplierName: line.supplierName,
        supplierPhone: line.supplierPhone,
        lines: [],
        subtotal: 0,
      };
      g.lines.push(line);
      g.subtotal += line.price * line.quantity;
      map.set(line.supplierId, g);
    }
    return Array.from(map.values());
  }, [cartInScope]);

  const scopeTotal = cartInScope.reduce((s, l) => s + l.price * l.quantity, 0);

  /* ── cart actions ───────────────────────────────────────────────────────── */
  function findExistingLine(catalogItemId: string) {
    return cart.find(l =>
      l.catalogItemId === catalogItemId
      && (isProjectMode ? l.projectId === selectedProjectId : !l.projectId),
    );
  }

  // Hard cap (project-mode): how many units of this catalogItem we are allowed
  // to keep on a single cart line for the given requirement. Returns Infinity
  // when not in project mode or when the item is off-requirement.
  function maxQtyAllowedForLine(catalogItemId: string, requirementId?: string): number {
    if (!isProjectMode || !requirementId) return Infinity;
    const r = project?.requirements?.find((x: any) => x.id === requirementId);
    if (!r) return Infinity;
    const needed = Number(r.quantityNeeded || 0);
    const stats = requirementStats.get(requirementId);
    const existing = cart.find(l =>
      l.catalogItemId === catalogItemId
      && l.projectId === selectedProjectId
      && l.requirementId === requirementId,
    );
    const existingQty = Number(existing?.quantity || 0);
    // Already committed from somewhere else (orders + other suppliers' cart lines)
    const allocatedElsewhere = (stats?.ordered || 0) + (stats?.inCart || 0) - existingQty;
    return Math.max(0, needed - allocatedElsewhere);
  }

  function addOne(item: any, requirementId?: string) {
    const matchedReqId = requirementId ?? (isProjectMode ? matchRequirement(item)?.id : undefined);

    // Project-mode hard cap
    if (isProjectMode && matchedReqId) {
      const r = project?.requirements?.find((x: any) => x.id === matchedReqId);
      const existing = findExistingLine(item.id);
      const existingQty = Number(existing?.quantity || 0);
      const cap = maxQtyAllowedForLine(item.id, matchedReqId);
      if (existingQty + 1 > cap) {
        const unit = r?.unit ? ` ${r.unit}` : '';
        const reqName = r?.materialName ?? 'this requirement';
        setNotice(
          cap === 0
            ? `Already fully sourced for "${reqName}".`
            : `Cap reached — only ${cap}${unit} more of "${reqName}" can come from this supplier.`,
        );
        return;
      }
    }

    setCart(prev => {
      const key = item.id;
      const existing = prev.find(l =>
        l.catalogItemId === key
        && (isProjectMode ? l.projectId === selectedProjectId : !l.projectId)
        && (matchedReqId ? l.requirementId === matchedReqId : !l.requirementId),
      );
      if (existing) {
        return prev.map(l =>
          l === existing ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, {
        catalogItemId: item.id,
        supplierId: item.supplierId,
        supplierName: item.supplier?.supplierProfile?.businessName ?? 'Supplier',
        supplierPhone: item.supplier?.phone,
        name: item.name,
        unit: item.unit,
        price: item.price,
        quantity: 1,
        stock: Number(item.stock || 0),
        imageUrl: item.imageUrl,
        category: item.category,
        projectId: isProjectMode ? selectedProjectId : undefined,
        requirementId: matchedReqId,
      }];
    });
    setDrawerOpen(true);
  }

  // Add `qty` units of `item` to the cart in one shot. If a matching line exists,
  // we increase it; otherwise we create one. Honors stock and the project-mode cap,
  // emitting the same toast notices as the +1 path so behavior stays consistent.
  function addQuantity(item: any, qty: number, requirementId?: string) {
    const want = Math.max(0, Math.floor(Number(qty) || 0));
    if (want <= 0) return;
    const matchedReqId = requirementId ?? (isProjectMode ? matchRequirement(item)?.id : undefined);

    const existing = findExistingLine(item.id);
    const existingQty = Number(existing?.quantity || 0);
    const stock = Number(item.stock || 0);

    // Cap by available stock
    let target = Math.min(existingQty + want, stock || existingQty + want);

    // Project-mode requirement cap
    if (isProjectMode && matchedReqId) {
      const cap = maxQtyAllowedForLine(item.id, matchedReqId);
      const projectLimit = existingQty + cap;
      if (target > projectLimit) {
        target = projectLimit;
        const r = project?.requirements?.find((x: any) => x.id === matchedReqId);
        const unit = r?.unit ? ` ${r.unit}` : '';
        const reqName = r?.materialName ?? 'this requirement';
        setNotice(
          cap === 0
            ? `Already fully sourced for "${reqName}".`
            : `Capped at ${cap}${unit} more — that's all "${reqName}" still needs from this supplier.`,
        );
      }
    }

    const finalQty = Math.max(existingQty, target);
    if (finalQty <= existingQty) {
      if (!existing) setDrawerOpen(true);
      return;
    }

    setCart(prev => {
      const matchExisting = prev.find(l =>
        l.catalogItemId === item.id
        && (isProjectMode ? l.projectId === selectedProjectId : !l.projectId)
        && (matchedReqId ? l.requirementId === matchedReqId : !l.requirementId),
      );
      if (matchExisting) {
        return prev.map(l => l === matchExisting ? { ...l, quantity: finalQty } : l);
      }
      return [...prev, {
        catalogItemId: item.id,
        supplierId: item.supplierId,
        supplierName: item.supplier?.supplierProfile?.businessName ?? 'Supplier',
        supplierPhone: item.supplier?.phone,
        name: item.name,
        unit: item.unit,
        price: item.price,
        quantity: finalQty,
        stock,
        imageUrl: item.imageUrl,
        category: item.category,
        projectId: isProjectMode ? selectedProjectId : undefined,
        requirementId: matchedReqId,
      }];
    });
    setDrawerOpen(true);
  }

  function setLineQty(line: CartLine, qty: number) {
    const requested = Math.max(0, qty);
    let clamped = requested;
    if (isProjectMode && line.requirementId) {
      const cap = maxQtyAllowedForLine(line.catalogItemId, line.requirementId);
      if (requested > cap) {
        clamped = cap;
        const r = project?.requirements?.find((x: any) => x.id === line.requirementId);
        const unit = r?.unit ? ` ${r.unit}` : '';
        const reqName = r?.materialName ?? 'this requirement';
        setNotice(`Capped at ${cap}${unit} — that's all "${reqName}" still needs from this supplier.`);
      }
    }
    setCart(prev => prev
      .map(l => l === line ? { ...l, quantity: clamped } : l)
      .filter(l => l.quantity > 0));
  }
  function removeLine(line: CartLine) {
    setCart(prev => prev.filter(l => l !== line));
  }

  /* ── checkout ──────────────────────────────────────────────────────────── */
  async function placeOrders() {
    const anyPersonalDelivery = !isProjectMode && groupedBySupplier.some(g => getFulfillment(g.supplierId) === 'DELIVERY');
    if (!isProjectMode) {
      if (!shipping.recipientName.trim()) { alert('Please add a recipient name.'); return; }
      if (!shipping.recipientPhone.trim()) { alert('Please add a recipient phone.'); return; }
      if (anyPersonalDelivery && !shipping.address.trim()) {
        alert('Please add a shipping address for the delivery order(s).'); return;
      }
    }
    const token = getAccessToken();
    if (!token) { router.push('/login'); return; }
    setSubmitting(true);
    try {
      for (const group of groupedBySupplier) {
        const fulfillmentType = getFulfillment(group.supplierId);
        const body: any = {
          supplierId: group.supplierId,
          items: group.lines.map(l => ({ catalogItemId: l.catalogItemId, quantity: l.quantity })),
          deliveryType: 'STANDARD',
          fulfillmentType,
        };
        if (isProjectMode) {
          body.projectId = selectedProjectId;
        } else {
          body.recipientName = shipping.recipientName;
          body.recipientPhone = shipping.recipientPhone;
          // Only ship-to address makes sense for DELIVERY personal purchases
          if (fulfillmentType === 'DELIVERY') body.shippingAddress = shipping.address;
        }
        await apiRequest('/orders', { method: 'POST', token, body });
      }
      setStage('done');
      // Clear cart-in-scope only
      setCart(prev => prev.filter(l => isProjectMode ? l.projectId !== selectedProjectId : l.projectId));
      // Refresh project allocations
      if (isProjectMode) fetchProject(selectedProjectId);
    } catch (err: any) {
      alert(err?.message || 'Order placement failed');
    } finally {
      setSubmitting(false);
    }
  }

  const activeProjectName = project?.name ?? '';
  const activeRequirement = project?.requirements?.find((r: any) => r.id === activeRequirementId) ?? null;

  /* ── render ────────────────────────────────────────────────────────────── */
  return (
    <div className="fade-in" style={{ paddingBottom: 60 }}>
      {/* Cap notice toast — portaled to <body> so it floats above any sticky/transform chrome */}
      {notice && typeof document !== 'undefined' && createPortal(
        <div
          role="status"
          aria-live="polite"
          onClick={() => setNotice(null)}
          style={{
            position: 'fixed', top: 90, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10000, display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 999,
            background: 'rgba(220, 38, 38, 0.16)',
            border: '1px solid rgba(220, 38, 38, 0.4)',
            color: '#FCA5A5',
            fontSize: 12, fontWeight: 700,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            boxShadow: 'var(--shadow-lg)',
            cursor: 'pointer',
            maxWidth: '90vw',
          }}
        >
          <AlertCircle size={14} />
          {notice}
        </div>,
        document.body,
      )}
      {/* ─── Sticky header island: stays pinned just below the topbar ─── */}
      <div
        className="shop-sticky"
        style={{
          position: 'sticky',
          top: 68,                 /* matches topbar height */
          zIndex: 20,
          margin: '-32px -28px 24px',
          padding: '16px 28px 14px',
          background: 'var(--topbar-bg)',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
      {/* ─── Mode picker + cart row ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <ModePicker
          mode={isProjectMode ? 'project' : 'personal'}
          projectName={activeProjectName}
          projects={projects}
          open={modePickerOpen}
          setOpen={setModePickerOpen}
          onPersonal={() => { setSelectedProjectId(PERSONAL); setModePickerOpen(false); }}
          onPickProject={(id) => { setSelectedProjectId(id); setModePickerOpen(false); }}
        />

        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder={isProjectMode ? 'Search by material or supplier…' : 'Search products, suppliers, categories…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input"
            style={{ paddingLeft: 40, height: 42, borderRadius: 12 }}
          />
        </div>

        <button
          type="button"
          onClick={() => { setStage('cart'); setDrawerOpen(true); }}
          className="btn btn-primary"
          style={{ width: 'auto', padding: '0 18px', height: 42, display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <ShoppingCart size={16} />
          Cart{cartInScopeCount > 0 ? ` · ${cartInScopeCount}` : ''}
          {scopeTotal > 0 && (
            <span style={{ fontWeight: 800 }}>· {fmt(scopeTotal)}</span>
          )}
        </button>
      </div>

      {/* ─── Project context strip (only in project mode) ─── */}
      {isProjectMode && project && (
        <ProjectStrip project={project} stats={requirementStats} />
      )}

      {/* ─── Chips (categories OR requirements depending on mode) ─── */}
      {isProjectMode ? (
        (project?.requirements?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <Chip active={activeRequirementId === null} onClick={() => setActiveRequirementId(null)}>
              All requirements
            </Chip>
            {project.requirements.map((r: any) => {
              const s = requirementStats.get(r.id);
              const allocated = (s?.ordered || 0) + (s?.inCart || 0);
              const needed = Number(r.quantityNeeded || 0);
              const pct = needed > 0 ? Math.min(100, Math.round((allocated / needed) * 100)) : 0;
              const full = needed > 0 && allocated >= needed;
              const unitSuffix = r.unit ? ` ${r.unit}` : '';
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveRequirementId(r.id)}
                  title={`${allocated} of ${needed}${unitSuffix} allocated (${pct}%)`}
                  style={{
                    padding: '6px 6px 6px 14px', borderRadius: 999,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: '1px solid',
                    borderColor: activeRequirementId === r.id ? 'var(--accent)' : 'var(--border-subtle)',
                    background: activeRequirementId === r.id ? 'var(--accent-muted)' : 'transparent',
                    color: activeRequirementId === r.id ? 'var(--accent)' : 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span>{r.materialName}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                    background: full ? 'rgba(16,185,129,0.18)' : 'var(--bg-elevated)',
                    color: full ? 'var(--success)' : 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: 0.2,
                  }}>
                    {full ? `✓ ${needed}${unitSuffix}` : `${allocated} / ${needed}${unitSuffix}`}
                  </span>
                </button>
              );
            })}
          </div>
        )
      ) : (
        categories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            <Chip active={activeCategory === null} onClick={() => setActiveCategory(null)}>All</Chip>
            {categories.map(c => (
              <Chip key={c} active={activeCategory === c} onClick={() => setActiveCategory(c)}>{c}</Chip>
            ))}
          </div>
        )
      )}
      </div>
      {/* ── end sticky island ── */}

      {/* ─── Grid ─── */}
      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ width: 36, height: 36, borderTopColor: 'var(--accent)', margin: '0 auto' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Package size={36} strokeWidth={1.4} style={{ opacity: 0.3 }} />
          <p style={{ marginTop: 12, fontSize: 14 }}>
            {activeRequirement
              ? `No suppliers currently list "${activeRequirement.materialName}".`
              : 'No products match your filters.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
          {filtered.map(item => {
            const supplierName = item.supplier?.supplierProfile?.businessName ?? 'Supplier';
            const inLine = findExistingLine(item.id);
            const oos = Number(item.stock || 0) <= 0;
            const matchedReq = isProjectMode ? matchRequirement(item) : null;
            const stats = matchedReq ? requirementStats.get(matchedReq.id) : null;
            return (
              <div key={item.id} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <button
                  type="button"
                  onClick={() => setViewingProduct(item)}
                  aria-label={`View details for ${item.name}`}
                  style={{
                    height: 140, background: 'var(--bg-elevated)', position: 'relative',
                    border: 'none', padding: 0, cursor: 'pointer', display: 'block', width: '100%',
                  }}
                >
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {isProjectMode && matchedReq && (
                    <span style={{
                      position: 'absolute', top: 10, left: 10,
                      background: 'rgba(245, 158, 11, 0.95)', color: '#0A0A0A',
                      padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                      letterSpacing: 0.5, textTransform: 'uppercase',
                      boxShadow: '0 4px 12px rgba(245, 158, 11, 0.25)',
                    }}>
                      Fits "{matchedReq.materialName}"
                    </span>
                  )}
                  <span style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'rgba(13, 21, 38, 0.75)', backdropFilter: 'blur(6px)',
                    color: '#F1F5F9', padding: '5px 9px', borderRadius: 999,
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <Info size={11} /> Details
                  </span>
                </button>
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <button
                    type="button"
                    onClick={() => setViewingProduct(item)}
                    style={{
                      fontSize: 14, fontWeight: 700, color: 'inherit', background: 'transparent',
                      border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer',
                    }}
                  >
                    {item.name}
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{supplierName}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{fmt(item.price)}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>per {item.unit}</span>
                  </div>
                  <div style={{ fontSize: 11, color: oos ? 'var(--danger, #ef4444)' : 'var(--text-muted)' }}>
                    {oos ? 'Out of stock' : `${Number(item.stock).toLocaleString()} in stock`}
                  </div>

                  {isProjectMode && matchedReq && stats && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span>{stats.ordered + stats.inCart} / {stats.needed} {matchedReq.unit || ''} allocated</span>
                      {stats.ordered + stats.inCart >= stats.needed && (
                        <span style={{ color: 'var(--success)', fontWeight: 700 }}>Fully sourced</span>
                      )}
                    </div>
                  )}

                  {(() => {
                    // Project-mode hard cap → disable the button when at the limit.
                    const cap = matchedReq ? maxQtyAllowedForLine(item.id, matchedReq.id) : Infinity;
                    const currentQty = Number(inLine?.quantity || 0);
                    const atCap = isProjectMode && matchedReq && currentQty >= cap;
                    const disabled = oos || atCap;
                    const label = oos
                      ? 'Out of stock'
                      : atCap
                        ? (cap === 0 ? 'Requirement met' : 'Cap reached')
                        : inLine
                          ? `In cart · ${inLine.quantity}`
                          : 'Add to cart';
                    return (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => addOne(item)}
                        className="btn btn-primary"
                        style={{ marginTop: 'auto', height: 38, opacity: disabled ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        title={atCap ? `Already at the ${matchedReq.quantityNeeded} ${matchedReq.unit || ''} the project needs` : undefined}
                      >
                        <ShoppingCart size={14} />
                        {label}
                      </button>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Drawer (portaled to <body> so the page-wrapper's transform
            doesn't trap it inside a containing block) ─── */}
      {drawerOpen && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(2,6,12,0.65)', backdropFilter: 'blur(8px)',
          }}
        >
          <aside
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: 0, right: 0, height: '100vh', width: '100%', maxWidth: 460,
              background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {stage === 'cart' ? (isProjectMode ? 'Project Cart' : 'Your Cart') : stage === 'checkout' ? 'Checkout' : 'Confirmed'}
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
                  {stage === 'cart' && (isProjectMode ? activeProjectName : `${cartInScopeCount} item${cartInScopeCount === 1 ? '' : 's'}`)}
                  {stage === 'checkout' && (isProjectMode ? 'Review & secure escrow' : 'Shipping details')}
                  {stage === 'done' && 'Thanks for your order'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                aria-label="Close cart"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
              {stage === 'cart' && (
                cartInScope.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    <ShoppingCart size={36} strokeWidth={1.2} style={{ opacity: 0.3 }} />
                    <p style={{ marginTop: 12, fontSize: 13 }}>Your cart is empty.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {groupedBySupplier.map(group => (
                      <div key={group.supplierId} style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {group.supplierName}
                          </div>
                          {group.supplierPhone && (
                            <a
                              href={`tel:${group.supplierPhone}`}
                              title={`Call ${group.supplierName} (${group.supplierPhone})`}
                              aria-label={`Call ${group.supplierName}`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 11, fontWeight: 800,
                                padding: '4px 10px', borderRadius: 999,
                                background: 'var(--accent-muted)', color: 'var(--accent)',
                                border: '1px solid var(--border-accent)',
                                textDecoration: 'none', flexShrink: 0,
                              }}
                            >
                              <Phone size={11} /> Call
                            </a>
                          )}
                        </div>
                        <FulfillmentToggle
                          value={getFulfillment(group.supplierId)}
                          onChange={t => setFulfillment(group.supplierId, t)}
                        />
                        {group.lines.map(l => {
                          const reqName = l.requirementId
                            ? project?.requirements?.find((r: any) => r.id === l.requirementId)?.materialName
                            : null;
                          return (
                            <div key={l.catalogItemId + (l.requirementId ?? '')} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '8px 0', borderBottom: '1px dashed var(--border-subtle)' }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {fmt(l.price)} / {l.unit}
                                  {reqName && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>· for {reqName}</span>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {(() => {
                                  const lineCap = l.requirementId
                                    ? maxQtyAllowedForLine(l.catalogItemId, l.requirementId)
                                    : Infinity;
                                  const atLineCap = l.quantity >= lineCap;
                                  return (
                                    <>
                                      <button type="button" onClick={() => setLineQty(l, l.quantity - 1)} className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, minWidth: 28, borderRadius: 6 }} aria-label="Decrease">
                                        <Minus size={12} />
                                      </button>
                                      <input
                                        type="number" min={1}
                                        max={Number.isFinite(lineCap) ? lineCap : undefined}
                                        value={l.quantity}
                                        onChange={e => setLineQty(l, Math.max(1, Number(e.target.value) || 1))}
                                        style={{ width: 50, textAlign: 'center', padding: '4px 2px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}
                                        aria-label={`Quantity of ${l.name}`}
                                      />
                                      <button
                                        type="button"
                                        disabled={atLineCap}
                                        onClick={() => setLineQty(l, l.quantity + 1)}
                                        className="btn btn-ghost btn-sm"
                                        style={{ width: 28, height: 28, padding: 0, minWidth: 28, borderRadius: 6, opacity: atLineCap ? 0.35 : 1 }}
                                        aria-label="Increase"
                                      >
                                        <Plus size={12} />
                                      </button>
                                    </>
                                  );
                                })()}
                                <button type="button" onClick={() => removeLine(l)} className="btn btn-ghost btn-sm" style={{ width: 28, height: 28, padding: 0, minWidth: 28, borderRadius: 6, color: 'var(--danger, #ef4444)' }} aria-label="Remove">
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, fontWeight: 700 }}>
                          <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                          <span>{fmt(group.subtotal)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {stage === 'checkout' && !isProjectMode && (() => {
                const anyDelivery = groupedBySupplier.some(g => getFulfillment(g.supplierId) === 'DELIVERY');
                const allPickup = !anyDelivery && groupedBySupplier.length > 0;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {allPickup && (
                      <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <StoreIcon size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          You'll collect these items from the supplier. We'll share your contact so they can let you know when it's ready.
                        </div>
                      </div>
                    )}
                    <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px dashed var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <UserIcon size={12} style={{ color: 'var(--accent)' }} />
                      <span>Pre-filled with your profile details. Edit only if the order should go to someone else.</span>
                    </div>
                    <Field label="Recipient name (you)" icon={<UserIcon size={14} />}>
                      <input className="input" value={shipping.recipientName} onChange={e => setShipping(s => ({ ...s, recipientName: e.target.value }))} placeholder="Full name" />
                    </Field>
                    <Field label="Recipient phone (you)" icon={<Phone size={14} />}>
                      <input className="input" value={shipping.recipientPhone} onChange={e => setShipping(s => ({ ...s, recipientPhone: e.target.value }))} placeholder="+233 …" inputMode="tel" />
                    </Field>
                    {anyDelivery && (
                      <Field label="Shipping address" icon={<MapPin size={14} />}>
                        <textarea
                          className="input"
                          value={shipping.address}
                          onChange={e => setShipping(s => ({ ...s, address: e.target.value }))}
                          placeholder="Street, area, city, landmark"
                          rows={3}
                          style={{ resize: 'vertical', minHeight: 80, padding: 10 }}
                        />
                      </Field>
                    )}
                    <SummaryCard groups={groupedBySupplier} total={scopeTotal} />
                  </div>
                );
              })()}

              {stage === 'checkout' && isProjectMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: 'var(--accent-muted)', border: '1px solid var(--border-accent)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <ShieldCheck size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      Linking <strong style={{ color: 'var(--text-primary)' }}>{activeProjectName}</strong>.
                      Funds are held in escrow and released after delivery is confirmed at the project site.
                    </div>
                  </div>
                  <SummaryCard groups={groupedBySupplier} total={scopeTotal} />
                </div>
              )}

              {stage === 'done' && (
                <div style={{ textAlign: 'center', padding: 30 }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', color: 'var(--success, #10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <CheckCircle size={32} />
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Order placed</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 22 }}>
                    Funds are held safely in escrow until your items arrive. Track everything in Orders &amp; Escrow.
                  </p>
                  <button type="button" onClick={() => { setDrawerOpen(false); setStage('cart'); router.push('/dashboard/orders'); }} className="btn btn-primary" style={{ height: 42 }}>
                    View my orders
                  </button>
                </div>
              )}
            </div>

            {stage !== 'done' && cartInScope.length > 0 && (
              <div style={{ padding: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {stage === 'cart' && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                      <span style={{ fontWeight: 800 }}>{fmt(scopeTotal)}</span>
                    </div>
                    <button type="button" disabled={cartInScope.length === 0} onClick={() => setStage('checkout')} className="btn btn-primary" style={{ height: 44, opacity: cartInScope.length === 0 ? 0.35 : 1 }}>
                      Checkout
                    </button>
                  </>
                )}
                {stage === 'checkout' && (
                  <>
                    <button type="button" onClick={() => setStage('cart')} className="btn btn-ghost" style={{ height: 40 }}>
                      Back to cart
                    </button>
                    <button type="button" disabled={submitting} onClick={placeOrders} className="btn btn-primary" style={{ height: 44, opacity: submitting ? 0.6 : 1 }}>
                      {submitting ? 'Placing orders…' : `Place ${groupedBySupplier.length} order${groupedBySupplier.length === 1 ? '' : 's'} · ${fmt(scopeTotal)}`}
                    </button>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>,
        document.body,
      )}

      {/* ─── Product Details Modal (portaled to <body>) ─── */}
      {viewingProduct && typeof document !== 'undefined' && createPortal(
        <ProductDetailsModal
          product={viewingProduct}
          inLine={findExistingLine(viewingProduct.id) ?? null}
          fits={isProjectMode ? matchRequirement(viewingProduct) : null}
          isProjectMode={isProjectMode}
          onClose={() => setViewingProduct(null)}
          onAdd={(qty: number) => { addQuantity(viewingProduct, qty); }}
          onBrowseSupplier={(name: string) => {
            setSearch(name);
            setViewingProduct(null);
          }}
          maxAddable={(() => {
            const matched = isProjectMode ? matchRequirement(viewingProduct) : null;
            if (!matched) return Number(viewingProduct.stock || 0);
            return Math.min(Number(viewingProduct.stock || 0), maxQtyAllowedForLine(viewingProduct.id, matched.id));
          })()}
        />,
        document.body,
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Subcomponents                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

function ModePicker({
  mode, projectName, projects, open, setOpen, onPersonal, onPickProject,
}: {
  mode: 'personal' | 'project';
  projectName: string;
  projects: any[];
  open: boolean;
  setOpen: (v: boolean) => void;
  onPersonal: () => void;
  onPickProject: (id: string) => void;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', height: 42, borderRadius: 12,
          background: mode === 'project' ? 'var(--accent-muted)' : 'var(--bg-elevated)',
          border: `1px solid ${mode === 'project' ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
          color: 'var(--text-primary)',
          cursor: 'pointer', fontWeight: 700, fontSize: 13,
          minWidth: 220,
        }}
      >
        {mode === 'project'
          ? <Briefcase size={15} style={{ color: 'var(--accent)' }} />
          : <ShoppingCart size={15} style={{ color: 'var(--text-secondary)' }} />}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Shopping for
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
            {mode === 'project' ? (projectName || 'a project') : 'Personal'}
          </span>
        </div>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 51,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, boxShadow: 'var(--shadow-lg)',
            minWidth: 280, padding: 6,
          }}>
            <button type="button" onClick={onPersonal}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: mode === 'personal' ? 'var(--accent-muted)' : 'transparent', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
              <ShoppingCart size={14} style={{ color: mode === 'personal' ? 'var(--accent)' : 'var(--text-secondary)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Personal</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Buy materials for yourself, ship to any address</div>
              </div>
            </button>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 4px' }} />
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '4px 12px' }}>
              Projects
            </div>
            {projects.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                No projects yet. Create one from <strong>My Projects</strong>.
              </div>
            ) : (
              projects.map(p => (
                <button key={p.id} type="button" onClick={() => onPickProject(p.id)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}>
                  <FolderOpen size={14} style={{ color: 'var(--text-secondary)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.location || 'No location set'}
                    </div>
                  </div>
                  <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ProjectStrip({ project, stats }: { project: any; stats: Map<string, { needed: number; ordered: number; inCart: number }> }) {
  const requirements = project.requirements ?? [];
  const totalNeeded = requirements.reduce((s: number, r: any) => s + Number(r.quantityNeeded || 0), 0);
  let totalAllocated = 0;
  for (const r of requirements) {
    const st = stats.get(r.id);
    if (st) totalAllocated += st.ordered + st.inCart;
  }
  const totalPct = totalNeeded > 0 ? Math.min(100, Math.round((totalAllocated / totalNeeded) * 100)) : 0;
  const fulfilled = requirements.filter((r: any) => {
    const s = stats.get(r.id);
    return s && (s.ordered + s.inCart) >= s.needed;
  }).length;
  return (
    <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
        <Briefcase size={16} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)' }}>
            Project planning
          </div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{project.name}</div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
          <span>{fulfilled} of {requirements.length} requirements sourced</span>
          <span style={{ fontWeight: 700, color: totalPct >= 100 ? 'var(--success)' : 'var(--text-primary)' }}>{totalPct}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${totalPct}%`, height: '100%',
            background: totalPct >= 100 ? 'var(--success)' : 'var(--accent-gradient)',
            transition: 'width 0.2s ease',
          }} />
        </div>
      </div>
    </div>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: '1px solid',
        cursor: 'pointer',
        borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
        background: active ? 'var(--accent-muted)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        transition: 'all 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

function ProductDetailsModal({
  product, inLine, fits, isProjectMode, onClose, onAdd, onBrowseSupplier, maxAddable,
}: {
  product: any;
  inLine: CartLine | null;
  fits: { id: string; materialName: string; unit?: string } | null;
  isProjectMode: boolean;
  onClose: () => void;
  onAdd: (qty: number) => void;
  onBrowseSupplier: (name: string) => void;
  maxAddable: number;
}) {
  const supplier = product.supplier ?? {};
  const profile = supplier.supplierProfile ?? {};
  const supplierName: string = profile.businessName ?? 'Supplier';
  const verified = profile.verificationStatus === 'APPROVED';
  const memberSince = supplier.createdAt ? new Date(supplier.createdAt) : null;
  const description: string = product.description || product.masterProduct?.description || '';
  const category: string | undefined = product.category || product.masterProduct?.category;
  const stock = Number(product.stock || 0);
  const oos = stock <= 0;
  const atCap = !!(isProjectMode && fits && maxAddable <= 0);
  const disabled = oos || atCap;

  // Quantity stepper: clamp to what the contractor can still add to the line
  // (stock minus what's already in cart, minus what the project requirement allows).
  const addableMax = Math.max(
    0,
    isProjectMode && fits ? Math.min(stock - (inLine?.quantity ?? 0), maxAddable) : stock - (inLine?.quantity ?? 0),
  );
  // Empty by default — user must enter how many they want.
  const [qtyInput, setQtyInput] = useState<string>('');
  const qty = qtyInput === '' ? 0 : Math.max(0, Math.floor(Number(qtyInput) || 0));
  const clampQty = (n: number) => Math.max(0, Math.min(addableMax, Math.floor(Number(n) || 0)));
  const subtotal = qty * Number(product.price || 0);
  const canAdd = !disabled && qty >= 1 && qty <= addableMax;
  const ctaLabel = oos
    ? 'Out of stock'
    : atCap
      ? 'Requirement met'
      : qty < 1
        ? 'Enter a quantity'
        : inLine
          ? `Add ${qty} ${product.unit} more`
          : `Add ${qty} ${product.unit} to cart`;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9997,
        background: 'rgba(2,6,12,0.65)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 760, maxHeight: '92vh', overflow: 'auto',
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 18, boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Product details</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div className="pdm-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 280px) minmax(0, 1fr)', gap: 0 }}>
          <div style={{ background: 'var(--bg-elevated)', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', maxHeight: 320, objectFit: 'cover' }} />
            ) : (
              <Package size={56} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            )}
          </div>

          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>{product.name}</h2>
              {category && (
                <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '3px 8px', borderRadius: 999 }}>
                  <Tag size={11} /> {category}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent)' }}>{fmt(product.price)}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>per {product.unit}</span>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: oos ? 'var(--danger, #ef4444)' : 'var(--success, #10b981)',
              }}>
                · {oos ? 'Out of stock' : `${stock.toLocaleString()} ${product.unit} in stock`}
              </span>
            </div>

            {description ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {description}
              </p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                No description provided.
              </p>
            )}

            {isProjectMode && fits && (
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--accent-muted)', border: '1px solid var(--border-accent)', fontSize: 12, color: 'var(--text-secondary)' }}>
                Matches your project requirement <strong style={{ color: 'var(--accent)' }}>{fits.materialName}</strong>.
              </div>
            )}

            {/* Supplier section */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sold by</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: 'var(--accent-muted)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <StoreIcon size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{supplierName}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                      padding: '3px 8px', borderRadius: 999,
                      background: verified ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                      color: verified ? 'var(--success, #10b981)' : 'var(--warning, var(--accent))',
                      border: `1px solid ${verified ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    }}>
                      {verified ? <CheckCircle size={11} /> : <ShieldCheck size={11} />}
                      {verified ? 'Verified supplier' : (profile.verificationStatus || 'Pending review')}
                    </span>
                    {memberSince && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
                        padding: '3px 8px', borderRadius: 999,
                        background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}>
                        <Calendar size={11} />
                        Member since {memberSince.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {supplier.phone && (
                  <a
                    href={`tel:${supplier.phone}`}
                    title={`Call ${supplierName} (${supplier.phone})`}
                    className="btn btn-primary"
                    style={{ width: 'auto', height: 36, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px', textDecoration: 'none' }}
                  >
                    <Phone size={14} /> Call supplier
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onBrowseSupplier(supplierName)}
                  className="btn btn-ghost"
                  style={{ width: 'auto', height: 36, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px' }}
                >
                  <Search size={14} /> See all from {supplierName}
                </button>
              </div>
            </div>

            {!disabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Quantity
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Up to {addableMax.toLocaleString()} {product.unit}
                      {inLine ? ` (already ${inLine.quantity} in cart)` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setQtyInput(String(clampQty(qty - 1)))}
                      disabled={qty <= 0}
                      aria-label="Decrease quantity"
                      className="btn btn-ghost"
                      style={{ width: 36, height: 36, padding: 0, minWidth: 36, borderRadius: 10, opacity: qty <= 0 ? 0.35 : 1 }}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={qtyInput}
                      placeholder="0"
                      onChange={e => {
                        // Strip anything non-numeric, then clamp to addableMax
                        const digits = e.target.value.replace(/\D/g, '');
                        if (digits === '') { setQtyInput(''); return; }
                        const n = Math.min(addableMax, parseInt(digits, 10));
                        setQtyInput(String(n));
                      }}
                      onKeyDown={e => {
                        if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault();
                      }}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        if (!/^\d+$/.test(text.trim())) e.preventDefault();
                      }}
                      aria-label={`Quantity of ${product.name}`}
                      style={{
                        width: 76, textAlign: 'center', padding: '8px 6px',
                        borderRadius: 10, fontWeight: 800, fontSize: 14,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setQtyInput(String(clampQty(qty + 1)))}
                      disabled={qty >= addableMax}
                      aria-label="Increase quantity"
                      className="btn btn-ghost"
                      style={{ width: 36, height: 36, padding: 0, minWidth: 36, borderRadius: 10, opacity: qty >= addableMax ? 0.35 : 1 }}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    Subtotal
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--accent)' }}>
                    {fmt(subtotal)}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost"
                style={{ flex: 1, height: 42 }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={!canAdd}
                onClick={() => { onAdd(qty); onClose(); }}
                className="btn btn-primary"
                style={{ flex: 2, height: 42, opacity: !canAdd ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <ShoppingCart size={14} />
                {ctaLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FulfillmentToggle({
  value, onChange,
}: {
  value: 'PICKUP' | 'DELIVERY';
  onChange: (t: 'PICKUP' | 'DELIVERY') => void;
}) {
  const opts: { key: 'DELIVERY' | 'PICKUP'; label: string; hint: string; Icon: any }[] = [
    { key: 'DELIVERY', label: 'Delivery', hint: 'Supplier ships', Icon: Truck },
    { key: 'PICKUP',   label: 'Pickup',   hint: 'I collect',     Icon: StoreIcon },
  ];
  return (
    <div role="radiogroup" aria-label="Fulfillment method" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
      {opts.map(({ key, label, hint, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: active ? 'var(--accent-muted)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', textAlign: 'left',
              transition: 'var(--transition)',
            }}
          >
            <Icon size={14} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
              <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.4 }}>{hint}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
        {icon} {label}
      </span>
      {children}
    </label>
  );
}

function SummaryCard({ groups, total }: {
  groups: { supplierId: string; supplierName: string; subtotal: number }[];
  total: number;
}) {
  return (
    <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {groups.map(g => (
        <div key={g.supplierId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>{g.supplierName}</span>
          <span style={{ fontWeight: 700 }}>{fmt(g.subtotal)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
        <span style={{ fontWeight: 700 }}>Total</span>
        <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{fmt(total)}</span>
      </div>
    </div>
  );
}
