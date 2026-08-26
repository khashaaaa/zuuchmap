import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import Input from './Input'
import { getCategoryLabel, getCategoryColor, toneForTheme, withAlpha } from '@/lib/utils'
import { priceSliderMax, EMPTY_FILTERS } from '@/lib/mapCluster'
import { useThemeStore } from '@/store'

/**
 * Map filters. Ports the app's `MapFilterModal`: multi-select categories, a
 * price range with a slider that follows the data, and a "near me" radius.
 *
 * State is local until Apply, so dragging the slider does not re-cluster the
 * map behind the sheet — the same reason the app keeps its own copy.
 */
export default function MapFilterModal({ open, onClose, onApply, posts, schemas, value }) {
  const { t } = useTranslation()
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'

  const [selectedCategories, setSelectedCategories] = useState(value.selectedCategories ?? [])
  const [priceRange, setPriceRange] = useState(value.priceRange ?? EMPTY_FILTERS.priceRange)
  const [locationFilter, setLocationFilter] = useState(value.locationFilter ?? EMPTY_FILTERS.locationFilter)

  // Reopening shows what is actually applied, not what was abandoned last time.
  // Adjusted during render rather than in an effect: an effect would paint the
  // stale draft for one frame and then cascade a second render over it.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSelectedCategories(value.selectedCategories ?? [])
      setPriceRange(value.priceRange ?? EMPTY_FILTERS.priceRange)
      setLocationFilter(value.locationFilter ?? EMPTY_FILTERS.locationFilter)
    }
  }

  const active = useMemo(() => schemas.filter((s) => s.active), [schemas])
  const sliderMax = useMemo(() => priceSliderMax(posts), [posts])

  const toggleCategory = (key) => setSelectedCategories((prev) =>
    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
  )

  const apply = () => {
    onApply({ selectedCategories, priceRange, locationFilter })
    onClose()
  }

  const reset = () => {
    setSelectedCategories([])
    setPriceRange(EMPTY_FILTERS.priceRange)
    setLocationFilter(EMPTY_FILTERS.locationFilter)
  }

  const parseAmount = (text) => {
    const cleaned = text.replace(/,/g, '')
    return cleaned === '' ? null : (parseInt(cleaned, 10) || 0)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('common.filter')}
      size="lg"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={reset}>{t('common.clear')}</Button>
          <Button onClick={apply}>{t('common.apply')}</Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text">{t('posts.category')}</h3>
            <div className="flex gap-3">
              <button type="button" className="text-xs text-primary-text hover:underline"
                onClick={() => setSelectedCategories(active.map((s) => s.key))}>
                {t('filter.allCategories')}
              </button>
              <button type="button" className="text-xs text-primary-text hover:underline"
                onClick={() => setSelectedCategories([])}>
                {t('common.clear')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {active.map((schema) => {
              const selected = selectedCategories.includes(schema.key)
              const hex = getCategoryColor(schema.key, schemas)
              return (
                <button
                  key={schema.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCategory(schema.key)}
                  className={`flex items-center gap-2 min-h-touch px-3 py-2 rounded-btn border text-left transition-colors ${
                    selected ? 'border-primary' : 'border-border/20 hover:border-border'
                  }`}
                  style={selected ? { backgroundColor: withAlpha(hex, 0.14) } : undefined}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} aria-hidden="true" />
                  <span className="text-xs font-medium truncate" style={{ color: selected ? toneForTheme(hex, isDark) : undefined }}>
                    {getCategoryLabel(schema.key, t, schemas)}
                  </span>
                  {selected && <Check size={14} className="ml-auto shrink-0 text-primary-text" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={priceRange.enabled}
              onChange={(e) => setPriceRange((p) => ({ ...p, enabled: e.target.checked }))}
              className="accent-[var(--color-primary)] w-4 h-4"
            />
            <span className="text-sm font-semibold text-text">{t('common.price')}</span>
          </label>
          {priceRange.enabled && (
            <div className="space-y-3 pl-6">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">{t('filter.minPrice')}</span>
                  <Input
                    format="currency"
                    value={priceRange.min ?? ''}
                    onChange={(e) => setPriceRange((p) => ({ ...p, min: parseAmount(e.target.value) }))}
                  />
                </label>
                <label className="block">
                  <span className="field-label">{t('filter.maxPrice')}</span>
                  <Input
                    format="currency"
                    value={priceRange.max ?? ''}
                    onChange={(e) => setPriceRange((p) => ({ ...p, max: parseAmount(e.target.value) }))}
                  />
                </label>
              </div>
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={Math.max(1, Math.round(sliderMax / 100))}
                value={priceRange.max ?? sliderMax}
                onChange={(e) => setPriceRange((p) => ({ ...p, max: Number(e.target.value) }))}
                aria-label={t('filter.maxPrice')}
                className="w-full accent-[var(--color-primary)]"
              />
            </div>
          )}
        </section>

        <section>
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={locationFilter.enabled}
              onChange={(e) => setLocationFilter((l) => ({ ...l, enabled: e.target.checked }))}
              className="accent-[var(--color-primary)] w-4 h-4"
            />
            <span className="text-sm font-semibold text-text">{t('map.filter')}</span>
          </label>
          {locationFilter.enabled && (
            <div className="space-y-2 pl-6">
              <p className="text-xs text-muted">{t('map.locationRadius', { radius: locationFilter.radius })}</p>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={locationFilter.radius}
                onChange={(e) => setLocationFilter((l) => ({ ...l, radius: Number(e.target.value) }))}
                aria-label={t('map.radiusLabel', { radius: locationFilter.radius })}
                className="w-full accent-[var(--color-primary)]"
              />
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
