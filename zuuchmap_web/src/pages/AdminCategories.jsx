import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCategories } from '@/hooks/useCategories'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, X, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, Tag } from 'lucide-react'
import { categoryApi } from '@/lib/api'
import { PRICE_UNITS, CATEGORY_COLORS, getCategoryColor } from '@/lib/utils'
import { LANGUAGES } from '@/i18n'
import PageHeader from '@/components/PageHeader'
import ErrorState from '@/components/ErrorState'
import EmptyState from '@/components/EmptyState'
import ConfirmModal from '@/components/ConfirmModal'
import { useMinDisplayTime } from '@/hooks/useMinDisplayTime'
import TabBar from '@/components/TabBar'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import StatusBadge from '@/components/StatusBadge'
import DensityToggle from '@/components/DensityToggle'
import SchemaFormPreview from '@/components/SchemaFormPreview'
import { useTableDensity } from '@/hooks/useTableDensity'
import { toast } from 'sonner'

const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'multiselect', 'boolean', 'date', 'phone']
const LOCALES = LANGUAGES.map((l) => l.code)
const DEFAULT_COLOR = CATEGORY_COLORS.construction

const emptySchema = () => ({
  key: '', label: '', labels: {}, icon: '', color: DEFAULT_COLOR,
  active: true, sort_order: 0,
  has_rental_status: false, has_availability_dates: false, has_price: false, default_price_unit: '',
  emphasized: false, post_expiry_days: null,
  subcategories: [], fields: [],
})

const emptyField = () => ({ key: '', label: '', labels: {}, type: 'text', required: false, filterable: false, group: 'core', unit: '', placeholder: '', options: [] })
const emptySubcat = () => ({ value: '', display: '', labels: {} })

function LabelsEditor({ value = {}, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {LOCALES.map((lng) => (
        <Input key={lng} value={value?.[lng] ?? ''} placeholder={lng.toUpperCase()}
          onChange={(e) => onChange({ ...(value ?? {}), [lng]: e.target.value })}  />
      ))}
    </div>
  )
}

