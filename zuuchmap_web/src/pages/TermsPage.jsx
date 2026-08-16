import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { FileText } from 'lucide-react'
import PageHeader from '@/components/PageHeader'

function Section({ title, children }) {
  return (
    <div className="mb-5 last:mb-0">
      <h2 className="text-sm font-semibold text-text mb-1.5">{title}</h2>
      <p className="text-base text-text leading-relaxed max-w-xl">{children}</p>
    </div>
  )
}

export default function TermsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background p-3 md:p-6">
      <div className="max-w-2xl mx-auto">
        <PageHeader title={t('terms.title')} icon={FileText} onBack={() => navigate(-1)} />
        <p className="text-xs text-muted -mt-4 mb-6">{t('terms.effective')}</p>
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <p className="text-base text-text leading-relaxed max-w-xl mb-6">{t('terms.intro')}</p>
          <Section title={t('terms.acceptTitle')}>{t('terms.acceptText')}</Section>
          <Section title={t('terms.usersTitle')}>{t('terms.usersText')}</Section>
          <Section title={t('terms.listingLifetimeTitle')}>{t('terms.listingLifetimeText')}</Section>
          <Section title={t('terms.contentTitle')}>{t('terms.contentText')}</Section>
          <Section title={t('terms.liabilityTitle')}>{t('terms.liabilityText')}</Section>
          <div className="pt-4 border-t border-border/50 mt-5">
            <p className="text-xs text-muted">{t('terms.contact')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
