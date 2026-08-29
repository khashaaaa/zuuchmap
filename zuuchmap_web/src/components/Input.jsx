import { twMerge } from 'tailwind-merge'

const BASE = 'w-full bg-surface2 border border-transparent rounded-btn px-3 py-2 text-sm md:text-base text-text placeholder:text-muted outline-none focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed'

/**
 * Tailwind resolves two utilities from the same group by their order in the
 * generated stylesheet, not by their order in the class string — so a base
 * class listed first still beats a caller's override listed last. `twMerge`
 * drops the base class the caller meant to replace, so the prop actually lands.
 */
const merge = (extra) => twMerge(BASE, extra)

const groupDigits = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * `format="currency"`: shows thousand separators and a ₮ suffix while the
 * caller keeps a plain digit string in state — `onChange` still receives an
 * event-shaped `{ target: { value } }` with the raw number, so the usual
 * `set(key, e.target.value)` wiring works unchanged. Anything that is not a
 * digit is dropped on input.
 */
function CurrencyInput({ className, value, onChange, ...props }) {
    const raw = String(value ?? '').replace(/\D/g, '')
    return (
        <div className="relative">
            <input
                type="text"
                inputMode="numeric"
                value={raw ? groupDigits(raw) : ''}
                onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '')
                    onChange?.({ ...e, target: { ...e.target, value: next } })
                }}
                className={merge(`pr-8 tabular-nums ${className}`)}
                {...props}
            />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted font-medium">₮</span>
        </div>
    )
}

export default function Input({ as: Tag = 'input', className = '', format, ...props }) {
    if (format === 'currency') return <CurrencyInput className={className} {...props} />
    return (
        <Tag
            className={merge(className)}
            {...props}
        />
    )
}
