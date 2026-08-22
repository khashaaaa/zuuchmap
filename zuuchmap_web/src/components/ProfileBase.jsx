import { Trash2, LifeBuoy, Shield, FileText } from 'lucide-react'
import SettingsMenu from '@/components/SettingsMenu'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/utils'
import { useProfileForm } from '@/hooks/useProfileForm'
import Button from '@/components/Button'
import Input from '@/components/Input'
import PageHeader from '@/components/PageHeader'
import ConfirmModal from '@/components/ConfirmModal'
import AvatarPicker from '@/components/AvatarPicker'
import ErrorState from '@/components/ErrorState'

/**
 * The whole profile page minus the role-specific parts. CustomerProfile and
 * ProviderProfile were byte-identical apart from the stats row and one
 * settings item — they pass those in instead of copying the page.
 */
export default function ProfileBase({ stats = null, extraMenuItems = [] }) {
  const { t } = useTranslation()
  const { form, setForm, setAvatar, avatarUrl, src, mut, deleteMut, handleSubmit, confirmDelete, setConfirmDelete, user, profileLoading, profileError, refetchProfile } = useProfileForm()

  // The form is the profile — never show it empty while the real values are in
  // flight, and never let a failed load save blanks over the account.
  if (profileLoading) return (
    <div className="max-w-md">
      <PageHeader title={t('profile.title')} />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 skeleton rounded-btn" />
        ))}
      </div>
    </div>
  )
  if (profileError) return (
    <div className="max-w-md">
      <PageHeader title={t('profile.title')} />
      <ErrorState onRetry={refetchProfile} />
    </div>
  )

  return (
    <div className="max-w-md">
      <PageHeader title={t('profile.title')} />

      {stats}

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
        {/* The 4th slot is the input type — a bare "text" email field gets the
            wrong mobile keyboard and no browser-side validation. */}
        {[
          [t('profile.parentName'), 'parent_name', true, 'text'],
          [t('profile.givenName'), 'given_name', true, 'text'],
          [t('profile.emailAddress'), 'email', false, 'email'],
          [t('profile.address'), 'address', false, 'text'],
        ].map(([label, key, req, inputType]) => (
          <div key={key}>
            <label className="text-xs text-muted block mb-1.5">
              {label}{req && <span className="text-danger"> *</span>}
            </label>
            <Input
              type={inputType}
              value={form[key]}
              required={Boolean(req)}
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
          ...extraMenuItems,
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
