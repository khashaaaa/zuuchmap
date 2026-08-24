import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** Shared closing band for the signed-out pages — the public shell should
    end with intention on every route, not only the landing. */
export default function PublicFooter() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-border/20">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted">
          ZuuchMap — {t('landing.footerTagline')}
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
          <Link to="/browse" className="hover:text-text transition-colors">{t('landing.browse')}</Link>
          <Link to="/privacy" className="hover:text-text transition-colors">{t('privacy.title')}</Link>
          <Link to="/terms" className="hover:text-text transition-colors">{t('terms.title')}</Link>
          <Link to="/help" className="hover:text-text transition-colors">{t('helpSupport.title')}</Link>
        </nav>
      </div>
    </footer>
  )
}
