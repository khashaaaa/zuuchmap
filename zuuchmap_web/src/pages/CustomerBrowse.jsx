import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { X, Heart } from 'lucide-react'
import { toast } from 'sonner'
import { postsApi, categoryApi, likesApi } from '@/lib/api'
import { debounce, PROVINCES, DISTRICTS, getPostCategory, getCategoryLabel, getSubcategoryLabel, getFieldLabel, getOptionLabel } from '@/lib/utils'
import Input from '@/components/Input'
import SearchBar from '@/components/SearchBar'
import CategoryPills from '@/components/CategoryPills'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Pagination from '@/components/Pagination'
import PostGrid from '@/components/PostGrid'
import { useAuthStore } from '@/store'
import { track } from '@/lib/analytics'

const LIMIT = 12

export default function CustomerBrowse() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Reachable signed-out from /browse — saving is the only gated affordance.
  const isAuthed = useAuthStore((s) => Boolean(s.token))

  // Category and page live in the URL — shareable, survives reload, and the
  // browser back button walks through them. Everything else stays in state.
  const category = searchParams.get('category') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const [subcat, setSubcat] = useState('')
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [attrInputs, setAttrInputs] = useState({})
  const [attrFilters, setAttrFilters] = useState({})
  const [sort, setSort] = useState('')
  const [priceInputs, setPriceInputs] = useState({})
  const [priceFilters, setPriceFilters] = useState({})

  const setPage = useCallback((p) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (p > 1) next.set('page', String(p))
      else next.delete('page')
      return next
    })
  }, [setSearchParams])

  // Filter changes reset pagination without stacking history entries.
  const resetPage = useCallback(() => {
    setSearchParams((prev) => {
      if (!prev.has('page')) return prev
      const next = new URLSearchParams(prev)
      next.delete('page')
      return next
    }, { replace: true })
  }, [setSearchParams])

  const debouncedSearch = useCallback(
    debounce((val) => {
      setSearch(val); resetPage()
      if (val) track('browse.search', { query_length: val.length })
    }, 400),
    [resetPage] // eslint-disable-line
  )

  const handleCategory = useCallback((val) => {
    setSubcat('')
    setAttrInputs({})
    setAttrFilters({})
    setSearchParams(val ? { category: val } : {})
  }, [setSearchParams])

  const applyAttr = useCallback(
    debounce((key, val) => { setAttrFilters((p) => ({ ...p, [key]: val })); resetPage() }, 400),
    [resetPage] // eslint-disable-line
  )

  const handleAttrChange = useCallback((key, val, immediate) => {
    setAttrInputs((p) => ({ ...p, [key]: val }))
    if (immediate) { setAttrFilters((p) => ({ ...p, [key]: val })); resetPage() }
    else applyAttr(key, val)
  }, [applyAttr, resetPage])

  const applyPrice = useMemo(
    () => debounce((key, val) => { setPriceFilters((p) => ({ ...p, [key]: val })); resetPage() }, 400),
    [resetPage] // eslint-disable-line
  )
  const handlePriceChange = useCallback((key, val) => {
    setPriceInputs((p) => ({ ...p, [key]: val }))
    applyPrice(key, val)
  }, [applyPrice])

  // Drop pending debounced calls on unmount (or identity change) — they would
  // otherwise fire setState/setSearchParams into a dead component.
  useEffect(() => () => {
    debouncedSearch.cancel()
    applyAttr.cancel()
    applyPrice.cancel()
  }, [debouncedSearch, applyAttr, applyPrice])

  const handleProvince = useCallback((val) => {
    setProvince(val)
    setDistrict('')
    resetPage()
  }, [resetPage])

  const queryParams = { approval_status: 'APPROVED', page, limit: LIMIT }
  if (category) queryParams.category = category
  if (category && subcat) queryParams.subcategory = subcat
  if (province) queryParams.province = province
  if (district) queryParams.district = district
  if (search) queryParams.q = search
  if (sort) queryParams.sort = sort
  if (priceFilters.min) queryParams.price_min = priceFilters.min
  if (priceFilters.max) queryParams.price_max = priceFilters.max
  if (category) {
    for (const [k, v] of Object.entries(attrFilters)) {
      if (v) queryParams[`attr.${k}`] = v
    }
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['posts', queryParams],
    queryFn: () => postsApi.getAll(queryParams),
    // v5 form of keepPreviousData — the old boolean was silently ignored and
    // page changes blanked the grid.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const { data: schemas = [], isError: schemasError, refetch: refetchSchemas } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })

  const { data: likedIds = [] } = useQuery({
    queryKey: ['liked-ids'],
    queryFn: likesApi.getIds,
    staleTime: 60_000,
    enabled: isAuthed,
  })
  const likedSet = useMemo(() => new Set(likedIds.map(String)), [likedIds])

  const likeMut = useMutation({
    mutationFn: ({ postId, postType, isLiked }) =>
      isLiked ? likesApi.unlike(postType, postId) : likesApi.toggle(postId, postType),
    onSuccess: (_, { isLiked }) => {
      qc.invalidateQueries({ queryKey: ['liked-ids'] })
      qc.invalidateQueries({ queryKey: ['liked-posts'] })
      qc.invalidateQueries({ queryKey: ['like-check'] })
      toast.success(t(isLiked ? 'posts.unsaved' : 'posts.saved'))
    },
    onError: () => toast.error(t('common.error')),
  })

  const posts = Array.isArray(data) ? data : (data?.items ?? [])
  const total = Array.isArray(data) ? data.length : (data?.total ?? 0)

  const clearAll = useCallback(() => {
    setSubcat(''); setProvince(''); setDistrict('')
    setSearchInput(''); setSearch('')
    setAttrInputs({}); setAttrFilters({})
    setSort(''); setPriceInputs({}); setPriceFilters({})
    setSearchParams({}) // drops category + page together
  }, [setSearchParams])

  const schema = useMemo(() => schemas.find((s) => s.key === category), [schemas, category])
  const filterFields = useMemo(() => schema?.fields?.filter((f) => f.filterable) ?? [], [schema])

  const hasFilters = category || subcat || province || district || search || sort
    || Object.values(priceFilters).some(Boolean) || Object.values(attrFilters).some(Boolean)

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <aside className="w-full lg:w-64 shrink-0 lg:sticky lg:top-6 space-y-5">
        <SearchBar
          value={searchInput}
          onChange={(e) => { setSearchInput(e.target.value); debouncedSearch(e.target.value) }}
          placeholder={t('filter.searchPlaceholder')}
          className="w-full"
        />

        <Input as="select" value={sort} onChange={(e) => { setSort(e.target.value); resetPage() }} className="bg-surface rounded-btn w-full">
          <option value="">{t('sort.newest')}</option>
          <option value="price_asc">{t('sort.priceAsc')}</option>
          <option value="price_desc">{t('sort.priceDesc')}</option>
          <option value="views">{t('sort.views')}</option>
        </Input>

        <div>
          <p className="text-xs text-muted mb-1">{t('filter.price')}</p>
          <div className="flex gap-2">
            <Input type="number" inputMode="numeric" value={priceInputs.min ?? ''} placeholder={t('filter.min')} onChange={(e) => handlePriceChange('min', e.target.value)} className="bg-surface rounded-btn w-full" />
            <Input type="number" inputMode="numeric" value={priceInputs.max ?? ''} placeholder={t('filter.max')} onChange={(e) => handlePriceChange('max', e.target.value)} className="bg-surface rounded-btn w-full" />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted mb-2">{t('posts.category')}</p>
          {schemasError && schemas.length === 0 && (
            <ErrorState compact onRetry={refetchSchemas} />
          )}
          <CategoryPills
            categories={schemas.filter((s) => s.active).map((s) => ({
              key: s.key,
              label: getCategoryLabel(s.key, t, schemas),
            }))}
            value={category}
            onChange={handleCategory}
            allLabel={t('filter.allCategories')}
            as="button"
            shape="lg"
          />
        </div>

        {schema && (schema.subcategories?.length > 0 || filterFields.length > 0) && (
          <div className="space-y-3">
            {schema.subcategories?.length > 0 && (
              <Input as="select" value={subcat} onChange={(e) => { setSubcat(e.target.value); resetPage() }} className="bg-surface rounded-btn w-full">
                <option value="">{t('posts.subcategory')}</option>
                {schema.subcategories.map((sub) => (
                  <option key={sub.value} value={sub.value}>{getSubcategoryLabel(sub.value, t, schema)}</option>
                ))}
              </Input>
            )}
            {filterFields.map((f) => f.type === 'select' ? (
              <Input as="select" key={f.key} value={attrInputs[f.key] ?? ''} onChange={(e) => handleAttrChange(f.key, e.target.value, true)} className="bg-surface rounded-btn w-full">
                <option value="">{getFieldLabel(f, t)}</option>
                {f.options?.map((o) => <option key={o} value={o}>{getOptionLabel(o, t)}</option>)}
              </Input>
            ) : f.type === 'number' ? (
              <div key={f.key}>
                <p className="text-xs text-muted mb-1">{getFieldLabel(f, t)}</p>
                <div className="flex gap-2">
                  <Input type="number" inputMode="numeric" value={attrInputs[`${f.key}_min`] ?? ''} placeholder={t('filter.min')} onChange={(e) => handleAttrChange(`${f.key}_min`, e.target.value)} className="bg-surface rounded-btn w-full" />
                  <Input type="number" inputMode="numeric" value={attrInputs[`${f.key}_max`] ?? ''} placeholder={t('filter.max')} onChange={(e) => handleAttrChange(`${f.key}_max`, e.target.value)} className="bg-surface rounded-btn w-full" />
                </div>
              </div>
            ) : (
              <Input key={f.key} value={attrInputs[f.key] ?? ''} placeholder={getFieldLabel(f, t)} onChange={(e) => handleAttrChange(f.key, e.target.value)} className="bg-surface rounded-btn w-full" />
            ))}
          </div>
        )}

        <div className="space-y-3">
          <Input as="select" value={province} onChange={(e) => handleProvince(e.target.value)} className="bg-surface rounded-btn w-full">
            <option value="">{t('common.province')}</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{t(`province.${p}`, { defaultValue: p })}</option>)}
          </Input>
          {province === 'ULAANBAATAR' && (
            <Input as="select" value={district} onChange={(e) => { setDistrict(e.target.value); resetPage() }} className="bg-surface rounded-btn w-full">
              <option value="">{t('common.district')}</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{t(`district.${d}`, { defaultValue: d })}</option>)}
            </Input>
          )}
        </div>

        {hasFilters && (
          <button onClick={clearAll} className="flex items-center gap-1 px-3 py-2 text-sm text-muted hover:text-text border border-border/50 rounded-btn w-full justify-center transition-colors">
            <X size={13} /> {t('common.clear')}
          </button>
        )}
      </aside>

      <div className="flex-1 min-w-0 w-full">
        {!isLoading && posts.length > 0 && (
          <p className="text-xs text-muted mb-4">{t('common.total', { count: total })}</p>
        )}
        <PostGrid
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
          isEmpty={posts.length === 0}
          emptyState={<EmptyState title={t('posts.browseEmpty')} description={t('posts.browseEmptyDesc')} />}
          cols={3}
          skeletonCount={LIMIT}
        >
          {posts.map((post, i) => {
            const saved = likedSet.has(String(post.id))
            const postType = getPostCategory(post)
            const isPendingThis = likeMut.isPending && likeMut.variables?.postId === post.id
            return (
              <PostCard
                key={post.id}
                post={post}
                index={i}
                actions={
                  <button
                    onClick={() => {
                      if (!isAuthed) return navigate('/login')
                      likeMut.mutate({ postId: post.id, postType, isLiked: saved })
                    }}
                    disabled={isPendingThis}
                    className={`w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border rounded-btn transition-colors disabled:opacity-50 ${
                      saved
                        ? 'bg-primary/15 text-primary-text border-primary/30 hover:bg-danger/10 hover:text-danger hover:border-danger/30'
                        : 'border-border/50 text-muted hover:text-primary-text hover:border-primary/40'
                    }`}
                  >
                    <Heart size={12} className={isPendingThis ? 'animate-pulse' : ''} fill={saved ? 'currentColor' : 'none'} />
                    {saved ? t('nav.saved') : t('common.save')}
                  </button>
                }
              />
            )
          })}
        </PostGrid>
        {!isLoading && posts.length > 0 && (
          <Pagination page={page} total={total} limit={LIMIT} onChange={setPage}
            labels={{ previous: t('common.previousPage'), next: t('common.nextPage') }} />
        )}
      </div>
    </div>
  )
}
