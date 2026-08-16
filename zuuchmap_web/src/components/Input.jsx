export default function Input({ as: Tag = 'input', className = '', ...props }) {
    return (
        <Tag
            className={`w-full bg-surface2 border border-transparent rounded-btn px-3 py-2 text-sm md:text-base text-text placeholder:text-muted outline-none focus:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
            {...props}
        />
    )
}
