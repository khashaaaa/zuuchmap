import { useId } from 'react'
import Input from './Input'
import { getFieldLabel, getOptionLabel } from '@/lib/utils'

export const fieldPlaceholder = (field, lng) => field.placeholders?.[lng] ?? field.placeholder ?? ''

/**
 * The schema-driven controls of the provider post form. Shared with the admin
 * category editor's preview, which renders the very same components disabled
 * so what the admin sees is what the provider will get.
 */
export function DynamicField({ field, value, onChange, t, lng, disabled = false }) {
  const unit = field.unit ? ` (${field.unit})` : ''
  // A boolean is always answered — the checkbox carries `false`, and the engine
  // accepts it (`validateRequiredAttributes` only rejects empty strings and
  // empty arrays). Marking one "required" promised a gate that nothing can
  // enforce, so the asterisk goes everywhere except there.
  const showRequired = field.required && field.type !== 'boolean'
  const lbl = <>{getFieldLabel(field, t)}{unit}{showRequired && <span className="text-danger"> *</span>}</>
  // Ties the visible label to its control, so a screen reader names it and a
  // tap on the label focuses it.
  const id = useId()

  if (field.type === 'select') return (
    <div>
      <label htmlFor={id} className="field-label">{lbl}</label>
      <Input as="select" id={id} value={value} onChange={(e) => onChange(e.target.value)} required={field.required} disabled={disabled}>
        <option value="">{t('common.select')}</option>
        {field.options?.map((opt) => <option key={opt} value={opt}>{getOptionLabel(opt, t)}</option>)}
      </Input>
    </div>
  )

  if (field.type === 'boolean') return (
    <div>
      <p id={id} className="field-label">{lbl}</p>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" aria-labelledby={id} checked={value === true} disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 accent-primary" />
        <span className="text-sm text-text">{value === true ? t('common.yes') : t('common.no')}</span>
      </label>
    </div>
  )

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
    return (
      <div>
        <p id={id} className="field-label">{lbl}</p>
        <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
          {field.options?.map((opt) => (
            <button key={opt} type="button" onClick={() => toggle(opt)} disabled={disabled}
              aria-pressed={selected.includes(opt)}
              className={`px-3 py-1.5 text-xs rounded-btn border transition-colors ${
                selected.includes(opt)
                  ? 'bg-primary text-on-primary border-primary'
                  : 'border-border/40 text-muted hover:text-text'
              }`}>
              {getOptionLabel(opt, t)}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'textarea') return (
    <div>
      <label htmlFor={id} className="field-label">{lbl}</label>
      <Input as="textarea" id={id} value={value} onChange={(e) => onChange(e.target.value)} required={field.required} rows={3}
        placeholder={fieldPlaceholder(field, lng)} className="resize-none" disabled={disabled} />
    </div>
  )

  const inputType = field.type === 'phone' ? 'tel' : field.type === 'text' ? 'text' : field.type
  return (
    <div>
      <label htmlFor={id} className="field-label">{lbl}</label>
      <Input id={id} type={inputType} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={fieldPlaceholder(field, lng)} required={field.required} disabled={disabled} />
    </div>
  )
}

// Section card — same idiom as ProviderCompany's detail card, so the form
// reads as a sequence of concerns instead of one unbroken column of controls.
export function FormSection({ title, children }) {
  return (
    <section className="bg-surface border border-border/20 shadow-card rounded-card p-5 space-y-4">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {children}
    </section>
  )
}
