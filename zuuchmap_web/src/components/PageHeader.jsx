import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function PageHeader({ title, description, action, icon: Icon, onBack }) {
  const { t } = useTranslation()

  return (
    <div className="mb-6">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors mb-3"
        >
          <ArrowLeft size={15} /> {t('common.back')}
        </button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2.5">
          {Icon && <Icon size={20} className="text-primary shrink-0" />}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-text break-words">{title}</h1>
            {description && <p className="text-sm md:text-base text-muted mt-0.5">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
