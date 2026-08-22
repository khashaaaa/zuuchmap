import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { postsApi, likesApi } from '@/lib/api'
import { useAuthStore } from '@/store'
import ProfileBase from '@/components/ProfileBase'
import StatCard from '@/components/StatCard'

export default function ProviderProfile() {
  const { t } = useTranslation()
  const { isAdmin, user } = useAuthStore()

  const isProvider = !isAdmin && user?.type === 'PROVIDER'

  const { data: myPosts } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
    enabled: isProvider,
  })

  const { data: likedPosts } = useQuery({
    queryKey: ['liked-posts'],
    queryFn: likesApi.getLiked,
    enabled: isAdmin,
  })

  const totalPosts = myPosts?.length ?? 0
  // Matches the engine's counter: approved AND active, not merely active.
  const activePosts = myPosts?.filter((p) => p.approval_status === 'APPROVED' && p.status === 'ACTIVE').length ?? 0

  return (
    <ProfileBase
      stats={
        <>
          {isProvider && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <StatCard label={t('profile.totalPosts')} value={totalPosts} />
              <StatCard label={t('profile.activePosts')} value={activePosts} color="text-success" />
            </div>
          )}
          {isAdmin && (
            <div className="grid grid-cols-1 gap-3 mb-4">
              <StatCard label={t('nav.saved')} value={likedPosts?.length ?? 0} />
            </div>
          )}
        </>
      }
      extraMenuItems={isProvider ? [{ to: '/provider/company', label: t('nav.company'), icon: Building2 }] : []}
    />
  )
}
