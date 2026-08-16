import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { X, Heart } from 'lucide-react'
import { toast } from 'sonner'
import { postsApi, categoryApi, likesApi } from '@/lib/api'
import { debounce, PROVINCES, DISTRICTS, getPostCategory, getCategoryLabel, getSubcategoryLabel, getFieldLabel, getOptionLabel } from '@/lib/utils'
import Input from '@/components/Input'
import SearchBar from '@/components/SearchBar'
import CategoryPills from '@/components/CategoryPills'
import PostCard from '@/components/PostCard'
import EmptyState from '@/components/EmptyState'
import Pagination from '@/components/Pagination'
import PostGrid from '@/components/PostGrid'

const LIMIT = 12

export default function CustomerBrowse() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [category, setCategory] = useState(searchParams.get('category') ?? '')
  const [subcat, setSubcat] = useState('')
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [attrInputs, setAttrInputs] = useState({})
  const [attrFilters, setAttrFilters] = useState({})
  const [page, setPage] = useState(1)

  useEffect(() => {
    const cat = searchParams.get('category')
    if (cat && cat !== category) setCategory(cat)
  }, []) // eslint-disable-line

  const debouncedSearch = useCallback(
    debounce((val) => { setSearch(val); setPage(1) }, 400),
    [] // eslint-disable-line
  )

  const handleCategory = useCallback((val) => {
    setCategory(val)
    setSubcat('')
    setAttrInputs({})
    setAttrFilters({})
    setPage(1)
    setSearchParams(val ? { category: val } : {})
  }, [setSearchParams])

  const applyAttr = useCallback(
    debounce((key, val) => { setAttrFilters((p) => ({ ...p, [key]: val })); setPage(1) }, 400),
    [] // eslint-disable-line
  )

  const handleAttrChange = useCallback((key, val, immediate) => {
    setAttrInputs((p) => ({ ...p, [key]: val }))
    if (immediate) { setAttrFilters((p) => ({ ...p, [key]: val })); setPage(1) }
    else applyAttr(key, val)
  }, [applyAttr])

  const handleProvince = useCallback((val) => {
    setProvince(val)
    setDistrict('')
    setPage(1)
  }, [])

  const queryParams = { approval_status: 'APPROVED', page, limit: LIMIT }
  if (category) queryParams.category = category
  if (category && subcat) queryParams.subcategory = subcat
  if (province) queryParams.province = province
  if (district) queryParams.district = district
  if (search) queryParams.q = search
  if (category) {
    for (const [k, v] of Object.entries(attrFilters)) {
      if (v) queryParams[`attr.${k}`] = v
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['posts', queryParams],
    queryFn: () => postsApi.getAll(queryParams),
    keepPreviousData: true,
    staleTime: 30_000,
  })

  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 60_000,
  })

  const { data: likedIds = [] } = useQuery({
    queryKey: ['liked-ids'],
    queryFn: likesApi.getIds,
    staleTime: 60_000,
  })
  const likedSet = useMemo(() => new Set(likedIds.map(String)), [likedIds])

  const likeMut = useMutation({
    mutationFn: ({ postId, postType, isLiked }) =>
      isLiked ? likesApi.unlike(postType, postId) : likesApi.toggle(postId, postType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liked-ids'] })
      qc.invalidateQueries({ queryKey: ['liked-posts'] })
    },
    onError: () => toast.error(t('common.error')),
  })

  const posts = Array.isArray(data) ? data : (data?.items ?? [])
  const total = Array.isArray(data) ? data.length : (data?.total ?? 0)

  const clearAll = useCallback(() => {
    setCategory(''); setSubcat(''); setProvince(''); setDistrict('')
    setSearchInput(''); setSearch(''); setPage(1)
    setAttrInputs({}); setAttrFilters({})
    setSearchParams({})
  }, [setSearchParams])

  const schema = useMemo(() => schemas.find((s) => s.key === category), [schemas, category])
  const filterFields = useMemo(() => schema?.fields?.filter((f) => f.filterable) ?? [], [schema])

  const hasFilters = category || subcat || province || district || search || Object.values(attrFilters).some(Boolean)

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <aside className="w-full lg:w-64 shrink-0 lg:sticky lg:top-6 space-y-5">
        <SearchBar
          value={searchInput}
          onChange={(e) => { setSearchInput(e.target.value); debouncedSearch(e.target.value) }}
          placeholder={t('filter.searchPlaceholder')}
          className="w-full"
        />

        <div>
          <p className="label mb-2">{t('posts.category')}</p>
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
              <Input as="select" value={subcat} onChange={(e) => { setSubcat(e.target.value); setPage(1) }} className="bg-surface rounded-btn w-full">
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
            ) : (
              <Input key={f.key} value={attrInputs[f.key] ?? ''} placeholder={getFieldLabel(f, t)} onChange={(e) => handleAttrChange(f.key, e.target.value)} className="bg-surface rounded-btn w-full" />
            ))}
          </div>
        )}

        <div className="space-y-3">
          <Input as="select" value={province} onChange={(e) => handleProvince(e.target.value)} className="bg-surface rounded-btn w-full">
            <option value="">{t('common.province')}</option>
            {PROVINCES.map((p) => <option key={p.value} value={p.value}>{t(`province.${p.value}`)}</option>)}
          </Input>
          {province === 'ULAANBAATAR' && (
            <Input as="select" value={district} onChange={(e) => { setDistrict(e.target.value); setPage(1) }} className="bg-surface rounded-btn w-full">
              <option value="">{t('common.district')}</option>
              {DISTRICTS.map((d) => <option key={d.value} value={d.value}>{t(`district.${d.value}`)}</option>)}
            </Input>
          )}
        </div>

        {hasFilters && (
          <button onClick={clearAll} className="flex items-center gap-1 px-3 py-2 text-sm text-muted hover:text-text border border-border/50 rounded-btn w-full justify-center">
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
          isEmpty={posts.length === 0}
          emptyState={<EmptyState title={t('posts.browseEmpty')} description={t('posts.browseEmptyDesc')} />}
          cols={3}
          skeletonCount={LIMIT}
        >
          {posts.map((post) => {
            const saved = likedSet.has(String(post.id))
            const postType = getPostCategory(post)
            const isPendingThis = likeMut.isPending && likeMut.variables?.postId === post.id
            return (
              <PostCard
                key={post.id}
                post={post}
                actions={
                  <button
                    onClick={() => likeMut.mutate({ postId: post.id, postType, isLiked: saved })}
                    disabled={isPendingThis}
                    className={`w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border rounded-btn transition-colors disabled:opacity-50 ${
                      saved
                        ? 'bg-primary/15 text-primary border-primary/30 hover:bg-danger/10 hover:text-danger hover:border-danger/30'
                        : 'border-border/50 text-muted hover:text-primary hover:border-primary/40'
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
          <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
        )}
      </div>
    </div>
  )
}
