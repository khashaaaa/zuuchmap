import type { ComponentType, SVGProps } from 'react';
import {
  AlertTriangle, ArrowLeft, BadgeCheck, BarChart3, Bell, Bookmark, Briefcase, Building2, Calendar, CalendarRange, Camera,
  Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleAlert, CircleCheck, Clock, Copy,
  ExternalLink, Eye, FileText, Filter, Flag, Heart, Home, Image, Info, LayoutGrid, List, Loader2, Locate,
  LogOut, Map as MapIcon, MapPin, Megaphone, MessageCircle, MessageSquare, Minus, MoreHorizontal, Package, Pencil, Phone,
  Plus, RefreshCw, Search, Send, Settings, Share2, ShieldCheck, SlidersHorizontal, Star, Trash2, TrendingUp,
  Truck, User, Users, Wifi, WifiOff, Wrench, X, CalendarX, CreditCard, Inbox, Sparkles, Upload,
} from 'lucide-react';
import { categoryIconFallback } from '@zuuchmap/core';
import { cn } from '@/lib/cn';

type LucideComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;

const ICONS = {
  plus: Plus, heart: Heart, x: X, clock: Clock, 'circle-alert': CircleAlert, check: Check, calendar: Calendar,
  'badge-check': BadgeCheck, pencil: Pencil, 'circle-check': CircleCheck, 'building-2': Building2, phone: Phone,
  search: Search, 'map-pin': MapPin, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, list: List, map: MapIcon, minus: Minus, star: Star, 'share-2': Share2, flag: Flag,
  bell: Bell, camera: Camera, send: Send, locate: Locate, 'sliders-horizontal': SlidersHorizontal,
  'message-circle': MessageCircle, bookmark: Bookmark, user: User, home: Home, package: Package, truck: Truck,
  wrench: Wrench, briefcase: Briefcase, image: Image, eye: Eye, 'trash-2': Trash2, 'more-horizontal': MoreHorizontal,
  'arrow-left': ArrowLeft, info: Info, 'alert-triangle': AlertTriangle, 'wifi-off': WifiOff, wifi: Wifi,
  settings: Settings, 'log-out': LogOut, 'shield-check': ShieldCheck, 'trending-up': TrendingUp,
  'layout-grid': LayoutGrid, 'file-text': FileText, users: Users, 'bar-chart-3': BarChart3, megaphone: Megaphone,
  filter: Filter, 'refresh-cw': RefreshCw, copy: Copy, 'external-link': ExternalLink, 'check-check': CheckCheck,
  circle: Circle, 'loader-2': Loader2, 'calendar-range': CalendarRange, 'message-square': MessageSquare,
  'calendar-x': CalendarX, 'credit-card': CreditCard, inbox: Inbox, sparkles: Sparkles, upload: Upload,
} satisfies Record<string, LucideComponent>;

export type IconName = keyof typeof ICONS;
export const SHIPPED_ICONS: ReadonlySet<string> = new Set(Object.keys(ICONS));

export interface IconProps {
  /** Lucide kebab name. Anything not shipped renders the category family's icon. */
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Category key used to pick the family fallback for an unknown `name`. */
  categoryKey?: string;
}

export function Icon({ name, size = 20, className, strokeWidth = 2, categoryKey }: IconProps) {
  const key = SHIPPED_ICONS.has(name) ? name : categoryIconFallback(name, categoryKey, SHIPPED_ICONS);
  const Cmp: LucideComponent = (ICONS as Record<string, LucideComponent>)[key] ?? Package;
  return <Cmp size={size} strokeWidth={strokeWidth} className={cn('shrink-0', className)} aria-hidden="true" focusable="false" />;
}
