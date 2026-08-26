import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellRing } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import SavedSearches from '@/components/SavedSearches'
import { goBack } from '@/lib/utils'

/**
 * Saved searches on their own route, matching the app's `SavedSearchesScreen`.
 * The list itself is the same component the browse sidebar renders — this only
 * gives it a page to live on, so the two clients have the same set of screens.
 */
export default function SavedSearchesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('savedSearch.title')}
        description={t('savedSearch.hint')}
        icon={BellRing}
        onBack={() => goBack(navigate, '/customer/browse')}
      />
      <SavedSearches headed={false} />
    </div>
  )
}
