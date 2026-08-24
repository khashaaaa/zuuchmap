import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { postsApi, categoryApi } from '@/lib/api'
import { getCategoryLabel, getPostCategory, getCategoryColor, formatPrice, getImageUrl, hideBrokenImage } from '@/lib/utils'
import { categoryPin } from '@/lib/mapPin'
import CategoryPills from '@/components/CategoryPills'
import ErrorState from '@/components/ErrorState'
import EmptyState from '@/components/EmptyState'
import { useThemeStore } from '@/store'

const UB = [47.9184676, 106.9177016]
const MAP_MARKER_CAP = 300
const LIST_CAP = 100

export default function CustomerMap() {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const [selected, setSelected] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('')

  const { data: allPosts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['posts-map'],
    queryFn: postsApi.getMap,
    staleTime: 60_000,
  })

  const { data: schemas = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.getAll,
    staleTime: 300_000,
  })

  const resolveLabel = (key) => getCategoryLabel(key, t, schemas)

  const posts = useMemo(() => allPosts.slice(0, MAP_MARKER_CAP), [allPosts])

  const filtered = useMemo(() =>
    selectedCategory ? posts.filter(p => getPostCategory(p) === selectedCategory) : posts,
    [posts, selectedCategory]
  )

  if (isLoading) return <div className="h-[calc(100vh-8rem)] skeleton rounded-card" />

  // An empty map and an unreachable engine look identical once the pins are gone.
  if (isError) return <ErrorState onRetry={refetch} />

  return (
    <>
      <CategoryPills
        categories={schemas.filter((s) => s.active).map((s) => ({ key: s.key, label: getCategoryLabel(s.key, t, schemas) }))}
        value={selectedCategory}
        onChange={setSelectedCategory}
        allLabel={t('filter.allCategories')}
        as="button"
        shape="full"
        className="overflow-x-auto flex-nowrap pb-2 mb-3"
      />
    <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-8rem)]">
      <div className="md:flex-1 rounded-card overflow-hidden border border-border/20 shadow-card h-[60vh] md:h-full">
        <MapContainer center={UB} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl>
          <TileLayer
            key={theme}
            url={`https://{s}.basemaps.cartocdn.com/${theme === 'dark' ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          />
          {filtered.map((post) =>
            post.latitude && post.longitude ? (
              <Marker
                key={post.id}
                position={[post.latitude, post.longitude]}
                icon={categoryPin(getCategoryColor(getPostCategory(post), schemas))}
                eventHandlers={{ click: () => setSelected(post) }}
              >
                <Popup>
                  <div className="text-xs" style={{ minWidth: 140 }}>
                    <p className="font-semibold text-sm mb-0.5">{post.title || resolveLabel(getPostCategory(post))}</p>
                    {post.price_amount && <p className="text-primary-text">{formatPrice(post.price_amount, post.price_unit, t)}</p>}
                    <Link to={`/posts/${post.id}`} className="text-primary-text underline mt-1 block">{t('common.viewAll')}</Link>
                  </div>
                </Popup>
              </Marker>
            ) : null
          )}
        </MapContainer>
      </div>
      <div className="w-full md:w-72 md:shrink-0 overflow-y-auto space-y-3 pr-1 max-h-[50vh] md:max-h-none md:h-full">
        <p className="text-xs text-muted sticky top-0 bg-background py-1">
          {filtered.length > LIST_CAP
            ? t('common.showingOf', { shown: LIST_CAP, total: filtered.length })
            : t('common.total', { count: filtered.length })}
        </p>
        {filtered.length === 0 && (
          <EmptyState title={t('posts.browseEmpty')} description={t('posts.browseEmptyDesc')} />
        )}
        {filtered.slice(0, LIST_CAP).map((post) => (
          <Link
            key={post.id}
            to={`/posts/${post.id}`}
            className={`block bg-surface border shadow-card rounded-card overflow-hidden hover:border-primary/40 transition-colors ${selected?.id === post.id ? 'border-primary bg-primary/10' : 'border-border/20'}`}
          >
            {post.images?.[0] && (
              <div className="h-28 overflow-hidden">
                <img src={getImageUrl(post.images[0])} alt="" loading="lazy" className="w-full h-full object-cover" onError={hideBrokenImage} />
              </div>
            )}
            <div className="p-3">
              <p className="text-xs font-medium text-text line-clamp-2">{post.title || resolveLabel(getPostCategory(post))}</p>
              {post.price_amount && <p className="text-xs text-primary-text mt-0.5">{formatPrice(post.price_amount, post.price_unit, t)}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
    </>
  )
}
