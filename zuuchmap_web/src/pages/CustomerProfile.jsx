import { useQuery } from '@tanstack/react-query'
import { Trash2, Heart, LifeBuoy, Shield, FileText } from 'lucide-react'
import SettingsMenu from '@/components/SettingsMenu'
import { useTranslation } from 'react-i18next'
import { likesApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useProfileForm } from '@/hooks/useProfileForm'
import Button from '@/components/Button'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import ConfirmModal from '@/components/ConfirmModal'
import AvatarPicker from '@/components/AvatarPicker'
import StatCard from '@/components/StatCard'

export default function CustomerProfile() {
  const { t } = useTranslation()
  const { form, setForm, avatar, setAvatar, avatarUrl, src, mut, deleteMut, handleSubmit, confirmDelete, setConfirmDelete, user } = useProfileForm()

  const { data: likedPosts } = useQuery({
    queryKey: ['liked'],
    queryFn: likesApi.getLiked,
  })

  const savedCount = likedPosts?.length ?? 0

  return (
    <div className="max-w-md">
      <PageHeader title={t('profile.title')} />

      <div className="grid grid-cols-1 gap-3 mb-4">
        <StatCard label={t('nav.saved')} value={savedCount} />
      </div>

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
          { to: '/customer/saved', label: t('nav.saved'), icon: Heart },
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
