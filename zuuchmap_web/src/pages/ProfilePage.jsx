import { useQuery } from '@tanstack/react-query'
import { Building2, Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usersApi, likesApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import ProfileBase from '@/components/ProfileBase'
import StatCard from '@/components/StatCard'
import SavedSearches from '@/components/SavedSearches'

/**
 * One profile page for every role: the form is the same, only the stats above
 * it and the extra menu entries differ. An admin who is also a provider sees
 * the admin variant — their listings live under /provider.
 */
export default function ProfilePage() {
  const { t } = useTranslation()
  const { isAdmin, user, token } = useAuthStore()
  const isProvider = !isAdmin && user?.type === 'PROVIDER'
  const isCustomer = !isAdmin && user?.type === 'CUSTOMER'

  // The engine's counters (`countActivePosts`, the definition the quota is
  // enforced against). Counting `getMine` here read expired posts as active
  // and dropped RENTED ones, so the web said 21 where the app and the quota
  // banner said 25. Keyed under 'my-posts' so post mutations invalidate it.
  const { data: postCounts } = useQuery({
    queryKey: ['my-posts', 'counts'],
    queryFn: usersApi.getPostCounts,
    enabled: isProvider,
  })

  // The engine's own total, not the length of a page of it. This read
  // `getLiked().length`, which rode the default limit of 20 — so a customer
  // with more saves than that was told "20" here and shown a different, larger
  // number by the app's profile, which has always read the total.
  const { data: likedCount } = useQuery({
    queryKey: ['liked-count'],
    queryFn: likesApi.count,
    // Gated on the token as well as the role: a JWT-only endpoint must never
    // be asked for on behalf of a visitor with no session — the answer is a
    // 401 that the response interceptor reads as a session ending.
    enabled: Boolean(token) && isCustomer,
  })

  // Undefined until the count lands: StatCard reads that as "—", where a
  // default of 0 flashed a wrong number first.
  const totalPosts = postCounts?.totalPosts
  const activePosts = postCounts?.activePosts

  let stats
  if (isProvider) {
    stats = (
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label={t('profile.totalPosts')} value={totalPosts} />
        <StatCard label={t('profile.activePosts')} value={activePosts} color="text-success" />
      </div>
    )
  } else if (isCustomer) {
    // Customers only. An admin cannot save a listing, so theirs was a tile
    // that read "Хадгалсан 0" and could never read anything else.
    stats = (
      <div className="grid grid-cols-1 gap-3 mb-4">
        <StatCard label={t('nav.saved')} value={likedCount} />
        <SavedSearches />
      </div>
    )
  }

  const extraMenuItems = isProvider
    ? [{ to: '/provider/company', label: t('nav.company'), icon: Building2 }]
    : isCustomer
      ? [{ to: '/customer/saved', label: t('nav.saved'), icon: Heart }]
      : []

  return <ProfileBase stats={stats} extraMenuItems={extraMenuItems} />
}
