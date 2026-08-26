import { NavLink, Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import {
  LayoutDashboard, FileText, Users, Map, Heart, User, Building2,
  LogOut, ChevronRight, Search, Tag, Plus, CalendarRange, BarChart3, BellRing,
  MessageSquare, Flag, CreditCard,
} from 'lucide-react'
import { useAuthStore } from '../store'
import { usersApi } from '@/lib/api'
import UserAvatar from './UserAvatar'
import ConfirmModal from './ConfirmModal'

function buildNav(t) {
  return {
    admin: [
      { to: '/admin', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
      { to: '/admin/posts', label: t('nav.posts'), icon: FileText },
      { to: '/admin/users', label: t('nav.users'), icon: Users },
      { to: '/admin/categories', label: t('admin.categories'), icon: Tag },
      { to: '/admin/analytics', label: t('analytics.title'), icon: BarChart3 },
      { to: '/admin/reports', label: t('report.queue'), icon: Flag },
      { to: '/admin/profile', label: t('nav.profile'), icon: User },
    ],
    provider: [
      { to: '/provider', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
      { to: '/provider/posts', label: t('nav.myPosts'), icon: FileText, end: true },
      { to: '/provider/posts/new', label: t('posts.add'), icon: Plus },
      { to: '/provider/bookings', label: t('booking.receivedBookings'), icon: CalendarRange },
      { to: '/messages', label: t('messages.title'), icon: MessageSquare },
      { to: '/provider/billing', label: t('billing.title'), icon: CreditCard },
      { to: '/provider/company', label: t('nav.company'), icon: Building2 },
      { to: '/provider/profile', label: t('nav.profile'), icon: User },
    ],
    customer: [
      { to: '/customer', label: t('nav.dashboard'), icon: LayoutDashboard, end: true },
      { to: '/customer/browse', label: t('nav.browse'), icon: Search },
      { to: '/customer/map', label: t('nav.map'), icon: Map },
      { to: '/customer/saved', label: t('nav.saved'), icon: Heart },
      { to: '/customer/saved-searches', label: t('savedSearch.title'), icon: BellRing },
      { to: '/customer/bookings', label: t('booking.myBookings'), icon: CalendarRange },
      { to: '/messages', label: t('messages.title'), icon: MessageSquare },
      { to: '/customer/profile', label: t('nav.profile'), icon: User },
    ],
  }
}

function NavItem({ to, label, icon: Icon, end, onClick, indicatorId }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `relative flex items-center gap-3 min-h-touch px-3 py-2.5 rounded-btn text-sm transition-colors ${
          isActive ? 'text-primary-text font-medium' : 'text-muted hover:text-text hover:bg-surface2'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={indicatorId}
              transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 35 }}
              className="absolute inset-0 rounded-btn bg-primary/15"
              aria-hidden="true"
            />
          )}
          <Icon size={18} className="relative shrink-0" />
          <span className="relative flex-1 truncate">{label}</span>
          <ChevronRight size={14} className="relative opacity-50 shrink-0" />
        </>
      )}
    </NavLink>
  )
}

export default function AppSidebar({ onNavigate }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, isAdmin, logout } = useAuthStore()
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: usersApi.getProfile, staleTime: 30_000 })
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  // The sidebar mounts twice (desktop + mobile drawer) — a per-instance id
  // keeps each indicator gliding within its own nav.
  const indicatorId = useId()
  const navMap = useMemo(() => buildNav(t), [t])
  const nav = isAdmin ? navMap.admin : user?.type === 'PROVIDER' ? navMap.provider : navMap.customer
  const isAdminProvider = isAdmin && user?.type === 'PROVIDER'
  const role = isAdmin ? t('admin.role') : user?.type === 'PROVIDER' ? t('onboarding.provider') : t('onboarding.customer')
  const profilePath = isAdmin ? '/admin/profile' : user?.type === 'PROVIDER' ? '/provider/profile' : '/customer/profile'
  const displayUser = profile ?? user

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex flex-col w-60 h-full bg-surface border-r border-border/20 shadow-card shrink-0"
    >
      <div className="h-14 px-4 flex flex-col justify-center border-b border-border/50 overflow-hidden">
        <h1 className="text-lg md:text-xl font-bold text-primary-text tracking-tight leading-tight">ZuuchMap</h1>
        {/* One line, ellipsized — the EN tagline is long enough to wrap and
            spill past the fixed-height header into the nav below otherwise. */}
        <p className="text-[11px] leading-tight text-muted truncate">{t('landing.footerTagline')}</p>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((item) => (
          <NavItem key={item.to} {...item} onClick={onNavigate} indicatorId={indicatorId} />
        ))}
        {isAdminProvider && (
          <>
            <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted uppercase tracking-wider">{t('onboarding.provider')}</p>
            <NavItem to="/provider/posts" end label={t('nav.myPosts')} icon={FileText} onClick={onNavigate} indicatorId={indicatorId} />
            <NavItem to="/provider/posts/new" label={t('posts.add')} icon={Plus} onClick={onNavigate} indicatorId={indicatorId} />
            <NavItem to="/provider/company" label={t('nav.company')} icon={Building2} onClick={onNavigate} indicatorId={indicatorId} />
          </>
        )}
      </nav>
      <div className="p-3 border-t border-border/50">
        <Link
          to={profilePath}
          onClick={onNavigate}
          className="flex items-center gap-3 min-h-touch px-3 py-2 mb-1 rounded-btn hover:bg-surface2 transition-colors"
        >
          <UserAvatar
            src={displayUser?.profile_picture}
            name={displayUser?.given_name ?? displayUser?.phone_number}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{displayUser?.given_name || displayUser?.phone_number}</p>
            <p className="text-xs text-muted">{role}</p>
          </div>
        </Link>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-3 w-full min-h-touch px-3 py-2 rounded-btn text-sm text-muted hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <LogOut size={16} />
          {t('nav.logout')}
        </button>
      </div>
      <ConfirmModal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title={t('nav.logoutConfirmTitle')}
        message={t('nav.logoutConfirmMessage')}
        confirmLabel={t('nav.logout')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => { setShowLogoutConfirm(false); logout(); navigate('/login', { replace: true }) }}
      />
    </motion.aside>
  )
}
