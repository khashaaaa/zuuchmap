import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellOff, CheckCircle, XCircle, Info } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import EmptyState from '@/components/EmptyState'
import { useAuthStore, useNotificationStore } from '@/store'
import { goBack } from '@/lib/utils'

const KIND_ICON = { success: CheckCircle, error: XCircle, info: Info }
const KIND_CLASS = { success: 'text-success', error: 'text-danger', info: 'text-primary-text' }

/**
 * The full notification history, mirroring the app's `NotificationsScreen`.
 * The header bell keeps its dropdown for the last few; this is where the rest
 * live, split at midnight and tappable through to whatever they are about.
 */
export default function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { isAdmin, user } = useAuthStore()
  const { notifications, markAllRead } = useNotificationStore()

  // Which rows are tinted is decided once, on arrival, and held for the visit.
  // Reading `n.read` directly would work in production but not in development:
  // StrictMode mounts, unmounts and remounts, firing the "mark read on the way
  // out" cleanup below straight away — erasing the unread tint before it has
  // been seen. A snapshot makes the tint independent of when the store updates.
  const [unreadAtArrival] = useState(
    () => new Set(useNotificationStore.getState().notifications.filter((n) => !n.read).map((n) => n.id))
  )
  const [dismissed, setDismissed] = useState(false)
  const showMarkAll = !dismissed && unreadAtArrival.size > 0

  // "approved 3 minutes ago" and "approved 3 weeks ago" are different news —
  // split the stream at midnight so time structure is visible.
  const sections = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const today = []
    const earlier = []
    notifications.forEach((n) => (new Date(n.ts) >= startOfToday ? today : earlier).push(n))
    return [
      ...(today.length ? [{ title: t('notifications.today'), items: today }] : []),
      ...(earlier.length ? [{ title: t('notifications.earlier'), items: earlier }] : []),
    ]
  }, [notifications, t])

  // Mark read on the way out, not on arrival — clearing on mount erases the
  // unread tint before it has been seen and hides the header action entirely.
  useEffect(() => () => markAllRead(), [markAllRead])

  // Mirrors `resolveNotificationRoute` in the app: a post opens the post (in
  // the admin console when that is where the action is), a booking opens the
  // list on the recipient's side.
  const targetFor = (n) => {
    // Messages first: a message notification also carries a postId, and the
    // thread — not the listing — is what the reader is being called to.
    if (n.conversationId) return `/messages/${n.conversationId}`
    if (n.postId) return isAdmin && n.role === 'admin' ? `/admin/posts/${n.postId}` : `/posts/${n.postId}`
    if (n.bookingRole === 'provider') return '/provider/bookings'
    if (n.bookingRole === 'customer') return '/customer/bookings'
    return null
  }

  const stamp = (ts) => {
    const d = new Date(ts)
    const locale = i18n.language === 'mn' ? 'mn-MN' : 'en-GB'
    return `${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} · ${d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`
  }

  const home = isAdmin ? '/admin' : user?.type === 'PROVIDER' ? '/provider' : '/customer'

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('notifications.title')}
        onBack={() => goBack(navigate, home)}
        action={showMarkAll ? (
          <button
            onClick={() => { setDismissed(true); markAllRead() }}
            className="text-sm text-primary-text hover:underline"
          >
            {t('notifications.markAllRead')}
          </button>
        ) : null}
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={t('notifications.empty')}
          description={t('notifications.emptySubtitle')}
        />
      ) : (
        sections.map((section) => (
          <section key={section.title} className="mb-6 last:mb-0">
            <h2 className="text-xs uppercase tracking-wide text-muted mb-2">{section.title}</h2>
            <ul className="surface-card">
              {section.items.map((n) => {
                const Icon = KIND_ICON[n.kind] ?? Info
                const to = targetFor(n)
                // Unread is one signal: a 3px amber rule on the row's leading edge.
                const unread = !dismissed && unreadAtArrival.has(n.id)
                const row = (
                  <div className={`flex gap-3 px-3 py-3 border-l-[3px] ${unread ? 'border-l-primary' : 'border-l-transparent'}`}>
                    <Icon size={20} className={`shrink-0 mt-0.5 ${KIND_CLASS[n.kind] ?? KIND_CLASS.info}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text break-words">{n.message}</p>
                      <p className="text-xs text-muted mt-0.5">{stamp(n.ts)}</p>
                    </div>
                  </div>
                )
                return (
                  <li key={n.id} className="border-b border-border/50 last:border-0">
                    {/* Rows without a target (a broadcast, a stats ping) stay plain. */}
                    {to ? (
                      <button type="button" onClick={() => navigate(to)} className="w-full text-left hover:bg-surface2 transition-colors">
                        {row}
                      </button>
                    ) : row}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
