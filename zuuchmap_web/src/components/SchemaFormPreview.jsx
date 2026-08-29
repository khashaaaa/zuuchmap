import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { Smartphone } from 'lucide-react'
import { getCategoryColor, resolveSchemaLabel, PRICE_UNITS } from '@/lib/utils'
import Input from './Input'
import CollapsibleSection from './CollapsibleSection'
import { DynamicField, FormSection } from './PostFormFields'

const noop = () => {}

/**
 * Phone-sized preview of the provider form a category schema produces. It
 * renders the real form controls (PostFormFields, the same ones
 * ProviderPostForm uses) in disabled mode, so "required", "select" and
 * "has_price" are seen exactly as a provider will see them, and re-renders
 * as the admin edits fields and flags. Mirrors the form's section order —
 * listing info, category details (core, then "More details"), price &
 * availability, contact.
 */
export default function SchemaFormPreview({ schema }) {
  const { t } = useTranslation()
  const lng = i18n.language
  const fields = schema?.fields ?? []
  const core = fields.filter((f) => (f.group ?? 'core') !== 'details')
  const details = fields.filter((f) => f.group === 'details')
  const color = schema?.color || getCategoryColor(schema?.key, [])
  const title = resolveSchemaLabel(schema) || schema?.label || schema?.key || '…'
  const field = (f) => <DynamicField key={f.key} field={f} value={f.type === 'multiselect' ? [] : ''} onChange={noop} t={t} lng={lng} disabled />

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

          <fieldset disabled className="px-4 pb-4 space-y-4 text-sm" aria-label={t('admin.previewTitle')}>
            <FormSection title={t('posts.basicInfo')}>
              {schema?.subcategories?.length > 0 && (
                <div>
                  <label className="field-label">{t('posts.subcategory')}</label>
                  <Input as="select" value="" onChange={noop} disabled>
                    <option value="">{t('common.select')}</option>
                    {schema.subcategories.map((s, i) => (
                      <option key={`${s.value}-${i}`} value={s.value}>{resolveSchemaLabel(s) || s.display || s.value || '…'}</option>
                    ))}
                  </Input>
                </div>
              )}
              <div>
                <label className="field-label">{t('posts.title')} <span className="text-danger">*</span></label>
                <Input value="" onChange={noop} placeholder={t('posts.title')} disabled />
              </div>
              <div>
                <label className="field-label">{t('posts.details')}</label>
                <Input as="textarea" value="" onChange={noop} rows={3} placeholder={t('posts.details')} className="resize-none" disabled />
              </div>
            </FormSection>

            <FormSection title={t('posts.categoryDetails')}>
              {fields.length === 0 && <p className="text-xs text-muted italic">{t('admin.previewNoFields')}</p>}
              {core.length > 0 && <div className="space-y-3">{core.map(field)}</div>}
              {details.length > 0 && (
                <CollapsibleSection title={t('posts.moreDetails')} defaultOpen variant="bare">
                  <div className="space-y-3">{details.map(field)}</div>
                </CollapsibleSection>
              )}
            </FormSection>

            {(schema?.has_price || schema?.has_rental_status || schema?.has_availability_dates) && (
              <FormSection title={t('posts.pricing')}>
                {schema.has_price && (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div>
                      <label className="field-label">{t('posts.priceAmount')}</label>
                      <Input format="currency" value="" onChange={noop} placeholder="0" disabled />
                    </div>
                    <div>
                      <label className="field-label">{t('posts.priceUnit')}</label>
                      <Input as="select" value={schema.default_price_unit || ''} onChange={noop} disabled>
                        {!schema.default_price_unit && <option value="">—</option>}
                        {PRICE_UNITS.map((u) => <option key={u} value={u}>{t(`priceUnit.${u.toLowerCase()}`, { defaultValue: u })}</option>)}
                      </Input>
                    </div>
                  </div>
                )}
                {schema.has_availability_dates && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="field-label">{t('posts.availableFrom')}</label>
                      <Input type="date" value="" onChange={noop} disabled />
                    </div>
                    <div>
                      <label className="field-label">{t('posts.availableUntil')}</label>
                      <Input type="date" value="" onChange={noop} disabled />
                    </div>
                  </div>
                )}
                {schema.has_rental_status && (
                  <div>
                    <label className="field-label">{t('common.status')}</label>
                    <Input as="select" value="ACTIVE" onChange={noop} disabled>
                      {['ACTIVE', 'RENTED', 'EXPIRED'].map((s) => (
                        <option key={s} value={s}>{t(`status.${s.toLowerCase()}`, { defaultValue: s })}</option>
                      ))}
                    </Input>
                  </div>
                )}
              </FormSection>
            )}

            <FormSection title={t('posts.contactInfo')}>
              <div>
                <label className="field-label">{t('posts.contactPhone')} <span className="text-danger">*</span></label>
                <Input type="tel" value="" onChange={noop} disabled />
              </div>
            </FormSection>

            <div className="pt-1">
              <div className="h-10 rounded-btn bg-primary text-on-primary text-sm font-semibold flex items-center justify-center">
                {t('admin.previewSubmit')}
              </div>
            </div>
          </fieldset>
        </div>
      </div>
    </aside>
  )
}
