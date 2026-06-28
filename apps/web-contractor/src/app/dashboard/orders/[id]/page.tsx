'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { ArrowLeft, Package, Truck, CheckCircle, Clock, ShieldCheck, MessageSquare, MapPin, Calendar, FileText, ChevronRight, User } from 'lucide-react';
import Link from 'next/link';

export default function OrderDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    if (id) fetchOrderDetails();
  }, [id]);

  async function fetchOrderDetails() {
    const token = getAccessToken();
    try {
      // Note: Backend might need an endpoint for single order details or we filter from list
      // For now we'll assume GET /orders/:id exists (I should check or add it)
      const data = await apiRequest<any>(`/orders/${id}`, { token: token! });
      setOrder(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRelease() {
    if (!confirm('Are you sure you want to release funds to the supplier? Only do this if you have verified the materials on site.')) return;
    
    const token = getAccessToken();
    setReleasing(true);
    try {
      await apiRequest(`/orders/${id}/release-funds`, {
        method: 'PATCH',
        token: token!,
      });
      alert('Funds released successfully!');
      fetchOrderDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to release funds');
    } finally {
      setReleasing(false);
    }
  }

  if (loading) return <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><div className="spinner-light" /></div>;
  if (!order) return <div style={{ padding: 60, textAlign: 'center' }}><h2>Order not found</h2></div>;

  const steps = [
    { label: 'Order Placed', status: 'COMPLETED', date: order.createdAt },
    { label: 'Supplier Accepted', status: order.status !== 'PENDING' ? 'COMPLETED' : 'PENDING', date: order.updatedAt },
    { label: 'In Transit', status: ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(order.status) ? 'COMPLETED' : 'PENDING' },
    { label: 'Delivered to Site', status: ['DELIVERED', 'COMPLETED'].includes(order.status) ? 'COMPLETED' : 'PENDING' },
    { label: 'Escrow Released', status: order.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING' },
  ];

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 32 }}>
        <Link href="/dashboard/orders" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14, marginBottom: 16 }}>
          <ArrowLeft size={16} /> Back to Orders
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ margin: 0 }}>Order #{order.id.slice(-8).toUpperCase()}</h1>
              <span className={`badge ${{
                PENDING: 'badge-muted', ACCEPTED: 'badge-info', DISPATCHED: 'badge-info',
                DRIVER_ACCEPTED: 'badge-info', IN_TRANSIT: 'badge-warning', ARRIVED: 'badge-warning',
                DELIVERED: 'badge-success', COMPLETED: 'badge-success',
                CANCELLED: 'badge-danger', REFUNDED: 'badge-danger',
              }[order.status as string] ?? 'badge-muted'}`}>
                {order.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Supplier: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{order.supplier.supplierProfile.businessName}</span>
              {order.project
                ? <> • Project: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{order.project.name}</span></>
                : <> • <span style={{ color: '#818cf8', fontWeight: 700 }}>Personal purchase</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
             <Link href={`/dashboard/messages?orderId=${order.id}`} className="btn btn-ghost" style={{ width: 'auto' }}>
               <MessageSquare size={18} /> Chat with Supplier
             </Link>
          </div>
        </div>
      </div>

      <div className="detail-split-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>
        <div>
          {/* TRACKING TIMELINE */}
          <div className="card" style={{ marginBottom: 32 }}>
             <div className="card-header">
               <span className="card-title">Live Tracking Timeline</span>
             </div>
             <div style={{ padding: '40px 24px' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                 <div style={{ position: 'absolute', top: 12, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.05)', zIndex: 1 }} />
                 <div style={{ position: 'absolute', top: 12, left: 0, width: `${(steps.filter(s => s.status === 'COMPLETED').length - 1) * 25}%`, height: 2, background: 'var(--accent)', zIndex: 2, transition: 'width 0.5s ease' }} />
                 
                 {steps.map((step, i) => (
                   <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, zIndex: 3, flex: 1 }}>
                     <div style={{ 
                       width: 26, 
                       height: 26, 
                       borderRadius: '50%', 
                       background: step.status === 'COMPLETED' ? 'var(--accent)' : 'var(--bg-surface)', 
                       border: `4px solid ${step.status === 'COMPLETED' ? 'var(--bg-surface)' : 'rgba(255,255,255,0.05)'}`,
                       display: 'flex',
                       alignItems: 'center',
                       justifyContent: 'center',
                       color: step.status === 'COMPLETED' ? '#000' : 'var(--text-muted)'
                     }}>
                       {step.status === 'COMPLETED' ? <CheckCircle size={14} /> : i + 1}
                     </div>
                     <div style={{ textAlign: 'center' }}>
                       <div style={{ fontSize: 12, fontWeight: 700, color: step.status === 'COMPLETED' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{step.label}</div>
                       {step.date && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{new Date(step.date).toLocaleDateString()}</div>}
                     </div>
                   </div>
                 ))}
               </div>
             </div>
             {order.status === 'IN_TRANSIT' && (
               <div style={{ padding: '0 24px 24px 24px' }}>
                 <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                   <div className="spinner-light" />
                   <div>
                     <div style={{ fontSize: 14, fontWeight: 700 }}>Driver is on the way</div>
                     <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Estimated arrival: 2:30 PM (Today)</div>
                   </div>
                   <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', width: 'auto' }}>View Map</button>
                 </div>
               </div>
             )}
          </div>

          {/* ITEM SUMMARY */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Itemized Summary</span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Quantity</th>
                    <th>Price/Unit</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item: any) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 600 }}>{item.catalogItem.name}</td>
                      <td>{item.quantity} {item.catalogItem.unit}</td>
                      <td>GH₵ {item.priceAtOrder.toLocaleString()}</td>
                      <td style={{ fontWeight: 700 }}>GH₵ {(item.quantity * item.priceAtOrder).toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>Logistics & Processing</td>
                    <td style={{ fontWeight: 700 }}>GH₵ 50</td>
                  </tr>
                  <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 800, fontSize: 16 }}>Total Escrow</td>
                    <td style={{ fontWeight: 900, fontSize: 18, color: 'var(--accent)' }}>GH₵ {(order.totalAmount + 50).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          {/* DELIVERY INFO */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="card-title">Delivery Details</span>
            </div>
            <div style={{ padding: 24 }}>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                 <div style={{ display: 'flex', gap: 12 }}>
                   <MapPin size={18} color="var(--accent)" />
                   <div>
                     <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                       {order.project ? 'Site Location' : 'Shipping Address'}
                     </div>
                     <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'pre-wrap' }}>
                       {order.project?.location ?? order.shippingAddress ?? '—'}
                     </div>
                     {!order.project && (order.recipientName || order.recipientPhone) && (
                       <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                         {[order.recipientName, order.recipientPhone].filter(Boolean).join(' · ')}
                       </div>
                     )}
                   </div>
                 </div>
                 <div style={{ display: 'flex', gap: 12 }}>
                   <Calendar size={18} color="var(--accent)" />
                   <div>
                     <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Scheduled Date</div>
                     <div style={{ fontSize: 14, fontWeight: 600 }}>{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'ASAP'}</div>
                   </div>
                 </div>
                 <div style={{ display: 'flex', gap: 12 }}>
                   <Truck size={18} color="var(--accent)" />
                   <div>
                     <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Logistics Type</div>
                     <div style={{ fontSize: 14, fontWeight: 600 }}>{order.deliveryType}</div>
                   </div>
                 </div>
                 {order.bookedByContractor && order.driver && (
                   <div style={{ display: 'flex', gap: 12 }}>
                     <User size={18} color="var(--accent)" />
                     <div>
                       <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pre-booked Driver</div>
                       <div style={{ fontSize: 14, fontWeight: 600 }}>
                         {order.driver.driverProfile?.firstName} {order.driver.driverProfile?.lastName}
                         {order.driverFee != null && (
                           <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>· GH₵{order.driverFee}</span>
                         )}
                       </div>
                     </div>
                   </div>
                 )}
                 {order.notes && (
                   <div style={{ display: 'flex', gap: 12 }}>
                     <FileText size={18} color="var(--accent)" />
                     <div>
                       <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Driver Notes</div>
                       <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{order.notes}</div>
                     </div>
                   </div>
                 )}
               </div>
            </div>
          </div>

          {/* ESCROW STATUS & ACTIONS */}
          <div className="card" style={{ border: order.status === 'DELIVERED' ? '1px solid var(--accent)' : '1px solid var(--border-subtle)' }}>
            <div className="card-header" style={{ background: order.status === 'DELIVERED' ? 'var(--accent-muted)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} color="var(--accent)" />
                <span className="card-title">Escrow Protection</span>
              </div>
            </div>
            <div style={{ padding: 24 }}>
               <div style={{ textAlign: 'center', marginBottom: 24 }}>
                 <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>ESCROW STATUS</div>
                 <div style={{ fontSize: 24, fontWeight: 900, color: order.escrowStatus === 'RELEASED' ? 'var(--success)' : 'var(--warning)' }}>
                   {order.escrowStatus}
                 </div>
                 <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
                   {order.escrowStatus === 'HELD' 
                     ? 'Funds are safely held. They will only be released to the supplier once you verify receipt.'
                     : 'Payment has been completed. Thank you for using our escrow system.'}
                 </p>
               </div>

               {order.status === 'DELIVERED' && order.escrowStatus === 'HELD' && (
                 <button 
                  onClick={handleRelease} 
                  className="btn btn-primary" 
                  style={{ width: '100%', height: 52 }}
                  disabled={releasing}
                 >
                   {releasing ? 'Releasing...' : 'Verify & Release Funds'}
                 </button>
               )}
               
               {order.status !== 'DELIVERED' && order.escrowStatus === 'HELD' && (
                 <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                   Funds release will be available after delivery confirmation.
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
