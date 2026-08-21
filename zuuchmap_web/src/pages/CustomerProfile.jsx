import { useQuery } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { likesApi } from '@/lib/api'
import ProfileBase from '@/components/ProfileBase'
import StatCard from '@/components/StatCard'

export default function CustomerProfile() {
  const { t } = useTranslation()

  const { data: likedPosts } = useQuery({
    queryKey: ['liked-posts'],
    queryFn: likesApi.getLiked,
  })

  return (
    <ProfileBase
      stats={
        <div className="grid grid-cols-1 gap-3 mb-4">
          <StatCard label={t('nav.saved')} value={likedPosts?.length ?? 0} />
        </div>
      }
      extraMenuItems={[{ to: '/customer/saved', label: t('nav.saved'), icon: Heart }]}
    />
  )
}
