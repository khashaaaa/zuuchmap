import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, X, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react'
import { categoryApi } from '@/lib/api'
import { PRICE_UNITS } from '@/lib/utils'
import { LANGUAGES } from '@/i18n'
import PageHeader from '@/components/PageHeader'
import TabBar from '@/components/TabBar'
import Input from '@/components/Input'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import { toast } from 'sonner'

const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'date', 'phone']
const LOCALES = LANGUAGES.map((l) => l.code)

const emptySchema = () => ({
  key: '', label: '', labels: {}, icon: '', color: '#9BA1A6',
  active: true, sort_order: 0,
  has_rental_status: false, has_availability_dates: false, has_price: false, default_price_unit: '',
  subcategories: [], fields: [],
})

const emptyField = () => ({ key: '', label: '', labels: {}, type: 'text', required: false, filterable: false, placeholder: '', options: [] })
const emptySubcat = () => ({ value: '', display: '', labels: {} })

function LabelsEditor({ value = {}, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {LOCALES.map((lng) => (
        <Input key={lng} value={value?.[lng] ?? ''} placeholder={lng.toUpperCase()}
          onChange={(e) => onChange({ ...(value ?? {}), [lng]: e.target.value })} className="bg-background" />
      ))}
    </div>
  )
}

function SchemaModal({ schema, onClose, onSave, isSaving }) {
  const { t } = useTranslation()
  const isNew = !schema?.key || schema._isNew
  const [form, setForm] = useState(() => schema ? { ...schema, subcategories: [...(schema.subcategories ?? [])], fields: [...(schema.fields ?? [])] } : emptySchema())
  const [tab, setTab] = useState('basic')

  function setF(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  function addField() { setForm((f) => ({ ...f, fields: [...f.fields, emptyField()] })) }
  function removeField(i) { setForm((f) => ({ ...f, fields: f.fields.filter((_, idx) => idx !== i) })) }
  function updateField(i, k, v) {
    setForm((f) => ({ ...f, fields: f.fields.map((fld, idx) => idx === i ? { ...fld, [k]: v } : fld) }))
  }

  function addSubcat() { setForm((f) => ({ ...f, subcategories: [...f.subcategories, emptySubcat()] })) }
  function removeSubcat(i) { setForm((f) => ({ ...f, subcategories: f.subcategories.filter((_, idx) => idx !== i) })) }
  function updateSubcat(i, k, v) {
    setForm((f) => ({ ...f, subcategories: f.subcategories.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }))
  }

  function handleSave() {
    if (!form.key || !form.label) { toast.error(t('admin.categoryRequired')); return }
    if (form.subcategories.some((s) => !s.value.trim() || !s.display.trim())) {
      toast.error(t('admin.subcatRowRequired')); return
    }
    if (form.fields.some((f) => !f.key.trim() || !f.label.trim())) {
      toast.error(t('admin.fieldRowRequired')); return
    }
    onSave(form)
  }

  const tabs = [
    { id: 'basic', label: t('admin.tabBasic') },
    { id: 'subcategories', label: `${t('admin.tabSubcategories')} (${form.subcategories.length})` },
    { id: 'fields', label: `${t('admin.tabFields')} (${form.fields.length})` },
  ]

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
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
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
          {tab === 'basic' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted block mb-1">
                    {t('admin.categoryKeyHint')}{isNew && <span className="text-danger"> *</span>}
                  </label>
                  <Input value={form.key} onChange={(e) => setF('key', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    placeholder="vehiclerent" disabled={!isNew} className="bg-background" />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">
                    {t('admin.categoryLabel')} <span className="text-danger">*</span>
                  </label>
                  <Input value={form.label} onChange={(e) => setF('label', e.target.value)} placeholder="Vehicle Rental" className="bg-background" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted block mb-1">{t('admin.categoryIcon')}</label>
                  <Input value={form.icon ?? ''} onChange={(e) => setF('icon', e.target.value)} placeholder="🚗" className="bg-background" />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">{t('admin.categoryColor')}</label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={form.color ?? '#9BA1A6'} onChange={(e) => setF('color', e.target.value)}
                      className="w-10 h-10 rounded border border-border/50 cursor-pointer bg-surface2" />
                    <Input value={form.color ?? ''} onChange={(e) => setF('color', e.target.value)} className="bg-background flex-1" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">{t('admin.categorySortOrder')}</label>
                  <Input type="number" value={form.sort_order ?? 0} onChange={(e) => setF('sort_order', Number(e.target.value))} className="bg-background" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">{t('admin.categoryTranslations', { defaultValue: 'Label translations' })}</label>
                <LabelsEditor value={form.labels} onChange={(v) => setF('labels', v)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="checkbox" checked={form.active ?? true} onChange={(e) => setF('active', e.target.checked)} className="accent-primary" />
                {t('admin.categoryActive')}
              </label>
              <div className="pt-2 border-t border-border/50 space-y-2">
                <p className="text-xs text-muted">{t('admin.categoryBehavior', { defaultValue: 'Behavior' })}</p>
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={form.has_rental_status ?? false} onChange={(e) => setF('has_rental_status', e.target.checked)} className="accent-primary" />
                  {t('admin.hasRentalStatus', { defaultValue: 'Has rental status (active/rented)' })}
                </label>
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={form.has_availability_dates ?? false} onChange={(e) => setF('has_availability_dates', e.target.checked)} className="accent-primary" />
                  {t('admin.hasAvailabilityDates', { defaultValue: 'Has availability dates' })}
                </label>
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                  <input type="checkbox" checked={form.has_price ?? false} onChange={(e) => setF('has_price', e.target.checked)} className="accent-primary" />
                  {t('admin.hasPrice', { defaultValue: 'Has price' })}
                </label>
                {form.has_price && (
                  <div>
                    <label className="text-xs text-muted block mb-1">{t('admin.defaultPriceUnit', { defaultValue: 'Default price unit' })}</label>
                    <Input as="select" value={form.default_price_unit ?? ''} onChange={(e) => setF('default_price_unit', e.target.value)} className="bg-background w-auto">
                      <option value="">—</option>
                      {PRICE_UNITS.map((u) => <option key={u} value={u}>{t(`priceUnit.${u.toLowerCase()}`, { defaultValue: u })}</option>)}
                    </Input>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'subcategories' && (
            <div className="space-y-2">
              {form.subcategories.map((sub, i) => (
                <div key={i} className="p-2 bg-surface2 rounded-lg space-y-2">
                  <div className="flex gap-2 items-center">
                    <GripVertical size={14} className="text-muted shrink-0" />
                    <Input value={sub.value} onChange={(e) => updateSubcat(i, 'value', e.target.value)}
                      placeholder="key_value" className="bg-background flex-1" />
                    <Input value={sub.display} onChange={(e) => updateSubcat(i, 'display', e.target.value)}
                      placeholder="Display name" className="bg-background flex-1" />
                    <button onClick={() => removeSubcat(i)} className="min-w-9 min-h-9 flex items-center justify-center text-muted hover:text-danger shrink-0 rounded-btn hover:bg-danger/10 transition-colors"><X size={14} /></button>
                  </div>
                  <LabelsEditor value={sub.labels} onChange={(v) => updateSubcat(i, 'labels', v)} />
                </div>
              ))}
              <button onClick={addSubcat}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                <Plus size={13} /> {t('admin.addSubcategory')}
              </button>
            </div>
          )}

          {tab === 'fields' && (
            <div className="space-y-3">
              {form.fields.map((fld, i) => (
                <div key={i} className="p-3 bg-surface2 rounded-lg space-y-2 relative">
                  <button onClick={() => removeField(i)} className="absolute top-1 right-1 min-w-9 min-h-9 flex items-center justify-center text-muted hover:text-danger rounded-btn hover:bg-danger/10 transition-colors"><X size={14} /></button>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-9">
                    <Input value={fld.key} onChange={(e) => updateField(i, 'key', e.target.value)}
                      placeholder="field_key" className="bg-background" />
                    <Input value={fld.label} onChange={(e) => updateField(i, 'label', e.target.value)}
                      placeholder="Field label" className="bg-background" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input as="select" value={fld.type} onChange={(e) => updateField(i, 'type', e.target.value)} className="bg-background">
                      {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
                    </Input>
                    <Input value={fld.placeholder ?? ''} onChange={(e) => updateField(i, 'placeholder', e.target.value)}
                      placeholder="Placeholder..." className="bg-background" />
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
                      {t('admin.fieldFilterable', { defaultValue: 'Filterable in browse' })}
                    </label>
                  </div>
                  {fld.type === 'select' && (
                    <div>
                      <p className="text-xs text-muted mb-1">{t('admin.fieldOptions')}</p>
                      <Input
                        value={Array.isArray(fld.options) ? fld.options.join(', ') : ''}
                        onChange={(e) => updateField(i, 'options', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                        placeholder="Option A, Option B, Option C"
                        className="bg-background"
                      />
                    </div>
                  )}
                </div>
              ))}
              <button onClick={addField} className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                <Plus size={13} /> {t('admin.addField')}
              </button>
            </div>
          )}
    </Modal>
  )
}

export default function AdminCategories() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)

  const { data: schemas = [], isLoading } = useQuery({
    queryKey: ['categories', 'admin'],
    queryFn: categoryApi.getAllForAdmin,
    staleTime: 60_000,
  })

  const createMut = useMutation({
    mutationFn: (body) => categoryApi.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setEditing(null); toast.success(t('admin.categoryCreated')) },
    onError: (e) => toast.error(e.response?.data?.message || t('common.error')),
  })

  const updateMut = useMutation({
    mutationFn: ({ key, body }) => categoryApi.update(key, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setEditing(null); toast.success(t('admin.categoryUpdated')) },
    onError: (e) => toast.error(e.response?.data?.message || t('common.error')),
  })

  const toggleMut = useMutation({
    mutationFn: ({ key, active }) => categoryApi.update(key, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (e) => toast.error(e.response?.data?.message || t('common.error')),
  })

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
          <button
            onClick={() => setEditing({ ...emptySchema(), _isNew: true })}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-btn text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} /> {t('admin.addCategory')}
          </button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-surface2 rounded-card animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-surface border border-border/20 shadow-card rounded-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Key</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Label</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium hidden sm:table-cell">Fields</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium hidden sm:table-cell">Subcategories</th>
                <th className="text-left px-4 py-3 text-xs text-muted font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((schema) => (
                <tr key={schema.key} className="border-b border-border/50 last:border-b-0 hover:bg-surface2/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {schema.icon && <span>{schema.icon}</span>}
                      <code className="text-xs bg-surface2 px-1.5 py-0.5 rounded text-muted">{schema.key}</code>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {schema.color && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: schema.color }} />}
                      <span className="text-text font-medium">{schema.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted hidden sm:table-cell">{schema.fields?.length ?? 0}</td>
                  <td className="px-4 py-3 text-muted hidden sm:table-cell">{schema.subcategories?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${schema.active ? 'text-success bg-success/10 border-success/20' : 'text-muted bg-surface2 border-border/50'}`}>
                      {schema.active ? t('status.active') : t('status.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleMut.mutate({ key: schema.key, active: !schema.active })}
                        disabled={toggleMut.isPending}
                        className={`min-w-9 min-h-9 flex items-center justify-center rounded-btn transition-colors ${schema.active ? 'text-success hover:text-danger hover:bg-danger/10' : 'text-muted hover:text-success hover:bg-success/10'}`}
                        title={schema.active ? t('common.deactivate') : t('common.activate')}
                      >
                        {schema.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button
                        onClick={() => setEditing(schema)}
                        className="min-w-9 min-h-9 flex items-center justify-center text-muted hover:text-primary hover:bg-primary/10 rounded-btn transition-colors"
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
    </div>
  )
}
