import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/store'
import { usersApi } from '@/lib/api'
import { goBack } from '@/lib/utils'
import Button from '@/components/Button'
import AlertBanner from '@/components/AlertBanner'
import ConfirmModal from '@/components/ConfirmModal'
import PageHeader from '@/components/PageHeader'
import { toast } from 'sonner'

export default function AccountDeletion() {
  const { t } = useTranslation()
  const { token, logout } = useAuthStore()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)

  const deleteMut = useMutation({
    mutationFn: usersApi.deleteAccount,
    onSuccess: () => {
      toast.success(t('accountDeletion.deleted'))
      logout()
      navigate('/login', { replace: true })
    },
    onError: () => toast.error(t('accountDeletion.error')),
  })

  return (
    <div className="min-h-screen bg-background p-3 md:p-6">
      <div className="max-w-2xl mx-auto">
        <PageHeader title={t('accountDeletion.title')} icon={Trash2} onBack={() => goBack(navigate, '/')} />

        <AlertBanner variant="danger" title={t('accountDeletion.warningTitle')} icon={AlertTriangle} className="mb-4">
          {t('accountDeletion.warning')}
        </AlertBanner>

        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8 space-y-5 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-text mb-1.5">{t('accountDeletion.whatTitle')}</h2>
            <p className="text-base text-text leading-relaxed max-w-xl">{t('accountDeletion.what')}</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text mb-1.5">{t('accountDeletion.howTitle')}</h2>
            <p className="text-base text-text leading-relaxed max-w-xl">{t('accountDeletion.how')}</p>
          </div>
        </div>

        {token ? (
          <Button
            variant="danger"
            size="lg"
            onClick={() => setConfirm(true)}
            className="w-full"
          >
            <Trash2 size={16} />
            {t('accountDeletion.confirmBtn')}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate('/login')}
            className="w-full"
          >
            {t('accountDeletion.loginToDelete')}
          </Button>
        )}

        <ConfirmModal
          open={confirm}
          onClose={() => setConfirm(false)}
          title={t('accountDeletion.title')}
          message={t('accountDeletion.confirmQuestion')}
          confirmLabel={t('common.delete')}
          loadingLabel={t('common.loading')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => deleteMut.mutate()}
          isPending={deleteMut.isPending}
        />
      </div>
    </div>
  )
}
