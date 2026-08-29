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
  const { isAdmin, user } = useAuthStore()
  const isProvider = !isAdmin && user?.type === 'PROVIDER'
  const isCustomer = !isAdmin && user?.type === 'CUSTOMER'

  const { data: myPosts } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
    enabled: isProvider,
  })

  const { data: likedPosts } = useQuery({
    queryKey: ['liked-posts'],
    queryFn: likesApi.getLiked,
    enabled: !isProvider,
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
        <StatCard label={t('nav.saved')} value={likedPosts?.length ?? 0} />
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
