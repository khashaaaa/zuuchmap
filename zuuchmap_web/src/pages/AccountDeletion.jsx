import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/store'
import { usersApi } from '@/lib/api'
import Button from '@/components/Button'
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
        <PageHeader title={t('accountDeletion.title')} icon={Trash2} onBack={() => navigate(-1)} />

        <div className="flex gap-3 bg-danger/10 border border-danger/30 rounded-card p-4 mb-4">
          <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger mb-1">{t('accountDeletion.warningTitle')}</p>
            <p className="text-sm text-muted">{t('accountDeletion.warning')}</p>
          </div>
        </div>

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
