import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { ChevronDown, Calendar, Image as ImageIcon, MapPin, Smartphone } from 'lucide-react'
import { getFieldLabel, getOptionLabel, getCategoryColor, resolveSchemaLabel } from '@/lib/utils'

/**
 * Phone-sized mock of the provider form the app derives from a category
 * schema. Purely presentational: nothing here is interactive, it just
 * re-renders as the admin edits fields and flags so "required", "select"
 * and "has_price" are seen rather than imagined. Mirrors the app's section
 * order — listing info, category details (core, then "More details"),
 * price & availability, images, location.
 */
export default function SchemaFormPreview({ schema }) {
  const { t } = useTranslation()
  const fields = schema?.fields ?? []
  const core = fields.filter((f) => (f.group ?? 'core') !== 'details')
  const details = fields.filter((f) => f.group === 'details')
  const color = schema?.color || getCategoryColor(schema?.key, [])
  const title = resolveSchemaLabel(schema) || schema?.label || schema?.key || '…'

  return (
    <aside className="hidden lg:block w-[360px] shrink-0 self-start sticky top-0" aria-label={t('admin.previewTitle')}>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted mb-2">
        <Smartphone size={13} className="text-primary-text" /> {t('admin.previewTitle')}
        <span className="normal-case tracking-normal text-muted/70">· {t('admin.previewHint')}</span>
      </p>
      {/* Bezel */}
      <div className="rounded-[2.2rem] border-[6px] border-border-strong bg-background shadow-card overflow-hidden">
        <div className="h-[600px] overflow-y-auto overscroll-contain">
          {/* Status bar + header */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur px-4 pt-3 pb-2">
            <div className="flex justify-center mb-2"><span className="w-16 h-1.5 rounded-full bg-border-strong" /></div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-sm font-semibold text-text truncate">{title}</span>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-4">
            <Section title={t('posts.basicInfo')}>
              <Field label={t('posts.title')} required><Box placeholder={t('posts.title')} /></Field>
              {schema?.subcategories?.length > 0 && (
                <Field label={t('posts.subcategory')} required>
                  <div className="flex flex-wrap gap-1.5">
                    {schema.subcategories.map((s, i) => (
                      <span key={`${s.value}-${i}`} className={`text-[11px] px-2 py-1 rounded-full border ${i === 0 ? 'border-primary bg-primary/15 text-primary-text' : 'border-border/50 text-muted'}`}>
                        {resolveSchemaLabel(s) || s.display || s.value || '…'}
                      </span>
                    ))}
                  </div>
                </Field>
              )}
              <Field label={t('posts.details')}><Box tall placeholder={t('posts.details')} /></Field>
            </Section>

            {(core.length > 0 || details.length > 0) && (
              <Section title={t('posts.categoryDetails')}>
                {core.map((f, i) => <SchemaField key={`${f.key}-${i}`} field={f} t={t} />)}
                {details.length > 0 && (
                  <div className="pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between text-xs text-muted mb-2">
                      <span>{t('posts.moreDetails')}</span><ChevronDown size={13} />
                    </div>
                    <div className="space-y-2.5 opacity-80">
                      {details.map((f, i) => <SchemaField key={`${f.key}-${i}`} field={f} t={t} />)}
                    </div>
                  </div>
                )}
              </Section>
            )}
            {fields.length === 0 && (
              <Section title={t('posts.categoryDetails')}>
                <p className="text-xs text-muted italic">{t('admin.previewNoFields')}</p>
              </Section>
            )}

            {(schema?.has_price || schema?.has_rental_status || schema?.has_availability_dates) && (
              <Section title={t('posts.pricing')}>
                {schema.has_price && (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Field label={t('posts.priceAmount')}><Box placeholder="0 ₮" /></Field>
                    <Field label={t('posts.priceUnit')}>
                      <Box>
                        <span className="flex items-center gap-1 text-text">
                          {schema.default_price_unit
                            ? t(`priceUnit.${schema.default_price_unit.toLowerCase()}`, { defaultValue: schema.default_price_unit })
                            : '—'}
                          <ChevronDown size={12} className="text-muted" />
                        </span>
                      </Box>
                    </Field>
                  </div>
                )}
                {schema.has_rental_status && (
                  <div className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs text-text">{t('admin.previewStatus')}</p>
                      <p className="text-[11px] text-muted">{t('status.active')} · {t('status.rented')}</p>
                    </div>
                    <Toggle on />
                  </div>
                )}
                {schema.has_availability_dates && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t('posts.availableFrom')}><Box icon={Calendar} placeholder="YYYY-MM-DD" /></Field>
                    <Field label={t('posts.availableUntil')}><Box icon={Calendar} placeholder="YYYY-MM-DD" /></Field>
                  </div>
                )}
              </Section>
            )}

            <Section title={t('posts.images')}>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="aspect-square rounded-lg border border-dashed border-border/60 flex items-center justify-center text-muted"><ImageIcon size={16} /></div>
                <div className="aspect-square rounded-lg bg-surface" />
                <div className="aspect-square rounded-lg bg-surface" />
              </div>
            </Section>

            <Section title={t('posts.location')}>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('common.province')} required><Box placeholder={t('admin.previewSelect')} chevron /></Field>
                <Field label={t('common.district')} required><Box placeholder={t('admin.previewSelect')} chevron /></Field>
              </div>
              <div className="h-16 rounded-lg bg-surface flex items-center justify-center text-muted text-[11px] gap-1">
                <MapPin size={12} /> {t('posts.pinOnMap')}
              </div>
            </Section>

            <div className="pt-1">
              <div className="h-10 rounded-btn bg-primary text-on-primary text-sm font-semibold flex items-center justify-center">
                {t('admin.previewSubmit')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted">{title}</p>
      {children}
    </section>
  )
}

