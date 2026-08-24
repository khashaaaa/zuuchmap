const BASE = 'w-full bg-surface2 border border-transparent rounded-btn px-3 py-2 text-sm md:text-base text-text placeholder:text-muted outline-none focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed'

const FONT_SIZES = new Set(['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'])
const BORDER_WIDTHS = new Set(['border', 'border-0', 'border-2', 'border-4', 'border-8'])
const RESPONSIVE = /^(sm|md|lg|xl|2xl):/

/**
 * Tailwind resolves two utilities from the same group by their order in the
 * generated stylesheet, not by their order in the class string — so a base
 * class listed first still beats a caller's override listed last. Every
 * `className` a caller passed for width, background or border colour was
 * therefore being dropped on the floor. Naming the group lets us remove the
 * base class the caller meant to replace, so the prop actually lands.
 */
const groupOf = (cls) => {
    const cut = cls.lastIndexOf(':')
    const variant = cut < 0 ? '' : cls.slice(0, cut + 1)
    const util = cut < 0 ? cls : cls.slice(cut + 1)
    if (util.startsWith('w-')) return variant + 'width'
    if (util.startsWith('bg-')) return variant + 'bg'
    if (util.startsWith('px-')) return variant + 'px'
    if (util.startsWith('py-')) return variant + 'py'
    if (util.startsWith('rounded')) return variant + 'radius'
    if (FONT_SIZES.has(util)) return variant + 'fontSize'
    if (BORDER_WIDTHS.has(util)) return variant + 'borderWidth'
    if (util.startsWith('border-')) return variant + 'borderColor'
    if (util.startsWith('text-')) return variant + 'textColor'
    return null
}

const merge = (extra) => {
    const overrides = extra.split(/\s+/).filter(Boolean)
    const claimed = new Set(overrides.map(groupOf).filter(Boolean))
    const kept = BASE.split(' ').filter((cls) => {
        const group = groupOf(cls)
        if (!group) return true
        if (claimed.has(group)) return false
        // An unprefixed override also replaces the base's responsive steps of
        // the same group (`text-xs` must beat `text-sm md:text-base`), but a
        // state variant like `placeholder:text-muted` is its own concern.
        return !(RESPONSIVE.test(group) && claimed.has(group.slice(group.indexOf(':') + 1)))
    })
    return [...kept, ...overrides].join(' ')
}

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
            className={className.trim() ? merge(className) : BASE}
            {...props}
        />
    )
}
