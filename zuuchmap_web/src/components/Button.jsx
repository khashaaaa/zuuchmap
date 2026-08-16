import { Link } from 'react-router-dom'

const VARIANTS = {
    primary:   'bg-primary text-on-primary hover:bg-primary/90',
    secondary: 'bg-surface2 text-text hover:bg-border',
    danger:    'bg-danger text-on-color hover:bg-danger/90',
    outline:   'border border-border/50 text-text hover:bg-surface2',
    ghost:     'text-muted hover:text-text hover:bg-surface2',
}
const SIZES = {
    sm: 'px-3 py-1.5 text-xs md:text-sm',
    md: 'px-4 py-2 text-sm md:text-base',
    lg: 'px-4 py-2.5 text-sm md:text-base',
}

export default function Button({ variant = 'primary', size = 'md', className = '', disabled, children, to, ...props }) {
    const classes = `inline-flex items-center justify-center gap-1.5 rounded-btn font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`

    if (to) {
        return (
            <Link to={to} className={classes} {...props}>
                {children}
            </Link>
        )
    }

    return (
        <button
            disabled={disabled}
            className={classes}
            {...props}
        >
            {children}
        </button>
    )
}
