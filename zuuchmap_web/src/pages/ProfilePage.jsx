import { useQuery } from '@tanstack/react-query'
import { Building2, Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { postsApi, likesApi } from '@/lib/api'
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

  const { data: myPosts } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
    enabled: isProvider,
  })

  // The engine's own total, not the length of a page of it. This read
  // `getLiked().length`, which rode the default limit of 20 — so a customer
  // with more saves than that was told "20" here and shown a different, larger
  // number by the app's profile, which has always read the total.
  const { data: likedCount = 0 } = useQuery({
    queryKey: ['liked-count'],
    queryFn: likesApi.count,
    // Gated on the token as well as the role: a JWT-only endpoint must never
    // be asked for on behalf of a visitor with no session — the answer is a
    // 401 that the response interceptor reads as a session ending.
    enabled: Boolean(token) && !isProvider,
  })

  const totalPosts = myPosts?.length ?? 0
  // Matches the engine's counter: approved AND active, not merely active.
  const activePosts = myPosts?.filter((p) => p.approval_status === 'APPROVED' && p.status === 'ACTIVE').length ?? 0

  let stats
  if (isProvider) {
    stats = (
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label={t('profile.totalPosts')} value={totalPosts} />
        <StatCard label={t('profile.activePosts')} value={activePosts} color="text-success" />
      </div>
    )
  } else {
    stats = (
      <div className="grid grid-cols-1 gap-3 mb-4">
        <StatCard label={t('nav.saved')} value={likedCount} />
        {isCustomer && <SavedSearches />}
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
