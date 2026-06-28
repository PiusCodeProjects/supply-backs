import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Truck,
  Wallet,
  MessageSquare,
  User,
} from 'lucide-react';

export const NAV_ITEMS = [
  { label: 'Overview',          path: '/dashboard',                  icon: LayoutDashboard, desc: 'Dashboard home' },
  { label: 'Inventory',         path: '/dashboard/inventory',        icon: Package,         desc: 'Manage catalog items' },
  { label: 'Orders',            path: '/dashboard/fulfillment',      icon: ClipboardList,   desc: 'Accept and dispatch orders' },
  { label: 'Fleet Management',  path: '/dashboard/drivers',          icon: Truck,           desc: 'Manage your drivers' },
  { label: 'Earnings',          path: '/dashboard/payments',         icon: Wallet,          desc: 'Financials & escrow' },
  { label: 'Messages',          path: '/dashboard/messages',         icon: MessageSquare,   desc: 'Chat with contractors' },
  { label: 'Profile',           path: '/dashboard/profile',          icon: User,            desc: 'Account settings' },
] as const;

export const PAGE_SUBTITLES: Record<string, string> = {
  '/dashboard':             'Operational overview, escrow, and fulfillment at a glance',
  '/dashboard/inventory':   'Manage your product catalog and stock levels',
  '/dashboard/fulfillment': 'Accept incoming orders and dispatch drivers',
  '/dashboard/drivers':     'Monitor your fleet and assign deliveries',
  '/dashboard/payments':    'Track earnings, escrow, and payment history',
  '/dashboard/messages':    'Real-time messaging with contractors',
  '/dashboard/profile':     'Manage your business profile and security',
};
