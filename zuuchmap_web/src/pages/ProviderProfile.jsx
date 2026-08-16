import { useQuery } from '@tanstack/react-query'
import { Trash2, Building2, LifeBuoy, Shield, FileText } from 'lucide-react'
import SettingsMenu from '@/components/SettingsMenu'
import { useTranslation } from 'react-i18next'
import { postsApi, likesApi } from '@/lib/api'
import { useAuthStore as useStore } from '@/store'
import { formatDate } from '@/lib/utils'
import { useProfileForm } from '@/hooks/useProfileForm'
import PageHeader from '@/components/PageHeader'
import Button from '@/components/Button'
import ConfirmModal from '@/components/ConfirmModal'
import Input from '@/components/Input'
import AvatarPicker from '@/components/AvatarPicker'
import StatCard from '@/components/StatCard'

export default function ProviderProfile() {
  const { t } = useTranslation()
  const { isAdmin } = useStore()
  const { form, setForm, avatar, setAvatar, avatarUrl, src, mut, deleteMut, handleSubmit, confirmDelete, setConfirmDelete, user } = useProfileForm()

  const isProvider = !isAdmin && user?.type === 'PROVIDER'

  const { data: myPosts } = useQuery({
    queryKey: ['my-posts'],
    queryFn: postsApi.getMine,
    enabled: isProvider,
  })

  const { data: likedPosts } = useQuery({
    queryKey: ['liked'],
    queryFn: likesApi.getLiked,
    enabled: isAdmin,
  })

  const totalPosts = myPosts?.length ?? 0
  const activePosts = myPosts?.filter((p) => p.status === 'ACTIVE').length ?? 0
  const savedCount = likedPosts?.length ?? 0

  return (
    <div className="max-w-md">
      <PageHeader title={t('profile.title')} />

      {isProvider && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard label={t('profile.totalPosts')} value={totalPosts} />
          <StatCard label={t('profile.activePosts')} value={activePosts} color="text-success" />
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 gap-3 mb-4">
          <StatCard label={t('nav.saved')} value={savedCount} />
        </div>
      )}

      {src?.date_created && (
        <p className="text-xs text-muted mb-4">
          {t('profile.memberSince')}: {formatDate(src.date_created)}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AvatarPicker
          previewUrl={avatarUrl}
          profilePicture={src?.profile_picture}
          name={src?.given_name}
          onChange={setAvatar}
        />
        {[
          [t('profile.parentName'), 'parent_name', true],
          [t('profile.givenName'), 'given_name', true],
          [t('profile.emailAddress'), 'email'],
          [t('profile.address'), 'address'],
        ].map(([label, key, req]) => (
          <div key={key}>
            <label className="text-xs text-muted block mb-1.5">
              {label}{req && <span className="text-danger"> *</span>}
            </label>
            <Input
              type="text"
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
        <div>
          <label className="text-xs text-muted block mb-1.5">{t('profile.phone')}</label>
          <Input value={user?.phone_number ?? ''} disabled className="text-muted" />
        </div>
        <Button type="submit" size="lg" disabled={mut.isPending} className="w-full">
          {mut.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </form>

      <SettingsMenu
        className="mt-4"
        items={[
          ...(isProvider ? [{ to: '/provider/company', label: t('nav.company'), icon: Building2 }] : []),
          { to: '/help', label: t('profile.helpSupport'), icon: LifeBuoy },
          { to: '/privacy', label: t('profile.privacy'), icon: Shield },
          { to: '/terms', label: t('profile.terms'), icon: FileText },
          { label: t('profile.deleteAccount'), icon: Trash2, onClick: () => setConfirmDelete(true), variant: 'danger' },
        ]}
      />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('accountDeletion.title')}
        message={t('accountDeletion.confirmQuestion')}
        confirmLabel={t('common.delete')}
        loadingLabel={t('common.loading')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => deleteMut.mutate()}
        isPending={deleteMut.isPending}
      />
    </div>
  )
}
