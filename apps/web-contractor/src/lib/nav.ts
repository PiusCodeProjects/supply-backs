import {
  LayoutDashboard,
  FolderOpen,
  Store,
  Package,
  MapPin,
  MessageSquare,
  User,
} from 'lucide-react';

export const NAV_ITEMS = [
  { label: 'Overview',        path: '/dashboard',                icon: LayoutDashboard, desc: 'Dashboard home' },
  { label: 'My Projects',     path: '/dashboard/projects',       icon: FolderOpen,      desc: 'Manage projects' },
  { label: 'Shop',            path: '/dashboard/shop',           icon: Store,           desc: 'Browse and order materials' },
  { label: 'Orders & Escrow', path: '/dashboard/orders',         icon: Package,         desc: 'Track your orders' },
  { label: 'Live Tracking',   path: '/dashboard/tracking',       icon: MapPin,          desc: 'Delivery map' },
  { label: 'Messages',        path: '/dashboard/messages',       icon: MessageSquare,   desc: 'Chat with suppliers' },
  { label: 'Profile',         path: '/dashboard/profile',        icon: User,            desc: 'Account settings' },
] as const;

export const PAGE_SUBTITLES: Record<string, string> = {
  '/dashboard':              'Project status, procurement, and escrow at a glance',
  '/dashboard/projects':     'Create and manage your construction projects',
  '/dashboard/shop':         'Personal or project shopping — pick a mode at the top',
  '/dashboard/orders':       'Track and manage your orders and escrow',
  '/dashboard/tracking':     'Live delivery map and driver locations',
  '/dashboard/messages':     'Real-time messaging with your suppliers',
  '/dashboard/profile':      'Manage your account settings',
};
