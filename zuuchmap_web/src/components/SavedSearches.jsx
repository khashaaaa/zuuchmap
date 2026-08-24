import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { BellRing, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { savedSearchApi, categoryApi } from '@/lib/api'
import { getCategoryLabel, getSubcategoryLabel, apiErrorMessage } from '@/lib/utils'

/** Rebuilds the /customer/browse query string a saved search was captured from. */
export function savedSearchToParams(s) {
  const p = new URLSearchParams()
  if (s.category) p.set('category', s.category)
  if (s.subcategory) p.set('subcategory', s.subcategory)
  if (s.province) p.set('province', s.province)
  if (s.district) p.set('district', s.district)
  if (s.q) p.set('q', s.q)
  for (const [k, v] of Object.entries(s.attrs ?? {})) if (v !== '' && v != null) p.set(k, String(v))
  return p
}

export default function SavedSearches({ className = '' }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: searches = [], isLoading } = useQuery({ queryKey: ['saved-searches'], queryFn: savedSearchApi.list })
  const { data: schemas = [] } = useQuery({ queryKey: ['categories'], queryFn: categoryApi.getAll, staleTime: 5 * 60_000 })

  const del = useMutation({
    mutationFn: savedSearchApi.remove,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-searches'] }); toast.success(t('savedSearch.deleted')) },
    onError: (e) => toast.error(apiErrorMessage(e, t, t('common.error'))),
  })

  const summary = (s) => {
    const schema = schemas.find((x) => x.key === s.category)
    const bits = [
      s.category && getCategoryLabel(s.category, t, schemas),
      s.subcategory && schema && getSubcategoryLabel(s.subcategory, t, schema),
      s.province && t(`province.${s.province}`, { defaultValue: s.province }),
      s.district && t(`district.${s.district}`, { defaultValue: s.district }),
      s.q && `“${s.q}”`,
      ...Object.entries(s.attrs ?? {}).map(([k, v]) => `${k.replace(/^attr\./, '')}: ${v}`),
    ].filter(Boolean)
    return bits.length ? bits.join(' · ') : t('savedSearch.everything')
  }

  return (
    <section className={`bg-surface border border-border/20 shadow-card rounded-card p-4 ${className}`} aria-labelledby="saved-searches-title">
      <div className="flex items-center gap-2 mb-1">
        <BellRing size={15} className="text-primary-text" aria-hidden="true" />
        <h2 id="saved-searches-title" className="text-sm font-semibold text-text">{t('savedSearch.title')}</h2>
        <span className="text-xs text-muted ml-auto tabular-nums">{searches.length}/10</span>
      </div>
      <p className="text-xs text-muted mb-3">{t('savedSearch.hint')}</p>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-11 skeleton rounded-btn" />)}</div>
      ) : searches.length === 0 ? (
        <p className="text-xs text-muted italic">{t('savedSearch.empty')}</p>
      ) : (
        <ul className="divide-y divide-border/20">
          {searches.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-1.5">
              <Link
                to={`/customer/browse?${savedSearchToParams(s).toString()}`}
                className="flex-1 min-w-0 flex items-center gap-2.5 rounded-btn px-2 py-1.5 -mx-2 hover:bg-surface2 transition-colors group"
              >
                <Search size={14} className="text-muted group-hover:text-primary-text shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text truncate">{s.name}</span>
                  <span className="block text-xs text-muted truncate">{summary(s)}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => del.mutate(s.id)}
                disabled={del.isPending && del.variables === s.id}
                aria-label={t('common.delete')}
                title={t('common.delete')}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-btn text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
