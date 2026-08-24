const VARIANTS = {
  danger:  'bg-danger/10 border-danger/20 text-danger',
  warning: 'bg-warning/10 border-warning/20 text-warning',
  success: 'bg-success/10 border-success/20 text-success',
  info:    'bg-primary/10 border-primary/20 text-primary-text',
}

export default function AlertBanner({ variant = 'danger', title, icon: Icon, className = '', children }) {
  if (title) {
    return (
      <div className={`p-3.5 min-h-[44px] flex gap-3 border rounded-card text-sm ${VARIANTS[variant]} ${className}`}>
        {Icon && <Icon size={20} className="shrink-0 mt-0.5" />}
        <div>
          <p className="font-semibold mb-1">{title}</p>
          <p className="opacity-90">{children}</p>
        </div>
      </div>
    )
  }
  return (
    <div className={`p-3.5 min-h-[44px] flex items-center border rounded-card text-sm ${VARIANTS[variant]} ${className}`}>
      {children}
    </div>
  )
}
