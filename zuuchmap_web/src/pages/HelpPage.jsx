import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, Clock, HelpCircle } from 'lucide-react'
import PageHeader from '@/components/PageHeader'

function FaqItem({ q, a }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="text-sm font-semibold text-text mb-1">{q}</h3>
      <p className="text-base text-text leading-relaxed max-w-xl">{a}</p>
    </div>
  )
}

export default function HelpPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background p-3 md:p-6">
      <div className="max-w-2xl mx-auto">
        <PageHeader title={t('helpSupport.title')} icon={HelpCircle} onBack={() => navigate(-1)} />

        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8 mb-6 space-y-4">
          <div className="flex items-center gap-3">
            <Phone size={16} className="text-muted shrink-0" />
            <div>
              <p className="text-xs text-muted">{t('helpSupport.phoneLabel')}</p>
              <a href={`tel:${t('helpSupport.phoneNumber')}`} className="text-sm text-text hover:text-primary">{t('helpSupport.phoneNumber')}</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Mail size={16} className="text-muted shrink-0" />
            <div>
              <p className="text-xs text-muted">{t('helpSupport.emailLabel')}</p>
              <a href={`mailto:${t('helpSupport.emailAddress')}`} className="text-sm text-text hover:text-primary">{t('helpSupport.emailAddress')}</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-muted shrink-0" />
            <div>
              <p className="text-xs text-muted">{t('helpSupport.hoursLabel')}</p>
              <p className="text-sm text-text">{t('helpSupport.hoursText')}</p>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <h2 className="text-sm font-semibold text-text mb-4">{t('helpSupport.faqTitle')}</h2>
          <FaqItem q={t('helpSupport.faq1Q')} a={t('helpSupport.faq1A')} />
          <FaqItem q={t('helpSupport.faq2Q')} a={t('helpSupport.faq2A')} />
          <FaqItem q={t('helpSupport.faq3Q')} a={t('helpSupport.faq3A')} />
          <FaqItem q={t('helpSupport.faq4Q')} a={t('helpSupport.faq4A')} />
        </div>
      </div>
    </div>
  )
}