function SchemaModal({ schema, onClose, onSave, isSaving }) {
  const { t } = useTranslation()
  const isNew = !schema?.key || schema._isNew
  const [form, setForm] = useState(() => schema ? { ...schema, subcategories: [...(schema.subcategories ?? [])], fields: [...(schema.fields ?? [])] } : emptySchema())
  const [tab, setTab] = useState('basic')
  const [showErrors, setShowErrors] = useState(false)

  function setF(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  function addField() { setForm((f) => ({ ...f, fields: [...f.fields, emptyField()] })) }
  function removeField(i) { setForm((f) => ({ ...f, fields: f.fields.filter((_, idx) => idx !== i) })) }
  function updateField(i, k, v) {
    setForm((f) => ({ ...f, fields: f.fields.map((fld, idx) => idx === i ? { ...fld, [k]: v } : fld) }))
  }
  // Order is meaning: provider forms render fields and subcategories in array
  // order, so the editor must be able to arrange them.
  function move(list, i, dir) {
    const j = i + dir
    if (j < 0 || j >= list.length) return list
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  }
  function moveField(i, dir) { setForm((f) => ({ ...f, fields: move(f.fields, i, dir) })) }
  function moveSubcat(i, dir) { setForm((f) => ({ ...f, subcategories: move(f.subcategories, i, dir) })) }

  function addSubcat() { setForm((f) => ({ ...f, subcategories: [...f.subcategories, emptySubcat()] })) }
  function removeSubcat(i) { setForm((f) => ({ ...f, subcategories: f.subcategories.filter((_, idx) => idx !== i) })) }
  function updateSubcat(i, k, v) {
    setForm((f) => ({ ...f, subcategories: f.subcategories.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }))
  }

  // Validation failures switch to the offending tab and mark the rows —
  // a toast about a field on a hidden tab is a dead end.
  function handleSave() {
    if (!form.key || !form.label) {
      setShowErrors(true); setTab('basic'); toast.error(t('admin.categoryRequired')); return
    }
    if (form.subcategories.some((s) => !s.value.trim() || !s.display.trim())) {
      setShowErrors(true); setTab('subcategories'); toast.error(t('admin.subcatRowRequired')); return
    }
    if (form.fields.some((f) => !f.key.trim() || !f.label.trim())) {
      setShowErrors(true); setTab('fields'); toast.error(t('admin.fieldRowRequired')); return
    }
    if (form.fields.some((f) => (f.type === 'select' || f.type === 'multiselect') && !(f.options?.length > 0))) {
      setShowErrors(true); setTab('fields'); toast.error(t('admin.fieldOptionsRequired')); return
    }
    onSave(form)
  }

  const errClass = (bad) => (showErrors && bad ? 'border-danger' : '')

  const tabs = [
    { id: 'basic', label: t('admin.tabBasic') },
    { id: 'subcategories', label: `${t('admin.tabSubcategories')} (${form.subcategories.length})` },
    { id: 'fields', label: `${t('admin.tabFields')} (${form.fields.length})` },
  ]

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${isNew ? t('admin.addCategory') : t('admin.editCategory')}: ${form.label || form.key}`}
      tabs={
        <TabBar
          tabs={tabs.map((tb) => ({ key: tb.id, label: tb.label }))}
          value={tab}
          onChange={setTab}
        />
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0">
          {tab === 'basic' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">
                    {t('admin.categoryKeyHint')}{isNew && <span className="text-danger"> *</span>}
                  </label>
                  <Input value={form.key} onChange={(e) => setF('key', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="vehiclerent" disabled={!isNew} className={`${errClass(!form.key)}`} />
                </div>
                <div>
                  <label className="field-label">
                    {t('admin.categoryLabel')} <span className="text-danger">*</span>
                  </label>
                  <Input value={form.label} onChange={(e) => setF('label', e.target.value)} placeholder="Vehicle Rental" className={`${errClass(!form.label)}`} />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="field-label">{t('admin.categoryIcon')}</label>
                  <Input value={form.icon ?? ''} onChange={(e) => setF('icon', e.target.value)} placeholder="car-outline"  />
                  <p className="text-xs text-muted mt-1">{t('admin.categoryIconHint')}</p>
                </div>
                <div>
                  <label className="field-label">{t('admin.categoryColor')}</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.color ?? DEFAULT_COLOR} onChange={(e) => setF('color', e.target.value)}
                      className="w-10 h-10 rounded border border-border/50 cursor-pointer bg-surface2" />
                    <Input value={form.color ?? ''} onChange={(e) => setF('color', e.target.value)} className="flex-1" />
                  </div>
                </div>
                <div>
                  <label className="field-label">{t('admin.categorySortOrder')}</label>
                  <Input type="number" value={form.sort_order ?? 0} onChange={(e) => setF('sort_order', Number(e.target.value))}  />
                </div>
              </div>
              <div>
                <label className="field-label">{t('admin.categoryTranslations')}</label>
                <LabelsEditor value={form.labels} onChange={(v) => setF('labels', v)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="checkbox" checked={form.active ?? true} onChange={(e) => setF('active', e.target.checked)} className="accent-primary" />
                {t('admin.categoryActive')}
              </label>
              <div className="pt-2 border-t border-border/50 space-y-2">
                <p className="text-xs text-muted">{t('admin.categoryBehavior')}</p>
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={form.has_rental_status ?? false} onChange={(e) => setF('has_rental_status', e.target.checked)} className="accent-primary" />
                  {t('admin.hasRentalStatus')}
                </label>
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={form.has_availability_dates ?? false} onChange={(e) => setF('has_availability_dates', e.target.checked)} className="accent-primary" />
                  {t('admin.hasAvailabilityDates')}
                </label>
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={form.has_price ?? false} onChange={(e) => setF('has_price', e.target.checked)} className="accent-primary" />
                  {t('admin.hasPrice')}
                </label>
                {form.has_price && (
                  <div>
                    <label className="field-label">{t('admin.defaultPriceUnit')}</label>
                    <Input as="select" value={form.default_price_unit ?? ''} onChange={(e) => setF('default_price_unit', e.target.value)} className="w-auto">
                      <option value="">—</option>
                      {PRICE_UNITS.map((u) => <option key={u} value={u}>{t(`priceUnit.${u.toLowerCase()}`, { defaultValue: u })}</option>)}
                    </Input>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={form.emphasized ?? false} onChange={(e) => setF('emphasized', e.target.checked)} className="accent-primary" />
                  {t('admin.emphasized')}
                </label>
                <div>
                  <label className="field-label">{t('admin.postExpiryDays')}</label>
                  <Input type="number" min="1" max="365" value={form.post_expiry_days ?? ''} placeholder="30"
                    onChange={(e) => setF('post_expiry_days', e.target.value === '' ? null : Number(e.target.value))}
                    className="w-28" />
                </div>
              </div>
            </div>
          )}

          {tab === 'subcategories' && (
            <div className="space-y-2">
              {form.subcategories.map((sub, i) => (
                <div key={i} className="p-2 bg-surface2 rounded-lg space-y-2">
                  <div className="flex gap-2 items-center">
                    <div className="flex flex-col shrink-0">
                      <button onClick={() => moveSubcat(i, -1)} disabled={i === 0} aria-label={t('common.moveUp')} className="text-muted hover:text-text disabled:opacity-30 p-1"><ChevronUp size={13} /></button>
                      <button onClick={() => moveSubcat(i, 1)} disabled={i === form.subcategories.length - 1} aria-label={t('common.moveDown')} className="text-muted hover:text-text disabled:opacity-30 p-1"><ChevronDown size={13} /></button>
                    </div>
                    <Input value={sub.value} onChange={(e) => updateSubcat(i, 'value', e.target.value)}
                      placeholder="key_value" className={`flex-1 ${errClass(!sub.value.trim())}`} />
                    <Input value={sub.display} onChange={(e) => updateSubcat(i, 'display', e.target.value)}
                      placeholder={t('admin.subcatDisplayPlaceholder')} className={`flex-1 ${errClass(!sub.display.trim())}`} />
                    <button onClick={() => removeSubcat(i)} aria-label={t('common.delete')} className="min-w-touch min-h-touch flex items-center justify-center text-muted hover:text-danger shrink-0 rounded-btn hover:bg-danger/10 transition-colors"><X size={14} /></button>
                  </div>
                  <LabelsEditor value={sub.labels} onChange={(v) => updateSubcat(i, 'labels', v)} />
                </div>
              ))}
              <button onClick={addSubcat}
                className="flex items-center gap-1.5 text-xs text-primary-text hover:underline mt-2 transition-colors">
                <Plus size={13} /> {t('admin.addSubcategory')}
              </button>
            </div>
          )}

          {tab === 'fields' && (
            <div className="space-y-3">
              {form.fields.map((fld, i) => (
                <div key={i} className="p-3 bg-surface2 rounded-lg space-y-2 relative">
                  <div className="absolute top-1 right-1 flex items-center">
                    <button onClick={() => moveField(i, -1)} disabled={i === 0} aria-label={t('common.moveUp')} className="min-w-[36px] min-h-touch flex items-center justify-center text-muted hover:text-text disabled:opacity-30 rounded-btn transition-colors"><ChevronUp size={14} /></button>
                    <button onClick={() => moveField(i, 1)} disabled={i === form.fields.length - 1} aria-label={t('common.moveDown')} className="min-w-[36px] min-h-touch flex items-center justify-center text-muted hover:text-text disabled:opacity-30 rounded-btn transition-colors"><ChevronDown size={14} /></button>
                    <button onClick={() => removeField(i)} aria-label={t('common.delete')} className="min-w-[36px] min-h-touch flex items-center justify-center text-muted hover:text-danger rounded-btn hover:bg-danger/10 transition-colors"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-28">
                    <Input value={fld.key} onChange={(e) => updateField(i, 'key', e.target.value)}
                      placeholder="field_key" className={`${errClass(!fld.key.trim())}`} />
                    <Input value={fld.label} onChange={(e) => updateField(i, 'label', e.target.value)}
                      placeholder={t('admin.fieldLabelPlaceholder')} className={`${errClass(!fld.label.trim())}`} />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input as="select" value={fld.type} onChange={(e) => updateField(i, 'type', e.target.value)} >
                      {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
                    </Input>
                    {/* Where the field appears on the provider form: upfront, or
                        behind the "More details" disclosure. */}
                    <Input as="select" value={fld.group ?? 'core'} onChange={(e) => updateField(i, 'group', e.target.value)} >
                      <option value="core">{t('admin.fieldGroupCore')}</option>
                      <option value="details">{t('admin.fieldGroupDetails')}</option>
                    </Input>
                    <Input value={fld.unit ?? ''} onChange={(e) => updateField(i, 'unit', e.target.value)}
                      placeholder={t('admin.fieldUnitPlaceholder')}  />
                    <Input value={fld.placeholder ?? ''} onChange={(e) => updateField(i, 'placeholder', e.target.value)}
                      placeholder={t('admin.fieldPlaceholderPlaceholder')}  />
                  </div>
                  <LabelsEditor value={fld.labels} onChange={(v) => updateField(i, 'labels', v)} />
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                      <input type="checkbox" checked={fld.required ?? false}
                        onChange={(e) => updateField(i, 'required', e.target.checked)} className="accent-primary" />
                      {t('admin.fieldRequired')}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                      <input type="checkbox" checked={fld.filterable ?? false}
                        onChange={(e) => updateField(i, 'filterable', e.target.checked)} className="accent-primary" />
                      {t('admin.fieldFilterable')}
                    </label>
                  </div>
                  {(fld.type === 'select' || fld.type === 'multiselect') && (
                    <div>
                      <p className="text-xs text-muted mb-1">{t('admin.fieldOptions')}</p>
                      <Input
                        value={Array.isArray(fld.options) ? fld.options.join(', ') : ''}
                        onChange={(e) => updateField(i, 'options', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                        placeholder={t('admin.fieldOptionsPlaceholder')}
                        className={`${errClass(!(fld.options?.length > 0))}`}
                      />
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addField} className="flex items-center gap-1.5 text-xs text-primary-text hover:underline mt-2 transition-colors">
                <Plus size={13} /> {t('admin.addField')}
              </button>
            </div>
          )}
        </div>
        {/* Mirrors the app form as the admin types — see SchemaFormPreview. */}
        <SchemaFormPreview schema={form} />
      </div>
    </Modal>
  )
}

export default function AdminCategories() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(null)
  const [density, toggleDensity] = useTableDensity()
  const cellPad = density === 'compact' ? 'px-4 py-1.5' : 'px-4 py-3'

  const { data: schemas = [], isLoading, isError, refetch } = useCategories({ admin: true })

  const createMut = useApiMutation({
    mutationFn: (body) => categoryApi.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setEditing(null); toast.success(t('admin.categoryCreated')) },
  })

  const updateMut = useApiMutation({
    mutationFn: ({ key, body }) => categoryApi.update(key, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setEditing(null); toast.success(t('admin.categoryUpdated')) },
  })

  const toggleMut = useApiMutation({
    mutationFn: ({ key, active }) => categoryApi.update(key, { active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success(t('admin.categoryUpdated'))
    },
  })

  const showSkeleton = useMinDisplayTime(isLoading)

  function handleSave(form) {
    if (form._isNew) {
      const { _isNew, ...body } = form
      createMut.mutate(body)
    } else {
      const { key, ...body } = form
      updateMut.mutate({ key, body })
    }
  }

  const isSaving = createMut.isPending || updateMut.isPending

  const sorted = [...schemas].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  return (
    <div>
      <PageHeader
        title={t('admin.categoriesTitle')}
        description={t('common.total', { count: schemas.length })}
        action={
          <Button onClick={() => setEditing({ ...emptySchema(), _isNew: true })}>
            <Plus size={15} /> {t('admin.addCategory')}
          </Button>
        }
      />

      <div className="flex justify-end mb-5">
        <DensityToggle density={density} onToggle={toggleDensity} />
      </div>

      {showSkeleton ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 skeleton rounded-card" />)}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : schemas.length === 0 ? (
        <EmptyState icon={Tag} title={t('common.noData')} />
      ) : (
        <div className="surface-card">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('admin.categoryKey')}</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('admin.categoryLabel')}</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium hidden sm:table-cell">{t('admin.tabFields')}</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium hidden sm:table-cell">{t('admin.tabSubcategories')}</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">{t('common.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((schema) => (
                <tr key={schema.key} className="border-b border-border/50 last:border-b-0 hover:bg-surface2/50 transition-colors">
                  <td className={cellPad}>
                    <div className="flex items-center gap-2">
                      {schema.icon && <span>{schema.icon}</span>}
                      <code className="text-xs bg-surface2 px-1.5 py-0.5 rounded text-muted">{schema.key}</code>
                    </div>
                  </td>
                  <td className={cellPad}>
                    <div className="flex items-center gap-2">
                      {getCategoryColor(schema.key, sorted) && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(schema.key, sorted) }} />}
                      <span className="text-text font-medium">{schema.label}</span>
                    </div>
                  </td>
                  <td className={`${cellPad} text-muted hidden sm:table-cell`}>{schema.fields?.length ?? 0}</td>
                  <td className={`${cellPad} text-muted hidden sm:table-cell`}>{schema.subcategories?.length ?? 0}</td>
                  <td className={cellPad}>
                    <StatusBadge status={schema.active ? 'ACTIVE' : 'INACTIVE'} />
                  </td>
                  <td className={cellPad}>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => schema.active
                          ? setConfirmDeactivate(schema)
                          : toggleMut.mutate({ key: schema.key, active: true })}
                        disabled={toggleMut.isPending && toggleMut.variables?.key === schema.key}
                        className={`min-w-touch min-h-touch flex items-center justify-center rounded-btn transition-colors disabled:opacity-50 ${schema.active ? 'text-success hover:text-danger hover:bg-danger/10' : 'text-muted hover:text-success hover:bg-success/10'}`}
                        title={schema.active ? t('common.deactivate') : t('common.activate')}
                        aria-label={schema.active ? t('common.deactivate') : t('common.activate')}
                      >
                        {schema.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button
                        onClick={() => setEditing(schema)}
                        title={t('common.edit')}
                        aria-label={t('common.edit')}
                        className="min-w-touch min-h-touch flex items-center justify-center text-muted hover:text-primary-text hover:bg-primary/10 rounded-btn transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {editing && (
        <SchemaModal
          schema={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}

      {/* Deactivating hides a whole vertical from the marketplace — confirm it. */}
      <ConfirmModal
        open={Boolean(confirmDeactivate)}
        onClose={() => setConfirmDeactivate(null)}
        title={`${t('common.deactivate')}: ${confirmDeactivate?.label ?? ''}`}
        message={t('admin.confirmDeactivateCategory')}
        confirmLabel={t('common.deactivate')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          toggleMut.mutate({ key: confirmDeactivate.key, active: false })
          setConfirmDeactivate(null)
        }}
        isPending={toggleMut.isPending}
      />
    </div>
  )
}