function Field({ label, required, unit, children }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted mb-1 truncate">
        {label}{unit ? <span className="text-muted/70"> ({unit})</span> : null}
        {required && <span className="text-danger"> *</span>}
      </p>
      {children}
    </div>
  )
}

function Box({ placeholder, tall, icon: Icon, chevron, children }) {
  return (
    <div className={`w-full bg-surface2 rounded-lg px-3 text-xs flex items-center gap-1.5 ${tall ? 'h-16 items-start py-2' : 'h-9'}`}>
      {Icon && <Icon size={12} className="text-muted shrink-0" />}
      <span className="flex-1 min-w-0 truncate text-muted">{children ?? placeholder}</span>
      {chevron && <ChevronDown size={12} className="text-muted shrink-0" />}
    </div>
  )
}

function Toggle({ on }) {
  return (
    <span className={`relative inline-block w-9 h-5 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-border-strong'}`}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow" style={{ left: on ? 'calc(100% - 1.125rem)' : '0.125rem' }} />
    </span>
  )
}

function SchemaField({ field, t }) {
  const label = field.label || field.key ? getFieldLabel({ ...field, label: field.label || field.key }, t) : '…'
  const placeholder = field.placeholders?.[i18n.language] ?? field.placeholder ?? ''
  const opts = Array.isArray(field.options) ? field.options : []
  switch (field.type) {
    case 'textarea':
      return <Field label={label} required={field.required} unit={field.unit}><Box tall placeholder={placeholder || label} /></Field>
    case 'number':
      return <Field label={label} required={field.required} unit={field.unit}><Box placeholder={placeholder || '0'} /></Field>
    case 'date':
      return <Field label={label} required={field.required}><Box icon={Calendar} placeholder={placeholder || 'YYYY-MM-DD'} /></Field>
    case 'phone':
      return <Field label={label} required={field.required}><Box placeholder={placeholder || '+976 …'} /></Field>
    case 'boolean':
      return (
        <div className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
          <p className="text-xs text-text">{label}{field.required && <span className="text-danger"> *</span>}</p>
          <Toggle />
        </div>
      )
    case 'select':
      return (
        <Field label={label} required={field.required} unit={field.unit}>
          <Box chevron placeholder={opts.length ? getOptionLabel(opts[0], t) : t('admin.previewSelect')} />
        </Field>
      )
    case 'multiselect':
      return (
        <Field label={label} required={field.required}>
          <div className="flex flex-wrap gap-1.5">
            {opts.length === 0 && <span className="text-[11px] text-muted italic">{t('admin.previewSelect')}</span>}
            {opts.map((o, i) => (
              <span key={`${o}-${i}`} className={`text-[11px] px-2 py-1 rounded-full border ${i === 0 ? 'border-primary bg-primary/15 text-primary-text' : 'border-border/50 text-muted'}`}>
                {getOptionLabel(o, t)}
              </span>
            ))}
          </div>
        </Field>
      )
    default:
      return <Field label={label} required={field.required} unit={field.unit}><Box placeholder={placeholder || label} /></Field>
  }
}
