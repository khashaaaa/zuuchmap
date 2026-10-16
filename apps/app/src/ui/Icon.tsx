import type { ComponentType } from 'react';
import { categoryIconFallback } from '@zuuchmap/core';
import {
  AlertTriangle, ArrowLeft, BadgeCheck, BarChart3, Bell, Bookmark, Briefcase, Building2, Calendar, Camera,
  Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleAlert, CircleCheck, Clock, Copy,
  ExternalLink, Eye, FileText, Filter, Flag, Heart, Home, Image, Info, LayoutGrid, List, Locate, LogOut, Map,
  MapPin, Megaphone, MessageCircle, Minus, MoreHorizontal, Package, Pencil, Phone, Plus, RefreshCw, Search, Send,
  Settings, Share2, ShieldCheck, Siren, Navigation, Globe, Lock, SlidersHorizontal, Star, Trash2, TrendingUp, Truck, User, Users, WifiOff, Wrench, X,
  CreditCard, Sparkles, Mail, HelpCircle, UserX, Inbox,
} from 'lucide-react-native';

export interface IconGlyphProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}

/** The icons the product ships, by Lucide kebab name. Anything else falls back to a category family icon. */
const ICONS = {
  plus: Plus, heart: Heart, x: X, clock: Clock, 'circle-alert': CircleAlert, check: Check, calendar: Calendar,
  'badge-check': BadgeCheck, pencil: Pencil, 'circle-check': CircleCheck, 'building-2': Building2, phone: Phone,
  search: Search, 'map-pin': MapPin, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight, list: List, map: Map, minus: Minus, star: Star, 'share-2': Share2, flag: Flag,
  bell: Bell, camera: Camera, send: Send, locate: Locate, 'sliders-horizontal': SlidersHorizontal,
  'message-circle': MessageCircle, bookmark: Bookmark, user: User, home: Home, package: Package, truck: Truck,
  wrench: Wrench, briefcase: Briefcase, image: Image, eye: Eye, 'trash-2': Trash2, 'more-horizontal': MoreHorizontal,
  'arrow-left': ArrowLeft, info: Info, 'alert-triangle': AlertTriangle, 'wifi-off': WifiOff, settings: Settings,
  'log-out': LogOut, 'shield-check': ShieldCheck, 'trending-up': TrendingUp, 'layout-grid': LayoutGrid,
  'file-text': FileText, users: Users, 'bar-chart-3': BarChart3, megaphone: Megaphone, filter: Filter,
  'refresh-cw': RefreshCw, siren: Siren, navigation: Navigation, globe: Globe, lock: Lock, copy: Copy, 'external-link': ExternalLink, 'check-check': CheckCheck, circle: Circle,
  'credit-card': CreditCard, sparkles: Sparkles, mail: Mail, 'help-circle': HelpCircle, 'user-x': UserX, inbox: Inbox,
} satisfies Record<string, ComponentType<IconGlyphProps>>;

export type IconName = keyof typeof ICONS;
const SHIPPED: readonly string[] = Object.keys(ICONS);

export interface IconProps extends IconGlyphProps {
  /** Lucide kebab name. Not in the shipped set (e.g. a legacy admin-entered name) renders the category family icon. */
  name: string;
  /** Category key used to pick the family icon when `name` is unknown. */
  categoryKey?: string | null;
}

export function Icon({ name, categoryKey, size = 24, color, strokeWidth = 2, fill }: IconProps) {
  const resolved = categoryIconFallback(name, categoryKey, SHIPPED);
  const Glyph: ComponentType<IconGlyphProps> = (ICONS as Record<string, ComponentType<IconGlyphProps>>)[resolved] ?? Package;
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} fill={fill ?? 'none'} />;
}
