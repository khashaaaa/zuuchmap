import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import useOnline from '@/hooks/useOnline'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { X, Heart, BellPlus, WifiOff, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { postsApi, categoryApi, likesApi, savedSearchApi } from '@/lib/api'
import { debounce, PROVINCES, DISTRICTS, getPostCategory, getCategoryLabel, getSubcategoryLabel, getFieldLabel, getOptionLabel, getCategoryColor, apiErrorMessage } from '@/lib/utils'
import Button from '@/components/Button'
import Input from '@/components/Input'
import SearchBar from '@/components/SearchBar'
import CategoryPills from '@/components/CategoryPills'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/components/ErrorState'
import Pagination from '@/components/Pagination'
import PostGrid from '@/components/PostGrid'
import Modal from '@/components/Modal'
import { useAuthStore } from '@/store'
import { track } from '@/lib/analytics'

// 12 turned a 2.4k-listing catalogue into 200+ pages behind prev/next arrows.
// 48 fills the 3-column grid 16 rows deep and cuts the page count by 4x; the
// server caps `limit` at 100 (post.service.ts).
const LIMIT = 48

const ATTR_PREFIX = 'attr.'

export default function CustomerBrowse() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Reachable signed-out from /browse — saving is the only gated affordance.
  const isAuthed = useAuthStore((s) => Boolean(s.token))

  // Every filter lives in the query string, not in component state. Opening a
  // listing unmounts this page, so anything held in state was gone by the time
  // Back returned — the grid came back unfiltered and a filtered view could not
  // be shared, bookmarked or reloaded at all.
  const category = searchParams.get('category') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const subcat = searchParams.get('subcategory') ?? ''
  const province = searchParams.get('province') ?? ''
  const district = searchParams.get('district') ?? ''
  const search = searchParams.get('q') ?? ''
  const sort = searchParams.get('sort') ?? ''
  const priceMin = searchParams.get('price_min') ?? ''
  const priceMax = searchParams.get('price_max') ?? ''
  const priceFilters = useMemo(() => ({ min: priceMin, max: priceMax }), [priceMin, priceMax])
  const attrKey = JSON.stringify(Object.fromEntries(
    [...searchParams.entries()].filter(([k]) => k.startsWith(ATTR_PREFIX)).map(([k, v]) => [k.slice(ATTR_PREFIX.length), v]),
  ))
  const attrFilters = useMemo(() => JSON.parse(attrKey), [attrKey])

  // Typed values keep a local mirror so the box stays responsive while the URL
  // is only written on the debounce. Below, an effect pulls the URL back into
  // the mirror whenever it moves on its own — Back/Forward, Clear, a saved
  // search — so an input never disagrees with the results it produced.
  const [searchInput, setSearchInput] = useState(search)
  const [priceInputs, setPriceInputs] = useState(priceFilters)
  const [attrInputs, setAttrInputs] = useState(attrFilters)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  // The rail is a sidebar from lg up and a disclosure below it, where it used
  // to push every listing a full screen down the page.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const online = useOnline()

  // Each mirror resets when the URL behind it moves on its own — Back/Forward,
  // Clear, a saved search. Done during render (React's documented alternative
  // to a sync-in-effect) so the box never paints a stale frame first, and
  // tracked per source: a price landing must not rewind a half-typed query.
  const [lastQ, setLastQ] = useState(search)
  if (lastQ !== search) { setLastQ(search); setSearchInput(search) }

  const priceKey = `${priceMin}|${priceMax}`
  const [lastPrice, setLastPrice] = useState(priceKey)
  if (lastPrice !== priceKey) { setLastPrice(priceKey); setPriceInputs({ min: priceMin, max: priceMax }) }

  const [lastAttr, setLastAttr] = useState(attrKey)
  if (lastAttr !== attrKey) { setLastAttr(attrKey); setAttrInputs(JSON.parse(attrKey)) }

  /**
   * The one writer. An empty value drops its key rather than writing a blank,
   * and any filter change resets the page cursor — asking for page 9 of a
   * result set that just became 2 pages long is how a filter change lands on an
   * empty grid. Filter edits replace the history entry (Back should not undo
   * one typed character at a time); paging and category push a new one.
   */
  const setParams = useCallback((patch, { push = false } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') next.delete(k)
        else next.set(k, String(v))
      }
      if (!('page' in patch)) next.delete('page')
      return next
    }, { replace: !push })
  }, [setSearchParams])

  const setPage = useCallback((p) => {
    setParams({ page: p > 1 ? p : '' }, { push: true })
  }, [setParams])

  const debouncedSearch = useCallback(
    debounce((val) => {
      setParams({ q: val })
      if (val) track('browse.search', { query_length: val.length })
    }, 400),
    [setParams] // eslint-disable-line
  )

  const handleCategory = useCallback((val) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      // Subcategory and attribute filters belong to the category being left;
      // location, text and price are category-agnostic and survive the switch.
      next.delete('subcategory')
      next.delete('page')
      for (const k of [...next.keys()]) if (k.startsWith(ATTR_PREFIX)) next.delete(k)
      if (val) next.set('category', val)
      else next.delete('category')
      return next
    })
  }, [setSearchParams])

  const applyAttr = useCallback(
    debounce((key, val) => setParams({ [`${ATTR_PREFIX}${key}`]: val }), 400),
    [setParams] // eslint-disable-line
  )

  const handleAttrChange = useCallback((key, val, immediate) => {
    setAttrInputs((p) => ({ ...p, [key]: val }))
    if (immediate) setParams({ [`${ATTR_PREFIX}${key}`]: val })
    else applyAttr(key, val)
  }, [applyAttr, setParams])

  const applyPrice = useMemo(
    () => debounce((key, val) => setParams({ [`price_${key}`]: val }), 400),
    [setParams] // eslint-disable-line
  )
  const handlePriceChange = useCallback((key, val) => {
    setPriceInputs((p) => ({ ...p, [key]: val }))
    applyPrice(key, val)
  }, [applyPrice])

  // Drop pending debounced calls on unmount (or identity change) — they would
  // otherwise fire setSearchParams into a dead component.
  useEffect(() => () => {
    debouncedSearch.cancel()
    applyAttr.cancel()
    applyPrice.cancel()
  }, [debouncedSearch, applyAttr, applyPrice])

  const handleProvince = useCallback((val) => {
    setParams({ province: val, district: '' })
  }, [setParams])

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

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
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

  // What a saved search remembers: the filters the engine can match a new
  // post against. Price bounds and sort are display concerns and stay out.
  const savedSearchBody = useMemo(() => {
    const attrs = {}
    if (category) for (const [k, v] of Object.entries(attrFilters)) if (v) attrs[`attr.${k}`] = v
    return {
      category: category || undefined,
      subcategory: (category && subcat) || undefined,
      province: province || undefined,
      district: district || undefined,
      q: search || undefined,
      attrs: Object.keys(attrs).length ? attrs : undefined,
    }
  }, [category, subcat, province, district, search, attrFilters])
  const canSaveSearch = Boolean(savedSearchBody.category || savedSearchBody.subcategory || savedSearchBody.province
    || savedSearchBody.district || savedSearchBody.q || savedSearchBody.attrs)

  const saveMut = useMutation({
    mutationFn: (name) => savedSearchApi.create({ name, ...savedSearchBody }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-searches'] })
      setSaveOpen(false); setSaveName('')
      toast.success(t('savedSearch.saved'))
    },
    onError: (e) => toast.error(
      e?.response?.data?.message === 'SAVED_SEARCH_LIMIT' ? t('savedSearch.limitReached') : apiErrorMessage(e, t, t('common.error'))
    ),
  })
  const defaultSaveName = () => [
    category && getCategoryLabel(category, t, schemas),
    province && t(`province.${province}`, { defaultValue: province }),
    search,
  ].filter(Boolean).join(' · ')
  const total = Array.isArray(data) ? data.length : (data?.total ?? 0)

  const clearAll = useCallback(() => {
    // Drop anything still in flight first. Without this, a debounced call queued
    // moments before Clear lands 400ms later and re-applies the filter it just
    // cleared — the input reads empty while the results stay filtered.
    debouncedSearch.cancel(); applyAttr.cancel(); applyPrice.cancel()
    setSearchInput(''); setAttrInputs({}); setPriceInputs({ min: '', max: '' })
    setSearchParams({}) // one empty query string drops every filter at once
  }, [setSearchParams, debouncedSearch, applyAttr, applyPrice])

  const schema = useMemo(() => schemas.find((s) => s.key === category), [schemas, category])
  const filterFields = useMemo(() => schema?.fields?.filter((f) => f.filterable) ?? [], [schema])

  const activeFilters = [category, subcat, province, district, search, sort, priceMin, priceMax]
    .filter(Boolean).length + Object.values(attrFilters).filter(Boolean).length
  const hasFilters = activeFilters > 0

  const activeColor = category ? getCategoryColor(category, schemas) : null
  const overline = 'text-[11px] font-semibold uppercase tracking-wider text-muted'

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Below lg the rail is a disclosure. Expanded, it is search + price + all
          thirteen category pills + subcategory + every filterable attribute +
          province + district — a full screen of form standing between the top of
          the page and the first listing. */}
      <button
        type="button"
        onClick={() => setFiltersOpen((o) => !o)}
        aria-expanded={filtersOpen}
        aria-controls="browse-filters"
        className="lg:hidden w-full min-h-touch flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-surface border border-border/20 shadow-card rounded-card text-text hover:border-primary/40 transition-colors"
      >
        <SlidersHorizontal size={15} className="text-muted" aria-hidden="true" />
        {t('common.filter')}
        {activeFilters > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 grid place-items-center rounded-full bg-primary text-on-primary text-[11px] font-semibold tabular-nums">
            {activeFilters}
          </span>
        )}
        <ChevronDown size={16} aria-hidden="true" className={`ml-auto text-muted transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
      </button>

      <aside
        id="browse-filters"
        className={`w-full lg:w-64 shrink-0 lg:sticky lg:top-(--sticky-offset) lg:max-h-[calc(100vh-var(--sticky-offset)-1.5rem)] lg:overflow-y-auto ${filtersOpen ? '' : 'hidden lg:block'}`}
      >
        {/* One contained rail: groups separated by hairlines, each named by an
            overline, so the form reads as rhythm instead of eight equal rows. */}
        <div className="bg-surface border border-border/20 shadow-card rounded-card p-4 divide-y divide-border/20">
          <div className="pb-4">
            <SearchBar
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); debouncedSearch(e.target.value) }}
              placeholder={t('filter.searchPlaceholder')}
              className="w-full"
            />
          </div>

          <div className="py-4">
            <p className={`${overline} mb-2`}>{t('filter.price')}</p>
            <div className="flex gap-2">
              <Input type="number" inputMode="numeric" value={priceInputs.min ?? ''} placeholder={t('filter.min')} onChange={(e) => handlePriceChange('min', e.target.value)} />
              <Input type="number" inputMode="numeric" value={priceInputs.max ?? ''} placeholder={t('filter.max')} onChange={(e) => handlePriceChange('max', e.target.value)} />
            </div>
          </div>

          <div className="py-4">
            <p className={`${overline} mb-2`}>{t('posts.category')}</p>
            {schemasError && schemas.length === 0 && (
              <ErrorState compact onRetry={refetchSchemas} />
            )}
            <CategoryPills
              categories={schemas.filter((s) => s.active).map((s) => ({
                key: s.key,
                label: getCategoryLabel(s.key, t, schemas),
                color: getCategoryColor(s.key, schemas),
              }))}
              value={category}
              onChange={handleCategory}
              allLabel={t('filter.allCategories')}
              as="button"
              shape="lg"
            />
          </div>

          {schema && (schema.subcategories?.length > 0 || filterFields.length > 0) && (
            <div className="py-4 space-y-3">
              <p className={overline}>{t('filter.specs')}</p>
              {schema.subcategories?.length > 0 && (
                <Input as="select" value={subcat} onChange={(e) => setParams({ subcategory: e.target.value })}>
                  <option value="">{t('posts.subcategory')}</option>
                  {schema.subcategories.map((sub) => (
                    <option key={sub.value} value={sub.value}>{getSubcategoryLabel(sub.value, t, schema)}</option>
                  ))}
                </Input>
              )}
              {filterFields.map((f) => f.type === 'select' ? (
                <Input as="select" key={f.key} value={attrInputs[f.key] ?? ''} onChange={(e) => handleAttrChange(f.key, e.target.value, true)}>
                  <option value="">{getFieldLabel(f, t)}</option>
                  {f.options?.map((o) => <option key={o} value={o}>{getOptionLabel(o, t)}</option>)}
                </Input>
              ) : f.type === 'number' ? (
                <div key={f.key}>
                  <p className="text-xs text-muted mb-1">{getFieldLabel(f, t)}</p>
                  <div className="flex gap-2">
                    <Input type="number" inputMode="numeric" value={attrInputs[`${f.key}_min`] ?? ''} placeholder={t('filter.min')} onChange={(e) => handleAttrChange(`${f.key}_min`, e.target.value)} />
                    <Input type="number" inputMode="numeric" value={attrInputs[`${f.key}_max`] ?? ''} placeholder={t('filter.max')} onChange={(e) => handleAttrChange(`${f.key}_max`, e.target.value)} />
                  </div>
                </div>
              ) : (
                <Input key={f.key} value={attrInputs[f.key] ?? ''} placeholder={getFieldLabel(f, t)} onChange={(e) => handleAttrChange(f.key, e.target.value)} />
              ))}
            </div>
          )}

          <div className="py-4 space-y-3">
            <p className={overline}>{t('filter.location')}</p>
            <Input as="select" value={province} onChange={(e) => handleProvince(e.target.value)}>
              <option value="">{t('common.province')}</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{t(`province.${p}`, { defaultValue: p })}</option>)}
            </Input>
            {province === 'ULAANBAATAR' && (
              <Input as="select" value={district} onChange={(e) => setParams({ district: e.target.value })}>
                <option value="">{t('common.district')}</option>
                {DISTRICTS.map((d) => <option key={d} value={d}>{t(`district.${d}`, { defaultValue: d })}</option>)}
              </Input>
            )}
          </div>

          {hasFilters && (
            <div className="pt-4 space-y-2">
              {canSaveSearch && (
                <button
                  type="button"
                  onClick={() => {
                    if (!isAuthed) return navigate('/login')
                    setSaveName(defaultSaveName()); setSaveOpen(true)
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-text bg-primary/10 hover:bg-primary/15 border border-primary/20 rounded-btn w-full justify-center transition-colors"
                >
                  <BellPlus size={14} /> {t('savedSearch.saveThis')}
                </button>
              )}
              <button onClick={clearAll} className="flex items-center gap-1 px-3 py-2 text-sm text-muted hover:text-text border border-border/50 rounded-btn w-full justify-center transition-colors">
                <X size={13} /> {t('common.clear')}
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 w-full">
        {/* No persistence layer here — this is React Query's in-memory cache.
            When the network drops, say what the grid is showing and how old it is. */}
        {!online && (
          <div role="status" className="mb-4 flex items-center gap-2.5 p-3 rounded-card border bg-warning/10 border-warning/20 text-warning-text text-sm">
            <WifiOff size={16} className="shrink-0" aria-hidden="true" />
            {data && dataUpdatedAt
              ? t('offline.showingSaved', { time: new Date(dataUpdatedAt).toLocaleTimeString('mn-MN', { hour: '2-digit', minute: '2-digit' }) })
              : t('offline.noConnection')}
          </div>
        )}
        {/* Results header: what am I looking at, how much of it is there, and
            how it is ordered — the answers a listings page owes up front. */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-text truncate">
              {category ? getCategoryLabel(category, t, schemas) : t('posts.allListings')}
            </h1>
            {!isLoading && (
              <span className="text-sm text-text font-medium tabular-nums whitespace-nowrap">
                {t('common.total', { count: total })}
              </span>
            )}
          </div>
          <Input
            as="select"
            value={sort}
            onChange={(e) => setParams({ sort: e.target.value })}
            aria-label={t('filter.sort')}
            className="w-auto"
          >
            <option value="">{t('sort.newest')}</option>
            <option value="price_asc">{t('sort.priceAsc')}</option>
            <option value="price_desc">{t('sort.priceDesc')}</option>
            <option value="views">{t('sort.views')}</option>
          </Input>
        </div>
        <PostGrid
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
          isEmpty={posts.length === 0}
          emptyState={
            <EmptyState
              title={t(hasFilters ? 'posts.noMatches' : 'posts.browseEmpty')}
              description={t(hasFilters ? 'posts.noMatchesDesc' : 'posts.browseEmptyDesc')}
              tint={activeColor}
              action={
                <div className="flex flex-col items-center gap-3">
                  {hasFilters && (
                    <Button variant="outline" size="sm" onClick={clearAll}>
                      <X size={13} /> {t('common.clear')}
                    </Button>
                  )}
                  {category && <div className="flex flex-wrap justify-center gap-2">
                    {schemas.filter((s) => s.active && s.key !== category).slice(0, 3).map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => handleCategory(s.key)}
                        className="inline-flex items-center min-h-[36px] px-3.5 py-2 text-xs font-medium border border-border/50 text-muted hover:text-text bg-surface rounded-btn transition-colors"
                      >
                        {getCategoryLabel(s.key, t, schemas)}
                      </button>
                    ))}
                  </div>}
                </div>
              }
            />
          }
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
            labels={{ previous: t('common.previousPage'), next: t('common.nextPage'), page: t('common.page') }} />
        )}
      </div>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={t('savedSearch.saveThis')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => saveMut.mutate(saveName.trim())} disabled={!saveName.trim() || saveMut.isPending}>
              {saveMut.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); if (saveName.trim()) saveMut.mutate(saveName.trim()) }} className="space-y-3">
          <p className="text-sm text-muted">{t('savedSearch.hint')}</p>
          <div>
            <label htmlFor="saved-search-name" className="field-label">{t('savedSearch.name')}</label>
            <Input id="saved-search-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} maxLength={60} autoFocus placeholder={t('savedSearch.namePlaceholder')} />
          </div>
        </form>
      </Modal>
    </div>
  )
}
