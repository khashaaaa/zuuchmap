import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Shield, FileText } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { goBack } from '@/lib/utils'

// Section key order and header icon per policy document.
const DOCS = {
  privacy: { icon: Shield, sections: ['data', 'use', 'share', 'delete'] },
  terms: { icon: FileText, sections: ['accept', 'users', 'listingLifetime', 'content', 'liability'] },
}

function Section({ title, children }) {
  return (
    <div className="mb-5 last:mb-0">
      <h2 className="text-sm font-semibold text-text mb-1.5">{title}</h2>
      <p className="text-base text-text leading-relaxed max-w-xl">{children}</p>
    </div>
  )
}

// Serves /privacy and /terms — same layout, different i18n namespace.
export default function PolicyPage({ doc = 'privacy' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { icon, sections } = DOCS[doc] ?? DOCS.privacy

  return (
    <div className="min-h-screen bg-background p-3 md:p-6">
      <div className="max-w-2xl mx-auto">
        <PageHeader title={t(`${doc}.title`)} icon={icon} onBack={() => goBack(navigate, '/')} />
        <p className="text-xs text-muted -mt-4 mb-6">{t(`${doc}.effective`)}</p>
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-6 md:p-8">
          <p className="text-base text-text leading-relaxed mb-6 max-w-xl">{t(`${doc}.intro`)}</p>
          {sections.map((key) => (
            <Section key={key} title={t(`${doc}.${key}Title`)}>{t(`${doc}.${key}Text`)}</Section>
          ))}
          <div className="pt-4 border-t border-border/50 mt-5">
            <p className="text-xs text-muted">{t(`${doc}.contact`)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
