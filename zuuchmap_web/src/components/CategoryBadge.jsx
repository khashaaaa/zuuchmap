import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getCategoryLabel } from '../lib/utils'
import { categoryApi } from '../lib/api'

export default function CategoryBadge({ category }) {
  const { t } = useTranslation()
  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })

  const label = getCategoryLabel(category, t, schemas)

  return (
    <span className="inline-block px-2 py-0.5 text-xs rounded-md bg-primary/10 text-primary border border-primary/20 font-medium">
      {label}
    </span>
  )
}
